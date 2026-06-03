import {
  Body,
  Controller,
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
  CreateCollaboratorDto,
  ListCollaboratorsQueryDto,
  ResetCollaboratorPasswordDto,
  UpdateCollaboratorDto,
  UpdateCollaboratorStatusDto,
} from './collaborators.dto';
import { CollaboratorsService } from './collaborators.service';

@Controller('collaborators')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
export class CollaboratorsController {
  constructor(private readonly collaboratorsService: CollaboratorsService) {}

  @Get()
  listCollaborators(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCollaboratorsQueryDto,
  ) {
    return this.collaboratorsService.listCollaborators(user.userId, query);
  }

  @Get(':id')
  getCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.collaboratorsService.getCollaboratorDetails(user.userId, id);
  }

  @Post()
  createCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCollaboratorDto,
  ) {
    return this.collaboratorsService.createCollaborator(user.userId, body);
  }

  @Put(':id')
  updateCollaborator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateCollaboratorDto,
  ) {
    return this.collaboratorsService.updateCollaborator(user.userId, id, body);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateCollaboratorStatusDto,
  ) {
    return this.collaboratorsService.updateCollaboratorStatus(
      user.userId,
      id,
      body.status,
    );
  }

  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ResetCollaboratorPasswordDto,
  ) {
    return this.collaboratorsService.resetCollaboratorPassword(
      user.userId,
      id,
      body.newPassword,
    );
  }
}
