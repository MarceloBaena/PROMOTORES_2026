import type { Server } from 'node:http';
import { ValidationPipe, Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import { AuditService } from '../src/audit/audit.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthRateLimitGuard } from '../src/auth/auth-rate-limit.guard';
import { AuthRateLimitService } from '../src/auth/auth-rate-limit.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import type { AuthenticatedUser } from '../src/common/authenticated-user';
import { CurrentUser } from '../src/common/current-user.decorator';
import { JwtAuthGuard } from '../src/common/jwt-auth.guard';
import { Roles } from '../src/common/roles.decorator';
import { RolesGuard } from '../src/common/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '@prisma/client';

jest.setTimeout(15_000);

interface MockUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  active: boolean;
  deletedAt: Date | null;
}

interface MockRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LoginResponseBody {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
  accessToken: string;
  refreshToken: string;
}

interface MeResponseBody {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface RefreshResponseBody {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
  accessToken: string;
  refreshToken: string;
}

@Controller('protected')
@UseGuards(JwtAuthGuard, RolesGuard)
class ProtectedController {
  @Get('supervisor')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  getSupervisorArea(@CurrentUser() user: AuthenticatedUser) {
    return {
      scope: 'supervisor',
      userId: user.userId,
      role: user.role,
    };
  }

  @Get('promoter')
  @Roles(UserRole.PROMOTER)
  getPromoterArea(@CurrentUser() user: AuthenticatedUser) {
    return {
      scope: 'promoter',
      userId: user.userId,
      role: user.role,
    };
  }
}

describe('AuthController (e2e)', () => {
  let users: MockUser[];
  let refreshTokens: MockRefreshToken[];

  const project = <T extends object>(
    source: T,
    select?: Record<string, unknown>,
  ) => {
    if (!select) {
      return source;
    }

    return Object.fromEntries(
      Object.entries(select)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([key]) => [key, source[key as keyof T]]),
    );
  };

  const prismaService = {
    user: {
      findFirst: jest.fn(
        ({
          where,
          select,
        }: {
          where?: {
            id?: string;
            email?: string;
            active?: boolean;
            deletedAt?: null;
          };
          select?: Record<string, unknown>;
        }) => {
          const user =
            users.find((candidate) => {
              if (where?.id && candidate.id !== where.id) {
                return false;
              }

              if (where?.email && candidate.email !== where.email) {
                return false;
              }

              if (
                where?.active !== undefined &&
                candidate.active !== where.active
              ) {
                return false;
              }

              if (
                where?.deletedAt === null &&
                candidate.deletedAt !== where.deletedAt
              ) {
                return false;
              }

              return true;
            }) ?? null;

          return Promise.resolve(user ? project(user, select) : null);
        },
      ),
    },
    refreshToken: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<
            MockRefreshToken,
            'createdAt' | 'updatedAt' | 'revokedAt'
          > & {
            revokedAt?: Date | null;
          };
        }) => {
          const storedToken: MockRefreshToken = {
            id: data.id,
            userId: data.userId,
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
            revokedAt: data.revokedAt ?? null,
            userAgent: data.userAgent ?? null,
            ipAddress: data.ipAddress ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          refreshTokens.push(storedToken);

          return Promise.resolve(storedToken);
        },
      ),
      findFirst: jest.fn(
        ({
          where,
          include,
        }: {
          where?: {
            id?: string;
            tokenHash?: string;
            revokedAt?: null;
            expiresAt?: {
              gt?: Date;
            };
          };
          include?: {
            user?: boolean;
          };
        }) => {
          const token =
            refreshTokens.find((candidate) => {
              if (where?.id && candidate.id !== where.id) {
                return false;
              }

              if (where?.tokenHash && candidate.tokenHash !== where.tokenHash) {
                return false;
              }

              if (
                where?.revokedAt === null &&
                candidate.revokedAt !== where.revokedAt
              ) {
                return false;
              }

              if (
                where?.expiresAt?.gt &&
                !(candidate.expiresAt > where.expiresAt.gt)
              ) {
                return false;
              }

              return true;
            }) ?? null;

          if (!token) {
            return Promise.resolve(null);
          }

          if (!include?.user) {
            return Promise.resolve(token);
          }

          const user = users.find((candidate) => candidate.id === token.userId);

          return Promise.resolve({
            ...token,
            user,
          });
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: {
            id: string;
          };
          data: Partial<MockRefreshToken>;
        }) => {
          const token = refreshTokens.find(
            (candidate) => candidate.id === where.id,
          );

          if (!token) {
            throw new Error('Refresh token nao encontrado');
          }

          Object.assign(token, data, {
            updatedAt: new Date(),
          });

          return Promise.resolve(token);
        },
      ),
    },
  };

  const configService = {
    get: jest.fn((key: string, fallback: unknown) => {
      const values: Record<string, unknown> = {
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_EXPIRES_IN_SECONDS: 900,
        JWT_REFRESH_EXPIRES_IN_SECONDS: 2_592_000,
        AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
        AUTH_RATE_LIMIT_MAX_ATTEMPTS: 5,
      };

      return values[key] ?? fallback;
    }),
  };

  const auditService = {
    record: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    users = [
      {
        id: 'admin-1',
        email: 'admin@formula.local',
        name: 'Admin',
        role: UserRole.ADMIN,
        passwordHash: hashSync('Admin@123', 12),
        active: true,
        deletedAt: null,
      },
      {
        id: 'supervisor-1',
        email: 'supervisor@formula.local',
        name: 'Supervisor',
        role: UserRole.SUPERVISOR,
        passwordHash: hashSync('Supervisor@123', 12),
        active: true,
        deletedAt: null,
      },
      {
        id: 'promoter-1',
        email: 'promotor.centro@formula.local',
        name: 'Promotor Centro',
        role: UserRole.PROMOTER,
        passwordHash: hashSync('Promotor@123', 12),
        active: true,
        deletedAt: null,
      },
    ];
    refreshTokens = [];
  });

  const createApp = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [AuthController, ProtectedController],
      providers: [
        AuthService,
        JwtService,
        JwtStrategy,
        RolesGuard,
        AuthRateLimitService,
        AuthRateLimitGuard,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    return app;
  };

  it('autentica, retorna /me, faz refresh e logout com rotacao de token', async () => {
    const app = await createApp();

    try {
      const loginResponse = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .set('user-agent', 'jest-e2e')
        .send({
          email: 'supervisor@formula.local',
          password: 'Supervisor@123',
        })
        .expect(201);

      const loginBody = loginResponse.body as LoginResponseBody;

      expect(loginBody.user.email).toBe('supervisor@formula.local');
      expect(loginBody.user.role).toBe(UserRole.SUPERVISOR);

      const meResponse = await request(app.getHttpServer() as Server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginBody.accessToken}`)
        .expect(200);

      expect((meResponse.body as MeResponseBody).email).toBe(
        'supervisor@formula.local',
      );

      const refreshResponse = await request(app.getHttpServer() as Server)
        .post('/auth/refresh')
        .send({
          refreshToken: loginBody.refreshToken,
        })
        .expect(201);

      const refreshBody = refreshResponse.body as RefreshResponseBody;

      expect(refreshBody.refreshToken).not.toBe(loginBody.refreshToken);
      expect(
        refreshTokens.filter((token) => token.revokedAt !== null),
      ).toHaveLength(1);

      await request(app.getHttpServer() as Server)
        .post('/auth/logout')
        .send({
          refreshToken: refreshBody.refreshToken,
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .post('/auth/refresh')
        .send({
          refreshToken: refreshBody.refreshToken,
        })
        .expect(401);
    } finally {
      await app.close();
    }
  });

  it('aplica os guards por papel nas rotas protegidas', async () => {
    const app = await createApp();

    try {
      const supervisorLogin = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({
          email: 'supervisor@formula.local',
          password: 'Supervisor@123',
        })
        .expect(201);

      const adminLogin = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({
          email: 'admin@formula.local',
          password: 'Admin@123',
        })
        .expect(201);

      const promoterLogin = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({
          email: 'promotor.centro@formula.local',
          password: 'Promotor@123',
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .get('/protected/supervisor')
        .set(
          'Authorization',
          `Bearer ${(supervisorLogin.body as { accessToken: string }).accessToken}`,
        )
        .expect(200);

      await request(app.getHttpServer() as Server)
        .get('/protected/supervisor')
        .set(
          'Authorization',
          `Bearer ${(adminLogin.body as { accessToken: string }).accessToken}`,
        )
        .expect(200);

      await request(app.getHttpServer() as Server)
        .get('/protected/supervisor')
        .set(
          'Authorization',
          `Bearer ${(promoterLogin.body as { accessToken: string }).accessToken}`,
        )
        .expect(403);

      await request(app.getHttpServer() as Server)
        .get('/protected/promoter')
        .set(
          'Authorization',
          `Bearer ${(promoterLogin.body as { accessToken: string }).accessToken}`,
        )
        .expect(200);

      await request(app.getHttpServer() as Server)
        .get('/protected/promoter')
        .set(
          'Authorization',
          `Bearer ${(supervisorLogin.body as { accessToken: string }).accessToken}`,
        )
        .expect(403);
    } finally {
      await app.close();
    }
  });

  it('bloqueia repeticao excessiva de login com rate limit basico', async () => {
    const app = await createApp();

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app.getHttpServer() as Server)
          .post('/auth/login')
          .send({
            email: 'supervisor@formula.local',
            password: 'senha-errada',
          })
          .expect(401);
      }

      await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({
          email: 'supervisor@formula.local',
          password: 'senha-errada',
        })
        .expect(429);
    } finally {
      await app.close();
    }
  }, 20_000);
});
