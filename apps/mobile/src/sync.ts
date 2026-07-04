import { postJson, uploadVisitPhoto, type ClientSnapshot } from "./api";
import {
  addSyncLog,
  getClient,
  getPendingQueue,
  getPhoto,
  getSupplierExecution,
  getVisit,
  listPhotos,
  listSupplierExecutions,
  removeQueueItem,
  setQueueStatus,
  updatePhotoServerId,
  updatePhotoSyncStatus,
  updateSupplierExecutionServerId,
  updateSupplierExecutionSyncStatus,
  updateVisitServerId,
  updateVisitSyncStatus,
  type LocalPhoto,
  type LocalSupplierExecution,
  type LocalVisit
} from "./database";

interface VisitResponse {
  data: {
    id: string;
  };
}

interface SupplierExecutionResponse {
  data: {
    id: string;
  };
}

function parseClientPayload(client?: ReturnType<typeof getClient> | null) {
  if (!client?.payloadJson) {
    return null;
  }

  return JSON.parse(client.payloadJson) as ClientSnapshot;
}

function hasVisitRequiredPhotos(photos: LocalPhoto[]) {
  const types = new Set(photos.map((photo) => photo.type));
  return types.has("checkin") && types.has("checkout");
}

function hasLegacyRequiredPhotos(photos: LocalPhoto[]) {
  const types = new Set(photos.map((photo) => photo.type));
  return types.has("checkin") && types.has("before") && types.has("after") && types.has("checkout");
}

function hasSupplierRequiredPhotos(photos: LocalPhoto[]) {
  const types = new Set(photos.map((photo) => photo.type));
  return types.has("supplier_before") && types.has("supplier_after");
}

function isCompletedSupplierExecutionValid(execution: LocalSupplierExecution, photos: LocalPhoto[]) {
  if (execution.deliveryReceived === null || execution.deliveryReceived === undefined) {
    return false;
  }

  if (execution.deliveryReceived === false) {
    return true;
  }

  return (
    hasSupplierRequiredPhotos(photos) &&
    execution.productsReplenished !== null &&
    execution.productsReplenished !== undefined &&
    execution.stockoutFound !== null &&
    execution.stockoutFound !== undefined
  );
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

async function sendSupplierExecution(accessToken: string, visitId: string, execution: LocalSupplierExecution) {
  const payload = {
    clientGeneratedId: execution.localId,
    supplierId: execution.supplierId,
    status: execution.status,
    deliveryReceived: execution.deliveryReceived ?? null,
    productsReplenished: execution.deliveryReceived === false ? false : execution.productsReplenished ?? null,
    stockoutFound: execution.deliveryReceived === false ? false : execution.stockoutFound ?? null,
    notes: execution.notes ?? undefined,
    startedAtDevice: execution.startedAtDevice ?? undefined,
    finishedAtDevice: execution.finishedAtDevice ?? undefined
  };

  const response = execution.serverId
    ? await postJson<SupplierExecutionResponse>(accessToken, `/visits/${visitId}/supplier-executions/${execution.serverId}`, payload, "PUT")
    : await postJson<SupplierExecutionResponse>(accessToken, `/visits/${visitId}/supplier-executions`, payload);

  updateSupplierExecutionServerId(execution.localId, response.data.id, "synced");
  return response.data.id;
}

async function ensureServerVisit(accessToken: string, visit: LocalVisit) {
  return visit.serverId ?? await sendVisit(accessToken, { ...visit, status: "in_progress" }, "in_progress");
}

async function ensureServerSupplierExecution(accessToken: string, visitId: string, execution: LocalSupplierExecution) {
  updateSupplierExecutionSyncStatus(execution.localId, "syncing");
  return execution.serverId ?? await sendSupplierExecution(accessToken, visitId, execution);
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
    gpsLongitude: photo.gpsLongitude,
    supplierExecutionId: photo.supplierExecutionLocalId
      ? (getSupplierExecution(photo.supplierExecutionLocalId)?.serverId ?? undefined)
      : undefined,
    supplierId: photo.supplierId ?? undefined
  });

  updatePhotoServerId(photo.localId, response.data.id, "synced");
}

