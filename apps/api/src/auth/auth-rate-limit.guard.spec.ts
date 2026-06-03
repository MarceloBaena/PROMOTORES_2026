import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthRateLimitService } from './auth-rate-limit.service';

describe('AuthRateLimitGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const authRateLimitService = {
    consume: jest.fn(),
  } as unknown as AuthRateLimitService;

  const createContext = (email = 'user@example.com') =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '127.0.0.1',
          headers: {},
          body: {
            email,
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('permite a requisicao quando ainda ha margem de tentativas', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue({
      bucket: 'login',
      includeEmail: true,
    });
    authRateLimitService.consume = jest.fn().mockReturnValue({
      allowed: true,
      attempts: 1,
      retryAfterMs: 60_000,
    });

    const guard = new AuthRateLimitGuard(reflector, authRateLimitService);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('bloqueia a requisicao quando o limite foi excedido', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue({
      bucket: 'login',
      includeEmail: true,
    });
    authRateLimitService.consume = jest.fn().mockReturnValue({
      allowed: false,
      attempts: 6,
      retryAfterMs: 30_000,
    });

    const guard = new AuthRateLimitGuard(reflector, authRateLimitService);

    try {
      guard.canActivate(createContext());
      throw new Error('O guard deveria bloquear a requisicao');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });
});
