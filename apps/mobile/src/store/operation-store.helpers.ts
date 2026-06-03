import type { LocalPhoto, LocalVisitDraft } from '../lib/types';

type VisitPhotoPatch = Partial<
  Pick<
    LocalPhoto,
    'attempts' | 'lastAttemptAt' | 'remoteUrl' | 'syncError' | 'syncStatus' | 'uploaded'
  >
>;

export const updateVisitRecord = (
  visitsByStopId: Record<string, LocalVisitDraft>,
  routeStopId: string,
  updater: (visit: LocalVisitDraft) => LocalVisitDraft,
) => {
  const visit = visitsByStopId[routeStopId];

  if (!visit) {
    return null;
  }

  return {
    ...visitsByStopId,
    [routeStopId]: updater(visit),
  };
};

const mapVisitPhotos = (
  visit: LocalVisitDraft,
  updater: (photo: LocalPhoto) => LocalPhoto,
) => ({
  checkInPhoto: visit.checkInPhoto ? updater(visit.checkInPhoto) : visit.checkInPhoto,
  beforePhotos: visit.beforePhotos.map(updater),
  afterPhotos: visit.afterPhotos.map(updater),
});

export const withVisitPhotoAdded = (visit: LocalVisitDraft, photo: LocalPhoto) => {
  const isCheckInPhoto = photo.stage === 'CHECKIN';
  const collection = photo.type === 'BEFORE' ? 'beforePhotos' : 'afterPhotos';

  return {
    ...visit,
    ...(isCheckInPhoto
      ? { checkInPhoto: photo }
      : { [collection]: [...visit[collection], photo] }),
    pendingSync: true,
    lastLocalChangeAt: new Date().toISOString(),
  };
};

export const withVisitPhotoUploaded = (
  visit: LocalVisitDraft,
  localPhotoId: string,
  remoteUrl: string,
) => {
  const patch: VisitPhotoPatch = {
    uploaded: true,
    remoteUrl,
    syncError: undefined,
    syncStatus: 'SYNCED',
  };

  return {
    ...visit,
    ...mapVisitPhotos(visit, (photo) =>
      photo.id === localPhotoId ? { ...photo, ...patch } : photo,
    ),
    lastSyncedAt: new Date().toISOString(),
  };
};

export const withVisitPhotoStatePatched = (
  visit: LocalVisitDraft,
  localPhotoId: string,
  patch: VisitPhotoPatch,
) => ({
  ...visit,
  ...mapVisitPhotos(visit, (photo) =>
    photo.id === localPhotoId ? { ...photo, ...patch } : photo,
  ),
});

export const withVisitIdRemapped = (
  visit: LocalVisitDraft,
  localVisitId: string,
  remoteVisitId: string,
) => {
  if (localVisitId === remoteVisitId) {
    return visit;
  }

  return {
    ...visit,
    visitId: visit.visitId === localVisitId ? remoteVisitId : visit.visitId,
    ...mapVisitPhotos(visit, (photo) =>
      photo.visitId === localVisitId
        ? {
            ...photo,
            visitId: remoteVisitId,
          }
        : photo,
    ),
  };
};
