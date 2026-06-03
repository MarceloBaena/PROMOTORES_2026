import { Module } from '@nestjs/common';
import { OperationsModule } from '../operations/operations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

@Module({
  imports: [PrismaModule, OperationsModule],
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
