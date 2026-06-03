import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthRateLimitService,
    AuthRateLimitGuard,
  ],
  exports: [AuthService],
})
export class AuthModule {}
