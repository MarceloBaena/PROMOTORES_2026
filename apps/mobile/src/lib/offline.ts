import NetInfo from '@react-native-community/netinfo';
import type { JourneySummary } from '@promotor/types';
import {
  fetchRouteBundle,
  fetchVisit,
  pushSyncBatch,
  uploadPhoto,
  type SyncPushResult,
} from './api';
import { getNextRetryAt, isQueueActionReady, resolveVisitIdentifier } from './offline-helpers';
import type { LocalVisitDraft, QueueAction } from './types';
import { localOperationsRepository } from '../repositories/local-operations-repository';
import { useOperationStore } from '../store/operation-store';

type SyncPendingQueueOptions = {
  force?: boolean;
  source?: 'AUTO' | 'MANUAL';
};

type SyncRunResult = {
  processedCount: number;
  failures: string[];
};

const getSyncErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Falha ao sincronizar item da fila';

const addSyncLog = (
  action: QueueAction,
  status: 'PENDING' | 'DEFERRED' | 'SYNCING' | 'SYNCED' | 'FAILED',
  message: string,
  attempt?: number,
  serverEntityId?: string | null,
) => {
  useOperationStore.getState().addSyncLog({
    actionId: action.id,
    clientGeneratedId: action.clientGeneratedId,
    actionType: action.type,
    status,
    message,
    routeStopId: 'routeStopId' in action ? action.routeStopId : undefined,
    visitId:
      'visitId' in action
        ? action.visitId
        : 'payload' in action &&
            action.payload &&
            typeof action.payload === 'object' &&
            'visitId' in action.payload
          ? String(action.payload.visitId)
          : undefined,
    attempt,
    serverEntityId: serverEntityId ?? undefined,
  });
};

const markQueueActionDeferred = (action: QueueAction, reason: string) => {
  useOperationStore.getState().updateQueueAction(action.id, {
    status: 'PENDING',
    lastError: reason,
    nextRetryAt: undefined,
  });
  addSyncLog(action, 'DEFERRED', reason, action.attempts);
};

const markQueueActionSyncing = (action: QueueAction, now = new Date()) => {
  const nextAttempts = action.attempts + 1;

  useOperationStore.getState().updateQueueAction(action.id, {
    attempts: nextAttempts,
    lastAttemptAt: now.toISOString(),
    lastError: null,
    nextRetryAt: undefined,
    status: 'SYNCING',
  });

  if (action.type === 'UPLOAD_PHOTO') {
    useOperationStore.getState().updatePhotoState(action.routeStopId, action.localPhotoId, {
      attempts: nextAttempts,
      lastAttemptAt: now.toISOString(),
      syncError: undefined,
      syncStatus: 'PENDING',
    });
  }

  addSyncLog(action, 'SYNCING', 'Item enviado para sincronizacao.', nextAttempts);
};

const markQueueActionFailed = (action: QueueAction, message: string, now = new Date()) => {
  const attemptCount = action.attempts + 1;

  useOperationStore.getState().updateQueueAction(action.id, {
    attempts: attemptCount,
    status: 'FAILED',
    lastAttemptAt: now.toISOString(),
    lastError: message,
    nextRetryAt: getNextRetryAt(attemptCount, now),
  });

  if (action.type === 'UPLOAD_PHOTO') {
    useOperationStore.getState().updatePhotoState(action.routeStopId, action.localPhotoId, {
      attempts: attemptCount,
      lastAttemptAt: now.toISOString(),
      syncError: message,
      syncStatus: 'ERROR',
    });
  }

  addSyncLog(action, 'FAILED', message, attemptCount);
};

const markQueueActionSynced = (
  action: QueueAction,
  processedAt: string,
  message: string,
  serverEntityId?: string | null,
) => {
  addSyncLog(action, 'SYNCED', message, action.attempts + 1, serverEntityId);
  useOperationStore.getState().removeQueueAction(action.id);
  useOperationStore.getState().setLastSync(processedAt);
  useOperationStore.getState().setSyncError(null);
};

const hasPendingRouteAction = (
  queue: QueueAction[],
  routeStopId: string,
  types: QueueAction['type'][],
  currentActionId: string,
) =>
  queue.some(
    (candidate) =>
      candidate.id !== currentActionId &&
      'routeStopId' in candidate &&
      candidate.routeStopId === routeStopId &&
      types.includes(candidate.type),
  );

const hasPendingStartJourney = (queue: QueueAction[], currentActionId: string) =>
  queue.some((candidate) => candidate.id !== currentActionId && candidate.type === 'START_JOURNEY');

