import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  AUTH_RATE_LIMIT_KEY,
  type AuthRateLimitOptions,
} from './auth-rate-limit.decorator';
import { AuthRateLimitService } from './auth-rate-limit.service';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AuthRateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<AuthRateLimitOptions>(
      AUTH_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = this.buildKey(request, options);
    const result = this.authRateLimitService.consume(key, {
      maxAttempts: options.maxAttempts,
      windowMs: options.windowMs,
    });

    if (result.allowed) {
      return true;
    }

    const retryAfterInSeconds = Math.max(
      1,
      Math.ceil(result.retryAfterMs / 1000),
    );

    this.logger.warn(
      `Rate limit excedido em auth bucket=${options.bucket} ip=${this.getClientIp(request)} key=${key}`,
    );

    throw new HttpException(
      {
        error: 'TooManyRequests',
        message: `Muitas tentativas em autenticacao. Tente novamente em ${retryAfterInSeconds}s.`,
        details: {
          bucket: options.bucket,
          retryAfterSeconds: retryAfterInSeconds,
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private buildKey(request: Request, options: AuthRateLimitOptions) {
    const email =
      options.includeEmail === false
        ? ''
        : this.extractEmail(request.body as unknown);

    return [options.bucket, this.getClientIp(request), email]
      .filter(Boolean)
      .join(':');
  }

  private extractEmail(body: unknown) {
    if (
      typeof body === 'object' &&
      body !== null &&
      'email' in body &&
      typeof body.email === 'string'
    ) {
      return body.email.toLowerCase().trim();
    }

    return '';
  }

  private getClientIp(request: Request) {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor) && forwardedFor[0]) {
      return forwardedFor[0].split(',')[0]?.trim() ?? request.ip ?? 'unknown';
    }

    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      return forwardedFor.split(',')[0]?.trim() ?? request.ip ?? 'unknown';
    }

    return request.ip ?? 'unknown';
  }
}
