import * as FileSystem from 'expo-file-system/legacy';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { ChecklistTemplateItem } from '@promotor/types';
import { useOperationStore } from '../store/operation-store';
import type {
  HistoryItem,
  LocalChecklistItem,
  LocalPhoto,
  LocalVisitDraft,
  PhotoCategory,
  PhotoGpsStatus,
  PhotoVisitStage,
  RouteBundle,
  RouteDayStop,
  VisitDetailsResponse,
} from '../lib/types';

const visitMediaDirectory = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}visit-media`
  : null;

const toChecklistDraft = (template: ChecklistTemplateItem[]) =>
  template.map<LocalChecklistItem>((item) => ({
    ...item,
    value: item.type === 'BOOLEAN' ? false : '',
  }));

const normalizePhotoName = (asset: ImagePickerAsset, category: PhotoCategory) => {
  const extension = asset.fileName?.split('.').pop() ?? 'jpg';
  return `${category.toLowerCase()}-${Date.now()}.${extension}`;
};

const ensureDirectory = async (directoryPath: string | null) => {
  if (!directoryPath) {
    return;
  }

  const info = await FileSystem.getInfoAsync(directoryPath);

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directoryPath, {
      intermediates: true,
    });
  }
};

const derivePhotoStage = (
  photoType: LocalPhoto['type'],
  category: PhotoCategory,
  stage?: PhotoVisitStage,
): PhotoVisitStage => {
  if (stage) {
    return stage;
  }

  if (category === 'CHECKIN_ESTABLISHMENT') {
    return 'CHECKIN';
  }

  if (category === 'OTHER') {
    return 'OCCURRENCE_EXTRA';
  }

  return photoType === 'AFTER' ? 'AFTER' : 'BEFORE';
};

const persistPhotoAsset = async (
  routeStopId: string,
  visitId: string,
  type: LocalPhoto['type'],
  category: PhotoCategory,
  stage: PhotoVisitStage,
  asset: ImagePickerAsset,
) => {
  if (!visitMediaDirectory) {
    return asset.uri;
  }

  const visitDirectory = `${visitMediaDirectory}/${routeStopId}/${visitId}/${stage.toLowerCase()}`;
  await ensureDirectory(visitDirectory);
  const fileName = normalizePhotoName(asset, category);
  const targetPath = `${visitDirectory}/${type.toLowerCase()}-${fileName}`;

  await FileSystem.copyAsync({
    from: asset.uri,
    to: targetPath,
  });

  const targetInfo = await FileSystem.getInfoAsync(targetPath);

  if (!targetInfo.exists) {
    throw new Error('Falha ao persistir a imagem no armazenamento local do aparelho.');
  }

  return targetPath;
};

const getPendingRouteStopIds = () => {
  const state = useOperationStore.getState();

  return new Set(
    state.queue.flatMap((action) =>
      'routeStopId' in action ? [action.routeStopId] : [],
    ),
  );
};

const calculateDurationSeconds = (startAt?: string, endAt?: string) => {
  if (!startAt || !endAt) {
    return undefined;
  }

  const diff = new Date(endAt).getTime() - new Date(startAt).getTime();

  return diff > 0 ? Math.floor(diff / 1000) : 0;
};

const flattenVisitPhotos = (visit?: LocalVisitDraft) =>
  [
    visit?.checkInPhoto,
    ...(visit?.beforePhotos ?? []),
    ...(visit?.afterPhotos ?? []),
  ].filter((photo): photo is LocalPhoto => Boolean(photo));

const findMatchingStoredPhoto = (
  visit: LocalVisitDraft | undefined,
  photo:
    | NonNullable<VisitDetailsResponse['checkInPhoto']>
    | VisitDetailsResponse['beforePhotos'][number]
    | VisitDetailsResponse['afterPhotos'][number],
  fallbackStage: PhotoVisitStage,
) => {
  const stage = photo.stage ?? fallbackStage;

  return flattenVisitPhotos(visit).find(
    (candidate) =>
      candidate.remoteUrl === photo.url ||
      (candidate.stage === stage &&
        candidate.type === photo.type &&
        candidate.category === photo.category &&
        candidate.capturedAt === photo.capturedAt),
  );
};

const mapRemotePhoto = (
  photo:
    | NonNullable<VisitDetailsResponse['checkInPhoto']>
    | VisitDetailsResponse['beforePhotos'][number]
    | VisitDetailsResponse['afterPhotos'][number],
  routeStopId: string,
  visitId: string,
  fallbackStage: PhotoVisitStage,
  existingVisit?: LocalVisitDraft,
): LocalPhoto => {
  const storedPhoto = findMatchingStoredPhoto(existingVisit, photo, fallbackStage);

  return {
    id: photo.id,
    visitId,
    routeStopId,
    stage: photo.stage ?? fallbackStage,
    type: photo.type,
    category: photo.category,
    uri: storedPhoto?.localPath ?? storedPhoto?.uri ?? photo.url,
    localPath: storedPhoto?.localPath ?? storedPhoto?.uri ?? photo.url,
    capturedAt: photo.capturedAt,
    capturedLatitude: photo.capturedLatitude ?? undefined,
    capturedLongitude: photo.capturedLongitude ?? undefined,
    gpsStatus:
      photo.gpsStatus ??
      (typeof photo.capturedLatitude === 'number' &&
      typeof photo.capturedLongitude === 'number'
        ? 'CAPTURED'
        : storedPhoto?.gpsStatus ?? 'UNAVAILABLE'),
    gpsErrorCode: photo.gpsErrorCode ?? storedPhoto?.gpsErrorCode,
    gpsErrorMessage: photo.gpsErrorMessage ?? storedPhoto?.gpsErrorMessage,
    uploaded: true,
    syncStatus: 'SYNCED',
    attempts: storedPhoto?.attempts ?? 0,
    remoteUrl: photo.url,
    fileName: storedPhoto?.fileName ?? photo.url.split('/').pop() ?? `${photo.id}.jpg`,
    mimeType: storedPhoto?.mimeType ?? 'image/jpeg',
    width: storedPhoto?.width,
    height: storedPhoto?.height,
    compressionQuality: storedPhoto?.compressionQuality,
  };
};

const mapRemoteVisit = (
  visit: VisitDetailsResponse,
  stop: RouteDayStop,
  existingVisit?: LocalVisitDraft,
): LocalVisitDraft => ({
  visitId: visit.id,
  routeStopId: visit.routeStopId,
  routeSequence: stop.sequence,
  clientId: visit.clientId,
  clientName: visit.clientName,
  clientAddress: stop.client.address,
  status: visit.status,
  operationalStatus: visit.operationalStatus,
  completionStatus: visit.completionStatus ?? undefined,
  journeyId: visit.journeyId,
  checkInAt: visit.checkInAt,
  serviceStartedAt: visit.serviceStartedAt ?? undefined,
  checkOutAt: visit.checkOutAt ?? undefined,
  totalDurationSeconds: visit.totalDurationSeconds ?? undefined,
  executionDurationSeconds: visit.executionDurationSeconds ?? undefined,
  outsideGeofence: visit.outsideGeofence,
  geofenceDistanceM: visit.geofenceDistanceM ?? undefined,
  outsideGeofenceJustification:
    visit.outsideGeofenceJustification ?? undefined,
  notes: visit.notes ?? '',
  checklist:
    visit.checklist.length > 0
      ? visit.checklist
      : existingVisit?.checklist ??
        toChecklistDraft(useOperationStore.getState().checklistTemplate),
  checklistCompleted: visit.checklist.length > 0,
  checklistSyncedAt:
    visit.checklist.length > 0
      ? new Date().toISOString()
      : existingVisit?.checklistSyncedAt,
  checkInPhoto: visit.checkInPhoto
    ? mapRemotePhoto(visit.checkInPhoto, stop.id, visit.id, 'CHECKIN', existingVisit)
    : existingVisit?.checkInPhoto,
  beforePhotos: visit.beforePhotos.map((photo) =>
    mapRemotePhoto(photo, stop.id, visit.id, 'BEFORE', existingVisit),
  ),
  afterPhotos: visit.afterPhotos.map((photo) =>
    mapRemotePhoto(photo, stop.id, visit.id, 'AFTER', existingVisit),
  ),
  pendingSync: existingVisit?.pendingSync ?? false,
  lastLocalChangeAt: existingVisit?.lastLocalChangeAt ?? new Date().toISOString(),
  lastSyncedAt: new Date().toISOString(),
  localOnly: false,
  plannedStartAt: stop.plannedStartAt,
  plannedEndAt: stop.plannedEndAt,
});

export const localOperationsRepository = {
  hydrateRemoteState(bundle: RouteBundle, visits: VisitDetailsResponse[]) {
    const store = useOperationStore.getState();
    store.setRouteBundle(bundle);

    if (!bundle.route) {
      return;
    }

    const pendingStopIds = getPendingRouteStopIds();

    for (const stop of bundle.route.stops) {
      const remoteVisit = visits.find((item) => item.routeStopId === stop.id);
      const existingVisit = store.visitsByStopId[stop.id];

      if (pendingStopIds.has(stop.id) && existingVisit) {
        store.patchVisit(stop.id, {
          plannedStartAt: stop.plannedStartAt,
          plannedEndAt: stop.plannedEndAt,
        });
        continue;
      }

      if (remoteVisit) {
        store.upsertVisit(mapRemoteVisit(remoteVisit, stop, existingVisit));
      }
    }
  },

  createVisitDraft(stop: RouteDayStop, justification?: string, outsideGeofence = false) {
    const visit: LocalVisitDraft = {
      visitId: `local-visit-${Date.now()}`,
      routeStopId: stop.id,
      routeSequence: stop.sequence,
      clientId: stop.client.id,
      clientName: stop.client.tradeName,
      clientAddress: stop.client.address,
      status: 'IN_PROGRESS',
      operationalStatus: 'EM_ATENDIMENTO',
      checkInAt: new Date().toISOString(),
      serviceStartedAt: undefined,
      totalDurationSeconds: undefined,
      executionDurationSeconds: undefined,
      outsideGeofence,
      outsideGeofenceJustification: justification?.trim() || undefined,
      notes: '',
      checklist: toChecklistDraft(useOperationStore.getState().checklistTemplate),
      checklistCompleted: false,
      checkInPhoto: undefined,
      beforePhotos: [],
      afterPhotos: [],
      pendingSync: true,
      lastLocalChangeAt: new Date().toISOString(),
      localOnly: true,
      plannedStartAt: stop.plannedStartAt,
      plannedEndAt: stop.plannedEndAt,
    };

    useOperationStore.getState().upsertVisit(visit);

    return visit;
  },

  updateChecklistDraft(routeStopId: string, checklist: LocalChecklistItem[]) {
    useOperationStore.getState().patchVisit(routeStopId, {
      checklist,
      checklistCompleted: checklist.every((item) =>
        item.required
          ? item.type === 'BOOLEAN'
            ? typeof item.value === 'boolean'
            : String(item.value).trim().length > 0
          : true,
      ),
      lastLocalChangeAt: new Date().toISOString(),
    });
  },

  saveVisitNotes(routeStopId: string, notes: string) {
    useOperationStore.getState().patchVisit(routeStopId, {
      notes,
      lastLocalChangeAt: new Date().toISOString(),
    });
  },

  markVisitServiceStarted(routeStopId: string, startedAt = new Date().toISOString()) {
    useOperationStore.getState().patchVisit(routeStopId, {
      serviceStartedAt: startedAt,
      pendingSync: true,
      lastLocalChangeAt: new Date().toISOString(),
    });
  },

  async addPhoto(
    routeStopId: string,
    visitId: string,
    photoType: LocalPhoto['type'],
    category: PhotoCategory,
    asset: ImagePickerAsset,
    options?: {
      capturedAt?: string;
      stage?: PhotoVisitStage;
      capturedLatitude?: number;
      capturedLongitude?: number;
      gpsStatus?: PhotoGpsStatus;
      gpsErrorCode?: string;
      gpsErrorMessage?: string;
    },
  ) {
    const capturedAt = options?.capturedAt ?? new Date().toISOString();
    const stage = derivePhotoStage(photoType, category, options?.stage);
    const persistentUri = await persistPhotoAsset(
      routeStopId,
      visitId,
      photoType,
      category,
      stage,
      asset,
    );
    const photo: LocalPhoto = {
      id: `photo-${Date.now()}`,
      visitId,
      routeStopId,
      stage,
      type: photoType,
      category,
      uri: persistentUri,
      localPath: persistentUri,
      capturedAt,
      capturedLatitude: options?.capturedLatitude,
      capturedLongitude: options?.capturedLongitude,
      gpsStatus: options?.gpsStatus ?? 'UNAVAILABLE',
      gpsErrorCode: options?.gpsErrorCode,
      gpsErrorMessage: options?.gpsErrorMessage,
      uploaded: false,
      syncStatus: 'PENDING',
      attempts: 0,
      fileName: asset.fileName ?? normalizePhotoName(asset, category),
      mimeType: asset.mimeType ?? 'image/jpeg',
      width: asset.width,
      height: asset.height,
      compressionQuality: 70,
    };

    useOperationStore.getState().addPhotoToVisit(routeStopId, photo);

    return {
      photo,
      visitId,
    };
  },

  completeChecklist(routeStopId: string) {
    useOperationStore.getState().patchVisit(routeStopId, {
      checklistCompleted: true,
      checklistSyncedAt: new Date().toISOString(),
      pendingSync: true,
      lastLocalChangeAt: new Date().toISOString(),
    });
  },

  markVisitCheckedOut(
    routeStopId: string,
    completionStatus: LocalVisitDraft['completionStatus'],
    checkedOutAt = new Date().toISOString(),
  ) {
    const visit = useOperationStore.getState().visitsByStopId[routeStopId];
    const operationalStatus =
      completionStatus === 'COMPLETED'
        ? 'CONCLUIDA'
        : completionStatus === 'PARTIAL'
          ? 'PARCIAL'
          : 'NAO_REALIZADA';

    const status =
      completionStatus === 'COMPLETED'
        ? 'COMPLETED'
        : completionStatus === 'PARTIAL'
          ? 'PARTIAL'
          : 'NOT_DONE';

    useOperationStore.getState().patchVisit(routeStopId, {
      completionStatus,
      operationalStatus,
      status,
      checkOutAt: checkedOutAt,
      totalDurationSeconds: calculateDurationSeconds(
        visit?.checkInAt,
        checkedOutAt,
      ),
      executionDurationSeconds: calculateDurationSeconds(
        visit?.serviceStartedAt,
        checkedOutAt,
      ),
      pendingSync: true,
      localOnly: false,
      lastLocalChangeAt: new Date().toISOString(),
    });
  },

  listHistory(): HistoryItem[] {
    return Object.values(useOperationStore.getState().visitsByStopId)
      .sort(
        (left, right) =>
          new Date(right.lastLocalChangeAt).getTime() -
          new Date(left.lastLocalChangeAt).getTime(),
      )
      .map((visit) => ({
        routeStopId: visit.routeStopId,
        visitId: visit.visitId,
        clientName: visit.clientName,
        clientAddress: visit.clientAddress,
        sequence: visit.routeSequence,
        operationalStatus: visit.operationalStatus,
        completionStatus: visit.completionStatus,
        checkInAt: visit.checkInAt,
        checkOutAt: visit.checkOutAt,
        beforePhotos: visit.beforePhotos.length + (visit.checkInPhoto ? 1 : 0),
        afterPhotos: visit.afterPhotos.length,
        checklistCompleted: visit.checklistCompleted,
        pendingSync: visit.pendingSync,
        lastLocalChangeAt: visit.lastLocalChangeAt,
      }));
  },
};
