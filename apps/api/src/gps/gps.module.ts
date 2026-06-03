import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GpsService } from './gps.service';

@Module({
  imports: [PrismaModule],
  providers: [GpsService],
  exports: [GpsService],
})
export class GpsModule {}
