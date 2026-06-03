import AsyncStorage from '@react-native-async-storage/async-storage';
import type { JourneySummary } from '@promotor/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mergeQueueActions } from '../lib/offline-helpers';
import type {
  LocalPhoto,
  SyncLogEntry,
  LocalVisitDraft,
  QueueAction,
  RouteBundle,
  RouteDayBundle,
  RouteNotification,
} from '../lib/types';
import {
  updateVisitRecord,
  withVisitIdRemapped,
  withVisitPhotoAdded,
  withVisitPhotoStatePatched,
  withVisitPhotoUploaded,
} from './operation-store.helpers';

interface OperationState {
  route: RouteDayBundle | null;
  checklistTemplate: Array<{
    code: string;
    label: string;
    type: 'BOOLEAN' | 'TEXT';
    required: boolean;
  }>;
  activeJourney: JourneySummary | null;
  notifications: RouteNotification[];
  visitsByStopId: Record<string, LocalVisitDraft>;
  queue: QueueAction[];
  syncLogs: SyncLogEntry[];
  visitIdMap: Record<string, string>;
  lastSyncAt?: string;
  syncError?: string | null;
  setRouteBundle: (input: RouteBundle) => void;
  setActiveJourney: (journey: JourneySummary | null) => void;
  upsertVisit: (visit: LocalVisitDraft) => void;
  patchVisit: (routeStopId: string, patch: Partial<LocalVisitDraft>) => void;
  addPhotoToVisit: (routeStopId: string, photo: LocalPhoto) => void;
  markPhotoUploaded: (routeStopId: string, localPhotoId: string, remoteUrl: string) => void;
  updatePhotoState: (
    routeStopId: string,
    localPhotoId: string,
    patch: Partial<
      Pick<
        LocalPhoto,
        'attempts' | 'lastAttemptAt' | 'remoteUrl' | 'syncError' | 'syncStatus' | 'uploaded'
      >
    >,
  ) => void;
  enqueue: (action: QueueAction) => void;
  updateQueueAction: (
    actionId: string,
    patch: Partial<
      Pick<QueueAction, 'attempts' | 'lastAttemptAt' | 'lastError' | 'nextRetryAt' | 'status'>
    >,
  ) => void;
  removeQueueAction: (actionId: string) => void;
  addSyncLog: (
    entry: Omit<SyncLogEntry, 'id' | 'createdAt'> & {
      id?: string;
      createdAt?: string;
    },
  ) => void;
  setVisitIdMapping: (localVisitId: string, remoteVisitId: string) => void;
  setLastSync: (value: string) => void;
  setSyncError: (value: string | null) => void;
  resetOperations: () => void;
}

const initialState = {
  route: null,
  checklistTemplate: [],
  activeJourney: null,
  notifications: [],
  visitsByStopId: {},
  queue: [],
  syncLogs: [],
  visitIdMap: {},
  lastSyncAt: undefined,
  syncError: null,
} satisfies Omit<
  OperationState,
  | 'setRouteBundle'
  | 'setActiveJourney'
  | 'upsertVisit'
  | 'patchVisit'
  | 'addPhotoToVisit'
  | 'markPhotoUploaded'
  | 'updatePhotoState'
  | 'enqueue'
  | 'updateQueueAction'
  | 'removeQueueAction'
  | 'addSyncLog'
  | 'setVisitIdMapping'
  | 'setLastSync'
  | 'setSyncError'
  | 'resetOperations'
>;

export const useOperationStore = create<OperationState>()(
  persist(
    (set) => ({
      ...initialState,
      setRouteBundle: (input) =>
        set({
          route: input.route,
          checklistTemplate: input.checklistTemplate,
          activeJourney: input.activeJourney,
          notifications: input.notifications ?? [],
        }),
      setActiveJourney: (journey) =>
        set({
          activeJourney: journey,
        }),
      upsertVisit: (visit) =>
        set((state) => ({
          visitsByStopId: {
            ...state.visitsByStopId,
            [visit.routeStopId]: visit,
          },
        })),
      patchVisit: (routeStopId, patch) =>
        set((state) => {
          const visitsByStopId = updateVisitRecord(
            state.visitsByStopId,
            routeStopId,
            (visit) => ({
              ...visit,
              ...patch,
            }),
          );

          return visitsByStopId ? { visitsByStopId } : state;
        }),
      addPhotoToVisit: (routeStopId, photo) =>
        set((state) => {
          const visitsByStopId = updateVisitRecord(
            state.visitsByStopId,
            routeStopId,
            (visit) => withVisitPhotoAdded(visit, photo),
          );

          return visitsByStopId ? { visitsByStopId } : state;
        }),
      markPhotoUploaded: (routeStopId, localPhotoId, remoteUrl) =>
        set((state) => {
          const visitsByStopId = updateVisitRecord(
            state.visitsByStopId,
            routeStopId,
            (visit) => withVisitPhotoUploaded(visit, localPhotoId, remoteUrl),
          );

          return visitsByStopId ? { visitsByStopId } : state;
        }),
      updatePhotoState: (routeStopId, localPhotoId, patch) =>
        set((state) => {
          const visitsByStopId = updateVisitRecord(
            state.visitsByStopId,
            routeStopId,
            (visit) => withVisitPhotoStatePatched(visit, localPhotoId, patch),
          );

          return visitsByStopId ? { visitsByStopId } : state;
        }),
      enqueue: (action) =>
        set((state) => ({
          queue: mergeQueueActions(state.queue, action),
        })),
      updateQueueAction: (actionId, patch) =>
        set((state) => ({
          queue: state.queue.map((action) =>
            action.id === actionId ? { ...action, ...patch } : action,
          ),
        })),
      removeQueueAction: (actionId) =>
        set((state) => ({
          queue: state.queue.filter((action) => action.id !== actionId),
        })),
      addSyncLog: (entry) =>
        set((state) => ({
          syncLogs: [
            {
              id: entry.id ?? `sync-log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              createdAt: entry.createdAt ?? new Date().toISOString(),
              ...entry,
            },
            ...state.syncLogs,
          ].slice(0, 200),
        })),
      setVisitIdMapping: (localVisitId, remoteVisitId) =>
        set((state) => ({
          visitIdMap: {
            ...state.visitIdMap,
            [localVisitId]: remoteVisitId,
          },
          visitsByStopId: Object.fromEntries(
            Object.entries(state.visitsByStopId).map(([routeStopId, visit]) => {
              return [
                routeStopId,
                withVisitIdRemapped(visit, localVisitId, remoteVisitId),
              ];
            }),
          ) as Record<string, LocalVisitDraft>,
        })),
      setLastSync: (value) =>
        set({
          lastSyncAt: value,
        }),
      setSyncError: (value) =>
        set({
          syncError: value,
        }),
      resetOperations: () =>
        set({
          ...initialState,
        }),
    }),
    {
      name: 'promotor-mobile-operations',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
