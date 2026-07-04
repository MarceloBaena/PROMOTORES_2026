import * as SQLite from "expo-sqlite";
import type { ClientSnapshot, LoginResponse, MobileSnapshot, RouteItemSnapshot, RouteSnapshot } from "./api";

export type VisitStatus = "pending" | "in_progress" | "completed" | "not_completed" | "canceled";
export type SupplierExecutionStatus = "pending" | "in_progress" | "completed" | "skipped";
export type PhotoType =
  | "checkin"
  | "before"
  | "after"
  | "supplier_before"
  | "supplier_after"
  | "leaflet"
  | "gondola"
  | "display"
  | "island"
  | "promotional_material"
  | "checkout"
  | "store_extra"
  | "occurrence_extra";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

export interface LocalSession {
  accessToken: string;
  refreshToken: string;
  userJson: string;
  savedAt: string;
}

export interface LocalClient {
  id: string;
  code?: string | null;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  payloadJson: string;
}

export interface LocalRouteItem {
  id: string;
  routeId: string;
  clientId: string;
  sequence: number;
  status: string;
  payloadJson: string;
}

export interface LocalRoute {
  id: string;
  name: string;
  status: string;
  scheduledDate?: string | null;
  payloadJson: string;
}

export interface LocalVisit {
  localId: string;
  serverId?: string | null;
  routeId?: string | null;
  routeItemId?: string | null;
  clientId: string;
  status: VisitStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  notes?: string | null;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface LocalPhoto {
  localId: string;
  visitLocalId: string;
  serverId?: string | null;
  supplierExecutionLocalId?: string | null;
  supplierId?: string | null;
  type: PhotoType;
  uri: string;
  capturedAt: string;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  syncStatus: SyncStatus;
}

export interface LocalSupplierExecution {
  localId: string;
  serverId?: string | null;
  visitLocalId: string;
  supplierId: string;
  clientId: string;
  promoterId?: string | null;
  status: SupplierExecutionStatus;
  deliveryReceived?: boolean | null;
  productsReplenished?: boolean | null;
  stockoutFound?: boolean | null;
  notes?: string | null;
  startedAtDevice?: string | null;
  finishedAtDevice?: string | null;
  syncStatus: SyncStatus;
  updatedAt: string;
}

export interface SyncLog {
  id: number;
  status: SyncStatus;
  message: string;
  createdAt: string;
}

export interface SyncQueueDiagnostic {
  id: number;
  kind: "visit" | "supplierExecution" | "photo";
  entityLocalId: string;
  status: SyncStatus;
  attempts: number;
  lastError?: string | null;
  updatedAt: string;
  clientName?: string | null;
  photoType?: PhotoType | null;
  supplierName?: string | null;
}

const db = SQLite.openDatabaseSync("promotores_offline.db");
let databaseInitialized = false;

function nowIso() {
  return new Date().toISOString();
}

function hasColumn(tableName: string, columnName: string) {
  const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(tableName: string, columnName: string, sqlDefinition: string) {
  if (!hasColumn(tableName, columnName)) {
    db.execSync(`ALTER TABLE ${tableName} ADD COLUMN ${sqlDefinition};`);
  }
}

function toBoolean(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value) === 1;
}

export function initDatabase() {
  if (databaseInitialized) {
    return;
  }

  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      user_json TEXT NOT NULL,
      saved_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_date TEXT,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS route_items (
      id TEXT PRIMARY KEY,
      route_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visits (
      local_id TEXT PRIMARY KEY,
      server_id TEXT,
      route_id TEXT,
      route_item_id TEXT,
      client_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      gps_latitude REAL,
      gps_longitude REAL,
      notes TEXT,
      sync_status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS supplier_executions (
      local_id TEXT PRIMARY KEY,
      server_id TEXT,
      visit_local_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      promoter_id TEXT,
      status TEXT NOT NULL,
      delivery_received INTEGER,
      products_replenished INTEGER,
      stockout_found INTEGER,
      notes TEXT,
      started_at_device TEXT,
      finished_at_device TEXT,
      sync_status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS photos (
      local_id TEXT PRIMARY KEY,
      visit_local_id TEXT NOT NULL,
      server_id TEXT,
      type TEXT NOT NULL,
      uri TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      gps_latitude REAL,
      gps_longitude REAL,
      sync_status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      entity_local_id TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn("photos", "supplier_execution_local_id", "supplier_execution_local_id TEXT");
  ensureColumn("photos", "supplier_id", "supplier_id TEXT");

  databaseInitialized = true;
}

export function saveSession(session: LoginResponse) {
  initDatabase();
  db.runSync(
    "INSERT OR REPLACE INTO session (id, access_token, refresh_token, user_json, saved_at) VALUES (1, ?, ?, ?, ?)",
    session.accessToken,
    session.refreshToken,
    JSON.stringify(session.user),
    nowIso()
  );
}

export function getSession() {
  initDatabase();
  return db.getFirstSync<LocalSession>(
    "SELECT access_token AS accessToken, refresh_token AS refreshToken, user_json AS userJson, saved_at AS savedAt FROM session WHERE id = 1"
  );
}

export function saveSnapshot(snapshot: MobileSnapshot) {
  initDatabase();
  db.withTransactionSync(() => {
    db.runSync("DELETE FROM route_items");
    db.runSync("DELETE FROM routes");

    for (const client of snapshot.clients) {
      saveClient(client);
    }

    for (const route of snapshot.routes) {
      saveRoute(route);

      for (const item of route.items) {
        saveRouteItem(item);
      }
    }

    if (snapshot.routes.length === 0) {
      addSyncLog(
        "synced",
        "Nenhum atendimento pendente para este promotor. Clientes ja concluidos nao aparecem no roteiro do app."
      );
      return;
    }

    addSyncLog("synced", `Roteiro atualizado: ${snapshot.routes.length} rota(s), ${snapshot.clients.length} cliente(s) pendente(s).`);
  });
}

function saveClient(client: ClientSnapshot) {
  initDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO clients (id, code, name, address, city, state, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    client.id,
    client.code ?? null,
    client.name,
    client.address ?? null,
    client.city ?? null,
    client.state ?? null,
    JSON.stringify(client)
  );
}

function saveRoute(route: RouteSnapshot) {
  initDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO routes (id, name, status, scheduled_date, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
    route.id,
    route.name,
    route.status,
    route.scheduledDate ?? null,
    JSON.stringify(route)
  );
}

function saveRouteItem(item: RouteItemSnapshot) {
  initDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO route_items (id, route_id, client_id, sequence, status, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    item.id,
    item.routeId,
    item.clientId,
    item.sequence,
    item.status,
    JSON.stringify(item)
  );
}

export function listRouteItems() {
  initDatabase();
  return db.getAllSync<LocalRouteItem & { clientName: string; clientAddress?: string | null; routeName: string }>(
    `SELECT
      route_items.id,
      route_items.route_id AS routeId,
      route_items.client_id AS clientId,
      route_items.sequence,
      route_items.status,
      route_items.payload_json AS payloadJson,
      clients.name AS clientName,
      clients.address AS clientAddress,
      routes.name AS routeName
    FROM route_items
    INNER JOIN routes ON routes.id = route_items.route_id
    INNER JOIN clients ON clients.id = route_items.client_id
    WHERE routes.status = 'PUBLISHED'
      AND route_items.status = 'PLANNED'
      AND NOT EXISTS (
        SELECT 1
        FROM visits local_visit
        WHERE local_visit.route_item_id = route_items.id
          AND local_visit.status = 'completed'
      )
      AND route_items.id = (
      SELECT candidate.id
      FROM route_items candidate
      INNER JOIN routes candidate_route ON candidate_route.id = candidate.route_id
      WHERE candidate.client_id = route_items.client_id
        AND candidate_route.status = 'PUBLISHED'
        AND candidate.status = 'PLANNED'
        AND NOT EXISTS (
          SELECT 1
          FROM visits local_visit
          WHERE local_visit.route_item_id = candidate.id
            AND local_visit.status = 'completed'
        )
      ORDER BY candidate_route.scheduled_date DESC, candidate.sequence ASC, candidate.id ASC
      LIMIT 1
    )
    ORDER BY route_items.sequence ASC`
  );
}

export function getClient(clientId: string) {
  initDatabase();
  return db.getFirstSync<LocalClient>(
    `SELECT id, code, name, address, city, state, payload_json AS payloadJson FROM clients WHERE id = ?`,
    clientId
  );
}

export function getVisitByRouteItem(routeItemId: string) {
  initDatabase();
  return db.getFirstSync<LocalVisit>(
    `SELECT
      local_id AS localId,
      server_id AS serverId,
      route_id AS routeId,
      route_item_id AS routeItemId,
      client_id AS clientId,
      status,
      started_at AS startedAt,
      finished_at AS finishedAt,
      gps_latitude AS gpsLatitude,
      gps_longitude AS gpsLongitude,
      notes,
      sync_status AS syncStatus,
      updated_at AS updatedAt
    FROM visits WHERE route_item_id = ? ORDER BY updated_at DESC LIMIT 1`,
    routeItemId
  );
}

export function getVisit(localId: string) {
  initDatabase();
  return db.getFirstSync<LocalVisit>(
    `SELECT
      local_id AS localId,
      server_id AS serverId,
      route_id AS routeId,
      route_item_id AS routeItemId,
      client_id AS clientId,
      status,
      started_at AS startedAt,
      finished_at AS finishedAt,
      gps_latitude AS gpsLatitude,
      gps_longitude AS gpsLongitude,
      notes,
      sync_status AS syncStatus,
      updated_at AS updatedAt
    FROM visits WHERE local_id = ?`,
    localId
  );
}

export function upsertVisit(visit: LocalVisit) {
  initDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO visits (
      local_id, server_id, route_id, route_item_id, client_id, status, started_at, finished_at,
      gps_latitude, gps_longitude, notes, sync_status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    visit.localId,
    visit.serverId ?? null,
    visit.routeId ?? null,
    visit.routeItemId ?? null,
    visit.clientId,
    visit.status,
    visit.startedAt ?? null,
    visit.finishedAt ?? null,
    visit.gpsLatitude ?? null,
    visit.gpsLongitude ?? null,
    visit.notes ?? null,
    visit.syncStatus,
    visit.updatedAt
  );
}

export function upsertSupplierExecution(execution: LocalSupplierExecution) {
  initDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO supplier_executions (
      local_id, server_id, visit_local_id, supplier_id, client_id, promoter_id, status,
      delivery_received, products_replenished, stockout_found, notes, started_at_device,
      finished_at_device, sync_status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    execution.localId,
    execution.serverId ?? null,
    execution.visitLocalId,
    execution.supplierId,
    execution.clientId,
    execution.promoterId ?? null,
    execution.status,
    execution.deliveryReceived === null || execution.deliveryReceived === undefined ? null : execution.deliveryReceived ? 1 : 0,
    execution.productsReplenished === null || execution.productsReplenished === undefined ? null : execution.productsReplenished ? 1 : 0,
    execution.stockoutFound === null || execution.stockoutFound === undefined ? null : execution.stockoutFound ? 1 : 0,
    execution.notes ?? null,
    execution.startedAtDevice ?? null,
    execution.finishedAtDevice ?? null,
    execution.syncStatus,
    execution.updatedAt
  );
}

function normalizeSupplierExecution(
  row:
    | (Omit<LocalSupplierExecution, "deliveryReceived" | "productsReplenished" | "stockoutFound"> & {
        deliveryReceived?: number | null;
        productsReplenished?: number | null;
        stockoutFound?: number | null;
      })
    | null
): LocalSupplierExecution | null {
  if (!row) {
    return null;
  }

  return {
    ...row,
    deliveryReceived: toBoolean(row.deliveryReceived),
    productsReplenished: toBoolean(row.productsReplenished),
    stockoutFound: toBoolean(row.stockoutFound)
  } satisfies LocalSupplierExecution;
}

export function listSupplierExecutions(visitLocalId: string) {
  initDatabase();
  const rows = db.getAllSync<
    Omit<LocalSupplierExecution, "deliveryReceived" | "productsReplenished" | "stockoutFound"> & {
      deliveryReceived?: number | null;
      productsReplenished?: number | null;
      stockoutFound?: number | null;
    }
  >(
    `SELECT
      local_id AS localId,
      server_id AS serverId,
      visit_local_id AS visitLocalId,
      supplier_id AS supplierId,
      client_id AS clientId,
      promoter_id AS promoterId,
      status,
      delivery_received AS deliveryReceived,
      products_replenished AS productsReplenished,
      stockout_found AS stockoutFound,
      notes,
      started_at_device AS startedAtDevice,
      finished_at_device AS finishedAtDevice,
      sync_status AS syncStatus,
      updated_at AS updatedAt
    FROM supplier_executions
    WHERE visit_local_id = ?
    ORDER BY updated_at ASC`,
    visitLocalId
  );

  return rows.map((row) => normalizeSupplierExecution(row)).filter((row): row is LocalSupplierExecution => row !== null);
}

export function getSupplierExecution(localId: string) {
  initDatabase();
  const row = db.getFirstSync<
    Omit<LocalSupplierExecution, "deliveryReceived" | "productsReplenished" | "stockoutFound"> & {
      deliveryReceived?: number | null;
      productsReplenished?: number | null;
      stockoutFound?: number | null;
    }
  >(
    `SELECT
      local_id AS localId,
      server_id AS serverId,
      visit_local_id AS visitLocalId,
      supplier_id AS supplierId,
      client_id AS clientId,
      promoter_id AS promoterId,
      status,
      delivery_received AS deliveryReceived,
      products_replenished AS productsReplenished,
      stockout_found AS stockoutFound,
      notes,
      started_at_device AS startedAtDevice,
      finished_at_device AS finishedAtDevice,
      sync_status AS syncStatus,
      updated_at AS updatedAt
    FROM supplier_executions
    WHERE local_id = ?`,
    localId
  );

  return normalizeSupplierExecution(row);
}

export function getSupplierExecutionBySupplier(visitLocalId: string, supplierId: string) {
  initDatabase();
  const row = db.getFirstSync<
    Omit<LocalSupplierExecution, "deliveryReceived" | "productsReplenished" | "stockoutFound"> & {
      deliveryReceived?: number | null;
      productsReplenished?: number | null;
      stockoutFound?: number | null;
    }
  >(
    `SELECT
      local_id AS localId,
      server_id AS serverId,
      visit_local_id AS visitLocalId,
      supplier_id AS supplierId,
      client_id AS clientId,
      promoter_id AS promoterId,
      status,
      delivery_received AS deliveryReceived,
      products_replenished AS productsReplenished,
      stockout_found AS stockoutFound,
      notes,
      started_at_device AS startedAtDevice,
      finished_at_device AS finishedAtDevice,
      sync_status AS syncStatus,
      updated_at AS updatedAt
    FROM supplier_executions
    WHERE visit_local_id = ? AND supplier_id = ?
    ORDER BY updated_at DESC
    LIMIT 1`,
    visitLocalId,
    supplierId
  );

  return normalizeSupplierExecution(row);
}

export function addPhoto(photo: LocalPhoto) {
  initDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO photos (
      local_id, visit_local_id, server_id, supplier_execution_local_id, supplier_id, type, uri,
      captured_at, gps_latitude, gps_longitude, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    photo.localId,
    photo.visitLocalId,
    photo.serverId ?? null,
    photo.supplierExecutionLocalId ?? null,
    photo.supplierId ?? null,
    photo.type,
    photo.uri,
    photo.capturedAt,
    photo.gpsLatitude ?? null,
    photo.gpsLongitude ?? null,
    photo.syncStatus
  );
}

export function listPhotos(visitLocalId: string) {
  initDatabase();
  return db.getAllSync<LocalPhoto>(
    `SELECT
      local_id AS localId,
      visit_local_id AS visitLocalId,
      server_id AS serverId,
      supplier_execution_local_id AS supplierExecutionLocalId,
      supplier_id AS supplierId,
      type,
      uri,
      captured_at AS capturedAt,
      gps_latitude AS gpsLatitude,
      gps_longitude AS gpsLongitude,
      sync_status AS syncStatus
    FROM photos WHERE visit_local_id = ? ORDER BY captured_at ASC`,
    visitLocalId
  );
}

export function getPhoto(localId: string) {
  initDatabase();
  return db.getFirstSync<LocalPhoto>(
    `SELECT
      local_id AS localId,
      visit_local_id AS visitLocalId,
      server_id AS serverId,
      supplier_execution_local_id AS supplierExecutionLocalId,
      supplier_id AS supplierId,
      type,
      uri,
      captured_at AS capturedAt,
      gps_latitude AS gpsLatitude,
      gps_longitude AS gpsLongitude,
      sync_status AS syncStatus
    FROM photos WHERE local_id = ?`,
    localId
  );
}

export function updateVisitServerId(localId: string, serverId: string, status: SyncStatus) {
  initDatabase();
  db.runSync("UPDATE visits SET server_id = ?, sync_status = ?, updated_at = ? WHERE local_id = ?", serverId, status, nowIso(), localId);
}

export function updateVisitSyncStatus(localId: string, status: SyncStatus) {
  initDatabase();
  db.runSync("UPDATE visits SET sync_status = ?, updated_at = ? WHERE local_id = ?", status, nowIso(), localId);
}

export function updateSupplierExecutionServerId(localId: string, serverId: string, status: SyncStatus) {
  initDatabase();
  db.runSync(
    "UPDATE supplier_executions SET server_id = ?, sync_status = ?, updated_at = ? WHERE local_id = ?",
    serverId,
    status,
    nowIso(),
    localId
  );
}

export function updateSupplierExecutionSyncStatus(localId: string, status: SyncStatus) {
  initDatabase();
  db.runSync("UPDATE supplier_executions SET sync_status = ?, updated_at = ? WHERE local_id = ?", status, nowIso(), localId);
}

export function updatePhotoServerId(localId: string, serverId: string, status: SyncStatus) {
  initDatabase();
  db.runSync("UPDATE photos SET server_id = ?, sync_status = ? WHERE local_id = ?", serverId, status, localId);
}

export function updatePhotoSyncStatus(localId: string, status: SyncStatus) {
  initDatabase();
  db.runSync("UPDATE photos SET sync_status = ? WHERE local_id = ?", status, localId);
}

export function enqueue(kind: "visit" | "supplierExecution" | "photo", entityLocalId: string) {
  initDatabase();
  const existing = db.getFirstSync<{ id: number }>(
    "SELECT id FROM sync_queue WHERE kind = ? AND entity_local_id = ? AND status IN ('pending', 'syncing', 'failed')",
    kind,
    entityLocalId
  );

  if (existing) {
    db.runSync("UPDATE sync_queue SET status = 'pending', updated_at = ? WHERE id = ?", nowIso(), existing.id);
    return;
  }

  db.runSync(
    "INSERT INTO sync_queue (kind, entity_local_id, status, attempts, created_at, updated_at) VALUES (?, ?, 'pending', 0, ?, ?)",
    kind,
    entityLocalId,
    nowIso(),
    nowIso()
  );
}

export function getPendingQueue() {
  initDatabase();
  return db.getAllSync<{ id: number; kind: "visit" | "supplierExecution" | "photo"; entityLocalId: string; attempts: number }>(
    `SELECT id, kind, entity_local_id AS entityLocalId, attempts
     FROM sync_queue
     WHERE status IN ('pending', 'syncing', 'failed')
     ORDER BY id ASC`
  );
}

export function setQueueStatus(id: number, status: SyncStatus, error?: string) {
  initDatabase();
  db.runSync(
    "UPDATE sync_queue SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?",
    status,
    error ?? null,
    nowIso(),
    id
  );
}

export function removeQueueItem(id: number) {
  initDatabase();
  db.runSync("DELETE FROM sync_queue WHERE id = ?", id);
}

export function getQueueSummary() {
  initDatabase();
  return db.getFirstSync<{ pending: number; failed: number }>(
    `SELECT
      SUM(CASE WHEN status IN ('pending', 'syncing') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM sync_queue`
  ) ?? { pending: 0, failed: 0 };
}

export function clearLocalOperationalData() {
  initDatabase();
  db.withTransactionSync(() => {
    db.runSync("DELETE FROM photos");
    db.runSync("DELETE FROM supplier_executions");
    db.runSync("DELETE FROM visits");
    db.runSync("DELETE FROM sync_queue");
    db.runSync("DELETE FROM sync_logs");
    db.runSync("DELETE FROM route_items");
    db.runSync("DELETE FROM routes");
    db.runSync("DELETE FROM clients");
  });
}

export function listQueueDiagnostics() {
  initDatabase();
  return db.getAllSync<SyncQueueDiagnostic>(
    `SELECT
      sync_queue.id,
      sync_queue.kind,
      sync_queue.entity_local_id AS entityLocalId,
      sync_queue.status,
      sync_queue.attempts,
      sync_queue.last_error AS lastError,
      sync_queue.updated_at AS updatedAt,
      clients.name AS clientName,
      photos.type AS photoType,
      NULL AS supplierName
    FROM sync_queue
    LEFT JOIN visits
      ON (sync_queue.kind = 'visit' AND visits.local_id = sync_queue.entity_local_id)
      OR (sync_queue.kind = 'supplierExecution' AND visits.local_id = (SELECT visit_local_id FROM supplier_executions WHERE supplier_executions.local_id = sync_queue.entity_local_id LIMIT 1))
      OR (sync_queue.kind = 'photo' AND visits.local_id = (SELECT visit_local_id FROM photos WHERE photos.local_id = sync_queue.entity_local_id LIMIT 1))
    LEFT JOIN clients ON clients.id = visits.client_id
    LEFT JOIN photos ON photos.local_id = sync_queue.entity_local_id
    WHERE sync_queue.status IN ('pending', 'syncing', 'failed')
    ORDER BY
      CASE sync_queue.status WHEN 'failed' THEN 0 WHEN 'syncing' THEN 1 ELSE 2 END,
      sync_queue.updated_at DESC`
  );
}

export function addSyncLog(status: SyncStatus, message: string) {
  initDatabase();
  db.runSync("INSERT INTO sync_logs (status, message, created_at) VALUES (?, ?, ?)", status, message, nowIso());
}

export function listSyncLogs() {
  initDatabase();
  return db.getAllSync<SyncLog>(
    "SELECT id, status, message, created_at AS createdAt FROM sync_logs ORDER BY id DESC LIMIT 30"
  );
}
