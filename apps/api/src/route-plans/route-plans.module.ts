import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OperationsModule } from '../operations/operations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RoutePlansController } from './route-plans.controller';
import { RoutePlansService } from './route-plans.service';

@Module({
  imports: [PrismaModule, OperationsModule, AuditModule],
  controllers: [RoutePlansController],
  providers: [RoutePlansService],
  exports: [RoutePlansService],
})
export class RoutePlansModule {}