const getVisitDependencyBlockReason = (
  action: QueueAction,
  visit: LocalVisitDraft | undefined,
  state: {
    queue: QueueAction[];
    visitIdMap: Record<string, string>;
  },
) => {
  if (action.type === 'TRACK_POINT' && hasPendingStartJourney(state.queue, action.id)) {
    return 'Aguardando sincronizacao do inicio da jornada';
  }

  if (
    action.type === 'END_JOURNEY' &&
    state.queue.some(
      (candidate) =>
        candidate.id !== action.id &&
        candidate.type !== 'TRACK_POINT' &&
        candidate.type !== 'END_JOURNEY',
    )
  ) {
    return 'Aguardando sincronizacao das visitas pendentes antes de encerrar a jornada';
  }

  if (!('routeStopId' in action)) {
    return null;
  }

  if (action.type === 'UPLOAD_PHOTO') {
    if (resolveVisitIdentifier(action.payload.visitId, state.visitIdMap).startsWith('local-')) {
      return 'Aguardando sincronizacao do check-in para enviar a foto';
    }

    if (
      action.payload.category !== 'CHECKIN_ESTABLISHMENT' &&
      (!visit?.serviceStartedAt ||
        hasPendingRouteAction(state.queue, action.routeStopId, ['START_SERVICE'], action.id))
    ) {
      return 'Aguardando sincronizacao do inicio do atendimento';
    }

    if (
      action.payload.type === 'AFTER' &&
      (!visit?.checklistSyncedAt ||
        hasPendingRouteAction(state.queue, action.routeStopId, ['SUBMIT_CHECKLIST'], action.id))
    ) {
      return 'Aguardando sincronizacao do registro de execucao';
    }

    return null;
  }

  if (
    action.type === 'START_SERVICE' ||
    action.type === 'SUBMIT_CHECKLIST' ||
    action.type === 'UPDATE_NOTES' ||
    action.type === 'CHECK_OUT'
  ) {
    if (resolveVisitIdentifier(action.payload.visitId, state.visitIdMap).startsWith('local-')) {
      return 'Aguardando sincronizacao do check-in';
    }
  }

  if (action.type === 'START_SERVICE') {
    if ((visit?.checkInPhoto?.syncStatus ?? 'PENDING') !== 'SYNCED') {
      return 'Aguardando upload da foto do estabelecimento do check-in';
    }

    return null;
  }

  if (action.type === 'SUBMIT_CHECKLIST') {
    if (!visit?.serviceStartedAt) {
      return 'Aguardando inicio do atendimento';
    }

    if (visit?.beforePhotos.some((photo) => photo.syncStatus !== 'SYNCED')) {
      return 'Aguardando upload das fotos de antes';
    }
  }

  if (action.type === 'CHECK_OUT') {
    if (!visit?.serviceStartedAt) {
      return 'Aguardando inicio do atendimento';
    }

    if (visit.checkInPhoto && visit.checkInPhoto.syncStatus !== 'SYNCED') {
      return 'Aguardando upload da foto do estabelecimento';
    }

    if (visit.beforePhotos.some((photo) => photo.syncStatus !== 'SYNCED')) {
      return 'Aguardando upload das fotos de antes';
    }

    if (
      !visit.checklistSyncedAt ||
      hasPendingRouteAction(state.queue, action.routeStopId, ['SUBMIT_CHECKLIST'], action.id)
    ) {
      return 'Aguardando sincronizacao do registro de execucao';
    }

    if (visit.afterPhotos.some((photo) => photo.syncStatus !== 'SYNCED')) {
      return 'Aguardando upload das fotos de depois';
    }
  }

  return null;
};

