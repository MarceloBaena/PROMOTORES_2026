export const userRoles = ['ADMIN', 'PROMOTER', 'SUPERVISOR'] as const;
export type UserRole = (typeof userRoles)[number];

export const visitCompletionStatuses = [
  'COMPLETED',
  'PARTIAL',
  'NOT_DONE',
] as const;
export type VisitCompletionStatus = (typeof visitCompletionStatuses)[number];

export const visitProgressStatuses = [
  'PLANNED',
  'IN_PROGRESS',
  'CHECKED_OUT',
  'SYNC_PENDING',
  'COMPLETED',
  'PARTIAL',
  'NOT_DONE',
] as const;
export type VisitProgressStatus = (typeof visitProgressStatuses)[number];

export const operationalVisitStatuses = [
  'PENDENTE',
  'EM_ATENDIMENTO',
  'CONCLUIDA',
  'PARCIAL',
  'NAO_REALIZADA',
] as const;
export type OperationalVisitStatus = (typeof operationalVisitStatuses)[number];

export const promoterOperationalStatuses = [
  'ON_ROUTE',
  'DELAYED',
  'READY',
  'IDLE',
] as const;
export type PromoterOperationalStatus =
  (typeof promoterOperationalStatuses)[number];

export const routePlanStatuses = [
  'DRAFT',
  'PUBLISHED',
  'IN_PROGRESS',
  'COMPLETED',
  'ARCHIVED',
] as const;
export type RoutePlanStatus = (typeof routePlanStatuses)[number];

export const routePlanningViewModes = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type RoutePlanningViewMode = (typeof routePlanningViewModes)[number];

export const routeRecurrencePatterns = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'CUSTOM',
] as const;
export type RouteRecurrencePattern = (typeof routeRecurrencePatterns)[number];

export const routeItemPriorities = [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
] as const;
export type RouteItemPriority = (typeof routeItemPriorities)[number];

export const notificationTypes = [
  'ROUTE_PUBLISHED',
  'ROUTE_UPDATED',
  'ROUTE_ITEM_ADDED',
  'ROUTE_ITEM_CANCELLED',
  'ROUTE_RESEQUENCED',
  'SUPERVISOR_INSTRUCTION',
] as const;
export type NotificationType = (typeof notificationTypes)[number];

export const photoKinds = ['BEFORE', 'AFTER'] as const;
export type PhotoKind = (typeof photoKinds)[number];

export const photoCategories = [
  'CHECKIN_ESTABLISHMENT',
  'BEFORE_1',
  'BEFORE_2',
  'AFTER_1',
  'AFTER_2',
  'GENERAL',
  'SHELF',
  'DISPLAY',
  'PRICE_TAG',
  'STOCK',
  'OTHER',
] as const;
export type PhotoCategory = (typeof photoCategories)[number];

export const photoVisitStages = [
  'CHECKIN',
  'BEFORE',
  'AFTER',
  'OCCURRENCE_EXTRA',
] as const;
export type PhotoVisitStage = (typeof photoVisitStages)[number];

export const photoGpsStatuses = [
  'CAPTURED',
  'UNAVAILABLE',
  'PERMISSION_DENIED',
] as const;
export type PhotoGpsStatus = (typeof photoGpsStatuses)[number];

export const alertSeverities = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type AlertSeverity = (typeof alertSeverities)[number];

export const alertTypes = [
  'GPS_MISSING',
  'OUTSIDE_GEOFENCE',
  'MISSING_REQUIRED_PHOTO',
  'TOO_FAST_VISIT',
  'TOO_LONG_VISIT',
  'INCONSISTENT_FINISH',
  'SYNC_FAILURE',
  'PENDING_SYNC',
  'PARTIAL_VISIT',
  'MISSED_VISIT',
  'NO_ACTIVE_JOURNEY',
  'MISSING_BEFORE_PHOTO',
  'MISSING_AFTER_PHOTO',
  'MISSING_CHECKLIST',
  'SKIPPED_CUSTOMER',
  'RELEVANT_DELAY',
] as const;
export type AlertType = (typeof alertTypes)[number];

export const gpsEventSources = [
  'JOURNEY_START',
  'TRACKING',
  'CUSTOMER_ARRIVAL',
  'CHECK_IN',
  'CHECK_OUT',
  'JOURNEY_END',
  'SYNC',
] as const;
export type GpsEventSource = (typeof gpsEventSources)[number];

export type ChecklistAnswerValue = boolean | string;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeoFence {
  latitude: number;
  longitude: number;
  radiusInMeters: number;
}

export interface ChecklistTemplateItem {
  code: string;
  label: string;
  type: 'BOOLEAN' | 'TEXT';
  required: boolean;
}

