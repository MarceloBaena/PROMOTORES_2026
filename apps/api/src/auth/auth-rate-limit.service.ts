import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateLimitBucket {
  attempts: number;
  resetAt: number;
}

@Injectable()
export class AuthRateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly configService: ConfigService) {}

  consume(
    key: string,
    options?: {
      maxAttempts?: number;
      windowMs?: number;
    },
  ) {
    this.cleanupExpired();

    const now = Date.now();
    const windowMs =
      options?.windowMs ??
      this.configService.get<number>('AUTH_RATE_LIMIT_WINDOW_MS', 60_000);
    const maxAttempts =
      options?.maxAttempts ??
      this.configService.get<number>('AUTH_RATE_LIMIT_MAX_ATTEMPTS', 5);
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      const nextBucket: RateLimitBucket = {
        attempts: 1,
        resetAt: now + windowMs,
      };

      this.buckets.set(key, nextBucket);

      return {
        allowed: true,
        attempts: nextBucket.attempts,
        retryAfterMs: windowMs,
      };
    }

    current.attempts += 1;
    this.buckets.set(key, current);

    return {
      allowed: current.attempts <= maxAttempts,
      attempts: current.attempts,
      retryAfterMs: Math.max(current.resetAt - now, 0),
    };
  }

  clear(key: string) {
    this.buckets.delete(key);
  }

  clearAll() {
    this.buckets.clear();
  }

  private cleanupExpired() {
    const now = Date.now();

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
