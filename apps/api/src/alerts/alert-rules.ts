import {
  AlertSeverity,
  AlertType,
  PhotoCategory,
  PhotoGpsStatus,
  PhotoType,
  RouteStopStatus,
  VisitCompletionStatus,
} from '@prisma/client';

export const TOO_FAST_VISIT_MAX_SECONDS = 3 * 60;
export const TOO_LONG_VISIT_MIN_SECONDS = 3 * 60 * 60;
export const AUTOMATIC_ALERT_RESOLUTION_NOTE =
  'Resolvido automaticamente pela reconciliacao do backend.';

export const AUDIT_ALERT_SEVERITIES: Partial<Record<AlertType, AlertSeverity>> =
  {
    [AlertType.GPS_MISSING]: AlertSeverity.MEDIUM,
    [AlertType.OUTSIDE_GEOFENCE]: AlertSeverity.HIGH,
    [AlertType.MISSING_REQUIRED_PHOTO]: AlertSeverity.HIGH,
    [AlertType.TOO_FAST_VISIT]: AlertSeverity.MEDIUM,
    [AlertType.TOO_LONG_VISIT]: AlertSeverity.MEDIUM,
    [AlertType.INCONSISTENT_FINISH]: AlertSeverity.HIGH,
    [AlertType.SYNC_FAILURE]: AlertSeverity.MEDIUM,
  };

export interface VisitAuditPhotoFact {
  type: PhotoType;
  category: PhotoCategory;
  capturedAt: Date;
  gpsStatus?: PhotoGpsStatus | null;
}

export interface VisitAuditFacts {
  id: string;
  promoterId: string;
  clientId: string;
  clientName: string;
  status: RouteStopStatus;
  completionStatus?: VisitCompletionStatus | null;
  checkInAt: Date;
  serviceStartedAt?: Date | null;
  checkOutAt?: Date | null;
  outsideGeofence: boolean;
  photos: VisitAuditPhotoFact[];
}

export interface VisitAuditEvaluation {
  gpsMissing: boolean;
  outsideGeofence: boolean;
  missingRequiredPhoto: boolean;
  missingRequiredPhotoItems: string[];
  tooFastVisit: boolean;
  tooLongVisit: boolean;
  inconsistentFinish: boolean;
  totalDurationSeconds: number | null;
  executionDurationSeconds: number | null;
}

export const isAuditAlertType = (type: AlertType) =>
  type in AUDIT_ALERT_SEVERITIES;

export const getAuditAlertSeverity = (type: AlertType) =>
  AUDIT_ALERT_SEVERITIES[type] ?? AlertSeverity.MEDIUM;

export const getCheckInEstablishmentPhoto = <T extends VisitAuditPhotoFact>(
  photos: T[],
) =>
  photos
    .filter((photo) => photo.category === PhotoCategory.CHECKIN_ESTABLISHMENT)
    .sort(
      (left, right) => left.capturedAt.getTime() - right.capturedAt.getTime(),
    )[0] ?? null;

export const getBeforeEvidencePhotos = <T extends VisitAuditPhotoFact>(
  photos: T[],
) =>
  photos.filter(
    (photo) =>
      photo.type === PhotoType.BEFORE &&
      photo.category !== PhotoCategory.CHECKIN_ESTABLISHMENT,
  );

export const getAfterEvidencePhotos = <T extends VisitAuditPhotoFact>(
  photos: T[],
) => photos.filter((photo) => photo.type === PhotoType.AFTER);

export const calculateDurationSeconds = (
  startAt?: Date | null,
  endAt?: Date | null,
) => {
  if (!startAt || !endAt) {
    return null;
  }

  const diffInMs = endAt.getTime() - startAt.getTime();
  return diffInMs > 0 ? Math.floor(diffInMs / 1000) : 0;
};

export const evaluateVisitAuditFlags = (
  facts: VisitAuditFacts,
  options?: {
    activateMissingRequiredPhoto?: boolean;
  },
): VisitAuditEvaluation => {
  const checkInPhoto = getCheckInEstablishmentPhoto(facts.photos);
  const beforePhotos = getBeforeEvidencePhotos(facts.photos);
  const afterPhotos = getAfterEvidencePhotos(facts.photos);
  const missingRequiredPhotoItems: string[] = [];

  if (!checkInPhoto) {
    missingRequiredPhotoItems.push('foto do estabelecimento do check-in');
  }

  if (!facts.serviceStartedAt) {
    missingRequiredPhotoItems.push('inicio do atendimento');
  }

  if (beforePhotos.length < 1) {
    missingRequiredPhotoItems.push('foto do antes');
  }

  if (afterPhotos.length < 1) {
    missingRequiredPhotoItems.push('foto do depois');
  }

  const totalDurationSeconds = calculateDurationSeconds(
    facts.checkInAt,
    facts.checkOutAt,
  );
  const executionDurationSeconds = calculateDurationSeconds(
    facts.serviceStartedAt,
    facts.checkOutAt,
  );
  const hasPersistedFinish = Boolean(
    facts.checkOutAt || facts.completionStatus,
  );
  const missingRequiredPhoto =
    missingRequiredPhotoItems.length > 0 &&
    Boolean(options?.activateMissingRequiredPhoto || hasPersistedFinish);
  const gpsMissing = facts.photos.some(
    (photo) => photo.gpsStatus && photo.gpsStatus !== PhotoGpsStatus.CAPTURED,
  );
  const tooFastVisit = Boolean(
    facts.checkOutAt &&
    executionDurationSeconds !== null &&
    executionDurationSeconds <= TOO_FAST_VISIT_MAX_SECONDS,
  );
  const tooLongVisit = Boolean(
    facts.checkOutAt &&
    totalDurationSeconds !== null &&
    totalDurationSeconds >= TOO_LONG_VISIT_MIN_SECONDS,
  );
  const inconsistentFinish = Boolean(
    facts.checkOutAt &&
    (!facts.serviceStartedAt ||
      facts.checkOutAt.getTime() <= facts.checkInAt.getTime() ||
      (facts.serviceStartedAt &&
        facts.checkOutAt.getTime() <= facts.serviceStartedAt.getTime()) ||
      (facts.completionStatus === VisitCompletionStatus.COMPLETED &&
        missingRequiredPhotoItems.length > 0)),
  );

  return {
    gpsMissing,
    outsideGeofence: facts.outsideGeofence,
    missingRequiredPhoto,
    missingRequiredPhotoItems,
    tooFastVisit,
    tooLongVisit,
    inconsistentFinish,
    totalDurationSeconds,
    executionDurationSeconds,
  };
};
