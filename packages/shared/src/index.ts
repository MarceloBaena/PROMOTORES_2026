export const ROLE_CODES = ["ADMIN", "SUPERVISOR", "PROMOTOR"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const USER_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PROFILE_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const CLIENT_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const ROUTE_STATUSES = ["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const ROUTE_ITEM_STATUSES = ["PLANNED", "COMPLETED", "SKIPPED", "CANCELLED"] as const;
export type RouteItemStatus = (typeof ROUTE_ITEM_STATUSES)[number];

export const VISIT_STATUSES = ["pending", "in_progress", "completed", "not_completed"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const PHOTO_TYPES = ["checkin", "before", "after", "occurrence_extra"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export const SYNC_STATUSES = ["pending", "syncing", "synced", "failed"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_TYPES = [
  "INITIAL_DOWNLOAD",
  "CLIENTS_DOWNLOAD",
  "ROUTES_DOWNLOAD",
  "VISIT_UPLOAD",
  "PHOTO_UPLOAD",
  "OCCURRENCE_UPLOAD",
  "STATUS_CHECK",
  "REPROCESS",
  "CSV_IMPORT"
] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

export const SYNC_ENTITY_TYPES = ["VISIT", "PHOTO", "OCCURRENCE"] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export const AUDIT_FLAG_TYPES = [
  "GPS_MISSING",
  "OUTSIDE_GEOFENCE",
  "MISSING_REQUIRED_PHOTO",
  "TOO_FAST_VISIT",
  "TOO_LONG_VISIT",
  "INCONSISTENT_FINISH",
  "SYNC_FAILURE"
] as const;
export type AuditFlagType = (typeof AUDIT_FLAG_TYPES)[number];

export const AUDIT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const IMPORT_STATUSES = ["PREVIEW", "SUCCESS", "PARTIAL", "FAILED"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: RoleCode;
  status: UserStatus;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export const DEFAULT_USERS = {
  admin: {
    email: "admin@salespromoters.local",
    password: "Admin@123"
  },
  supervisor: {
    email: "supervisor@salespromoters.local",
    password: "Supervisor@123"
  }
} as const;
