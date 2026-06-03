import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQueueAction,
  createEventId,
  getBackoffDelayMs,
  mergeQueueActions,
} from './offline-helpers';
import { syncPendingQueue } from './offline';
import type { LocalVisitDraft, QueueAction } from './types';
import { useOperationStore } from '../store/operation-store';

const buildPhoto = (
  overrides: Partial<NonNullable<LocalVisitDraft['checkInPhoto']>>,
) => ({
  id: 'photo-id',
  visitId: 'local-visit-1',
  routeStopId: 'stop-1',
  stage: 'BEFORE' as const,
  type: 'BEFORE' as const,
  category: 'GENERAL' as const,
  uri: 'file://photo.jpg',
  localPath: 'file://photo.jpg',
  capturedAt: '2026-03-21T10:00:00.000Z',
  gpsStatus: 'CAPTURED' as const,
  uploaded: false,
  syncStatus: 'PENDING' as const,
  attempts: 0,
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  compressionQuality: 70,
  ...overrides,
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const netInfoMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  addEventListener: vi.fn(() => vi.fn()),
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: netInfoMocks,
}));

const apiMocks = vi.hoisted(() => ({
  fetchRouteBundle: vi.fn(),
  fetchVisit: vi.fn(),
  pushSyncBatch: vi.fn(),
  uploadPhoto: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const localRepositoryMocks = vi.hoisted(() => ({
  hydrateRemoteState: vi.fn(),
}));

vi.mock('../repositories/local-operations-repository', () => ({
  localOperationsRepository: localRepositoryMocks,
}));

const baseVisit = (): LocalVisitDraft => ({
  visitId: 'local-visit-1',
  routeStopId: 'stop-1',
  routeSequence: 1,
  clientId: 'client-1',
  clientName: 'Mercado Centro',
  clientAddress: 'Rua A, 100',
  status: 'IN_PROGRESS',
  operationalStatus: 'EM_ATENDIMENTO',
  checkInAt: '2026-03-21T10:00:00.000Z',
  serviceStartedAt: '2026-03-21T10:02:00.000Z',
  outsideGeofence: false,
  notes: 'Observacao local',
  checklist: [
    {
      code: 'shelf_ok',
      label: 'Gondola organizada',
      type: 'BOOLEAN',
      required: true,
      value: true,
    },
  ],
  checklistCompleted: true,
  checklistSyncedAt: '2026-03-21T10:12:00.000Z',
  checkInPhoto: {
    ...buildPhoto({
      id: 'photo-checkin-1',
      stage: 'CHECKIN',
      category: 'CHECKIN_ESTABLISHMENT',
      uri: 'file://checkin.jpg',
      localPath: 'file://checkin.jpg',
      uploaded: true,
      syncStatus: 'SYNCED',
      remoteUrl: '/uploads/checkin.jpg',
      fileName: 'checkin.jpg',
      mimeType: 'image/jpeg',
    }),
  },
  beforePhotos: [
    buildPhoto({
      id: 'photo-before-1',
      capturedAt: '2026-03-21T10:05:00.000Z',
      uri: 'file://before.jpg',
      localPath: 'file://before.jpg',
      fileName: 'before.jpg',
      mimeType: 'image/jpeg',
    }),
  ],
  afterPhotos: [
    buildPhoto({
      id: 'photo-after-1',
      stage: 'AFTER',
      type: 'AFTER',
      capturedAt: '2026-03-21T10:20:00.000Z',
      uri: 'file://after.jpg',
      localPath: 'file://after.jpg',
      fileName: 'after.jpg',
      mimeType: 'image/jpeg',
    }),
  ],
  pendingSync: true,
  lastLocalChangeAt: '2026-03-21T10:25:00.000Z',
  localOnly: true,
});

const resetStore = () => {
  useOperationStore.getState().resetOperations();
  useOperationStore.setState({
    route: null,
    checklistTemplate: [],
    activeJourney: {
      id: 'local-journey-1',
      promoterId: 'promoter-1',
      promoterName: 'Promotor Centro',
      startedAt: '2026-03-21T09:00:00.000Z',
      active: true,
    },
    visitsByStopId: {},
    queue: [],
    syncLogs: [],
    visitIdMap: {},
    lastSyncAt: undefined,
    syncError: null,
  });
};

describe('offline sync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetStore();
    netInfoMocks.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    apiMocks.fetchRouteBundle.mockResolvedValue({
      route: null,
      checklistTemplate: [],
      activeJourney: null,
    });
  });

  it('sincroniza uma visita concluida offline ao reconectar', async () => {
    const visit = baseVisit();
    const beforeUploadEventId = createEventId('photo-before');
    const afterUploadEventId = createEventId('photo-after');
    const checkInAction = createQueueAction({
      type: 'CHECK_IN',
      localVisitId: visit.visitId,
      routeStopId: visit.routeStopId,
      payload: {
        routeStopId: visit.routeStopId,
        checkedInAt: visit.checkInAt ?? '2026-03-21T10:00:00.000Z',
        location: {
          latitude: -15.6014,
          longitude: -56.0979,
        },
        eventId: createEventId('checkin'),
      },
    });
    const beforePhotoAction = createQueueAction({
      type: 'UPLOAD_PHOTO',
      routeStopId: visit.routeStopId,
      visitId: visit.visitId,
      localPhotoId: 'photo-before-1',
      payload: {
        visitId: visit.visitId,
        type: 'BEFORE',
        category: 'GENERAL',
        stage: 'BEFORE',
        capturedAt: '2026-03-21T10:05:00.000Z',
        eventId: beforeUploadEventId,
        uri: 'file://before.jpg',
        fileName: 'before.jpg',
        mimeType: 'image/jpeg',
      },
    });
    const startServiceAction = createQueueAction({
      type: 'START_SERVICE',
      routeStopId: visit.routeStopId,
      visitId: visit.visitId,
      payload: {
        visitId: visit.visitId,
        body: {
          startedAt: visit.serviceStartedAt ?? '2026-03-21T10:02:00.000Z',
          eventId: createEventId('start-service'),
        },
      },
    });
    const checklistAction = createQueueAction({
      type: 'SUBMIT_CHECKLIST',
      routeStopId: visit.routeStopId,
      visitId: visit.visitId,
      payload: {
        visitId: visit.visitId,
        body: {
          items: visit.checklist,
          notes: visit.notes,
          eventId: createEventId('checklist'),
        },
      },
    });
    const afterPhotoAction = createQueueAction({
      type: 'UPLOAD_PHOTO',
      routeStopId: visit.routeStopId,
      visitId: visit.visitId,
      localPhotoId: 'photo-after-1',
      payload: {
        visitId: visit.visitId,
        type: 'AFTER',
        category: 'GENERAL',
        stage: 'AFTER',
        capturedAt: '2026-03-21T10:20:00.000Z',
        eventId: afterUploadEventId,
        uri: 'file://after.jpg',
        fileName: 'after.jpg',
        mimeType: 'image/jpeg',
      },
    });
    const checkOutAction = createQueueAction({
      type: 'CHECK_OUT',
      routeStopId: visit.routeStopId,
      visitId: visit.visitId,
      payload: {
        visitId: visit.visitId,
        body: {
          checkedOutAt: '2026-03-21T10:30:00.000Z',
          location: {
            latitude: -15.6014,
            longitude: -56.0979,
          },
          completionStatus: 'COMPLETED',
          notes: visit.notes,
          eventId: createEventId('checkout'),
        },
      },
    });

    useOperationStore.setState({
      visitsByStopId: {
        [visit.routeStopId]: visit,
      },
      queue: [
        checkInAction,
        startServiceAction,
        beforePhotoAction,
        checklistAction,
        afterPhotoAction,
        checkOutAction,
      ],
    });

    apiMocks.pushSyncBatch
      .mockResolvedValueOnce({
        serverTime: '2026-03-21T10:00:05.000Z',
        deviceId: null,
        pushedAt: '2026-03-21T10:00:05.000Z',
        acceptedActions: 1,
        rejectedActions: 0,
        results: [
          {
            id: checkInAction.id,
            clientGeneratedId: checkInAction.clientGeneratedId,
            actionType: 'CHECK_IN',
            success: true,
            status: 'SYNCED',
            processedAt: '2026-03-21T10:00:05.000Z',
            serverEntityId: 'visit-remote-1',
            result: {
              id: 'visit-remote-1',
              journeyId: 'journey-remote-1',
              status: 'IN_PROGRESS',
              operationalStatus: 'EM_ATENDIMENTO',
              completionStatus: null,
              checkInAt: '2026-03-21T10:00:00.000Z',
            },
          },
        ],
        snapshot: {
          route: null,
          checklistTemplate: [],
          activeJourney: null,
        },
      })
      .mockResolvedValueOnce({
        serverTime: '2026-03-21T10:00:10.000Z',
        deviceId: null,
        pushedAt: '2026-03-21T10:00:10.000Z',
        acceptedActions: 1,
        rejectedActions: 0,
        results: [
          {
            id: startServiceAction.id,
            clientGeneratedId: startServiceAction.clientGeneratedId,
            actionType: 'START_SERVICE',
            success: true,
            status: 'SYNCED',
            processedAt: '2026-03-21T10:00:10.000Z',
            serverEntityId: 'visit-remote-1',
            result: {
              id: 'visit-remote-1',
              serviceStartedAt: visit.serviceStartedAt,
            },
          },
        ],
        snapshot: {
          route: null,
          checklistTemplate: [],
          activeJourney: null,
        },
      })
      .mockResolvedValueOnce({
        serverTime: '2026-03-21T10:00:15.000Z',
        deviceId: null,
        pushedAt: '2026-03-21T10:00:15.000Z',
        acceptedActions: 1,
        rejectedActions: 0,
        results: [
          {
            id: checklistAction.id,
            clientGeneratedId: checklistAction.clientGeneratedId,
            actionType: 'SUBMIT_CHECKLIST',
            success: true,
            status: 'SYNCED',
            processedAt: '2026-03-21T10:00:15.000Z',
            serverEntityId: 'visit-remote-1',
            result: {
              id: 'visit-remote-1',
            },
          },
        ],
        snapshot: {
          route: null,
          checklistTemplate: [],
          activeJourney: null,
        },
      })
      .mockResolvedValueOnce({
        serverTime: '2026-03-21T10:00:20.000Z',
        deviceId: null,
        pushedAt: '2026-03-21T10:00:20.000Z',
        acceptedActions: 1,
        rejectedActions: 0,
        results: [
          {
            id: checkOutAction.id,
            clientGeneratedId: checkOutAction.clientGeneratedId,
            actionType: 'CHECK_OUT',
            success: true,
            status: 'SYNCED',
            processedAt: '2026-03-21T10:00:20.000Z',
            serverEntityId: 'visit-remote-1',
            result: {
              id: 'visit-remote-1',
              status: 'COMPLETED',
              operationalStatus: 'CONCLUIDA',
              completionStatus: 'COMPLETED',
              serviceStartedAt: visit.serviceStartedAt,
              checkOutAt: '2026-03-21T10:30:00.000Z',
              totalDurationSeconds: 1800,
              executionDurationSeconds: 1680,
            },
          },
        ],
        snapshot: {
          route: null,
          checklistTemplate: [],
          activeJourney: null,
        },
      });
    apiMocks.uploadPhoto.mockResolvedValue({
      id: 'photo-remote-1',
      url: '/uploads/visit-remote-1/photo.jpg',
    });

    await syncPendingQueue();

    const state = useOperationStore.getState();
    expect(apiMocks.pushSyncBatch).toHaveBeenCalledTimes(4);
    expect(apiMocks.uploadPhoto).toHaveBeenCalledTimes(2);
    expect(state.queue).toHaveLength(0);
    expect(state.visitIdMap['local-visit-1']).toBe('visit-remote-1');
    expect(state.visitsByStopId['stop-1']?.completionStatus).toBe('COMPLETED');
    expect(state.visitsByStopId['stop-1']?.serviceStartedAt).toBe('2026-03-21T10:02:00.000Z');
    expect(state.visitsByStopId['stop-1']?.beforePhotos[0]?.syncStatus).toBe('SYNCED');
    expect(state.visitsByStopId['stop-1']?.afterPhotos[0]?.syncStatus).toBe('SYNCED');
    expect(state.syncLogs.some((log) => log.status === 'SYNCED')).toBe(true);
  });

  it('mantem a fila e o estado da foto quando o upload falha parcialmente', async () => {
    const visit = {
      ...baseVisit(),
      visitId: 'visit-remote-1',
      localOnly: false,
    };
    const queue = [
      createQueueAction({
        type: 'UPLOAD_PHOTO',
        routeStopId: visit.routeStopId,
        visitId: visit.visitId,
        localPhotoId: 'photo-before-1',
        payload: {
          visitId: visit.visitId,
          type: 'BEFORE',
          category: 'GENERAL',
          stage: 'BEFORE',
          capturedAt: '2026-03-21T10:05:00.000Z',
          eventId: createEventId('photo-before'),
          uri: 'file://before.jpg',
          fileName: 'before.jpg',
          mimeType: 'image/jpeg',
        },
      }),
    ];

    useOperationStore.setState({
      visitsByStopId: {
        [visit.routeStopId]: visit,
      },
      queue,
    });

    apiMocks.uploadPhoto.mockRejectedValue(new Error('Falha parcial de upload'));

    await expect(syncPendingQueue()).rejects.toThrow('UPLOAD_PHOTO');

    const state = useOperationStore.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0]?.status).toBe('FAILED');
    expect(state.queue[0]?.nextRetryAt).toEqual(expect.any(String));
    expect(state.visitsByStopId['stop-1']?.beforePhotos[0]?.syncStatus).toBe('ERROR');
  });

  it('retoma a fila persistida apos fechamento do app sem duplicar a acao critica', async () => {
    const persistedQueue = JSON.parse(
      JSON.stringify([
        createQueueAction({
          type: 'CHECK_IN',
          localVisitId: 'local-visit-1',
          routeStopId: 'stop-1',
          payload: {
            routeStopId: 'stop-1',
            checkedInAt: '2026-03-21T10:00:00.000Z',
            location: {
              latitude: -15.6014,
              longitude: -56.0979,
            },
            eventId: 'checkin-fixed-event',
          },
        }),
      ]),
    ) as QueueAction[];
    const persistedAction = persistedQueue[0];

    if (!persistedAction) {
      throw new Error('A fila persistida nao foi criada');
    }

    useOperationStore.setState({
      visitsByStopId: {
        'stop-1': baseVisit(),
      },
      queue: persistedQueue,
    });

    apiMocks.pushSyncBatch.mockResolvedValue({
      serverTime: '2026-03-21T10:00:05.000Z',
      deviceId: null,
      pushedAt: '2026-03-21T10:00:05.000Z',
      acceptedActions: 1,
      rejectedActions: 0,
      results: [
        {
          id: persistedAction.id,
          clientGeneratedId: 'checkin-fixed-event',
          actionType: 'CHECK_IN',
          success: true,
          status: 'SYNCED',
          processedAt: '2026-03-21T10:00:05.000Z',
          serverEntityId: 'visit-remote-1',
          result: {
            id: 'visit-remote-1',
            journeyId: 'journey-remote-1',
            status: 'IN_PROGRESS',
            operationalStatus: 'EM_ATENDIMENTO',
            completionStatus: null,
            checkInAt: '2026-03-21T10:00:00.000Z',
          },
        },
      ],
      snapshot: {
        route: null,
        checklistTemplate: [],
        activeJourney: null,
      },
    });

    await syncPendingQueue();

    const state = useOperationStore.getState();
    const firstPushPayload = apiMocks.pushSyncBatch.mock.calls[0]?.[0] as unknown;

    expect(apiMocks.pushSyncBatch.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        actions: [
          expect.objectContaining({
            clientGeneratedId: 'checkin-fixed-event',
          }),
        ],
      }),
    );

    if (
      !firstPushPayload ||
      typeof firstPushPayload !== 'object' ||
      !('actions' in firstPushPayload) ||
      !Array.isArray(firstPushPayload.actions)
    ) {
      throw new Error('Payload do primeiro push nao foi registrado');
    }

    const [firstAction] = firstPushPayload.actions as Array<{
      payload?: {
        eventId?: string;
      };
    }>;

    expect(firstAction?.payload).toEqual(
      expect.objectContaining({
        eventId: 'checkin-fixed-event',
      }),
    );
    expect(state.queue).toHaveLength(0);
  });

  it('previne duplicidade e aplica backoff exponencial na fila', () => {
    const first = createQueueAction({
      type: 'UPDATE_NOTES',
      routeStopId: 'stop-1',
      visitId: 'visit-1',
      payload: {
        visitId: 'visit-1',
        notes: 'Primeira nota',
      },
    });
    const latest = createQueueAction({
      type: 'UPDATE_NOTES',
      routeStopId: 'stop-1',
      visitId: 'visit-1',
      payload: {
        visitId: 'visit-1',
        notes: 'Nota final',
      },
    });

    const merged = mergeQueueActions([first], latest);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.payload).toEqual(
      expect.objectContaining({
        notes: 'Nota final',
      }),
    );
    expect(getBackoffDelayMs(1)).toBe(2000);
    expect(getBackoffDelayMs(4)).toBeGreaterThan(getBackoffDelayMs(2));
  });
});
