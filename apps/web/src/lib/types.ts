import type {
  AlertSeverity,
  AlertType,
  PhotoCategory,
  PhotoKind,
  PromoterOperationalStatus,
  RouteItemPriority,
  RoutePlanStatus,
  RoutePlanningViewMode,
  RouteRecurrencePattern,
  VisitCompletionStatus,
  VisitProgressStatus,
  SupervisorDashboard,
} from '@promotor/types';

export type CollaboratorRole = 'PROMOTER' | 'SUPERVISOR';
export type CollaboratorStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED';

export type DashboardResponse = SupervisorDashboard & {
  promotersOnRoute: number;
  lateVisits: number;
  openAlerts: number;
  executionRate: number;
};

export interface OperationalMapResponse {
  date: string;
  promoters: Array<{
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    journeyId: string;
    status: PromoterOperationalStatus;
    latitude: number;
    longitude: number;
    updatedAt: string;
    journeyStartedAt?: string | null;
    currentCustomerName?: string | null;
    nextCustomerName?: string | null;
    completedVisits: number;
    delayedVisits: number;
    openAlerts: number;
    routeCustomers: Array<{
      routeStopId: string;
      visitId?: string | null;
      customerId: string;
      customerName: string;
      latitude: number;
      longitude: number;
      status: VisitProgressStatus;
      completionStatus?: VisitCompletionStatus | null;
      sequence: number;
      plannedStartAt?: string | null;
      checkedInAt?: string | null;
      outsideGeofence: boolean;
    }>;
  }>;
  routeCustomers: Array<{
    routeStopId: string;
    visitId?: string | null;
    customerId: string;
    customerName: string;
    promoterId: string;
    promoterName: string;
    latitude: number;
    longitude: number;
    status: VisitProgressStatus;
    completionStatus?: VisitCompletionStatus | null;
    sequence: number;
    plannedStartAt?: string | null;
    checkedInAt?: string | null;
    outsideGeofence: boolean;
  }>;
}

export interface TeamListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    employeeCode: string;
    status: PromoterOperationalStatus;
    journeyStartedAt?: string | null;
    currentCustomerName?: string | null;
    nextCustomerName?: string | null;
    visitsCompleted: number;
    totalStops: number;
    delays: number;
    openAlerts: number;
  }>;
}

export interface VisitsListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    id: string;
    routeStopId: string;
    visitId?: string | null;
    status: VisitProgressStatus;
    completionStatus?: VisitCompletionStatus | null;
    clientName: string;
    promoterName: string;
    plannedStartAt?: string | null;
    plannedEndAt?: string | null;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    beforePhotosCount: number;
    afterPhotosCount: number;
    geofenceDistanceM?: number | null;
    outsideGeofence: boolean;
    notes?: string | null;
    evidenceComplete: boolean;
    alertsOpen: number;
  }>;
}

export interface AlertsListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    id: string;
    type: AlertType;
    severity: AlertSeverity;
    message: string;
    active: boolean;
    promoterName: string;
    clientName?: string | null;
    visitId?: string | null;
    visitStatus?: VisitProgressStatus | null;
    createdAt: string;
    resolvedAt?: string | null;
    resolutionNote?: string | null;
  }>;
}

