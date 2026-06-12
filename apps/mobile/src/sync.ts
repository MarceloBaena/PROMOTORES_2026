import { postJson, uploadVisitPhoto } from "./api";
import {
  addSyncLog,
  getPendingQueue,
  getPhoto,
  getVisit,
  listPhotos,
  removeQueueItem,
  setQueueStatus,
  updatePhotoServerId,
  updatePhotoSyncStatus,
  updateVisitServerId,
  updateVisitSyncStatus,
  type LocalPhoto,
  type LocalVisit
} from "./database";

interface VisitResponse {
  data: {
    id: string;
  };
}

function hasRequiredPhotos(photos: LocalPhoto[]) {
  const types = new Set(photos.map((photo) => photo.type));
  return types.has("checkin") && types.has("before") && types.has("after");
}

async function sendVisit(accessToken: string, visit: LocalVisit, statusOverride?: LocalVisit["status"]) {
  const payload = {
    clientGeneratedId: visit.localId,
    routeId: visit.routeId,
    routeItemId: visit.routeItemId,
    clientId: visit.clientId,
    status: statusOverride ?? visit.status,
    startedAt: visit.startedAt,
    finishedAt: statusOverride === "in_progress" ? undefined : visit.finishedAt,
    gpsLatitude: visit.gpsLatitude,
    gpsLongitude: visit.gpsLongitude,
    notes: visit.notes
  };

  const response = visit.serverId
    ? await postJson<VisitResponse>(accessToken, `/visits/${visit.serverId}`, payload, "PUT")
    : await postJson<VisitResponse>(accessToken, "/visits", payload);

  updateVisitServerId(visit.localId, response.data.id, statusOverride ? "pending" : "synced");
  return response.data.id;
}

async function uploadPhoto(accessToken: string, visitId: string, photo: LocalPhoto) {
  if (photo.serverId || photo.syncStatus === "synced") {
    return;
  }

  updatePhotoSyncStatus(photo.localId, "syncing");
  const response = await uploadVisitPhoto(accessToken, visitId, {
    uri: photo.uri,
    type: photo.type,
    clientGeneratedId: photo.localId,
    capturedAt: photo.capturedAt,
    gpsLatitude: photo.gpsLatitude,
    gpsLongitude: photo.gpsLongitude
  });

  updatePhotoServerId(photo.localId, response.data.id, "synced");
}

async function syncVisit(accessToken: string, localId: string) {
  const visit = getVisit(localId);

  if (!visit) {
    return;
  }

  updateVisitSyncStatus(localId, "syncing");

  if (visit.status !== "completed") {
    await sendVisit(accessToken, visit);
    return;
  }

  const photos = listPhotos(visit.localId);

  if (!hasRequiredPhotos(photos)) {
    throw new Error("Visita concluida localmente sem todas as fotos obrigatorias.");
  }

  const serverVisitId = visit.serverId ?? await sendVisit(accessToken, visit, "in_progress");

  for (const photo of photos) {
    await uploadPhoto(accessToken, serverVisitId, photo);
  }

  const refreshedVisit = getVisit(localId) ?? visit;
  await sendVisit(accessToken, { ...refreshedVisit, serverId: serverVisitId });
}

async function syncPhoto(accessToken: string, localId: string) {
  const photo = getPhoto(localId);

  if (!photo || photo.serverId || photo.syncStatus === "synced") {
    return;
  }

  const visit = getVisit(photo.visitLocalId);

  if (!visit) {
    throw new Error("Visita da foto nao encontrada.");
  }

  const serverVisitId = visit.serverId ?? await sendVisit(accessToken, { ...visit, status: "in_progress" }, "in_progress");
  await uploadPhoto(accessToken, serverVisitId, photo);
}

interface SyncProgress {
  item: {
    id: number;
    kind: "visit" | "photo";
    entityLocalId: string;
    attempts: number;
  };
  status: "syncing" | "synced" | "failed";
  synced: number;
  failed: number;
  error?: string;
}

export async function syncPending(accessToken: string, onProgress?: (progress: SyncProgress) => void) {
  const queue = getPendingQueue();
  let synced = 0;
  let failed = 0;

  if (queue.length === 0) {
    return { synced, failed };
  }

  for (const item of queue) {
    try {
      setQueueStatus(item.id, "syncing");
      onProgress?.({ item, status: "syncing", synced, failed });

      if (item.kind === "visit") {
        await syncVisit(accessToken, item.entityLocalId);
      } else {
        await syncPhoto(accessToken, item.entityLocalId);
      }

      removeQueueItem(item.id);
      synced += 1;
      onProgress?.({ item, status: "synced", synced, failed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido de sincronizacao.";
      setQueueStatus(item.id, "failed", message);
      addSyncLog("failed", message);
      failed += 1;
      onProgress?.({ item, status: "failed", synced, failed, error: message });
    }
  }

  addSyncLog(failed > 0 ? "failed" : "synced", `Sync finalizada. Enviados: ${synced}. Falhas: ${failed}.`);
  return { synced, failed };
}
