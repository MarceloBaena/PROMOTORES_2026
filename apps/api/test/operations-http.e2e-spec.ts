import type { Server } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { AlertsController } from '../src/alerts/alerts.controller';
import { RolesGuard } from '../src/common/roles.guard';
import { ChecklistsController } from '../src/checklists/checklists.controller';
import { JourneysController } from '../src/operations/journeys.controller';
import { OperationsService } from '../src/operations/operations.service';
import { SyncController } from '../src/operations/sync.controller';
import { PrismaService } from '../src/prisma/prisma.service';
import { RoutePlansController } from '../src/route-plans/route-plans.controller';
import { RoutePlansService } from '../src/route-plans/route-plans.service';
import { DashboardController } from '../src/supervisor/dashboard.controller';
import { SupervisorService } from '../src/supervisor/supervisor.service';
import { VisitsController } from '../src/visits/visits.controller';

interface MockUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  deletedAt: Date | null;
}

describe('Operational HTTP endpoints (e2e)', () => {
  let jwtService: JwtService;
  let users: MockUser[];

  const prismaService = {
    user: {
      findFirst: jest.fn(
        ({
          where,
        }: {
          where?: {
            id?: string;
            active?: boolean;
            deletedAt?: null;
          };
        }) =>
          Promise.resolve(
            users.find((candidate) => {
              if (where?.id && candidate.id !== where.id) {
                return false;
              }

              if (
                where?.active !== undefined &&
                candidate.active !== where.active
              ) {
                return false;
              }

              if (
                where?.deletedAt === null &&
                candidate.deletedAt !== where.deletedAt
              ) {
                return false;
              }

              return true;
            }) ?? null,
          ),
      ),
    },
  };

  const operationsService = {
    startJourney: jest
      .fn()
      .mockResolvedValue({ id: 'journey-1', active: true }),
    endJourney: jest.fn().mockResolvedValue({ id: 'journey-1', active: false }),
    getTodayRoute: jest.fn().mockResolvedValue({
      route: {
        id: 'route-1',
        status: 'PUBLISHED',
      },
      checklistTemplate: [],
      activeJourney: null,
    }),
    checkIn: jest.fn().mockResolvedValue({ id: 'visit-1' }),
    startVisitService: jest.fn().mockResolvedValue({
      id: 'visit-1',
      serviceStartedAt: new Date().toISOString(),
    }),
    checkOut: jest
      .fn()
      .mockResolvedValue({ id: 'visit-1', status: 'COMPLETED' }),
    submitChecklist: jest.fn().mockResolvedValue({ id: 'visit-1' }),
    updateVisitStatus: jest
      .fn()
      .mockResolvedValue({ id: 'visit-1', status: 'PARTIAL' }),
    updateVisitNotes: jest
      .fn()
      .mockResolvedValue({ id: 'visit-1', notes: 'Cliente fechado' }),
    getVisitForPromoter: jest.fn().mockResolvedValue({ id: 'visit-1' }),
    listTodayVisits: jest.fn().mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{ routeStopId: 'stop-1', visitId: 'visit-1' }],
    }),
    getChecklistTemplate: jest.fn().mockResolvedValue([]),
    pullSyncSnapshot: jest.fn().mockResolvedValue({
      serverTime: new Date().toISOString(),
      deviceId: 'device-1',
      routeDate: '2026-04-11',
      routeVersion: 2,
      hasRouteChange: true,
      snapshot: {
        route: {
          id: 'route-1',
          status: 'PUBLISHED',
        },
        checklistTemplate: [],
        activeJourney: null,
        notifications: [],
      },
    }),
    pushSyncBatch: jest.fn().mockResolvedValue({
      serverTime: new Date().toISOString(),
      deviceId: 'device-1',
      pushedAt: new Date().toISOString(),
      acceptedActions: 1,
      rejectedActions: 0,
      results: [
        {
          id: 'queue-1',
          success: true,
        },
      ],
      snapshot: {
        route: {
          id: 'route-1',
          status: 'PUBLISHED',
        },
        checklistTemplate: [],
        activeJourney: null,
        notifications: [],
      },
    }),
  };

  const supervisorService = {
    listAlerts: jest.fn().mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    }),
    getDashboard: jest.fn().mockResolvedValue({
      activeJourneys: 1,
      plannedVisits: 10,
      completedVisits: 2,
      pendingVisits: 8,
      partialVisits: 0,
      highAlerts: 0,
      mapPoints: [],
      alerts: [],
    }),
    getVisitDetails: jest
      .fn()
      .mockResolvedValue({ id: 'visit-1', source: 'supervisor' }),
    listVisits: jest.fn().mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{ id: 'visit-1' }],
    }),
  };

  const configService = {
    get: jest.fn((key: string, fallback: unknown) => {
      const values: Record<string, unknown> = {
        JWT_ACCESS_SECRET: 'access-secret',
      };

      return values[key] ?? fallback;
    }),
  };

  const routePlansService = {
    listRoutePlans: jest.fn(),
    getRoutePlanDetails: jest.fn(),
    createRoutePlan: jest.fn(),
    updateRoutePlan: jest.fn(),
    archiveRoutePlan: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    users = [
      {
        id: 'admin-1',
        email: 'admin@formula.local',
        name: 'Administrador',
        role: UserRole.ADMIN,
        active: true,
        deletedAt: null,
      },
      {
        id: 'supervisor-1',
        email: 'supervisor@formula.local',
        name: 'Supervisor Operacional',
        role: UserRole.SUPERVISOR,
        active: true,
        deletedAt: null,
      },
      {
        id: 'promoter-1',
        email: 'promotor.centro@formula.local',
        name: 'Promotor Centro',
        role: UserRole.PROMOTER,
        active: true,
        deletedAt: null,
      },
    ];
  });

  const createApp = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [
        JourneysController,
        SyncController,
        RoutePlansController,
        VisitsController,
        ChecklistsController,
        AlertsController,
        DashboardController,
      ],
      providers: [
        JwtService,
        JwtStrategy,
        RolesGuard,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: OperationsService,
          useValue: operationsService,
        },
        {
          provide: RoutePlansService,
          useValue: routePlansService,
        },
        {
          provide: SupervisorService,
          useValue: supervisorService,
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    jwtService = app.get(JwtService);
    return app;
  };

  const signAccessToken = (user: MockUser) =>
    jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      {
        secret: 'access-secret',
      },
    );

  const getUserByRole = (role: UserRole) => {
    const user = users.find((candidate) => candidate.role === role);

    if (!user) {
      throw new Error(`Usuario de teste nao encontrado para ${role}`);
    }

    return user;
  };

  it('expone os endpoints operacionais exatos para o promotor autenticado', async () => {
    const app = await createApp();
    const promoterToken = await signAccessToken(
      getUserByRole(UserRole.PROMOTER),
    );

    try {
      await request(app.getHttpServer() as Server)
        .post('/journeys/start')
        .set('Authorization', `Bearer ${promoterToken}`)
        .send({
          startedAt: new Date().toISOString(),
          location: {
            latitude: -16.4706,
            longitude: -54.6355,
          },
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .get('/route-plans/today')
        .set('Authorization', `Bearer ${promoterToken}`)
        .expect(200);

      await request(app.getHttpServer() as Server)
        .post('/visits/check-in')
        .set('Authorization', `Bearer ${promoterToken}`)
        .send({
          routeStopId: 'stop-1',
          checkedInAt: new Date().toISOString(),
          location: {
            latitude: -16.4706,
            longitude: -54.6355,
          },
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .get('/visits/today')
        .set('Authorization', `Bearer ${promoterToken}`)
        .expect(200);

      await request(app.getHttpServer() as Server)
        .get('/checklists/template')
        .set('Authorization', `Bearer ${promoterToken}`)
        .expect(200);

      await request(app.getHttpServer() as Server)
        .get('/sync/pull')
        .query({
          deviceId: 'device-1',
          routeDate: '2026-04-11',
          lastKnownRouteVersion: 1,
        })
        .set('Authorization', `Bearer ${promoterToken}`)
        .expect(200);

      await request(app.getHttpServer() as Server)
        .post('/sync/push')
        .set('Authorization', `Bearer ${promoterToken}`)
        .send({
          deviceId: 'device-1',
          actions: [
            {
              id: 'queue-1',
              type: 'UPDATE_NOTES',
              payload: {
                visitId: 'visit-1',
                notes: 'Cliente reabastecido antes do checkout',
              },
            },
          ],
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .put('/visits/visit-1/notes')
        .set('Authorization', `Bearer ${promoterToken}`)
        .send({
          notes: 'Cliente com ruptura parcial',
        })
        .expect(200);

      await request(app.getHttpServer() as Server)
        .put('/visits/visit-1/status')
        .set('Authorization', `Bearer ${promoterToken}`)
        .send({
          status: 'PARCIAL',
          note: 'Atendimento parcial por indisponibilidade de estoque',
        })
        .expect(200);

      await request(app.getHttpServer() as Server)
        .post('/visits/visit-1/checklist')
        .set('Authorization', `Bearer ${promoterToken}`)
        .send({
          items: [],
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .get('/visits/visit-1')
        .set('Authorization', `Bearer ${promoterToken}`)
        .expect(200);

      await request(app.getHttpServer() as Server)
        .post('/visits/visit-1/check-out')
        .set('Authorization', `Bearer ${promoterToken}`)
        .send({
          checkedOutAt: new Date().toISOString(),
          location: {
            latitude: -16.4706,
            longitude: -54.6355,
          },
          completionStatus: 'COMPLETED',
        })
        .expect(201);

      await request(app.getHttpServer() as Server)
        .post('/journeys/end')
        .set('Authorization', `Bearer ${promoterToken}`)
        .send({
          endedAt: new Date().toISOString(),
          location: {
            latitude: -16.4706,
            longitude: -54.6355,
          },
        })
        .expect(201);
    } finally {
      await app.close();
    }
  });

  it('protege alerts e dashboard para supervisor/admin e bloqueia promotor', async () => {
    const app = await createApp();
    const promoterToken = await signAccessToken(
      getUserByRole(UserRole.PROMOTER),
    );
    const supervisorToken = await signAccessToken(
      getUserByRole(UserRole.SUPERVISOR),
    );
    const adminToken = await signAccessToken(getUserByRole(UserRole.ADMIN));

    try {
      await request(app.getHttpServer() as Server)
        .get('/alerts')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);

      await request(app.getHttpServer() as Server)
        .get('/dashboard/supervisor')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer() as Server)
        .get('/alerts')
        .set('Authorization', `Bearer ${promoterToken}`)
        .expect(403);

      await request(app.getHttpServer() as Server)
        .get('/dashboard/supervisor')
        .set('Authorization', `Bearer ${promoterToken}`)
        .expect(403);
    } finally {
      await app.close();
    }
  });

  it('aplica validacao de DTO nos endpoints operacionais', async () => {
    const app = await createApp();
    const promoterToken = await signAccessToken(
      getUserByRole(UserRole.PROMOTER),
    );

    try {
      await request(app.getHttpServer() as Server)
        .post('/journeys/start')
        .set('Authorization', `Bearer ${promoterToken}`)
        .send({
          startedAt: 'invalido',
          location: {
            latitude: 'abc',
          },
        })
        .expect(400);
    } finally {
      await app.close();
    }
  });
});
