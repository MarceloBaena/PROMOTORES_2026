import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { OperationsService } from '../src/operations/operations.service';
import { SupervisorService } from '../src/supervisor/supervisor.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const authService = app.get(AuthService);
    const operationsService = app.get(OperationsService);
    const supervisorService = app.get(SupervisorService);

    const promoterSession = await authService.login(
      'promotor.centro@formula.local',
      'Promotor@123',
    );
    const route = await operationsService.getTodayRoute(promoterSession.user.id);
    const supervisorSession = await authService.login(
      'supervisor@formula.local',
      'Supervisor@123',
    );
    const dashboard = await supervisorService.getDashboard();

    console.log(
      JSON.stringify(
        {
          promoterUserId: promoterSession.user.id,
          supervisorUserId: supervisorSession.user.id,
          routeStops: route.route?.stops.length ?? 0,
          checklistItems: route.checklistTemplate.length,
          activeJourney: route.activeJourney !== null,
          plannedVisits: dashboard.plannedVisits,
          pendingVisits: dashboard.pendingVisits,
          highAlerts: dashboard.highAlerts,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
