import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { EndJourneyDto, StartJourneyDto } from './operations.dto';
import { OperationsService } from './operations.service';

@Controller('journeys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROMOTER)
export class JourneysController {
  constructor(private readonly operationsService: OperationsService) {}

  @Post('start')
  startJourney(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartJourneyDto,
  ) {
    return this.operationsService.startJourney(user.userId, body);
  }

  @Post('end')
  endJourney(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: EndJourneyDto,
  ) {
    return this.operationsService.endJourney(user.userId, body);
  }
}
