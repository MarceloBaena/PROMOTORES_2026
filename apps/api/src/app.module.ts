import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlertsModule } from './alerts/alerts.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { CollaboratorsModule } from './collaborators/collaborators.module';
import { CustomersModule } from './customers/customers.module';
import { validateEnv } from './env';
import { GpsModule } from './gps/gps.module';
import { OperationsModule } from './operations/operations.module';
import { PhotosModule } from './photos/photos.module';
import { PromotersModule } from './promoters/promoters.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoutePlansModule } from './route-plans/route-plans.module';
import { StorageModule } from './storage/storage.module';
import { SupervisorModule } from './supervisor/supervisor.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';
import { VisitsModule } from './visits/visits.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    StorageModule,
    AuditModule,
    AlertsModule,
    AuthModule,
    CollaboratorsModule,
    UsersModule,
    PromotersModule,
    CustomersModule,
    RoutePlansModule,
    VisitsModule,
    PhotosModule,
    ChecklistsModule,
    GpsModule,
    OperationsModule,
    SupervisorModule,
    TeamsModule,
  ],
})
export class AppModule {}
