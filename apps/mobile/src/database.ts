import * as SQLite from "expo-sqlite";
import type { ClientSnapshot, LoginResponse, MobileSnapshot, RouteItemSnapshot, RouteSnapshot } from "./api";

export type VisitStatus = "pending" | "in_progress" | "completed" | "not_completed";
export type PhotoType = "checkin" | "before" | "after" | "occurrence_extra";
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
  type: PhotoType;
  uri: string;
  capturedAt: string;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  syncStatus: SyncStatus;
}

export interface SyncLog {
  id: number;
  status: SyncStatus;
  message: string;
  createdAt: string;
}

const db = SQLite.openDatabaseSync("promotores_offline.db");
let databaseInitialized = false;

function nowIso() {
  return new Date().toISOString();
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
    for (const client of snapshot.clients) {
      saveClient(client);
    }

    for (const route of snapshot.routes) {
      saveRoute(route);

      for (const item of route.items) {
        saveClient(item.client);
        saveRouteItem(item);
      }
    }

    addSyncLog("synced", `Roteiro salvo localmente: ${snapshot.routes.length} rota(s), ${snapshot.clients.length} cliente(s).`);
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
    INNER JOIN clients ON clients.id = route_items.client_id
    INNER JOIN routes ON routes.id = route_items.route_id
    ORDER BY routes.scheduled_date IS NULL, routes.scheduled_date ASC, route_items.sequence ASC`
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

export function addPhoto(photo: LocalPhoto) {
  initDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO photos (
      local_id, visit_local_id, server_id, type, uri, captured_at, gps_latitude, gps_longitude, sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    photo.localId,
    photo.visitLocalId,
    photo.serverId ?? null,
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

export function updatePhotoServerId(localId: string, serverId: string, status: SyncStatus) {
  initDatabase();
  db.runSync("UPDATE photos SET server_id = ?, sync_status = ? WHERE local_id = ?", serverId, status, localId);
}

export function updatePhotoSyncStatus(localId: string, status: SyncStatus) {
  initDatabase();
  db.runSync("UPDATE photos SET sync_status = ? WHERE local_id = ?", status, localId);
}

export function enqueue(kind: "visit" | "photo", entityLocalId: string) {
  initDatabase();
  const existing = db.getFirstSync<{ id: number }>(
    "SELECT id FROM sync_queue WHERE kind = ? AND entity_local_id = ? AND status IN ('pending', 'failed')",
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
  return db.getAllSync<{ id: number; kind: "visit" | "photo"; entityLocalId: string; attempts: number }>(
    `SELECT id, kind, entity_local_id AS entityLocalId, attempts
     FROM sync_queue
     WHERE status IN ('pending', 'failed')
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