const reconcileSuccessfulMutation = (
  action: Exclude<QueueAction, { type: 'UPLOAD_PHOTO' }>,
  result: SyncPushResult,
  processedAt: string,
) => {
  switch (action.type) {
    case 'START_JOURNEY':
      if (result.result && typeof result.result === 'object') {
        useOperationStore.getState().setActiveJourney(result.result as JourneySummary);
      }
      break;
    case 'TRACK_POINT':
      break;
    case 'CHECK_IN': {
      const response = result.result as {
        id: string;
        journeyId: string;
        status: LocalVisitDraft['status'];
        operationalStatus: LocalVisitDraft['operationalStatus'];
        checkInAt: string;
      };

      useOperationStore.getState().setVisitIdMapping(action.localVisitId, response.id);
      useOperationStore.getState().patchVisit(action.routeStopId, {
        visitId: response.id,
        journeyId: response.journeyId,
        status: response.status,
        operationalStatus: response.operationalStatus,
        checkInAt: response.checkInAt,
        pendingSync: false,
        localOnly: false,
        lastSyncedAt: processedAt,
      });
      break;
    }
    case 'START_SERVICE': {
      const response = result.result as {
        serviceStartedAt?: string | null;
      };

      useOperationStore.getState().patchVisit(action.routeStopId, {
        serviceStartedAt: response.serviceStartedAt ?? action.payload.body.startedAt,
        pendingSync: false,
        lastSyncedAt: processedAt,
      });
      break;
    }
    case 'SUBMIT_CHECKLIST':
      useOperationStore.getState().patchVisit(action.routeStopId, {
        pendingSync: false,
        checklistCompleted: true,
        checklistSyncedAt: processedAt,
        lastSyncedAt: processedAt,
      });
      break;
    case 'UPDATE_NOTES':
      useOperationStore.getState().patchVisit(action.routeStopId, {
        pendingSync: false,
        lastSyncedAt: processedAt,
      });
      break;
    case 'CHECK_OUT': {
      const response = result.result as {
        id: string;
        status: LocalVisitDraft['status'];
        operationalStatus: LocalVisitDraft['operationalStatus'];
        completionStatus?: LocalVisitDraft['completionStatus'] | null;
        serviceStartedAt?: string | null;
        checkOutAt?: string | null;
        totalDurationSeconds?: number | null;
        executionDurationSeconds?: number | null;
      };

      useOperationStore.getState().patchVisit(action.routeStopId, {
        visitId: response.id,
        status: response.status,
        operationalStatus: response.operationalStatus,
        completionStatus: response.completionStatus ?? undefined,
        serviceStartedAt: response.serviceStartedAt ?? undefined,
        checkOutAt: response.checkOutAt ?? action.payload.body.checkedOutAt,
        totalDurationSeconds: response.totalDurationSeconds ?? undefined,
        executionDurationSeconds: response.executionDurationSeconds ?? undefined,
        pendingSync: false,
        localOnly: false,
        lastSyncedAt: processedAt,
      });
      break;
    }
    case 'END_JOURNEY':
      useOperationStore.getState().setActiveJourney(null);
      break;
  }
};

const syncMutationsBatch = async (
  actions: Array<Exclude<QueueAction, { type: 'UPLOAD_PHOTO' }>>,
): Promise<SyncRunResult> => {
  if (actions.length === 0) {
    return {
      processedCount: 0,
      failures: [],
    };
  }

  const startedAt = new Date();

  for (const action of actions) {
    markQueueActionSyncing(action, startedAt);
  }

  try {
    const state = useOperationStore.getState();
    const routeDate = state.route?.date;
    const response = await pushSyncBatch({
      pushedAt: startedAt.toISOString(),
      routeDate,
      actions: actions.map((action) => ({
        id: action.id,
        clientGeneratedId: action.clientGeneratedId,
        type: action.type,
        payload:
          'visitId' in action
            ? {
                ...action.payload,
                visitId: resolveVisitIdentifier(action.payload.visitId, state.visitIdMap),
              }
            : action.payload,
      })),
    });

    useOperationStore.getState().setRouteBundle(response.snapshot);

    const failures: string[] = [];
    let processedCount = 0;

    for (const action of actions) {
      const result = response.results.find((candidate) => candidate.id === action.id);

      if (!result) {
        const message = 'Servidor nao confirmou o item sincronizado.';
        markQueueActionFailed(action, message, startedAt);
        failures.push(`${action.type}: ${message}`);
        continue;
      }

      if (result.status === 'SYNCED') {
        reconcileSuccessfulMutation(action, result, result.processedAt);
        markQueueActionSynced(
          action,
          result.processedAt,
          'Servidor confirmou a sincronizacao do item.',
          result.serverEntityId,
        );
        processedCount += 1;
        continue;
      }

      const message = result.error ?? 'Falha ao sincronizar item no backend.';
      markQueueActionFailed(action, message, startedAt);
      failures.push(`${action.type}: ${message}`);
    }

    return {
      processedCount,
      failures,
    };
  } catch (error) {
    const message = getSyncErrorMessage(error);

    for (const action of actions) {
      markQueueActionFailed(
        action,
        `${message}. O item foi mantido na fila para reenvio seguro.`,
        startedAt,
      );
    }

    return {
      processedCount: 0,
      failures: actions.map(
        (action) => `${action.type}: ${message}. O item foi mantido na fila para reenvio seguro.`,
      ),
    };
  }
};

