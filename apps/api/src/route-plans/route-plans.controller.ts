import {
  Body,
  Controller,
  Delete,
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
import { OperationsService } from '../operations/operations.service';
import {
  ApplyRouteTemplateDto,
  BatchUpsertRoutePlansDto,
  ListPromoterNotificationsQueryDto,
  ListRoutePlansQueryDto,
  ListRouteTemplatesQueryDto,
  PublishRoutePlanDto,
  UpsertRoutePlanDto,
  UpsertRouteTemplateDto,
} from './route-plans.dto';
import { RoutePlansService } from './route-plans.service';

@Controller('route-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoutePlansController {
  constructor(
    private readonly operationsService: OperationsService,
    private readonly routePlansService: RoutePlansService,
  ) {}

  @Get('today')
  @Roles(UserRole.PROMOTER)
  getTodayRoute(@CurrentUser() user: AuthenticatedUser) {
    return this.operationsService.getTodayRoute(user.userId);
  }

  @Get()
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  listRoutePlans(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRoutePlansQueryDto,
  ) {
    return this.routePlansService.listRoutePlans(user.userId, query);
  }

  @Post('batch')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  createRoutePlansBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: BatchUpsertRoutePlansDto,
  ) {
    return this.routePlansService.createRoutePlansBatch(user.userId, body);
  }

  @Get('templates')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  listRouteTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRouteTemplatesQueryDto,
  ) {
    return this.routePlansService.listRouteTemplates(user.userId, query);
  }

  @Get('templates/:id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  getRouteTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.routePlansService.getRouteTemplateDetails(user.userId, id);
  }

  @Post('templates')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  createRouteTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpsertRouteTemplateDto,
  ) {
    return this.routePlansService.createRouteTemplate(user.userId, body);
  }

  @Put('templates/:id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  updateRouteTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpsertRouteTemplateDto,
  ) {
    return this.routePlansService.updateRouteTemplate(user.userId, id, body);
  }

  @Post('templates/:id/apply')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  applyRouteTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ApplyRouteTemplateDto,
  ) {
    return this.routePlansService.applyRouteTemplate(user.userId, id, body);
  }

  @Get('notifications')
  @Roles(UserRole.PROMOTER)
  listPromoterNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPromoterNotificationsQueryDto,
  ) {
    return this.routePlansService.listPromoterNotifications(user.userId, query);
  }

  @Post('notifications/:id/read')
  @Roles(UserRole.PROMOTER)
  markNotificationAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.routePlansService.markNotificationAsRead(user.userId, id);
  }

  @Get(':id/history')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  getRoutePlanHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.routePlansService.getRoutePlanHistory(user.userId, id);
  }

  @Get(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  getRoutePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.routePlansService.getRoutePlanDetails(user.userId, id);
  }

  @Post()
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  createRoutePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpsertRoutePlanDto,
  ) {
    return this.routePlansService.createRoutePlan(user.userId, body);
  }

  @Put(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  updateRoutePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpsertRoutePlanDto,
  ) {
    return this.routePlansService.updateRoutePlan(user.userId, id, body);
  }

  @Post(':id/publish')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  publishRoutePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: PublishRoutePlanDto,
  ) {
    return this.routePlansService.publishRoutePlan(user.userId, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  archiveRoutePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.routePlansService.archiveRoutePlan(user.userId, id);
  }
}
