import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AlertsQueryDto, ResolveAlertDto } from '../supervisor/supervisor.dto';
import { SupervisorService } from '../supervisor/supervisor.service';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
export class AlertsController {
  constructor(private readonly supervisorService: SupervisorService) {}

  @Get()
  listAlerts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AlertsQueryDto,
  ) {
    return this.supervisorService.listAlerts(user.userId, query);
  }

  @Put(':alertId/resolve')
  resolveAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId') alertId: string,
    @Body() body: ResolveAlertDto,
  ) {
    return this.supervisorService.resolveAlert(user.userId, alertId, body);
  }
}
