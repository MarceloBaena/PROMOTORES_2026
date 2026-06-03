import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
  CheckInDto,
  CheckOutDto,
  SubmitChecklistDto,
} from '../operations/operations.dto';
import { OperationsService } from '../operations/operations.service';
import { SupervisorService } from '../supervisor/supervisor.service';
import {
  TodayVisitsQueryDto,
  UpdateVisitNotesDto,
  UpdateVisitStatusDto,
} from './visits.dto';
import { mapOperationalVisitStatusToPrimaryRouteStopStatus } from './visit-status';

@Controller('visits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitsController {
  constructor(
    private readonly operationsService: OperationsService,
    private readonly supervisorService: SupervisorService,
  ) {}

  @Post('check-in')
  @Roles(UserRole.PROMOTER)
  checkIn(@CurrentUser() user: AuthenticatedUser, @Body() body: CheckInDto) {
    return this.operationsService.checkIn(user.userId, body);
  }

  @Get('today')
  @Roles(UserRole.PROMOTER, UserRole.SUPERVISOR, UserRole.ADMIN)
  listToday(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TodayVisitsQueryDto,
  ) {
    if (user.role === UserRole.PROMOTER) {
      return this.operationsService.listTodayVisits(user.userId, query);
    }

    return this.supervisorService.listVisits(user.userId, {
      date: query.date,
      promoterId: query.promoterId,
      search: query.search,
      status: query.status
        ? mapOperationalVisitStatusToPrimaryRouteStopStatus(query.status)
        : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id')
  @Roles(UserRole.PROMOTER, UserRole.SUPERVISOR, UserRole.ADMIN)
  getVisit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (user.role === UserRole.PROMOTER) {
      return this.operationsService.getVisitForPromoter(user.userId, id);
    }

    return this.supervisorService.getVisitDetails(user.userId, id);
  }

  @Post(':id/check-out')
  @Roles(UserRole.PROMOTER)
  checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: CheckOutDto,
  ) {
    return this.operationsService.checkOut(user.userId, id, body);
  }

  @Post(':id/checklist')
  @Roles(UserRole.PROMOTER)
  submitChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SubmitChecklistDto,
  ) {
    return this.operationsService.submitChecklist(user.userId, id, body);
  }

  @Put(':id/status')
  @Roles(UserRole.PROMOTER)
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateVisitStatusDto,
  ) {
    return this.operationsService.updateVisitStatus(user.userId, id, body);
  }

  @Put(':id/notes')
  @Roles(UserRole.PROMOTER)
  updateNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateVisitNotesDto,
  ) {
    return this.operationsService.updateVisitNotes(user.userId, id, body.notes);
  }
}
