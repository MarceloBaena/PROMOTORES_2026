import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hashSync } from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
  accessToken: string;
  refreshToken: string;
}

interface LogoutResponse {
  success: boolean;
}

interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

const resolveConfigValue = (key: string, fallback: unknown) => {
  const values: Record<string, unknown> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_ACCESS_EXPIRES_IN_SECONDS: 900,
    JWT_REFRESH_EXPIRES_IN_SECONDS: 2_592_000,
    AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: 5,
  };

  return values[key] ?? fallback;
};

jest.setTimeout(15_000);

describe('AuthService', () => {
  let authService: AuthService;
  const userFindFirstMock = jest.fn();
  const refreshTokenCreateMock = jest.fn();
  const refreshTokenFindFirstMock = jest.fn();
  const refreshTokenUpdateMock = jest.fn();
  const jwtSignAsyncMock = jest.fn();
  const jwtDecodeMock = jest.fn();
  const jwtVerifyAsyncMock = jest.fn();
  const auditRecordMock = jest.fn();

  const prismaService = {
    user: {
      findFirst: userFindFirstMock,
    },
    refreshToken: {
      create: refreshTokenCreateMock,
      findFirst: refreshTokenFindFirstMock,
      update: refreshTokenUpdateMock,
    },
  };

  const jwtService = {
    signAsync: jwtSignAsyncMock,
    decode: jwtDecodeMock,
    verifyAsync: jwtVerifyAsyncMock,
  };

  const configGetMock = jest.fn(resolveConfigValue);

  const configService = {
    get: configGetMock,
  };

  const auditService = {
    record: auditRecordMock,
  };

  beforeEach(async () => {
    userFindFirstMock.mockReset();
    refreshTokenCreateMock.mockReset();
    refreshTokenFindFirstMock.mockReset();
    refreshTokenUpdateMock.mockReset();
    jwtSignAsyncMock.mockReset();
    jwtDecodeMock.mockReset();
    jwtVerifyAsyncMock.mockReset();
    auditRecordMock.mockReset();
    configGetMock.mockReset();
    configGetMock.mockImplementation(resolveConfigValue);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
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

    authService = moduleRef.get(AuthService);
  });

  it('realiza login e emite access e refresh tokens', async () => {
    userFindFirstMock.mockResolvedValue({
      id: 'user-1',
      email: 'promotor.centro@formula.local',
      name: 'Promotor Centro',
      role: UserRole.PROMOTER,
      passwordHash: hashSync('Promotor@123', 4),
      active: true,
      deletedAt: null,
    });
    jwtSignAsyncMock
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    jwtDecodeMock.mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 2_592_000,
    });

    const response = (await authService.login(
      'promotor.centro@formula.local',
      'Promotor@123',
      'jest',
      '127.0.0.1',
    )) as AuthResponse;

    expect(response.user.email).toBe('promotor.centro@formula.local');
    expect(response.accessToken).toBe('access-token');
    expect(response.refreshToken).toBe('refresh-token');
    const createCalls = refreshTokenCreateMock.mock.calls as Array<
      [
        {
          data: {
            userId: string;
            userAgent?: string;
            ipAddress?: string;
          };
        },
      ]
    >;
    const createCall = createCalls[0]?.[0];
    expect(createCall).toBeDefined();
    expect(createCall?.data.userId).toBe('user-1');
    expect(createCall?.data.userAgent).toBe('jest');
    expect(createCall?.data.ipAddress).toBe('127.0.0.1');
    expect(auditRecordMock).toHaveBeenCalledTimes(1);
  });

  it('rejeita login com senha invalida', async () => {
    userFindFirstMock.mockResolvedValue({
      id: 'user-1',
      email: 'promotor.centro@formula.local',
      name: 'Promotor Centro',
      role: UserRole.PROMOTER,
      passwordHash: hashSync('Promotor@123', 4),
      active: true,
      deletedAt: null,
    });

    await expect(
      authService.login('promotor.centro@formula.local', 'senha-errada'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('realiza refresh token com rotacao do token anterior', async () => {
    jwtVerifyAsyncMock.mockResolvedValue({
      sub: 'user-1',
      jti: 'refresh-1',
      type: 'refresh',
    });
    refreshTokenFindFirstMock.mockResolvedValue({
      id: 'refresh-1',
      userId: 'user-1',
      tokenHash: 'hashed-token',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        email: 'supervisor@formula.local',
        name: 'Supervisor',
        role: UserRole.SUPERVISOR,
        active: true,
        deletedAt: null,
      },
    });
    jwtSignAsyncMock
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');
    jwtDecodeMock.mockReturnValue({
      exp: Math.floor(Date.now() / 1000) + 2_592_000,
    });

    const response = (await authService.refresh(
      'refresh-token',
      'jest',
      '127.0.0.1',
    )) as AuthResponse;

    expect(response.accessToken).toBe('new-access-token');
    expect(response.refreshToken).toBe('new-refresh-token');
    const updateCalls = refreshTokenUpdateMock.mock.calls as Array<
      [
        {
          where: {
            id: string;
          };
          data: {
            revokedAt?: Date;
          };
        },
      ]
    >;
    const refreshUpdateCall = updateCalls[0]?.[0];
    expect(refreshUpdateCall).toBeDefined();
    expect(refreshUpdateCall?.where.id).toBe('refresh-1');
    expect(refreshUpdateCall?.data.revokedAt).toBeInstanceOf(Date);
    expect(refreshTokenCreateMock).toHaveBeenCalledTimes(1);
  });

  it('realiza logout revogando o refresh token atual', async () => {
    jwtVerifyAsyncMock.mockResolvedValue({
      sub: 'user-1',
      jti: 'refresh-1',
      type: 'refresh',
    });
    refreshTokenFindFirstMock.mockResolvedValue({
      id: 'refresh-1',
      userId: 'user-1',
      tokenHash: 'hashed-token',
      revokedAt: null,
    });

    const response = (await authService.logout(
      'refresh-token',
      '127.0.0.1',
    )) as LogoutResponse;

    expect(response).toEqual({
      success: true,
    });
    const logoutUpdateCalls = refreshTokenUpdateMock.mock.calls as Array<
      [
        {
          where: {
            id: string;
          };
          data: {
            revokedAt?: Date;
          };
        },
      ]
    >;
    const logoutUpdateCall = logoutUpdateCalls[0]?.[0];
    expect(logoutUpdateCall).toBeDefined();
    expect(logoutUpdateCall?.where.id).toBe('refresh-1');
    expect(logoutUpdateCall?.data.revokedAt).toBeInstanceOf(Date);
  });

  it('rejeita refresh token com payload de tipo invalido', async () => {
    jwtVerifyAsyncMock.mockResolvedValue({
      sub: 'user-1',
      jti: 'refresh-1',
      type: 'access',
    });

    await expect(authService.refresh('refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('retorna o usuario autenticado em /me', async () => {
    userFindFirstMock.mockResolvedValue({
      id: 'user-1',
      email: 'admin@formula.local',
      name: 'Admin',
      role: UserRole.ADMIN,
    });

    const response = (await authService.me('user-1')) as MeResponse;

    expect(response).toEqual({
      id: 'user-1',
      email: 'admin@formula.local',
      name: 'Admin',
      role: UserRole.ADMIN,
    });
  });
});