export interface VisitDetailResponse {
  id: string;
  routeDate: string;
  routeStopId: string;
  sequence?: number | null;
  status: VisitProgressStatus;
  completionStatus?: VisitCompletionStatus | null;
  outsideGeofence: boolean;
  geofenceDistanceM?: number | null;
  outsideGeofenceJustification?: string | null;
  notes?: string | null;
  checkInAt: string;
  checkOutAt?: string | null;
  promoter: {
    id: string;
    employeeCode?: string;
    name: string;
    email: string;
  };
  supervisor?: {
    id: string;
    name: string;
    email?: string | null;
  } | null;
  client: {
    id?: string;
    tradeName: string;
    legalName: string;
    address: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
    geofenceRadiusM?: number;
  };
  photos: Array<{
    id: string;
    type: PhotoKind;
    category?: PhotoCategory;
    url: string;
    capturedAt: string;
  }>;
  checklist: Array<{
    code: string;
    label: string;
    type: string;
    required: boolean;
    value: boolean | string;
  }>;
  statusHistory: Array<{
    previousStatus?: string | null;
    nextStatus: VisitProgressStatus;
    previousCompletionStatus?: VisitCompletionStatus | null;
    nextCompletionStatus?: VisitCompletionStatus | null;
    note?: string | null;
    changedAt: string;
  }>;
  alerts: Array<{
    id: string;
    type: AlertType;
    severity: AlertSeverity;
    message: string;
    createdAt: string;
    resolvedAt?: string | null;
    resolutionNote?: string | null;
  }>;
  trackPoints: Array<{
    id: string;
    latitude: number;
    longitude: number;
    capturedAt: string;
  }>;
  nextVisit?: {
    routeStopId: string;
    visitId?: string | null;
    customerId: string;
    customerName: string;
    sequence: number;
    plannedStartAt?: string | null;
  } | null;
  auditTrail: Array<{
    id: string;
    entityType: string;
    action: string;
    payload: unknown;
    createdAt: string;
  }>;
}

export interface EvidenceListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    visitId: string;
    clientName: string;
    promoterName: string;
    checkInAt: string;
    checkOutAt?: string | null;
    evidenceComplete: boolean;
    beforePhotos: EvidencePhoto[];
    afterPhotos: EvidencePhoto[];
  }>;
}

export interface EvidencePhoto {
  id: string;
  type: PhotoKind;
  category?: PhotoCategory;
  url: string;
  capturedAt: string;
}

export interface PromotersListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    id: string;
    name: string;
    email: string;
    employeeCode: string;
    active: boolean;
    supervisorId?: string | null;
    supervisorName?: string | null;
    hasActiveJourney: boolean;
    hasRoutePlanToday: boolean;
    latestJourneyStartedAt?: string | null;
  }>;
}

export interface CustomerScheduleInput {
  dayOfWeek: string;
  visitWindowStart?: string;
  visitWindowEnd?: string;
  sequenceHint?: number;
  active?: boolean;
}

export type CustomerStatus = 'ACTIVE' | 'INACTIVE';
export type CustomerSourceType = 'MANUAL' | 'CSV' | 'WINTHOR';
export type CustomerImportSourceType = 'CSV' | 'WINTHOR';
export type CustomerImportBatchStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'RETRY_SCHEDULED'
  | 'PREVIEWED'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED';
export type CustomerImportItemStatus = 'STAGED' | 'CREATE' | 'UPDATE' | 'IGNORE' | 'ERROR';

export interface CustomerInput {
  code: string;
  winthorCustomerCode?: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
  stateRegistration?: string;
  contactName: string;
  phone: string;
  email?: string;
  zipCode?: string;
  address: string;
  addressNumber?: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
  geofenceRadiusM: number;
  routeName: string;
  region: string;
  supervisorUserId: string;
  defaultPromoterUserId?: string;
  visitFrequency?: string;
  preferredVisitDays?: string[];
  preferredVisitTimeStart?: string;
  preferredVisitTimeEnd?: string;
  notes: string;
  status: CustomerStatus;
  schedules?: CustomerScheduleInput[];
}

