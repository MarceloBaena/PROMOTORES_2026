import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
  CreateTeamDto,
  ListTeamsQueryDto,
  UpdateTeamDto,
  UpdateTeamMembersDto,
  UpdateTeamStatusDto,
} from './teams.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  listTeams(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTeamsQueryDto,
  ) {
    return this.teamsService.listTeams(user.userId, query);
  }

  @Get(':id')
  getTeam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teamsService.getTeamDetails(user.userId, id);
  }

  @Post()
  createTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateTeamDto,
  ) {
    return this.teamsService.createTeam(user.userId, body);
  }

  @Put(':id')
  updateTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateTeamDto,
  ) {
    return this.teamsService.updateTeam(user.userId, id, body);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateTeamStatusDto,
  ) {
    return this.teamsService.updateTeamStatus(user.userId, id, body.status);
  }

  @Get(':id/members')
  getMembers(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teamsService.listTeamMembers(user.userId, id);
  }

  @Post(':id/members')
  addMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateTeamMembersDto,
  ) {
    return this.teamsService.addTeamMembers(user.userId, id, body);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.teamsService.removeTeamMember(user.userId, id, memberId);
  }
}