async function syncSupplierExecution(accessToken: string, localId: string) {
  const execution = getSupplierExecution(localId);

  if (!execution) {
    return;
  }

  const visit = getVisit(execution.visitLocalId);

  if (!visit) {
    throw new Error("Visita da execucao do fornecedor nao encontrada.");
  }

  const serverVisitId = await ensureServerVisit(accessToken, visit);
  await ensureServerSupplierExecution(accessToken, serverVisitId, execution);
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
  const supplierExecutions = listSupplierExecutions(visit.localId);
  const expectedSuppliers = parseClientPayload(getClient(visit.clientId))?.suppliers ?? [];

  if (expectedSuppliers.length === 0 && supplierExecutions.length === 0) {
    if (!hasLegacyRequiredPhotos(photos)) {
      throw new Error("Visita concluida localmente sem check-in, foto antes, foto depois e check-out.");
    }

    const serverVisitId = await ensureServerVisit(accessToken, visit);

    for (const photo of photos) {
      await uploadPhoto(accessToken, serverVisitId, photo);
    }

    const refreshedVisit = getVisit(localId) ?? visit;
    await sendVisit(accessToken, { ...refreshedVisit, serverId: serverVisitId });
    return;
  }

  if (!hasVisitRequiredPhotos(photos)) {
    throw new Error("Visita concluida localmente sem foto de check-in e check-out.");
  }

  const incompleteSuppliers = expectedSuppliers.filter((supplier) => {
    const execution = supplierExecutions.find((item) => item.supplierId === supplier.id);
    return !execution || execution.status !== "completed";
  });

  if (incompleteSuppliers.length > 0) {
    throw new Error(
      `Visita concluida localmente com ${incompleteSuppliers.length} fornecedor(es) sem concluir fotos e atividades obrigatorias.`
    );
  }

  const completedExecutions = supplierExecutions.filter((execution) => execution.status === "completed");

  for (const execution of completedExecutions) {
    const executionPhotos = photos.filter((photo) => photo.supplierExecutionLocalId === execution.localId);

    if (!isCompletedSupplierExecutionValid(execution, executionPhotos)) {
      throw new Error("Fornecedor concluido localmente sem cumprir as regras obrigatorias da atividade.");
    }
  }

  const serverVisitId = await ensureServerVisit(accessToken, visit);

  for (const execution of supplierExecutions) {
    await ensureServerSupplierExecution(accessToken, serverVisitId, execution);
  }

  for (const photo of photos) {
    if (photo.supplierExecutionLocalId) {
      const execution = getSupplierExecution(photo.supplierExecutionLocalId);

      if (execution && !execution.serverId) {
        await ensureServerSupplierExecution(accessToken, serverVisitId, execution);
      }
    }

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

  const serverVisitId = await ensureServerVisit(accessToken, visit);

  if (photo.supplierExecutionLocalId) {
    const execution = getSupplierExecution(photo.supplierExecutionLocalId);

    if (!execution) {
      throw new Error("Execucao do fornecedor da foto nao encontrada.");
    }

    await ensureServerSupplierExecution(accessToken, serverVisitId, execution);
  }

  await uploadPhoto(accessToken, serverVisitId, photo);
}

interface SyncProgress {
  item: {
    id: number;
    kind: "visit" | "supplierExecution" | "photo";
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
      } else if (item.kind === "supplierExecution") {
        await syncSupplierExecution(accessToken, item.entityLocalId);
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

  addSyncLog(failed > 0 ? "failed" : "synced", `Sincronizacao finalizada. Enviados: ${synced}. Falhas: ${failed}.`);
  return { synced, failed };
}
