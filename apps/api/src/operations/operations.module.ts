import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { JourneysController } from './journeys.controller';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { SyncController } from './sync.controller';

@Module({
  imports: [StorageModule, AuditModule, AlertsModule],
  controllers: [OperationsController, JourneysController, SyncController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
