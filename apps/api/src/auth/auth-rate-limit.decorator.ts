import { SetMetadata } from '@nestjs/common';

export interface AuthRateLimitOptions {
  bucket: 'login' | 'refresh' | 'logout';
  maxAttempts?: number;
  windowMs?: number;
  includeEmail?: boolean;
}

export const AUTH_RATE_LIMIT_KEY = 'auth-rate-limit';

export const AuthRateLimit = (options: AuthRateLimitOptions) =>
  SetMetadata(AUTH_RATE_LIMIT_KEY, options);