const syncPhotoUploads = async (
  actions: Array<Extract<QueueAction, { type: 'UPLOAD_PHOTO' }>>,
): Promise<SyncRunResult> => {
  if (actions.length === 0) {
    return {
      processedCount: 0,
      failures: [],
    };
  }

  let processedCount = 0;
  const failures: string[] = [];

  for (const action of actions) {
    const now = new Date();
    markQueueActionSyncing(action, now);

    try {
      const resolvedVisitId = resolveVisitIdentifier(
        action.payload.visitId,
        useOperationStore.getState().visitIdMap,
      );

      const response = await uploadPhoto({
        ...action.payload,
        visitId: resolvedVisitId,
        clientGeneratedId: action.clientGeneratedId,
      });

      useOperationStore
        .getState()
        .markPhotoUploaded(action.routeStopId, action.localPhotoId, response.url);
      markQueueActionSynced(
        action,
        new Date().toISOString(),
        'Foto confirmada pelo servidor.',
        response.id,
      );
      processedCount += 1;
    } catch (error) {
      const message = getSyncErrorMessage(error);
      markQueueActionFailed(action, message, now);
      failures.push(`${action.type}: ${message}`);
    }
  }

  return {
    processedCount,
    failures,
  };
};

const safeRefreshOperationalSnapshot = async () => {
  try {
    await refreshOperationalSnapshot();
  } catch (error) {
    const message = getSyncErrorMessage(error);
    useOperationStore.getState().setSyncError(message);
    useOperationStore.getState().addSyncLog({
      actionId: 'snapshot',
      clientGeneratedId: 'snapshot',
      actionType: 'TRACK_POINT',
      status: 'FAILED',
      message: `Sincronizacao confirmada, mas falhou a reconciliacao do snapshot: ${message}`,
    });
  }
};

export const refreshOperationalSnapshot = async () => {
  const bundle = await fetchRouteBundle();
  const remoteVisitIds =
    bundle.route?.stops.flatMap((stop) => (stop.visitId ? [stop.visitId] : [])) ?? [];
  const remoteVisits = await Promise.all(remoteVisitIds.map((visitId) => fetchVisit(visitId)));

  localOperationsRepository.hydrateRemoteState(bundle, remoteVisits);
  useOperationStore.getState().setLastSync(new Date().toISOString());
  useOperationStore.getState().setSyncError(null);
};

export const isOnlineNow = async () => {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
};

export const syncPendingQueue = async (options: SyncPendingQueueOptions = {}) => {
  const force = options.force ?? false;
  const source = options.source ?? 'AUTO';

  if (!(await isOnlineNow())) {
    throw new Error('Sem internet para sincronizar agora');
  }

  if (useOperationStore.getState().queue.length === 0) {
    await refreshOperationalSnapshot();
    return;
  }

  let totalProcessedCount = 0;
  const failures: string[] = [];
  const maxRounds = Math.max(useOperationStore.getState().queue.length * 2, 4);

  for (let round = 0; round < maxRounds; round += 1) {
    const store = useOperationStore.getState();

    if (store.queue.length === 0) {
      break;
    }

    const now = new Date();
    const readyActions = [...store.queue]
      .sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      )
      .filter((action) => force || isQueueActionReady(action, now));

    if (readyActions.length === 0) {
      break;
    }

    const eligibleActions: QueueAction[] = [];

    for (const action of readyActions) {
      const currentState = useOperationStore.getState();
      const visit =
        'routeStopId' in action ? currentState.visitsByStopId[action.routeStopId] : undefined;
      const dependencyBlockReason = getVisitDependencyBlockReason(action, visit, {
        queue: currentState.queue,
        visitIdMap: currentState.visitIdMap,
      });

      if (dependencyBlockReason) {
        markQueueActionDeferred(action, dependencyBlockReason);
        continue;
      }

      eligibleActions.push(action);
    }

    if (eligibleActions.length === 0) {
      break;
    }

    const mutationActions = eligibleActions.filter(
      (action): action is Exclude<QueueAction, { type: 'UPLOAD_PHOTO' }> =>
        action.type !== 'UPLOAD_PHOTO',
    );
    const photoActions = eligibleActions.filter(
      (action): action is Extract<QueueAction, { type: 'UPLOAD_PHOTO' }> =>
        action.type === 'UPLOAD_PHOTO',
    );

    const mutationResult = await syncMutationsBatch(mutationActions);
    const photoResult = await syncPhotoUploads(photoActions);
    const roundProcessedCount = mutationResult.processedCount + photoResult.processedCount;

    totalProcessedCount += roundProcessedCount;
    failures.push(...mutationResult.failures, ...photoResult.failures);

    if (roundProcessedCount === 0) {
      break;
    }
  }

  if (totalProcessedCount > 0) {
    await safeRefreshOperationalSnapshot();
  }

  if (failures.length === 0) {
    useOperationStore.getState().setSyncError(null);
    return;
  }

  const prefix =
    source === 'MANUAL' ? 'Sincronizacao manual com falhas' : 'Sincronizacao automatica com falhas';
  const failureMessage = `${prefix}: ${failures.join(' | ')}`;
  useOperationStore.getState().setSyncError(failureMessage);
  throw new Error(failureMessage);
};
