import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditEntityType, UserRole } from '@prisma/client';
import { compare } from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(
    email: string,
    password: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prismaService.user.findFirst({
      where: {
        email: normalizedEmail,
        active: true,
        deletedAt: null,
      },
    });

    if (!user) {
      this.logger.warn(
        `Falha de login para email=${normalizedEmail} ip=${ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const isPasswordValid = await compare(password, user.passwordHash);

    if (!isPasswordValid) {
      this.logger.warn(
        `Senha invalida para userId=${user.id} email=${normalizedEmail} ip=${ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const tokens = await this.issueTokens({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      userAgent,
      ipAddress,
    });

    await this.auditService.record(
      user.id,
      AuditEntityType.AUTH,
      user.id,
      'login',
      {
        email: user.email,
      },
    );

    this.logger.log(
      `Login concluido userId=${user.id} role=${user.role} ip=${ipAddress ?? 'unknown'}`,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    };
  }

  async refresh(refreshToken: string, userAgent?: string, ipAddress?: string) {
    const payload = await this.verifyRefreshToken(refreshToken, ipAddress);
    const persistedToken = await this.prismaService.refreshToken.findFirst({
      where: {
        id: payload.jti,
        tokenHash: this.hashToken(refreshToken),
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (
      !persistedToken ||
      !persistedToken.user.active ||
      persistedToken.user.deletedAt !== null
    ) {
      this.logger.warn(
        `Refresh token invalido jti=${payload.jti} ip=${ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException('Refresh token invalido');
    }

    await this.prismaService.refreshToken.update({
      where: {
        id: persistedToken.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const tokens = await this.issueTokens({
      userId: persistedToken.user.id,
      email: persistedToken.user.email,
      name: persistedToken.user.name,
      role: persistedToken.user.role,
      userAgent,
      ipAddress,
    });

    await this.auditService.record(
      persistedToken.user.id,
      AuditEntityType.REFRESH_TOKEN,
      persistedToken.id,
      'refresh',
      {},
    );

    this.logger.log(
      `Refresh concluido userId=${persistedToken.user.id} ip=${ipAddress ?? 'unknown'}`,
    );

    return {
      user: {
        id: persistedToken.user.id,
        email: persistedToken.user.email,
        name: persistedToken.user.name,
        role: persistedToken.user.role,
      },
      ...tokens,
    };
  }

  async logout(refreshToken: string, ipAddress?: string) {
    const payload = await this.verifyRefreshToken(refreshToken, ipAddress);
    const persistedToken = await this.prismaService.refreshToken.findFirst({
      where: {
        id: payload.jti,
        tokenHash: this.hashToken(refreshToken),
        revokedAt: null,
      },
    });

    if (persistedToken) {
      await this.prismaService.refreshToken.update({
        where: {
          id: persistedToken.id,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await this.auditService.record(
        persistedToken.userId,
        AuditEntityType.REFRESH_TOKEN,
        persistedToken.id,
        'logout',
        {},
      );

      this.logger.log(
        `Logout concluido userId=${persistedToken.userId} ip=${ipAddress ?? 'unknown'}`,
      );
    }

    return {
      success: true,
    };
  }

  async me(userId: string) {
    const user = await this.prismaService.user.findFirst({
      where: {
        id: userId,
        active: true,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario nao encontrado');
    }

    return user;
  }

  private async issueTokens(input: {
    userId: string;
    email: string;
    name: string;
    role: UserRole;
    userAgent?: string;
    ipAddress?: string;
  }) {
    const accessPayload: AccessTokenPayload = {
      sub: input.userId,
      email: input.email,
      name: input.name,
      role: input.role,
    };
    const refreshTokenId = randomUUID();
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.get<string>(
        'JWT_ACCESS_SECRET',
        'dev-access-secret',
      ),
      expiresIn: this.configService.get<number>(
        'JWT_ACCESS_EXPIRES_IN_SECONDS',
        900,
      ),
    });
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: input.userId,
        jti: refreshTokenId,
        type: 'refresh',
      } satisfies RefreshTokenPayload,
      {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'dev-refresh-secret',
        ),
        expiresIn: this.configService.get<number>(
          'JWT_REFRESH_EXPIRES_IN_SECONDS',
          2_592_000,
        ),
      },
    );
    const decoded = this.jwtService.decode<{ exp?: number }>(refreshToken);

    if (!decoded?.exp) {
      throw new UnauthorizedException('Falha ao emitir refresh token');
    }

    await this.prismaService.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId: input.userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private async verifyRefreshToken(refreshToken: string, ipAddress?: string) {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.configService.get<string>(
            'JWT_REFRESH_SECRET',
            'dev-refresh-secret',
          ),
        },
      );

      if (
        payload.type !== 'refresh' ||
        typeof payload.sub !== 'string' ||
        typeof payload.jti !== 'string'
      ) {
        throw new UnauthorizedException('Refresh token invalido');
      }

      return payload;
    } catch {
      this.logger.warn(
        `Falha na verificacao de refresh token ip=${ipAddress ?? 'unknown'}`,
      );
      throw new UnauthorizedException('Refresh token invalido');
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
