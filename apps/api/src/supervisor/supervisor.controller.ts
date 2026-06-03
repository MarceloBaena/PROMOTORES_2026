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
import {
  AuditQueryDto,
  AlertsQueryDto,
  DashboardQueryDto,
  EvidenceQueryDto,
  MapQueryDto,
  ReportsQueryDto,
  ResolveAlertDto,
  SyncPendenciesQueryDto,
  TeamQueryDto,
  VisitsQueryDto,
} from './supervisor.dto';
import { SupervisorService } from './supervisor.service';

@Controller('supervisor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
export class SupervisorController {
  constructor(private readonly supervisorService: SupervisorService) {}

  @Get('dashboard')
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.supervisorService.getDashboard(user.userId, query);
  }

  @Get('map')
  getMap(@CurrentUser() user: AuthenticatedUser, @Query() query: MapQueryDto) {
    return this.supervisorService.getOperationalMap(user.userId, query);
  }

  @Get('team')
  listTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TeamQueryDto,
  ) {
    return this.supervisorService.listTeam(user.userId, query);
  }

  @Get('visits')
  listVisits(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: VisitsQueryDto,
  ) {
    return this.supervisorService.listVisits(user.userId, query);
  }

  @Get('visits/:visitId')
  getVisitDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitId') visitId: string,
  ) {
    return this.supervisorService.getVisitDetails(user.userId, visitId);
  }

  @Get('alerts')
  listAlerts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AlertsQueryDto,
  ) {
    return this.supervisorService.listAlerts(user.userId, query);
  }

  @Put('alerts/:alertId/resolve')
  resolveAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId') alertId: string,
    @Body() body: ResolveAlertDto,
  ) {
    return this.supervisorService.resolveAlert(user.userId, alertId, body);
  }

  @Get('evidences')
  listEvidences(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EvidenceQueryDto,
  ) {
    return this.supervisorService.listEvidences(user.userId, query);
  }

  @Get('reports')
  getReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportsQueryDto,
  ) {
    return this.supervisorService.getReports(user.userId, query);
  }

  @Get('audit')
  listAudit(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AuditQueryDto,
  ) {
    return this.supervisorService.listAuditLogs(user.userId, query);
  }

  @Get('sync-pendencies')
  listSyncPendencies(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncPendenciesQueryDto,
  ) {
    return this.supervisorService.listSyncPendencies(user.userId, query);
  }
}