export interface CustomerSummary {
  id: string;
  customerCode: string;
  code: string;
  winthorCustomerCode?: string | null;
  tradeName: string;
  legalName: string;
  cnpj?: string | null;
  documentNumber?: string | null;
  contactName?: string | null;
  phone?: string | null;
  address: string;
  district?: string | null;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  routeName?: string | null;
  region?: string | null;
  supervisorUserId?: string | null;
  supervisorName?: string | null;
  defaultPromoterUserId?: string | null;
  defaultPromoterName?: string | null;
  status: CustomerStatus;
  active: boolean;
  sourceType: CustomerSourceType;
  lastSyncedAt?: string | null;
  notes?: string | null;
  routeStopsCount: number;
  visitsCount: number;
  schedules: CustomerScheduleInput[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomersListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: CustomerSummary[];
}

export interface CustomerDetailResponse extends CustomerSummary {
  stateRegistration?: string | null;
  email?: string | null;
  zipCode?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  visitFrequency?: string | null;
  preferredVisitDays: string[];
  preferredVisitTimeStart?: string | null;
  preferredVisitTimeEnd?: string | null;
  importBatchId?: string | null;
  importBatch?: {
    id: string;
    sourceType: CustomerImportSourceType;
    status: CustomerImportBatchStatus;
    requestedAt: string;
    finishedAt?: string | null;
  } | null;
  deletedAt?: string | null;
}

export interface CustomerImportItem {
  id: string;
  rowNumber: number;
  status: CustomerImportItemStatus;
  customerId?: string | null;
  customerCode?: string | null;
  winthorCustomerCode?: string | null;
  cnpj?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  message?: string | null;
  issues?: string[];
  conflictKeys: string[];
  rawPayload: unknown;
  customerName?: string | null;
  customer?: {
    id: string;
    code: string;
    tradeName: string;
  } | null;
  processedAt?: string | null;
  createdAt?: string;
}

export interface CustomerImportBatchSummary {
  id: string;
  sourceType: CustomerImportSourceType;
  status: CustomerImportBatchStatus;
  applyChanges: boolean;
  sourceReference?: string | null;
  readCount: number;
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
  errorCount: number;
  logSummary?: string | null;
  requestedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  attemptCount: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  actorUserId?: string | null;
  actorUserName?: string | null;
  itemsCount: number;
  summary?: {
    readCount: number;
    createdCount: number;
    updatedCount: number;
    ignoredCount: number;
    errorCount: number;
  };
}

export interface CustomerImportCsvMetadata {
  requestedDelimiter?: string | null;
  detectedDelimiter?: string | null;
  originalHeaders: string[];
  normalizedHeaders: string[];
  recognizedHeaders: string[];
  unrecognizedHeaders: string[];
  missingRequiredHeaders: string[];
  incompatibleLayout: boolean;
  layoutMessage?: string | null;
  validRows: number;
  invalidRows: number;
  skippedEmptyRows: number;
}

export interface CustomerImportBatchesResponse {
  page: number;
  pageSize: number;
  total: number;
  items: CustomerImportBatchSummary[];
}

export interface CustomerImportBatchDetail {
  id: string;
  sourceType: CustomerImportSourceType;
  status: CustomerImportBatchStatus;
  applyChanges: boolean;
  sourceReference?: string | null;
  readCount: number;
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
  errorCount: number;
  summary?: {
    readCount: number;
    createdCount: number;
    updatedCount: number;
    ignoredCount: number;
    errorCount: number;
  };
  logSummary?: string | null;
  requestedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  attemptCount: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  requestPayload?: unknown;
  csvMetadata?: CustomerImportCsvMetadata | null;
  actorUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  previewItems: CustomerImportItem[];
}

export interface CustomerImportBatchItemsResponse {
  page: number;
  pageSize: number;
  total: number;
  items: CustomerImportItem[];
}

export interface CustomerStatusUpdateResponse {
  id: string;
  status: CustomerStatus;
  active: boolean;
  updatedAt: string;
  archived: boolean;
}

export interface ActivateAllInactiveCustomersResponse {
  foundCount: number;
  reactivatedCount: number;
  errorCount: number;
  missingCoordinatesCount: number;
  updatedAt: string;
}

export type RoutePlanningView = RoutePlanningViewMode;
export type RouteTemplateRecurrence = RouteRecurrencePattern;
export type RoutePriority = RouteItemPriority;

export interface RoutePlanInput {
  routeDate: string;
  promoterId: string;
  planningView?: RoutePlanningView;
  status?: RoutePlanStatus;
  sourceTemplateId?: string;
  publishNow?: boolean;
  notes?: string;
  items: Array<{
    routePlanItemId?: string;
    customerId: string;
    sequence: number;
    priority?: RoutePriority;
    plannedStartAt?: string;
    plannedEndAt?: string;
    notes?: string;
  }>;
}

export interface BatchRoutePlanInput {
  startDate: string;
  endDate: string;
  promoterId: string;
  planningView?: RoutePlanningView;
  status?: RoutePlanStatus;
  sourceTemplateId?: string;
  publishNow?: boolean;
  notes?: string;
  weekdays?: string[];
  monthDays?: number[];
  items: RoutePlanInput['items'];
}

export interface RoutePlansListResponse {
  page: number;
  pageSize: number;
  total: number;
  view: RoutePlanningView;
  dateFrom: string;
  dateTo: string;
  items: Array<{
    id: string;
    routeDate: string;
    planningView: RoutePlanningView;
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    employeeCode: string;
    status: RoutePlanStatus;
    version: number;
    publishedAt?: string | null;
    updatedAt: string;
    notes?: string | null;
    template?: {
      id: string;
      name: string;
      recurrence: RouteTemplateRecurrence;
    } | null;
    totalStops: number;
    completedStops: number;
    partialStops: number;
    pendingStops: number;
    cancelledStops: number;
    urgentStops: number;
    nextInstruction: string;
    stops: Array<{
      id: string;
      customerId: string;
      customerName: string;
      sequence: number;
      priority: RoutePriority;
      plannedStartAt?: string | null;
      plannedEndAt?: string | null;
      status: VisitProgressStatus;
      notes?: string | null;
      visitId?: string | null;
      completionStatus?: VisitCompletionStatus | null;
    }>;
  }>;
}

export interface RoutePlanDetailResponse {
  id: string;
  routeDate: string;
  planningView: RoutePlanningView;
  version: number;
  publishedAt?: string | null;
  updatedAt: string;
  template?: {
    id: string;
    name: string;
    recurrence: RouteTemplateRecurrence;
  } | null;
  promoter: {
    id: string;
    name: string;
    email: string;
    employeeCode: string;
  };
  status: RoutePlanStatus;
  notes?: string | null;
  nextInstruction: string;
  stops: Array<{
    id: string;
    active: boolean;
    customerId: string;
    customerName: string;
    address: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
    geofenceRadiusM: number;
    sequence: number;
    priority: RoutePriority;
    plannedStartAt?: string | null;
    plannedEndAt?: string | null;
    status: VisitProgressStatus;
    notes?: string | null;
    visitId?: string | null;
    completionStatus?: VisitCompletionStatus | null;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    cancelledAt?: string | null;
    cancellationReason?: string | null;
    cancelledBy?: {
      id: string;
      name: string;
    } | null;
  }>;
}

export interface RoutePlanHistoryResponse {
  routePlanId: string;
  total: number;
  items: Array<{
    id: string;
    changeType: string;
    summary: string;
    previousSnapshot?: unknown;
    nextSnapshot?: unknown;
    metadata?: unknown;
    actor?: {
      id: string;
      name: string;
      email: string;
    } | null;
    createdAt: string;
  }>;
}

export interface RouteTemplateItemInput {
  routeTemplateItemId?: string;
  customerId: string;
  sequence: number;
  priority?: RoutePriority;
  plannedStartTime?: string;
  plannedEndTime?: string;
  dayOfWeek?: string;
  dayOfMonth?: number;
  notes?: string;
}

export interface RouteTemplateInput {
  name: string;
  promoterId: string;
  recurrence: RouteTemplateRecurrence;
  description?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  active?: boolean;
  weekdays?: string[];
  monthDays?: number[];
  items: RouteTemplateItemInput[];
}

export interface ApplyRouteTemplateInput {
  startDate: string;
  endDate: string;
  publishNow?: boolean;
}

export interface RouteTemplatesListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    id: string;
    name: string;
    description?: string | null;
    recurrence: RouteTemplateRecurrence;
    promoterId: string;
    promoterName: string;
    promoterEmail: string;
    weekdays: string[];
    monthDays: number[];
    effectiveFrom?: string | null;
    effectiveUntil?: string | null;
    active: boolean;
    itemsCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface RouteTemplateDetailResponse {
  id: string;
  name: string;
  description?: string | null;
  recurrence: RouteTemplateRecurrence;
  weekdays: string[];
  monthDays: number[];
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  promoter: {
    id: string;
    name: string;
    email: string;
    employeeCode: string;
  };
  items: Array<{
    id: string;
    customerId: string;
    customerName: string;
    address: string;
    city: string;
    state: string;
    sequence: number;
    priority: RoutePriority;
    plannedStartTime?: string | null;
    plannedEndTime?: string | null;
    dayOfWeek?: string | null;
    dayOfMonth?: number | null;
    notes?: string | null;
  }>;
}

export interface ReportsResponse {
  date: string;
  summary: {
    planned: number;
    completed: number;
    partial: number;
    notDone: number;
    outsideGeofenceCheckIns: number;
    evidenceCompletionRate: number;
  };
  promoterProductivity: Array<{
    promoterId: string;
    promoterName: string;
    planned: number;
    completed: number;
    partial: number;
    notDone: number;
    executionRate: number;
  }>;
  unattendedCustomers: Array<{
    routeStopId: string;
    customerId: string;
    customerName: string;
    promoterId: string;
    promoterName: string;
    plannedStartAt?: string | null;
    status: VisitProgressStatus;
  }>;
  outsideGeofenceVisits: Array<{
    visitId: string;
    clientName: string;
    promoterName: string;
    geofenceDistanceM?: number | null;
    checkInAt: string;
  }>;
}

export interface AuditLogListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    actorUserId?: string | null;
    actorName: string;
    actorEmail?: string | null;
    actorRole?: string | null;
    payload: unknown;
    createdAt: string;
  }>;
}

