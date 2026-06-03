import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import {
  AlertType,
  GpsLogSource,
  PhotoCategory,
  PhotoGpsStatus,
  PhotoType,
  Prisma,
  RoutePlanStatus,
  RouteStopStatus,
  VisitPhotoStage,
  VisitCompletionStatus,
} from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OperationsService } from './operations.service';

describe('OperationsService', () => {
  let operationsService: OperationsService;
  type RoutePlanFindFirstCall = [
    {
      where: {
        promoterId: string;
        active: boolean;
        status: RoutePlanStatus;
        publishedAt: {
          not: null;
        };
        routeDate: {
          gte: Date;
          lt: Date;
        };
      };
    },
  ];

  const prismaService = {
    $transaction: jest.fn(),
    journey: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    routePlan: {
      findFirst: jest.fn(),
    },
    notification: {
      findMany: jest.fn(),
    },
    routePlanItem: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    visit: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    gpsLog: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    visitPhoto: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    visitChecklist: {
      findFirst: jest.fn(),
    },
    syncOperation: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };

  const storageService = {
    deleteFile: jest.fn(),
    saveFile: jest.fn(),
  };

  const auditService = {
    record: jest.fn(),
  };

  const alertsService = {
    createAlert: jest.fn(),
    ensureActiveAlert: jest.fn(),
    syncAlertState: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaService.syncOperation.findUnique.mockResolvedValue(null);
    prismaService.syncOperation.upsert.mockResolvedValue(undefined);
    prismaService.syncOperation.update.mockResolvedValue(undefined);
    alertsService.ensureActiveAlert.mockResolvedValue(null);
    alertsService.syncAlertState.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OperationsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: StorageService,
          useValue: storageService,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
        {
          provide: AlertsService,
          useValue: alertsService,
        },
      ],
    }).compile();

    operationsService = moduleRef.get(OperationsService);
  });

  it('bloqueia check-in fora da geofence sem justificativa', async () => {
    prismaService.journey.findFirst.mockResolvedValue({
      id: 'journey-1',
      promoterId: 'promoter-1',
      active: true,
      startedAt: new Date(),
    });
    prismaService.routePlanItem.findFirst.mockResolvedValue({
      id: 'stop-1',
      routePlanId: 'route-plan-1',
      clientId: 'client-1',
      status: RouteStopStatus.PLANNED,
      visit: null,
      client: {
        id: 'client-1',
        tradeName: 'Mercado',
        latitude: -16.4706,
        longitude: -54.6355,
        geofenceRadiusM: 10,
      },
    });

    await expect(
      operationsService.checkIn('promoter-1', {
        routeStopId: 'stop-1',
        checkedInAt: new Date().toISOString(),
        location: {
          latitude: -16.4606,
          longitude: -54.6255,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('carrega a rota do promotor usando apenas roteiros publicados na janela do dia local', async () => {
    const now = new Date(2026, 3, 5, 10, 15, 0, 0);
    jest.useFakeTimers();
    jest.setSystemTime(now);

    prismaService.routePlan.findFirst.mockResolvedValue(null);
    prismaService.notification.findMany.mockResolvedValue([]);
    jest
      .spyOn(operationsService, 'getChecklistTemplate')
      .mockResolvedValue([] as never);
    jest
      .spyOn(operationsService, 'getActiveJourney')
      .mockResolvedValue(null as never);

    try {
      await operationsService.getTodayRoute('promoter-1');
    } finally {
      jest.useRealTimers();
    }

    const routePlanFindFirstCalls = prismaService.routePlan.findFirst.mock
      .calls as unknown as Array<RoutePlanFindFirstCall>;
    const firstRoutePlanFindFirstCall = routePlanFindFirstCalls[0] as
      | RoutePlanFindFirstCall
      | undefined;
    const where = firstRoutePlanFindFirstCall?.[0].where;

    if (!where) {
      throw new Error('A query do roteiro do promotor nao foi registrada');
    }

    expect(where.promoterId).toBe('promoter-1');
    expect(where.active).toBe(true);
    expect(where.status).toBe(RoutePlanStatus.PUBLISHED);
    expect(where.publishedAt).toEqual({
      not: null,
    });
    expect(where.routeDate.gte.toISOString()).toBe('2026-04-05T04:00:00.000Z');
    expect(where.routeDate.lt.toISOString()).toBe('2026-04-06T04:00:00.000Z');
  });

  it('reprocessa check-in com idempotencia sem criar segunda visita', async () => {
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: new Date('2026-03-21T10:02:00.000Z'),
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Centro',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-checkin-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
          capturedAt: new Date('2026-03-21T10:00:00.000Z'),
          publicUrl: '/uploads/checkin.jpg',
        },
      ],
      checklistResponses: [],
    });

    const response = await operationsService.checkIn('promoter-1', {
      routeStopId: 'stop-1',
      checkedInAt: '2026-03-21T10:00:00.000Z',
      location: {
        latitude: -16.4706,
        longitude: -54.6355,
      },
      eventId: 'checkin-fixed-event',
    });

    expect(response.id).toBe('visit-1');
    expect(prismaService.$transaction).not.toHaveBeenCalled();
  });

  it('reprocessa ponto GPS com idempotencia sem gravar novamente', async () => {
    prismaService.gpsLog.findFirst.mockResolvedValue({
      id: 'gps-1',
      journeyId: 'journey-1',
      capturedAt: new Date('2026-03-21T10:05:00.000Z'),
    });

    const response = await operationsService.addTrackPoint('promoter-1', {
      capturedAt: '2026-03-21T10:05:00.000Z',
      location: {
        latitude: -16.4706,
        longitude: -54.6355,
      },
      source: GpsLogSource.TRACKING,
      eventId: 'gps-fixed-event',
    });

    expect(response).toEqual({
      id: 'gps-1',
      journeyId: 'journey-1',
      capturedAt: '2026-03-21T10:05:00.000Z',
    });
    expect(prismaService.journey.findFirst).not.toHaveBeenCalled();
  });

  it('processa sincronizacao de notas pelo lote push sem perder idempotencia da fila', async () => {
    const updateVisitNotesSpy = jest.spyOn(
      operationsService,
      'updateVisitNotes',
    );
    updateVisitNotesSpy.mockResolvedValue({
      id: 'visit-1',
      notes: 'Reposicao concluida com ajuste de gondola',
    } as never);

    const response = await operationsService.syncBatch('promoter-1', {
      actions: [
        {
          id: 'queue-1',
          clientGeneratedId: 'notes-visit-1',
          type: 'UPDATE_NOTES',
          payload: {
            visitId: 'visit-1',
            notes: 'Reposicao concluida com ajuste de gondola',
          },
        },
      ],
    });

    expect(updateVisitNotesSpy).toHaveBeenCalledWith(
      'promoter-1',
      'visit-1',
      'Reposicao concluida com ajuste de gondola',
    );
    expect(response.results).toHaveLength(1);
    const firstResult = response.results[0];

    if (!firstResult) {
      throw new Error('Nenhum resultado retornado pelo sync batch');
    }

    expect(firstResult).toMatchObject({
      id: 'queue-1',
      clientGeneratedId: 'notes-visit-1',
      actionType: 'UPDATE_NOTES',
      success: true,
      status: 'SYNCED',
      serverEntityId: 'visit-1',
      result: {
        id: 'visit-1',
        notes: 'Reposicao concluida com ajuste de gondola',
      },
    });
    expect(typeof firstResult.processedAt).toBe('string');
  });

  it('reaproveita a confirmacao salva quando o mesmo clientGeneratedId chega novamente', async () => {
    const action = {
      id: 'queue-1',
      clientGeneratedId: 'notes-visit-1',
      type: 'UPDATE_NOTES' as const,
      payload: {
        visitId: 'visit-1',
        notes: 'Reposicao concluida com ajuste de gondola',
      },
    };
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(action))
      .digest('hex');

    prismaService.syncOperation.findUnique.mockResolvedValue({
      id: 'sync-1',
      promoterId: 'promoter-1',
      clientGeneratedId: 'notes-visit-1',
      actionType: 'UPDATE_NOTES',
      payloadHash,
      status: 'SYNCED',
      serverEntityId: 'visit-1',
      processedAt: new Date('2026-04-22T18:00:00.000Z'),
      responsePayload: {
        result: {
          id: 'visit-1',
          notes: 'Reposicao concluida com ajuste de gondola',
        },
      },
    });

    const response = await operationsService.syncBatch('promoter-1', {
      actions: [action],
    });

    expect(response.results).toEqual([
      expect.objectContaining({
        id: 'queue-1',
        clientGeneratedId: 'notes-visit-1',
        status: 'SYNCED',
        success: true,
        serverEntityId: 'visit-1',
        result: {
          id: 'visit-1',
          notes: 'Reposicao concluida com ajuste de gondola',
        },
      }),
    ]);
    expect(prismaService.syncOperation.upsert).not.toHaveBeenCalled();
  });

  it('gera alerta de atraso relevante quando o check-in ultrapassa a janela esperada', async () => {
    const checkedInAt = new Date('2026-03-21T11:00:00.000Z');
    const plannedStartAt = new Date('2026-03-21T10:20:00.000Z');
    const transaction = {
      visit: {
        create: jest.fn().mockResolvedValue({
          id: 'visit-1',
        }),
      },
      routePlanItem: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      gpsLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      visitStatusHistory: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    prismaService.$transaction.mockImplementation(
      (callback: (input: typeof transaction) => Promise<{ id: string }>) =>
        callback(transaction),
    );
    prismaService.journey.findFirst.mockResolvedValue({
      id: 'journey-1',
      promoterId: 'promoter-1',
      active: true,
      startedAt: new Date(),
    });
    prismaService.routePlanItem.findFirst.mockResolvedValue({
      id: 'stop-1',
      routePlanId: 'route-plan-1',
      clientId: 'client-1',
      sequence: 1,
      plannedStartAt,
      plannedEndAt: new Date('2026-03-21T10:50:00.000Z'),
      status: RouteStopStatus.PLANNED,
      visit: null,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
        latitude: -16.4706,
        longitude: -54.6355,
        geofenceRadiusM: 300,
      },
    });
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: checkedInAt,
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-checkin-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
          capturedAt: new Date('2026-03-21T10:00:00.000Z'),
          publicUrl: '/uploads/checkin.jpg',
        },
      ],
      checklistResponses: [],
    });

    await operationsService.checkIn('promoter-1', {
      routeStopId: 'stop-1',
      checkedInAt: checkedInAt.toISOString(),
      location: {
        latitude: -16.47061,
        longitude: -54.63551,
      },
    });

    expect(alertsService.ensureActiveAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AlertType.RELEVANT_DELAY,
        visitId: 'visit-1',
      }),
    );
  });

  it('realiza check-in com foto obrigatoria do estabelecimento e registra a captura', async () => {
    const checkedInAt = new Date('2026-03-21T10:00:00.000Z');
    const capturedAt = new Date('2026-03-21T09:58:00.000Z');
    const transaction = {
      visit: {
        create: jest.fn().mockResolvedValue({
          id: 'visit-1',
        }),
      },
      visitPhoto: {
        create: jest.fn().mockResolvedValue({
          id: 'photo-checkin-1',
        }),
      },
      routePlanItem: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      gpsLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      visitStatusHistory: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    prismaService.$transaction.mockImplementation(
      (callback: (input: typeof transaction) => Promise<{ id: string }>) =>
        callback(transaction),
    );
    prismaService.journey.findFirst.mockResolvedValue({
      id: 'journey-1',
      promoterId: 'promoter-1',
      active: true,
      startedAt: new Date(),
    });
    prismaService.routePlanItem.findFirst.mockResolvedValue({
      id: 'stop-1',
      routePlanId: 'route-plan-1',
      clientId: 'client-1',
      sequence: 1,
      plannedStartAt: checkedInAt,
      plannedEndAt: new Date('2026-03-21T10:30:00.000Z'),
      status: RouteStopStatus.PLANNED,
      visit: null,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
        latitude: -16.4706,
        longitude: -54.6355,
        geofenceRadiusM: 300,
      },
    });
    storageService.saveFile.mockResolvedValue({
      key: 'visits/checkin/stop-1/establishment/photo.jpg',
      publicUrl: '/uploads/visits/checkin/stop-1/establishment/photo.jpg',
      sizeInBytes: 2048,
    });
    prismaService.visit.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'visit-1',
        routeStopId: 'stop-1',
        journeyId: 'journey-1',
        promoterId: 'promoter-1',
        clientId: 'client-1',
        checkInAt: checkedInAt,
        checkOutAt: null,
        outsideGeofence: false,
        geofenceDistanceM: 12,
        outsideGeofenceJustification: null,
        notes: null,
        completionStatus: null,
        status: RouteStopStatus.IN_PROGRESS,
        client: {
          id: 'client-1',
          tradeName: 'Mercado Central',
        },
        routeStop: {
          id: 'stop-1',
        },
        photos: [
          {
            id: 'photo-checkin-1',
            type: PhotoType.BEFORE,
            category: PhotoCategory.CHECKIN_ESTABLISHMENT,
            publicUrl: '/uploads/visits/checkin/stop-1/establishment/photo.jpg',
            capturedAt,
          },
        ],
        checklistResponses: [
          {
            template: {
              sortOrder: 1,
              code: 'mix',
              label: 'Mix completo exposto',
              type: 'BOOLEAN',
              required: true,
            },
            valueBoolean: true,
            valueText: null,
          },
        ],
      });

    const response = await operationsService.checkInWithPhoto(
      'promoter-1',
      {
        routeStopId: 'stop-1',
        checkedInAt: checkedInAt.toISOString(),
        capturedAt: capturedAt.toISOString(),
        latitude: -16.47061,
        longitude: -54.63551,
        eventId: 'checkin-fixed-event',
        photoEventId: 'photo-checkin-fixed-event',
      },
      {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
        originalname: 'estabelecimento.jpg',
      } as Parameters<OperationsService['checkInWithPhoto']>[2],
    );

    const visitPhotoCreateCalls = transaction.visitPhoto.create.mock
      .calls as Array<
      [
        {
          data: {
            type: PhotoType;
            category: PhotoCategory;
            stage: VisitPhotoStage;
            capturedAt: Date;
            capturedLatitude: number | null;
            capturedLongitude: number | null;
            gpsStatus: PhotoGpsStatus | null;
          };
        },
      ]
    >;
    const visitPhotoCreateCall = visitPhotoCreateCalls[0]?.[0];

    expect(visitPhotoCreateCall).toBeDefined();
    expect(visitPhotoCreateCall?.data.type).toBe(PhotoType.BEFORE);
    expect(visitPhotoCreateCall?.data.category).toBe(
      PhotoCategory.CHECKIN_ESTABLISHMENT,
    );
    expect(visitPhotoCreateCall?.data.stage).toBe(VisitPhotoStage.CHECKIN);
    expect(visitPhotoCreateCall?.data.capturedAt).toEqual(capturedAt);
    expect(visitPhotoCreateCall?.data.capturedLatitude).toBe(-16.47061);
    expect(visitPhotoCreateCall?.data.capturedLongitude).toBe(-54.63551);
    expect(visitPhotoCreateCall?.data.gpsStatus).toBe(PhotoGpsStatus.CAPTURED);
    expect(response.checkInPhoto).toEqual(
      expect.objectContaining({
        category: PhotoCategory.CHECKIN_ESTABLISHMENT,
        stage: VisitPhotoStage.CHECKIN,
        capturedAt: capturedAt.toISOString(),
        capturedDate: '2026-03-21',
        capturedTime: '09:58:00',
      }),
    );
  });

  it('nao conclui visita sem foto do antes e foto do depois', async () => {
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: null,
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 20,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [],
      checklistResponses: [],
    });

    await expect(
      operationsService.checkOut('promoter-1', 'visit-1', {
        checkedOutAt: new Date('2026-03-21T10:30:00.000Z').toISOString(),
        location: {
          latitude: -16.4706,
          longitude: -54.6355,
        },
        completionStatus: VisitCompletionStatus.COMPLETED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(alertsService.syncAlertState).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AlertType.MISSING_REQUIRED_PHOTO,
        active: true,
      }),
    );
  });

  it('inicia o atendimento apenas depois do check-in com foto', async () => {
    prismaService.visit.findFirst
      .mockResolvedValueOnce({
        id: 'visit-1',
        routeStopId: 'stop-1',
        journeyId: 'journey-1',
        promoterId: 'promoter-1',
        clientId: 'client-1',
        checkInAt: new Date('2026-03-21T10:00:00.000Z'),
        serviceStartedAt: null,
        serviceStartEventId: null,
        checkOutAt: null,
        outsideGeofence: false,
        geofenceDistanceM: 20,
        outsideGeofenceJustification: null,
        notes: null,
        completionStatus: null,
        status: RouteStopStatus.IN_PROGRESS,
        client: {
          id: 'client-1',
          tradeName: 'Mercado Central',
        },
        routeStop: {
          id: 'stop-1',
        },
        photos: [
          {
            id: 'photo-checkin-1',
            type: PhotoType.BEFORE,
            category: PhotoCategory.CHECKIN_ESTABLISHMENT,
            capturedAt: new Date('2026-03-21T10:00:00.000Z'),
            publicUrl: '/uploads/checkin.jpg',
          },
        ],
        checklistResponses: [
          {
            template: {
              sortOrder: 1,
              code: 'mix',
              label: 'Mix completo exposto',
              type: 'BOOLEAN',
              required: true,
            },
            valueBoolean: true,
            valueText: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'visit-1',
        routeStopId: 'stop-1',
        journeyId: 'journey-1',
        promoterId: 'promoter-1',
        clientId: 'client-1',
        checkInAt: new Date('2026-03-21T10:00:00.000Z'),
        serviceStartedAt: new Date('2026-03-21T10:02:00.000Z'),
        serviceStartEventId: 'service-start-1',
        checkOutAt: null,
        outsideGeofence: false,
        geofenceDistanceM: 20,
        outsideGeofenceJustification: null,
        notes: null,
        completionStatus: null,
        status: RouteStopStatus.IN_PROGRESS,
        client: {
          id: 'client-1',
          tradeName: 'Mercado Central',
        },
        routeStop: {
          id: 'stop-1',
        },
        photos: [
          {
            id: 'photo-checkin-1',
            type: PhotoType.BEFORE,
            category: PhotoCategory.CHECKIN_ESTABLISHMENT,
            capturedAt: new Date('2026-03-21T10:00:00.000Z'),
            publicUrl: '/uploads/checkin.jpg',
          },
        ],
        checklistResponses: [
          {
            template: {
              sortOrder: 1,
              code: 'mix',
              label: 'Mix completo exposto',
              type: 'BOOLEAN',
              required: true,
            },
            valueBoolean: true,
            valueText: null,
          },
        ],
      });
    prismaService.visit.update.mockResolvedValue({
      id: 'visit-1',
    });

    await expect(
      operationsService.startVisitService('promoter-1', 'visit-1', {
        startedAt: '2026-03-21T10:02:00.000Z',
        eventId: 'service-start-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        serviceStartedAt: '2026-03-21T10:02:00.000Z',
      }),
    );

    const visitUpdateCalls = prismaService.visit.update.mock.calls as Array<
      [
        {
          where: {
            id: string;
          };
          data: {
            serviceStartedAt: Date;
            serviceStartEventId: string | null | undefined;
          };
        },
      ]
    >;
    const firstVisitUpdateCall = visitUpdateCalls[0]?.[0];

    expect(firstVisitUpdateCall).toBeDefined();
    expect(firstVisitUpdateCall?.where.id).toBe('visit-1');
    expect(firstVisitUpdateCall?.data.serviceStartedAt).toEqual(
      new Date('2026-03-21T10:02:00.000Z'),
    );
    expect(firstVisitUpdateCall?.data.serviceStartEventId).toBe(
      'service-start-1',
    );
  });

  it('bloqueia inicio concorrente de segunda jornada ativa', async () => {
    prismaService.journey.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'journey-1',
        promoterId: 'promoter-1',
        active: true,
      });
    prismaService.routePlan.findFirst.mockResolvedValue({
      id: 'route-plan-1',
    });
    prismaService.journey.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      operationsService.startJourney('promoter-1', {
        startedAt: '2026-03-21T08:00:00.000Z',
        location: {
          latitude: -16.4706,
          longitude: -54.6355,
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('limpa arquivo orfao e devolve foto existente em reprocessamento concorrente', async () => {
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: new Date('2026-03-21T10:02:00.000Z'),
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-checkin-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
          capturedAt: new Date('2026-03-21T10:00:00.000Z'),
          publicUrl: '/uploads/checkin.jpg',
        },
      ],
      checklistResponses: [],
    });
    storageService.saveFile.mockResolvedValue({
      key: 'visits/visit-1/before/general/file.jpg',
      publicUrl: '/uploads/visits/visit-1/before/general/file.jpg',
      sizeInBytes: 1024,
    });
    storageService.deleteFile.mockResolvedValue(undefined);
    prismaService.visitPhoto.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prismaService.visitPhoto.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'photo-1',
        type: PhotoType.BEFORE,
        category: PhotoCategory.GENERAL,
        publicUrl: '/uploads/visits/visit-1/before/general/file.jpg',
        capturedAt: new Date('2026-03-21T10:05:00.000Z'),
      });

    await expect(
      operationsService.uploadPhoto(
        'promoter-1',
        'visit-1',
        {
          type: PhotoType.BEFORE,
          capturedAt: '2026-03-21T10:05:00.000Z',
          eventId: 'photo-fixed-event',
        },
        {
          buffer: Buffer.from('image'),
          mimetype: 'image/jpeg',
          originalname: 'before.jpg',
        } as Parameters<OperationsService['uploadPhoto']>[3],
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'photo-1',
        type: PhotoType.BEFORE,
        category: PhotoCategory.GENERAL,
        stage: VisitPhotoStage.BEFORE,
        url: '/uploads/visits/visit-1/before/general/file.jpg',
        capturedAt: '2026-03-21T10:05:00.000Z',
        capturedDate: '2026-03-21',
        capturedTime: '10:05:00',
      }),
    );
    expect(storageService.deleteFile).toHaveBeenCalledWith(
      'visits/visit-1/before/general/file.jpg',
    );
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('registra auditoria quando a foto e salva sem GPS disponivel', async () => {
    prismaService.visitPhoto.findFirst.mockResolvedValue(null);
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: new Date('2026-03-21T10:02:00.000Z'),
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-checkin-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
          capturedAt: new Date('2026-03-21T10:00:00.000Z'),
          publicUrl: '/uploads/checkin.jpg',
        },
      ],
      checklistResponses: [],
    });
    storageService.saveFile.mockResolvedValue({
      key: 'visits/visit-1/before/general/file-gps-missing.jpg',
      publicUrl: '/uploads/visits/visit-1/before/general/file-gps-missing.jpg',
      sizeInBytes: 1024,
    });
    prismaService.visitPhoto.create.mockResolvedValue({
      id: 'photo-gps-missing-1',
      type: PhotoType.BEFORE,
      category: PhotoCategory.GENERAL,
      stage: VisitPhotoStage.BEFORE,
      publicUrl: '/uploads/visits/visit-1/before/general/file-gps-missing.jpg',
      capturedAt: new Date('2026-03-21T10:05:00.000Z'),
      capturedLatitude: null,
      capturedLongitude: null,
      gpsStatus: PhotoGpsStatus.UNAVAILABLE,
      gpsErrorCode: 'SERVICES_DISABLED',
      gpsErrorMessage: 'GPS indisponivel no aparelho.',
    });

    await expect(
      operationsService.uploadPhoto(
        'promoter-1',
        'visit-1',
        {
          type: PhotoType.BEFORE,
          category: PhotoCategory.GENERAL,
          stage: VisitPhotoStage.BEFORE,
          capturedAt: '2026-03-21T10:05:00.000Z',
          gpsStatus: PhotoGpsStatus.UNAVAILABLE,
          gpsErrorCode: 'SERVICES_DISABLED',
          gpsErrorMessage: 'GPS indisponivel no aparelho.',
        },
        {
          buffer: Buffer.from('image'),
          mimetype: 'image/jpeg',
          originalname: 'before.jpg',
        } as Parameters<OperationsService['uploadPhoto']>[3],
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'photo-gps-missing-1',
        stage: VisitPhotoStage.BEFORE,
        gpsStatus: PhotoGpsStatus.UNAVAILABLE,
      }),
    );

    expect(auditService.record).toHaveBeenNthCalledWith(
      1,
      'promoter-1',
      expect.any(String),
      'photo-gps-missing-1',
      'visit.photo.uploaded',
      expect.objectContaining({
        stage: VisitPhotoStage.BEFORE,
        gpsStatus: PhotoGpsStatus.UNAVAILABLE,
      }),
    );
    expect(auditService.record).toHaveBeenNthCalledWith(
      2,
      'promoter-1',
      expect.any(String),
      'photo-gps-missing-1',
      'visit.photo.gps_exception',
      expect.objectContaining({
        stage: VisitPhotoStage.BEFORE,
        gpsStatus: PhotoGpsStatus.UNAVAILABLE,
        gpsErrorCode: 'SERVICES_DISABLED',
      }),
    );
  });

  it('bloqueia evidencia da execucao antes do inicio do atendimento', async () => {
    prismaService.visitPhoto.findFirst.mockResolvedValue(null);
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: null,
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-checkin-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
          capturedAt: new Date('2026-03-21T10:00:00.000Z'),
          publicUrl: '/uploads/checkin.jpg',
        },
      ],
      checklistResponses: [],
    });

    await expect(
      operationsService.uploadPhoto(
        'promoter-1',
        'visit-1',
        {
          type: PhotoType.BEFORE,
          category: PhotoCategory.GENERAL,
          capturedAt: '2026-03-21T10:05:00.000Z',
        },
        {
          buffer: Buffer.from('image'),
          mimetype: 'image/jpeg',
          originalname: 'before.jpg',
        } as Parameters<OperationsService['uploadPhoto']>[3],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storageService.saveFile).not.toHaveBeenCalled();
  });

  it('bloqueia novas fotos quando a visita ja foi finalizada', async () => {
    prismaService.visitPhoto.findFirst.mockResolvedValue(null);
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: new Date('2026-03-21T10:02:00.000Z'),
      checkOutAt: new Date('2026-03-21T10:40:00.000Z'),
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: VisitCompletionStatus.COMPLETED,
      status: RouteStopStatus.COMPLETED,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [],
      checklistResponses: [],
    });

    await expect(
      operationsService.uploadPhoto(
        'promoter-1',
        'visit-1',
        {
          type: PhotoType.AFTER,
          capturedAt: '2026-03-21T10:35:00.000Z',
        },
        {
          buffer: Buffer.from('image'),
          mimetype: 'image/jpeg',
          originalname: 'after.jpg',
        } as Parameters<OperationsService['uploadPhoto']>[3],
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storageService.saveFile).not.toHaveBeenCalled();
  });

  it('bloqueia novo checklist quando a visita ja foi finalizada', async () => {
    prismaService.visitChecklist.findFirst.mockResolvedValue(null);
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: new Date('2026-03-21T10:02:00.000Z'),
      checkOutAt: new Date('2026-03-21T10:40:00.000Z'),
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: 'Visita concluida',
      completionStatus: VisitCompletionStatus.COMPLETED,
      status: RouteStopStatus.COMPLETED,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-before-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.BEFORE_1,
        },
      ],
      checklistResponses: [],
    });

    await expect(
      operationsService.submitChecklist('promoter-1', 'visit-1', {
        eventId: 'checklist-after-checkout',
        items: [
          {
            code: 'mix',
            label: 'Mix completo exposto',
            type: 'BOOLEAN',
            required: true,
            value: true,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaService.$transaction).not.toHaveBeenCalled();
  });

  it('bloqueia checklist antes do inicio do atendimento', async () => {
    prismaService.visitChecklist.findFirst.mockResolvedValue(null);
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: null,
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-checkin-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
        },
      ],
      checklistResponses: [],
    });

    await expect(
      operationsService.submitChecklist('promoter-1', 'visit-1', {
        eventId: 'checklist-before-service',
        items: [
          {
            code: 'mix',
            label: 'Mix completo exposto',
            type: 'BOOLEAN',
            required: true,
            value: true,
          },
        ],
      }),
    ).rejects.toThrow(
      'Inicie o atendimento antes de registrar evidencias da execucao.',
    );
  });

  it('bloqueia checklist enquanto a foto do antes nao for registrada', async () => {
    prismaService.visitChecklist.findFirst.mockResolvedValue(null);
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: new Date('2026-03-21T10:02:00.000Z'),
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-checkin-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
        },
      ],
      checklistResponses: [],
    });

    await expect(
      operationsService.submitChecklist('promoter-1', 'visit-1', {
        eventId: 'checklist-before-photo',
        items: [
          {
            code: 'mix',
            label: 'Mix completo exposto',
            type: 'BOOLEAN',
            required: true,
            value: true,
          },
        ],
      }),
    ).rejects.toThrow('Tire a foto do antes para continuar.');
  });

  it('bloqueia a foto do depois enquanto a execucao nao for registrada', async () => {
    prismaService.visitPhoto.findFirst.mockResolvedValue(null);
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: new Date('2026-03-21T10:02:00.000Z'),
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 12,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-checkin-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
          capturedAt: new Date('2026-03-21T10:00:00.000Z'),
          publicUrl: '/uploads/checkin.jpg',
        },
        {
          id: 'photo-before-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.GENERAL,
          capturedAt: new Date('2026-03-21T10:05:00.000Z'),
          publicUrl: '/uploads/before.jpg',
        },
      ],
      checklistResponses: [],
    });

    await expect(
      operationsService.uploadPhoto(
        'promoter-1',
        'visit-1',
        {
          type: PhotoType.AFTER,
          category: PhotoCategory.GENERAL,
          capturedAt: '2026-03-21T10:20:00.000Z',
        },
        {
          buffer: Buffer.from('image'),
          mimetype: 'image/jpeg',
          originalname: 'after.jpg',
        } as Parameters<OperationsService['uploadPhoto']>[3],
      ),
    ).rejects.toThrow('Registre a execucao da visita antes da foto do depois.');

    expect(storageService.saveFile).not.toHaveBeenCalled();
  });

  it('nao conclui visita sem execucao registrada', async () => {
    prismaService.visit.findFirst.mockResolvedValue({
      id: 'visit-1',
      routeStopId: 'stop-1',
      journeyId: 'journey-1',
      promoterId: 'promoter-1',
      clientId: 'client-1',
      checkInAt: new Date('2026-03-21T10:00:00.000Z'),
      serviceStartedAt: new Date('2026-03-21T10:02:00.000Z'),
      checkOutAt: null,
      outsideGeofence: false,
      geofenceDistanceM: 20,
      outsideGeofenceJustification: null,
      notes: null,
      completionStatus: null,
      status: RouteStopStatus.IN_PROGRESS,
      client: {
        id: 'client-1',
        tradeName: 'Mercado Central',
      },
      routeStop: {
        id: 'stop-1',
      },
      photos: [
        {
          id: 'photo-checkin-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.CHECKIN_ESTABLISHMENT,
          capturedAt: new Date('2026-03-21T10:00:00.000Z'),
          publicUrl: '/uploads/checkin.jpg',
        },
        {
          id: 'photo-before-1',
          type: PhotoType.BEFORE,
          category: PhotoCategory.GENERAL,
          capturedAt: new Date('2026-03-21T10:05:00.000Z'),
          publicUrl: '/uploads/before.jpg',
        },
        {
          id: 'photo-after-1',
          type: PhotoType.AFTER,
          category: PhotoCategory.GENERAL,
          capturedAt: new Date('2026-03-21T10:20:00.000Z'),
          publicUrl: '/uploads/after.jpg',
        },
      ],
      checklistResponses: [],
    });

    await expect(
      operationsService.checkOut('promoter-1', 'visit-1', {
        checkedOutAt: new Date('2026-03-21T10:30:00.000Z').toISOString(),
        location: {
          latitude: -16.4706,
          longitude: -54.6355,
        },
        completionStatus: VisitCompletionStatus.COMPLETED,
      }),
    ).rejects.toThrow('Visita nao pode ser concluida sem execucao registrada.');
  });

  it('gera flag de visita muito rapida quando o encerramento ocorre abaixo do limite operacional', async () => {
    const transaction = {
      visit: {
        update: jest.fn().mockResolvedValue({
          id: 'visit-1',
        }),
      },
      routePlanItem: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      gpsLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      visitStatusHistory: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    prismaService.$transaction.mockImplementation(
      (callback: (input: typeof transaction) => Promise<{ id: string }>) =>
        callback(transaction),
    );
    prismaService.visit.findFirst
      .mockResolvedValueOnce({
        id: 'visit-1',
        routeStopId: 'stop-1',
        journeyId: 'journey-1',
        promoterId: 'promoter-1',
        clientId: 'client-1',
        checkInAt: new Date('2026-03-21T10:00:00.000Z'),
        serviceStartedAt: new Date('2026-03-21T10:01:00.000Z'),
        checkOutAt: null,
        outsideGeofence: false,
        geofenceDistanceM: 10,
        outsideGeofenceJustification: null,
        notes: null,
        completionStatus: null,
        status: RouteStopStatus.IN_PROGRESS,
        client: {
          id: 'client-1',
          tradeName: 'Mercado Central',
        },
        routeStop: {
          id: 'stop-1',
        },
        photos: [
          {
            id: 'photo-checkin-1',
            type: PhotoType.BEFORE,
            category: PhotoCategory.CHECKIN_ESTABLISHMENT,
            capturedAt: new Date('2026-03-21T10:00:00.000Z'),
            publicUrl: '/uploads/checkin.jpg',
          },
          {
            id: 'photo-before-1',
            type: PhotoType.BEFORE,
            category: PhotoCategory.BEFORE_1,
            capturedAt: new Date('2026-03-21T10:01:30.000Z'),
            publicUrl: '/uploads/before.jpg',
          },
          {
            id: 'photo-after-1',
            type: PhotoType.AFTER,
            category: PhotoCategory.AFTER_1,
            capturedAt: new Date('2026-03-21T10:02:30.000Z'),
            publicUrl: '/uploads/after.jpg',
          },
        ],
        checklistResponses: [
          {
            template: {
              sortOrder: 1,
              code: 'mix',
              label: 'Mix completo exposto',
              type: 'BOOLEAN',
              required: true,
            },
            valueBoolean: true,
            valueText: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'visit-1',
        routeStopId: 'stop-1',
        journeyId: 'journey-1',
        promoterId: 'promoter-1',
        clientId: 'client-1',
        checkInAt: new Date('2026-03-21T10:00:00.000Z'),
        serviceStartedAt: new Date('2026-03-21T10:01:00.000Z'),
        checkOutAt: new Date('2026-03-21T10:03:00.000Z'),
        outsideGeofence: false,
        geofenceDistanceM: 10,
        outsideGeofenceJustification: null,
        notes: null,
        completionStatus: VisitCompletionStatus.COMPLETED,
        status: RouteStopStatus.COMPLETED,
        client: {
          id: 'client-1',
          tradeName: 'Mercado Central',
        },
        routeStop: {
          id: 'stop-1',
        },
        photos: [
          {
            id: 'photo-checkin-1',
            type: PhotoType.BEFORE,
            category: PhotoCategory.CHECKIN_ESTABLISHMENT,
            capturedAt: new Date('2026-03-21T10:00:00.000Z'),
            publicUrl: '/uploads/checkin.jpg',
          },
          {
            id: 'photo-before-1',
            type: PhotoType.BEFORE,
            category: PhotoCategory.BEFORE_1,
            capturedAt: new Date('2026-03-21T10:01:30.000Z'),
            publicUrl: '/uploads/before.jpg',
          },
          {
            id: 'photo-after-1',
            type: PhotoType.AFTER,
            category: PhotoCategory.AFTER_1,
            capturedAt: new Date('2026-03-21T10:02:30.000Z'),
            publicUrl: '/uploads/after.jpg',
          },
        ],
        checklistResponses: [
          {
            template: {
              sortOrder: 1,
              code: 'mix',
              label: 'Mix completo exposto',
              type: 'BOOLEAN',
              required: true,
            },
            valueBoolean: true,
            valueText: null,
          },
        ],
      });

    await operationsService.checkOut('promoter-1', 'visit-1', {
      checkedOutAt: '2026-03-21T10:03:00.000Z',
      location: {
        latitude: -16.4706,
        longitude: -54.6355,
      },
      completionStatus: VisitCompletionStatus.COMPLETED,
    });

    expect(alertsService.syncAlertState).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AlertType.TOO_FAST_VISIT,
        active: true,
        visitId: 'visit-1',
      }),
    );
  });

  it('gera flag de sync_failure quando a fila falha e mantem o item como failed', async () => {
    const updateVisitNotesSpy = jest.spyOn(
      operationsService,
      'updateVisitNotes',
    );
    updateVisitNotesSpy.mockRejectedValue(new Error('Timeout na API'));
    prismaService.visit.findFirst.mockResolvedValue(null);

    const response = await operationsService.syncBatch('promoter-1', {
      actions: [
        {
          id: 'queue-1',
          clientGeneratedId: 'notes-visit-1',
          type: 'UPDATE_NOTES',
          payload: {
            visitId: 'visit-1',
            notes: 'Reposicao concluida com ajuste de gondola',
          },
        },
      ],
    });

    expect(response.results[0]).toMatchObject({
      id: 'queue-1',
      clientGeneratedId: 'notes-visit-1',
      status: 'FAILED',
      success: false,
      error: 'Timeout na API',
    });
    expect(alertsService.syncAlertState).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AlertType.SYNC_FAILURE,
        active: true,
        visitId: 'visit-1',
      }),
    );
  });
});
