import { describe, expect, it } from 'vitest';
import { createQueueAction } from './offline-helpers';
import {
  getCheckoutRequirements,
  getExecutionRequirements,
  getNextVisitAction,
  getVisitProgress,
  getVisitSteps,
  hasPendingVisitSync,
} from './visit-workflow';
import type { LocalVisitDraft, QueueAction, RouteDayStop } from './types';

const buildPhoto = (overrides: Partial<NonNullable<LocalVisitDraft['checkInPhoto']>>) => ({
  id: 'photo-id',
  visitId: 'visit-1',
  routeStopId: 'stop-1',
  stage: 'BEFORE' as const,
  type: 'BEFORE' as const,
  category: 'GENERAL' as const,
  uri: 'file://photo.jpg',
  localPath: 'file://photo.jpg',
  capturedAt: new Date().toISOString(),
  gpsStatus: 'CAPTURED' as const,
  uploaded: true,
  syncStatus: 'SYNCED' as const,
  attempts: 0,
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  ...overrides,
});

const stop: RouteDayStop = {
  id: 'stop-1',
  sequence: 1,
  plannedDate: new Date().toISOString(),
  status: 'PLANNED',
  operationalStatus: 'PENDENTE',
  client: {
    id: 'client-1',
    tradeName: 'Mercado Centro',
    legalName: 'Mercado Centro LTDA',
    address: 'Rua A, 100',
    city: 'Cuiaba',
    state: 'MT',
    coordinates: {
      latitude: -15.6014,
      longitude: -56.0979,
    },
    geofence: {
      latitude: -15.6014,
      longitude: -56.0979,
      radiusInMeters: 120,
    },
  },
};

const visit: LocalVisitDraft = {
  visitId: 'visit-1',
  routeStopId: 'stop-1',
  routeSequence: 1,
  clientId: 'client-1',
  clientName: 'Mercado Centro',
  clientAddress: 'Rua A, 100',
  status: 'IN_PROGRESS',
  operationalStatus: 'EM_ATENDIMENTO',
  checkInAt: new Date().toISOString(),
  outsideGeofence: false,
  notes: '',
  checklist: [],
  checklistCompleted: false,
  checkInPhoto: {
    ...buildPhoto({
      id: 'photo-checkin-1',
      stage: 'CHECKIN',
      category: 'CHECKIN_ESTABLISHMENT',
      uri: 'file://checkin.jpg',
      localPath: 'file://checkin.jpg',
      fileName: 'checkin.jpg',
    }),
  },
  beforePhotos: [],
  afterPhotos: [],
  pendingSync: true,
  lastLocalChangeAt: new Date().toISOString(),
  localOnly: true,
};