export interface RouteClient {
  id: string;
  tradeName: string;
  legalName: string;
  address: string;
  city: string;
  state: string;
  coordinates: Coordinates;
  geofence: GeoFence;
}

export interface RouteStop {
  id: string;
  sequence: number;
  client: RouteClient;
  plannedDate: string;
  status: VisitProgressStatus;
  operationalStatus?: OperationalVisitStatus;
  priority?: RouteItemPriority;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  notes?: string;
  visitId?: string | null;
}

export interface RouteDay {
  id?: string;
  date: string;
  promoterId: string;
  promoterName: string;
  planningView?: RoutePlanningViewMode;
  status?: RoutePlanStatus;
  version?: number;
  publishedAt?: string | null;
  updatedAt?: string;
  notes?: string | null;
  totalStops?: number;
  completedStops?: number;
  pendingStops?: number;
  partialStops?: number;
  skippedStops?: number;
  nextInstruction?: string;
  stops: RouteStop[];
}

export interface RouteNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  routePlanId: string | null;
  routePlanItemId: string | null;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface ChecklistResponseItem extends ChecklistTemplateItem {
  value: ChecklistAnswerValue;
}

export interface VisitPhotoSummary {
  id: string;
  type: PhotoKind;
  category?: PhotoCategory;
  stage?: PhotoVisitStage | null;
  url: string;
  capturedAt: string;
  capturedLatitude?: number | null;
  capturedLongitude?: number | null;
  gpsStatus?: PhotoGpsStatus | null;
  gpsErrorCode?: string | null;
  gpsErrorMessage?: string | null;
}

export interface VisitSummary {
  id: string;
  routeStopId: string;
  journeyId: string;
  promoterId: string;
  clientId: string;
  clientName: string;
  status: VisitProgressStatus;
  operationalStatus?: OperationalVisitStatus;
  completionStatus?: VisitCompletionStatus | null;
  checkInAt: string;
  serviceStartedAt?: string | null;
  checkOutAt?: string | null;
  totalDurationSeconds?: number | null;
  executionDurationSeconds?: number | null;
  outsideGeofence: boolean;
  geofenceDistanceM?: number | null;
  outsideGeofenceJustification?: string | null;
  notes?: string | null;
  checkInPhoto?: VisitPhotoSummary | null;
  beforePhotos: VisitPhotoSummary[];
  afterPhotos: VisitPhotoSummary[];
  checklist: ChecklistResponseItem[];
}

export interface JourneySummary {
  id: string;
  promoterId: string;
  promoterName: string;
  startedAt: string;
  endedAt?: string;
  active: boolean;
}

export const syncPushActionTypes = [
  'START_JOURNEY',
  'TRACK_POINT',
  'CHECK_IN',
  'START_SERVICE',
  'SUBMIT_CHECKLIST',
  'UPDATE_NOTES',
  'CHECK_OUT',
  'END_JOURNEY',
] as const;
export type SyncPushActionType = (typeof syncPushActionTypes)[number];

export interface SyncPushAction {
  id: string;
  clientGeneratedId: string;
  type: SyncPushActionType;
  payload: Record<string, unknown>;
}

export interface SyncPushResult {
  id: string;
  clientGeneratedId?: string;
  actionType?: SyncPushActionType;
  success: boolean;
  status?: 'SYNCED' | 'FAILED';
  processedAt?: string;
  serverEntityId?: string | null;
  result?: unknown;
  error?: string | null;
}

export interface SyncPullSnapshot {
  serverTime: string;
  deviceId?: string | null;
  routeDate: string;
  routeVersion?: number | null;
  hasRouteChange: boolean;
  snapshot: {
    route: RouteDay | null;
    checklistTemplate: ChecklistTemplateItem[];
    activeJourney: JourneySummary | null;
    notifications: RouteNotification[];
  };
}

export interface SyncPushResponse {
  serverTime: string;
  deviceId?: string | null;
  pushedAt: string;
  acceptedActions: number;
  rejectedActions: number;
  results: SyncPushResult[];
  snapshot: SyncPullSnapshot['snapshot'];
}

export interface SupervisorDashboard {
  activeJourneys: number;
  plannedVisits: number;
  completedVisits: number;
  pendingVisits: number;
  partialVisits: number;
  highAlerts: number;
  mapPoints: Array<{
    promoterId: string;
    promoterName: string;
    journeyId: string;
    latitude: number;
    longitude: number;
    updatedAt: string;
  }>;
  alerts: Array<{
    id: string;
    type: AlertType;
    severity: AlertSeverity;
    message: string;
    promoterName: string;
    clientName?: string;
    createdAt: string;
  }>;
}
