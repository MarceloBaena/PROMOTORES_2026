import { Test } from '@nestjs/testing';
import {
  AlertSeverity,
  AlertType,
  PhotoCategory,
  PhotoGpsStatus,
  PhotoType,
  RouteStopStatus,
  VisitCompletionStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';

describe('AlertsService', () => {
  let alertsService: AlertsService;
  const findAlertMock = jest.fn();
  const findAlertsMock = jest.fn();
  const createAlertMock = jest.fn();
  const updateAlertMock = jest.fn();
  const findRoutePlansMock = jest.fn();
  const findRoutePlanItemsMock = jest.fn();
  const findVisitsMock = jest.fn();
  const findSyncOperationsMock = jest.fn();
  const auditRecordMock = jest.fn();

  const prismaService = {
    alert: {
      findFirst: findAlertMock,
      findMany: findAlertsMock,
      create: createAlertMock,
      update: updateAlertMock,
    },
    routePlan: {
      findMany: findRoutePlansMock,
    },
    routePlanItem: {
      findMany: findRoutePlanItemsMock,
    },
    visit: {
      findMany: findVisitsMock,
    },
    syncOperation: {
      findMany: findSyncOperationsMock,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: AuditService,
          useValue: {
            record: auditRecordMock,
          },
        },
      ],
    }).compile();

    alertsService = moduleRef.get(AlertsService);
    findAlertMock.mockResolvedValue(null);
    findAlertsMock.mockResolvedValue([]);
    createAlertMock.mockImplementation(
      ({
        data,
      }: {
        data: {
          type: AlertType;
          severity: AlertSeverity;
          message: string;
          promoterId: string;
          clientId?: string;
          visitId?: string;
        };
      }) =>
        Promise.resolve({
          id: `${data.type}-1`,
          active: true,
          resolvedAt: null,
          ...data,
        }),
    );
    updateAlertMock.mockImplementation(
      ({
        where,
        data,
      }: {
        where: {
          id: string;
        };
        data: {
          active?: boolean;
          resolvedAt?: Date;
          resolutionNote?: string;
          severity?: AlertSeverity;
          message?: string;
        };
      }) =>
        Promise.resolve({
          id: where.id,
          active: data.active ?? true,
          resolvedAt: data.resolvedAt ?? null,
          resolutionNote: data.resolutionNote ?? null,
          severity: data.severity ?? AlertSeverity.MEDIUM,
          message: data.message ?? 'updated',
        }),
    );
    findRoutePlansMock.mockResolvedValue([]);
    findRoutePlanItemsMock.mockResolvedValue([]);
    findVisitsMock.mockResolvedValue([]);
    findSyncOperationsMock.mockResolvedValue([]);
    auditRecordMock.mockResolvedValue(undefined);
  });

  it('gera alertas automaticos para falta de jornada e atraso relevante', async () => {
    findRoutePlansMock.mockResolvedValue([
      {
        promoterId: 'promoter-1',
        promoter: {
          user: {
            name: 'Promotor Centro',
          },
        },
        journeys: [],
      },
    ]);
    findRoutePlanItemsMock
      .mockResolvedValueOnce([
        {
          id: 'stop-1',
          status: RouteStopStatus.PLANNED,
          clientId: 'client-1',
          client: {
            tradeName: 'Mercado Centro',
          },
          routePlan: {
            promoterId: 'promoter-1',
          },
        },
      ])
      .mockResolvedValueOnce([]);

    await alertsService.reconcileOperationalAlerts(
      new Date('2026-03-21T15:00:00.000Z'),
    );

    const createdPayloads = (
      createAlertMock.mock.calls as Array<
        [
          {
            data: {
              type: AlertType;
              severity: AlertSeverity;
              promoterId: string;
              clientId?: string;
            };
          },
        ]
      >
    ).map(([input]) => input.data);

    expect(createdPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: AlertType.NO_ACTIVE_JOURNEY,
          severity: AlertSeverity.HIGH,
          promoterId: 'promoter-1',
        }),
        expect.objectContaining({
          type: AlertType.RELEVANT_DELAY,
          severity: AlertSeverity.MEDIUM,
          promoterId: 'promoter-1',
          clientId: 'client-1',
        }),
      ]),
    );
  });

  it('atualiza severidade e mensagem quando a mesma flag ja estava aberta', async () => {
    findAlertMock.mockResolvedValue({
      id: 'alert-1',
      type: AlertType.SYNC_FAILURE,
      severity: AlertSeverity.LOW,
      message: 'Mensagem antiga',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      visitId: 'visit-1',
      active: true,
      resolvedAt: null,
    });

    await alertsService.ensureActiveAlert({
      type: AlertType.SYNC_FAILURE,
      severity: AlertSeverity.MEDIUM,
      message: 'Falha de sincronizacao atualizada',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      visitId: 'visit-1',
    });

    expect(updateAlertMock).toHaveBeenCalledWith({
      where: {
        id: 'alert-1',
      },
      data: {
        severity: AlertSeverity.MEDIUM,
        message: 'Falha de sincronizacao atualizada',
      },
    });
    expect(auditRecordMock).toHaveBeenCalledWith(
      null,
      expect.any(String),
      'alert-1',
      'alert.updated',
      expect.objectContaining({
        previousSeverity: AlertSeverity.LOW,
        nextSeverity: AlertSeverity.MEDIUM,
      }),
    );
  });

  it('reconcilia flags da visita com gps ausente, fotos obrigatorias faltando e encerramento inconsistente', async () => {
    const syncAlertStateSpy = jest
      .spyOn(alertsService, 'syncAlertState')
      .mockResolvedValue(null);

    findVisitsMock.mockResolvedValue([
      {
        id: 'visit-1',
        promoterId: 'promoter-1',
        clientId: 'client-1',
        status: RouteStopStatus.COMPLETED,
        completionStatus: VisitCompletionStatus.COMPLETED,
        checkInAt: new Date('2026-03-21T10:00:00.000Z'),
        serviceStartedAt: null,
        checkOutAt: new Date('2026-03-21T10:02:00.000Z'),
        outsideGeofence: true,
        client: {
          tradeName: 'Mercado Centro',
        },
        photos: [
          {
            type: PhotoType.BEFORE,
            category: PhotoCategory.CHECKIN_ESTABLISHMENT,
            capturedAt: new Date('2026-03-21T10:00:00.000Z'),
            gpsStatus: PhotoGpsStatus.UNAVAILABLE,
          },
        ],
        checklistResponses: [],
      },
    ]);

    await alertsService.reconcileOperationalAlerts(
      new Date('2026-03-21T18:00:00.000Z'),
    );

    expect(syncAlertStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AlertType.GPS_MISSING,
        active: true,
        visitId: 'visit-1',
      }),
    );
    expect(syncAlertStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AlertType.OUTSIDE_GEOFENCE,
        active: true,
        visitId: 'visit-1',
      }),
    );
    expect(syncAlertStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AlertType.MISSING_REQUIRED_PHOTO,
        active: true,
        visitId: 'visit-1',
      }),
    );
    expect(syncAlertStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AlertType.INCONSISTENT_FINISH,
        active: true,
        visitId: 'visit-1',
      }),
    );
  });
});
