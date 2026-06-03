import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedUser } from './authenticated-user';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: AuthenticatedUser | undefined,
    info: { message?: string } | undefined,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    void context;
    void status;

    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException(
            info?.message ?? 'Sessao expirada ou token de acesso invalido.',
          );
    }

    return user as TUser;
  }
}
