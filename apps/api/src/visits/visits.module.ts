import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SupervisorModule } from '../supervisor/supervisor.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [PrismaModule, OperationsModule, SupervisorModule],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
