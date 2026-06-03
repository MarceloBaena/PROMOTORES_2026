import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OperationsService } from './operations.service';
import { SyncPullQueryDto, SyncPushDto } from './operations.dto';

@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROMOTER)
export class SyncController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('pull')
  pull(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncPullQueryDto,
  ) {
    return this.operationsService.pullSyncSnapshot(user.userId, query);
  }

  @Post('push')
  push(@CurrentUser() user: AuthenticatedUser, @Body() body: SyncPushDto) {
    return this.operationsService.pushSyncBatch(user.userId, body);
  }
}