describe('visit workflow', () => {
  it('bloqueia check-out sem requisitos minimos', () => {
    expect(getCheckoutRequirements(visit)).toEqual([
      'inicio do atendimento',
      'foto antes',
      'execucao registrada',
      'foto depois',
    ]);
  });

  it('mantem a visita bloqueada se faltar a foto do estabelecimento no check-in', () => {
    const visitWithoutCheckInPhoto: LocalVisitDraft = {
      ...visit,
      checkInPhoto: undefined,
    };

    expect(getCheckoutRequirements(visitWithoutCheckInPhoto)).toContain(
      'foto do estabelecimento do check-in',
    );
    expect(getNextVisitAction(stop, visitWithoutCheckInPhoto, true)).toMatchObject({
      key: 'checkIn',
      label: 'Registrar foto do estabelecimento',
    });
  });

  it('libera a ordem correta das etapas', () => {
    const steps = getVisitSteps(stop, visit, true);

    expect(steps.find((item) => item.key === 'startService')?.blocked).toBe(false);
    expect(steps.find((item) => item.key === 'beforePhotos')?.blocked).toBe(true);
    expect(steps.find((item) => item.key === 'afterPhotos')?.blocked).toBe(true);
    expect(steps.find((item) => item.key === 'checkout')?.blocked).toBe(true);
  });

  it('identifica o proximo passo obrigatorio da visita', () => {
    expect(getNextVisitAction(stop, visit, true)).toMatchObject({
      key: 'startService',
      label: 'Iniciar atendimento',
    });
  });

  it('resume o progresso obrigatorio da visita', () => {
    expect(getVisitProgress(visit)).toEqual({
      completedRequired: 1,
      totalRequired: 6,
    });
  });

  it('exige jornada ativa antes de liberar a operacao', () => {
    expect(getNextVisitAction(stop, undefined, false)).toMatchObject({
      key: 'journey',
      label: 'Iniciar jornada',
    });
  });

  it('identifica visita ainda pendente de sincronizacao', () => {
    const queue: QueueAction[] = [
      createQueueAction({
        type: 'CHECK_IN',
        localVisitId: 'visit-1',
        routeStopId: 'stop-1',
        payload: {
          routeStopId: 'stop-1',
          checkedInAt: new Date().toISOString(),
          location: {
            latitude: -15.6014,
            longitude: -56.0979,
          },
        },
      }),
    ];

    expect(hasPendingVisitSync(visit, queue)).toBe(true);
  });

  it('exige registrar a execucao antes de liberar a foto final', () => {
    const visitInExecution: LocalVisitDraft = {
      ...visit,
      serviceStartedAt: new Date().toISOString(),
      beforePhotos: [
        {
          ...buildPhoto({
            id: 'photo-before-1',
            stage: 'BEFORE',
            uri: 'file://before.jpg',
            localPath: 'file://before.jpg',
            fileName: 'before.jpg',
          }),
        },
      ],
    };

    const steps = getVisitSteps(stop, visitInExecution, true);

    expect(steps.find((item) => item.key === 'execution')?.blocked).toBe(false);
    expect(steps.find((item) => item.key === 'afterPhotos')?.blocked).toBe(true);
    expect(getNextVisitAction(stop, visitInExecution, true)).toMatchObject({
      key: 'execution',
      label: 'Registrar execucao',
    });
  });

  it('libera a foto de depois quando a execucao ja foi registrada', () => {
    const visitReadyForAfterPhoto: LocalVisitDraft = {
      ...visit,
      serviceStartedAt: new Date().toISOString(),
      beforePhotos: [
        {
          ...buildPhoto({
            id: 'photo-before-1',
            stage: 'BEFORE',
            uri: 'file://before.jpg',
            localPath: 'file://before.jpg',
            fileName: 'before.jpg',
          }),
        },
      ],
      checklistSyncedAt: new Date().toISOString(),
      checklistCompleted: true,
    };

    const steps = getVisitSteps(stop, visitReadyForAfterPhoto, true);

    expect(getExecutionRequirements(visitReadyForAfterPhoto)).toEqual([]);
    expect(steps.find((item) => item.key === 'afterPhotos')?.blocked).toBe(false);
    expect(getNextVisitAction(stop, visitReadyForAfterPhoto, true)).toMatchObject({
      key: 'afterPhotos',
    });
  });

  it('exige iniciar atendimento antes da primeira foto da execucao', () => {
    expect(getVisitSteps(stop, visit, true).find((item) => item.key === 'beforePhotos')?.blocked).toBe(
      true,
    );
    expect(getNextVisitAction(stop, visit, true)).toMatchObject({
      key: 'startService',
    });
  });

  it('coloca as etapas em somente leitura depois do checkout', () => {
    const finalizedVisit: LocalVisitDraft = {
      ...visit,
      beforePhotos: [
        {
          ...buildPhoto({
            id: 'photo-before-1',
            stage: 'BEFORE',
            uri: 'file://before.jpg',
            localPath: 'file://before.jpg',
            fileName: 'before.jpg',
          }),
        },
      ],
      afterPhotos: [
        {
          ...buildPhoto({
            id: 'photo-after-1',
            stage: 'AFTER',
            type: 'AFTER',
            uri: 'file://after.jpg',
            localPath: 'file://after.jpg',
            fileName: 'after.jpg',
          }),
        },
      ],
      serviceStartedAt: new Date().toISOString(),
      checkOutAt: new Date().toISOString(),
    };

    const steps = getVisitSteps(stop, finalizedVisit, true);

    expect(steps.find((item) => item.key === 'beforePhotos')?.blocked).toBe(true);
    expect(steps.find((item) => item.key === 'afterPhotos')?.blocked).toBe(true);
    expect(getNextVisitAction(stop, finalizedVisit, true)).toMatchObject({
      key: 'complete',
      label: 'Voltar ao roteiro',
    });
  });
});