export interface SyncPendenciesListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    routeStopId: string;
    visitId?: string | null;
    status: VisitProgressStatus;
    promoterId: string;
    promoterName: string;
    customerId: string;
    customerName: string;
    sequence: number;
    plannedStartAt?: string | null;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    outsideGeofence: boolean;
    geofenceDistanceM?: number | null;
    beforePhotosCount: number;
    afterPhotosCount: number;
    checklistSubmitted: boolean;
    openAlerts: number;
    pendingReason: string;
    notes?: string | null;
  }>;
}

export interface CollaboratorInput {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  employeeCode: string;
  role: CollaboratorRole;
  status: CollaboratorStatus;
  hireDate: string;
  region: string;
  notes?: string;
  supervisorId?: string;
  defaultJourneyStartTime?: string;
  defaultJourneyEndTime?: string;
  teamPromoterIds?: string[];
}

export interface CollaboratorCreateInput extends CollaboratorInput {
  initialPassword: string;
}

export interface CollaboratorSummary {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  cpf?: string | null;
  employeeCode?: string | null;
  role: CollaboratorRole;
  status: CollaboratorStatus;
  hireDate?: string | null;
  region?: string | null;
  notes?: string | null;
  active: boolean;
  supervisorId?: string | null;
  supervisorName?: string | null;
  defaultJourneyStartTime?: string | null;
  defaultJourneyEndTime?: string | null;
  teamSize: number;
}

