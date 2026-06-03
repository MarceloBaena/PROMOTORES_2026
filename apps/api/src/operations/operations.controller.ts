import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Express } from 'express';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import {
  CheckInDto,
  CheckInWithPhotoDto,
  CheckOutDto,
  EndJourneyDto,
  StartVisitServiceDto,
  StartJourneyDto,
  SubmitChecklistDto,
  SyncBatchDto,
  TrackPointDto,
  UploadPhotoQueryDto,
} from './operations.dto';
import { OperationsService } from './operations.service';

@Controller('operations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROMOTER)
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('route/today')
  getTodayRoute(@CurrentUser() user: AuthenticatedUser) {
    return this.operationsService.getTodayRoute(user.userId);
  }

  @Get('journey/active')
  getActiveJourney(@CurrentUser() user: AuthenticatedUser) {
    return this.operationsService.getActiveJourney(user.userId);
  }

  @Get('checklist-template')
  getChecklistTemplate() {
    return this.operationsService.getChecklistTemplate();
  }

  @Get('visits/:visitId')
  getVisit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitId') visitId: string,
  ) {
    return this.operationsService.getVisitForPromoter(user.userId, visitId);
  }

  @Post('journey/start')
  startJourney(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartJourneyDto,
  ) {
    return this.operationsService.startJourney(user.userId, body);
  }

  @Post('journey/track')
  trackJourney(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TrackPointDto,
  ) {
    return this.operationsService.addTrackPoint(user.userId, body);
  }

  @Post('journey/end')
  endJourney(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: EndJourneyDto,
  ) {
    return this.operationsService.endJourney(user.userId, body);
  }

  @Post('visits/check-in')
  checkIn(@CurrentUser() user: AuthenticatedUser, @Body() body: CheckInDto) {
    return this.operationsService.checkIn(user.userId, body);
  }

  @UseInterceptors(FileInterceptor('file'))
  @Post('visits/check-in-with-photo')
  checkInWithPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CheckInWithPhotoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Foto do estabelecimento obrigatoria para confirmar check-in.',
      );
    }

    return this.operationsService.checkInWithPhoto(user.userId, body, file);
  }

  @Post('visits/:visitId/start-service')
  startVisitService(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitId') visitId: string,
    @Body() body: StartVisitServiceDto,
  ) {
    return this.operationsService.startVisitService(user.userId, visitId, body);
  }

  @Put('visits/:visitId/checklist')
  submitChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitId') visitId: string,
    @Body() body: SubmitChecklistDto,
  ) {
    return this.operationsService.submitChecklist(user.userId, visitId, body);
  }

  @UseInterceptors(FileInterceptor('file'))
  @Post('visits/:visitId/photos')
  uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitId') visitId: string,
    @Query() query: UploadPhotoQueryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatorio');
    }

    return this.operationsService.uploadPhoto(
      user.userId,
      visitId,
      query,
      file,
    );
  }

  @Post('visits/:visitId/check-out')
  checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('visitId') visitId: string,
    @Body() body: CheckOutDto,
  ) {
    return this.operationsService.checkOut(user.userId, visitId, body);
  }

  @Post('sync')
  sync(@CurrentUser() user: AuthenticatedUser, @Body() body: SyncBatchDto) {
    return this.operationsService.syncBatch(user.userId, body);
  }
}
