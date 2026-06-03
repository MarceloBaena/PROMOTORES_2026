import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OperationsService } from '../operations/operations.service';

@Controller('checklists')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChecklistsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('template')
  @Roles(UserRole.PROMOTER)
  getChecklistTemplate() {
    return this.operationsService.getChecklistTemplate();
  }
}
