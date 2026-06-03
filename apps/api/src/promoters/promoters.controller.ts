import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ListPromotersQueryDto } from './promoters.dto';
import { PromotersService } from './promoters.service';

@Controller('promoters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromotersController {
  constructor(private readonly promotersService: PromotersService) {}

  @Get()
  @Roles(UserRole.SUPERVISOR, UserRole.ADMIN)
  listPromoters(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPromotersQueryDto,
  ) {
    return this.promotersService.listPromoters(user.userId, query);
  }
}
