import type {
  CheckInInput,
  CheckOutInput,
  ChecklistSubmissionInput,
  ChecklistTemplateItem,
  EndJourneyInput,
  GpsEventSource,
  JourneySummary,
  NotificationType,
  OperationalVisitStatus,
  PhotoCategory,
  PhotoGpsStatus,
  PhotoKind,
  PhotoVisitStage,
  RouteItemPriority,
  RouteNotification as SharedRouteNotification,
  RoutePlanStatus,
  RoutePlanningViewMode,
  RouteDay,
  RouteStop,
  StartVisitServiceInput,
  StartJourneyInput,
  TrackPointInput as SharedTrackPointInput,
  VisitCompletionStatus,
  VisitProgressStatus,
} from '@promotor/types';

export type {
  OperationalVisitStatus,
  PhotoCategory,
  PhotoGpsStatus,
  PhotoVisitStage,
} from '@promotor/types';

export type QueueActionState = 'PENDING' | 'SYNCING' | 'FAILED';
export type PhotoSyncStatus = 'PENDING' | 'SYNCED' | 'ERROR';
export type SyncLogStatus = 'PENDING' | 'DEFERRED' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface RouteDayStop extends RouteStop {
  operationalStatus?: OperationalVisitStatus;
  priority?: RouteItemPriority;
  plannedStartAt?: string;
  plannedEndAt?: string;
  notes?: string;
}

export interface RouteDayBundle extends Omit<RouteDay, 'stops'> {
  id: string;
  planningView?: RoutePlanningViewMode;
  status: RoutePlanStatus;
  version?: number;
  publishedAt?: string | null;
  updatedAt?: string;
  notes?: string | null;
  totalStops: number;
  completedStops: number;
  pendingStops: number;
  partialStops: number;
  skippedStops: number;
  nextInstruction?: string;
  stops: RouteDayStop[];
}

export interface RouteNotification extends Omit<SharedRouteNotification, 'type'> {
  type: NotificationType;
}

export interface RouteBundle {
  route: RouteDayBundle | null;
  checklistTemplate: ChecklistTemplateItem[];
  activeJourney: JourneySummary | null;
  notifications?: RouteNotification[];
}

export interface LocalPhoto {
  id: string;
  visitId: string;
  routeStopId: string;
  stage: PhotoVisitStage;
  type: PhotoKind;
  category: PhotoCategory;
  uri: string;
  localPath: string;
  capturedAt: string;
  capturedLatitude?: number;
  capturedLongitude?: number;
  gpsStatus: PhotoGpsStatus;
  gpsErrorCode?: string;
  gpsErrorMessage?: string;
  uploaded: boolean;
  syncStatus: PhotoSyncStatus;
  attempts: number;
  lastAttemptAt?: string;
  remoteUrl?: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  compressionQuality?: number;
  syncError?: string;
}

export interface LocalChecklistItem extends ChecklistTemplateItem {
  value: boolean | string;
}

export interface LocalVisitDraft {
  visitId: string;
  routeStopId: string;
  routeSequence: number;
  clientId: string;
  clientName: string;
  clientAddress: string;
  status: VisitProgressStatus;
  operationalStatus: OperationalVisitStatus;
  completionStatus?: VisitCompletionStatus;
  journeyId?: string;
  checkInAt?: string;
  serviceStartedAt?: string;
  checkOutAt?: string;
  totalDurationSeconds?: number;
  executionDurationSeconds?: number;
  outsideGeofence: boolean;
  geofenceDistanceM?: number;
  outsideGeofenceJustification?: string;
  notes: string;
  checklist: LocalChecklistItem[];
  checklistCompleted: boolean;
  checklistSyncedAt?: string;
  checkInPhoto?: LocalPhoto;
  beforePhotos: LocalPhoto[];
  afterPhotos: LocalPhoto[];
  pendingSync: boolean;
  lastLocalChangeAt: string;
  lastSyncedAt?: string;
  localOnly: boolean;
  plannedStartAt?: string;
  plannedEndAt?: string;
}

export interface VisitDetailsResponse {
  id: string;
  routeStopId: string;
  journeyId: string;
  promoterId: string;
  clientId: string;
  clientName: string;
  status: VisitProgressStatus;
  operationalStatus: OperationalVisitStatus;
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
  checkInPhoto?: {
    id: string;
    type: PhotoKind;
    category: PhotoCategory;
    url: string;
    capturedAt: string;
    stage?: PhotoVisitStage | null;
    capturedLatitude?: number | null;
    capturedLongitude?: number | null;
    gpsStatus?: PhotoGpsStatus | null;
    gpsErrorCode?: string | null;
    gpsErrorMessage?: string | null;
  } | null;
  beforePhotos: Array<{
    id: string;
    type: PhotoKind;
    category: PhotoCategory;
    url: string;
    capturedAt: string;
    stage?: PhotoVisitStage | null;
    capturedLatitude?: number | null;
    capturedLongitude?: number | null;
    gpsStatus?: PhotoGpsStatus | null;
    gpsErrorCode?: string | null;
    gpsErrorMessage?: string | null;
  }>;
  afterPhotos: Array<{
    id: string;
    type: PhotoKind;
    category: PhotoCategory;
    url: string;
    capturedAt: string;
    stage?: PhotoVisitStage | null;
    capturedLatitude?: number | null;
    capturedLongitude?: number | null;
    gpsStatus?: PhotoGpsStatus | null;
    gpsErrorCode?: string | null;
    gpsErrorMessage?: string | null;
  }>;
  checklist: LocalChecklistItem[];
}

