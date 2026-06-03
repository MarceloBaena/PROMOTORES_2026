import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthRateLimit } from './auth-rate-limit.decorator';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit({
    bucket: 'login',
    includeEmail: true,
  })
  @Post('login')
  login(
    @Body() body: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Req() request?: Request,
  ) {
    return this.authService.login(
      body.email,
      body.password,
      userAgent,
      this.getClientIp(request),
    );
  }

  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit({
    bucket: 'refresh',
    includeEmail: false,
    maxAttempts: 10,
  })
  @Post('refresh')
  refresh(
    @Body() body: RefreshTokenDto,
    @Headers('user-agent') userAgent?: string,
    @Req() request?: Request,
  ) {
    return this.authService.refresh(
      body.refreshToken,
      userAgent,
      this.getClientIp(request),
    );
  }

  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit({
    bucket: 'logout',
    includeEmail: false,
    maxAttempts: 20,
  })
  @Post('logout')
  logout(@Body() body: RefreshTokenDto, @Req() request?: Request) {
    return this.authService.logout(
      body.refreshToken,
      this.getClientIp(request),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }

  private getClientIp(request?: Request) {
    if (!request) {
      return undefined;
    }

    const forwardedFor = request.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor) && forwardedFor[0]) {
      return forwardedFor[0].split(',')[0]?.trim() ?? request.ip;
    }

    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      return forwardedFor.split(',')[0]?.trim() ?? request.ip;
    }

    return request.ip;
  }
}