export interface CollaboratorsListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: CollaboratorSummary[];
}

export interface CollaboratorDetailResponse extends CollaboratorSummary {
  teamPromoterIds: string[];
  teamPromoters: Array<{
    id: string;
    name: string;
    email: string;
    employeeCode?: string | null;
    active: boolean;
  }>;
}

export type TeamStatus = 'ACTIVE' | 'INACTIVE';

export interface TeamInput {
  name: string;
  code: string;
  description?: string;
  region?: string;
  supervisorUserId?: string;
  status: TeamStatus;
  promoterIds: string[];
}

export interface TeamMemberSummary {
  id: string;
  promoterId: string;
  promoterUserId: string;
  promoterName: string;
  promoterEmail: string;
  employeeCode: string;
  region?: string | null;
  status: CollaboratorStatus;
  active: boolean;
  supervisorUserId?: string | null;
  supervisorName?: string | null;
  createdAt: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  region?: string | null;
  supervisorUserId?: string | null;
  supervisorName?: string | null;
  status: TeamStatus;
  active: boolean;
  promotersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamsListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: TeamSummary[];
}

export interface TeamDetailResponse extends TeamSummary {
  supervisorEmail?: string | null;
  members: TeamMemberSummary[];
}

export interface TeamMembersResponse {
  teamId: string;
  total: number;
  items: TeamMemberSummary[];
}

export interface TeamStatusUpdateResponse {
  id: string;
  status: TeamStatus;
  active: boolean;
  updatedAt: string;
}
