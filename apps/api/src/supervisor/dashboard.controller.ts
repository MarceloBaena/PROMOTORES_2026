import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { DashboardQueryDto } from './supervisor.dto';
import { SupervisorService } from './supervisor.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
export class DashboardController {
  constructor(private readonly supervisorService: SupervisorService) {}

  @Get('supervisor')
  getSupervisorDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.supervisorService.getDashboard(user.userId, query);
  }
}
