import { Module, forwardRef } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { AuditModule } from '../audit/audit.module';
import { DashboardController } from './dashboard.controller';
import { SupervisorController } from './supervisor.controller';
import { SupervisorService } from './supervisor.service';

@Module({
  imports: [AuditModule, forwardRef(() => AlertsModule)],
  controllers: [SupervisorController, DashboardController],
  providers: [SupervisorService],
  exports: [SupervisorService],
})
export class SupervisorModule {}
