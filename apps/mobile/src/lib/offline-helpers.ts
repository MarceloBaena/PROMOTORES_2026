import type { QueueAction, QueueActionDraft } from './types';

const randomSuffix = () => Math.random().toString(16).slice(2);

export const createEventId = (prefix: string) => `${prefix}-${Date.now()}-${randomSuffix()}`;

const buildQueueDedupeKey = (action: QueueActionDraft) => {
  switch (action.type) {
    case 'START_JOURNEY':
      return 'START_JOURNEY:ACTIVE';
    case 'TRACK_POINT':
      return `TRACK_POINT:${action.payload.eventId ?? createEventId('gps-fallback')}`;
    case 'CHECK_IN':
      return `CHECK_IN:${action.routeStopId}`;
    case 'START_SERVICE':
      return `START_SERVICE:${action.routeStopId}`;
    case 'UPLOAD_PHOTO':
      return `UPLOAD_PHOTO:${action.localPhotoId}`;
    case 'SUBMIT_CHECKLIST':
      return `SUBMIT_CHECKLIST:${action.routeStopId}`;
    case 'UPDATE_NOTES':
      return `UPDATE_NOTES:${action.routeStopId}`;
    case 'CHECK_OUT':
      return `CHECK_OUT:${action.routeStopId}`;
    case 'END_JOURNEY':
      return 'END_JOURNEY:ACTIVE';
  }
};

const resolveClientGeneratedId = (action: QueueActionDraft, fallbackId: string) => {
  switch (action.type) {
    case 'START_JOURNEY':
    case 'TRACK_POINT':
    case 'CHECK_IN':
    case 'END_JOURNEY':
      return action.payload.eventId ?? fallbackId;
    case 'START_SERVICE':
      return action.payload.body.eventId ?? fallbackId;
    case 'SUBMIT_CHECKLIST':
      return action.payload.body.eventId ?? fallbackId;
    case 'CHECK_OUT':
      return action.payload.body.eventId ?? fallbackId;
    case 'UPLOAD_PHOTO':
      return action.payload.eventId ?? fallbackId;
    case 'UPDATE_NOTES':
      return fallbackId;
  }
};

export const createQueueAction = (action: QueueActionDraft): QueueAction => {
  const id = createEventId(action.type.toLowerCase());

  return {
    ...action,
    id,
    clientGeneratedId: resolveClientGeneratedId(action, id),
    dedupeKey: buildQueueDedupeKey(action),
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'PENDING',
    lastError: null,
  };
};

export const mergeQueueActions = (queue: QueueAction[], incoming: QueueAction): QueueAction[] => {
  const existingIndex = queue.findIndex((candidate) => candidate.dedupeKey === incoming.dedupeKey);

  if (existingIndex === -1) {
    return [...queue, incoming];
  }

  return queue.map((candidate, index) =>
    index === existingIndex
      ? {
          ...incoming,
          attempts: candidate.attempts,
          lastAttemptAt: candidate.lastAttemptAt,
          nextRetryAt: candidate.nextRetryAt,
          lastError: candidate.lastError,
          status: candidate.status === 'FAILED' ? ('FAILED' as const) : ('PENDING' as const),
        }
      : candidate,
  );
};

export const getBackoffDelayMs = (attempts: number) =>
  Math.min(60_000, Math.max(2_000, 2 ** Math.max(attempts - 1, 0) * 2_000));

export const getNextRetryAt = (attempts: number, now = new Date()) =>
  new Date(now.getTime() + getBackoffDelayMs(attempts)).toISOString();

export const isQueueActionReady = (action: QueueAction, now = new Date()) =>
  !action.nextRetryAt || new Date(action.nextRetryAt).getTime() <= now.getTime();

export const resolveVisitIdentifier = (visitId: string, mapping: Record<string, string>) =>
  mapping[visitId] ?? visitId;

export const isVisitScopedAction = (
  action: QueueAction,
): action is Extract<
  QueueAction,
  { routeStopId: string; visitId?: string } | { routeStopId: string }
> => 'routeStopId' in action;
