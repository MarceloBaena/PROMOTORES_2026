import type {
  ChecklistTemplateItem,
  JourneySummary,
  NotificationType,
  OperationalVisitStatus,
  PhotoCategory,
  PhotoKind,
  RouteItemPriority,
  RouteNotification as SharedRouteNotification,
  RoutePlanStatus,
  RoutePlanningViewMode,
  RouteDay,
  RouteStop,
  VisitCompletionStatus,
  VisitProgressStatus,
} from '@promotor/types';

export type { OperationalVisitStatus, PhotoCategory } from '@promotor/types';

export interface PromoterRouteDayStop extends RouteStop {
  operationalStatus?: OperationalVisitStatus;
  priority?: RouteItemPriority;
  plannedStartAt?: string;
  plannedEndAt?: string;
  notes?: string;
}

export interface PromoterRouteDayBundle extends Omit<RouteDay, 'stops'> {
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
  stops: PromoterRouteDayStop[];
}

export interface PromoterRouteNotification
  extends Omit<SharedRouteNotification, 'type'> {
  type: NotificationType;
}

export interface PromoterRouteBundleResponse {
  route: PromoterRouteDayBundle | null;
  checklistTemplate: ChecklistTemplateItem[];
  activeJourney: JourneySummary | null;
  notifications?: PromoterRouteNotification[];
}

export interface PromoterChecklistDraftItem extends ChecklistTemplateItem {
  value: boolean | string;
}

export interface PromoterVisitPhoto {
  id: string;
  type: PhotoKind;
  category: PhotoCategory;
  url: string;
  capturedAt: string;
  capturedDate?: string;
  capturedTime?: string;
}

export interface PromoterVisitDetailsResponse {
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
  checkOutAt?: string | null;
  outsideGeofence: boolean;
  geofenceDistanceM?: number | null;
  outsideGeofenceJustification?: string | null;
  notes?: string | null;
  checkInPhoto?: PromoterVisitPhoto | null;
  beforePhotos: PromoterVisitPhoto[];
  afterPhotos: PromoterVisitPhoto[];
  checklist: PromoterChecklistDraftItem[];
}

export interface PromoterTodayVisitItem {
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

export interface PromoterTodayVisitsResponse {
  page: number;
  pageSize: number;
  total: number;
  items: PromoterTodayVisitItem[];
}

export interface PromoterPhotoUploadResponse {
  id: string;
  type: PhotoKind;
  category: PhotoCategory;
  url: string;
  capturedAt: string;
  capturedDate?: string;
  capturedTime?: string;
}