export interface TodayVisitItem {
  routeStopId: string;
  visitId: string | null;
  routePlanId: string;
  routePlanStatus: RoutePlanStatus;
  sequence: number;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  status: VisitProgressStatus;
  operationalStatus: OperationalVisitStatus;
  completionStatus?: VisitCompletionStatus | null;
  client: {
    id: string;
    tradeName: string;
    city: string;
    state: string;
  };
  checkInAt?: string | null;
  checkOutAt?: string | null;
  outsideGeofence: boolean;
  beforePhotosCount: number;
  afterPhotosCount: number;
  checklistSubmitted: boolean;
}

export interface TodayVisitsResponse {
  page: number;
  pageSize: number;
  total: number;
  items: TodayVisitItem[];
}

export interface TrackPointInput extends Omit<SharedTrackPointInput, 'source'> {
  source: Extract<GpsEventSource, 'TRACKING' | 'SYNC' | 'CUSTOMER_ARRIVAL'>;
}

interface QueueActionBase {
  id: string;
  clientGeneratedId: string;
  dedupeKey: string;
  createdAt: string;
  attempts: number;
  status: QueueActionState;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  lastError?: string | null;
}

export interface SyncLogEntry {
  id: string;
  actionId: string;
  clientGeneratedId: string;
  actionType: QueueAction['type'];
  status: SyncLogStatus;
  message: string;
  createdAt: string;
  routeStopId?: string;
  visitId?: string;
  attempt?: number;
  serverEntityId?: string;
}

export type QueueAction =
  | (QueueActionBase & {
      type: 'START_JOURNEY';
      payload: StartJourneyInput;
    })
  | (QueueActionBase & {
      type: 'TRACK_POINT';
      payload: TrackPointInput;
    })
  | (QueueActionBase & {
      type: 'CHECK_IN';
      localVisitId: string;
      routeStopId: string;
      payload: CheckInInput;
    })
  | (QueueActionBase & {
      type: 'START_SERVICE';
      routeStopId: string;
      visitId: string;
      payload: {
        visitId: string;
        body: StartVisitServiceInput;
      };
    })
  | (QueueActionBase & {
      type: 'UPLOAD_PHOTO';
      routeStopId: string;
      visitId: string;
      localPhotoId: string;
      payload: {
        visitId: string;
        type: PhotoKind;
        category: PhotoCategory;
        stage: PhotoVisitStage;
        capturedAt: string;
        capturedLatitude?: number;
        capturedLongitude?: number;
        gpsStatus?: PhotoGpsStatus;
        gpsErrorCode?: string;
        gpsErrorMessage?: string;
        eventId?: string;
        uri: string;
        fileName: string;
        mimeType: string;
      };
    })
  | (QueueActionBase & {
      type: 'SUBMIT_CHECKLIST';
      routeStopId: string;
      visitId: string;
      payload: {
        visitId: string;
        body: ChecklistSubmissionInput;
      };
    })
  | (QueueActionBase & {
      type: 'UPDATE_NOTES';
      routeStopId: string;
      visitId: string;
      payload: {
        visitId: string;
        notes: string;
      };
    })
  | (QueueActionBase & {
      type: 'CHECK_OUT';
      routeStopId: string;
      visitId: string;
      payload: {
        visitId: string;
        body: CheckOutInput;
      };
    })
  | (QueueActionBase & {
      type: 'END_JOURNEY';
      payload: EndJourneyInput;
    });

type StripQueueActionMetadata<TAction> = TAction extends QueueActionBase
  ? Omit<TAction, keyof QueueActionBase>
  : never;

export type QueueActionDraft = StripQueueActionMetadata<QueueAction>;

export interface HistoryItem {
  routeStopId: string;
  visitId: string;
  clientName: string;
  clientAddress: string;
  sequence: number;
  operationalStatus: OperationalVisitStatus;
  completionStatus?: VisitCompletionStatus;
  checkInAt?: string;
  checkOutAt?: string;
  beforePhotos: number;
  afterPhotos: number;
  checklistCompleted: boolean;
  pendingSync: boolean;
  lastLocalChangeAt: string;
}
