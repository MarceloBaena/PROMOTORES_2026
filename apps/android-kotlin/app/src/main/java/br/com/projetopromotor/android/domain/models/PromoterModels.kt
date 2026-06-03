package br.com.projetopromotor.android.domain.models

enum class UserRole {
  ADMIN,
  SUPERVISOR,
  PROMOTER,
}

enum class VisitCompletionStatus {
  COMPLETED,
  PARTIAL,
  NOT_DONE,
}

enum class SyncQueueStatus {
  PENDING,
  PROCESSING,
  FAILED,
  SYNCED,
}

enum class LocalEvidenceType {
  CHECKIN,
  BEFORE,
  AFTER,
}

enum class LocalSyncActionType {
  START_JOURNEY,
  TRACK_POINT,
  CHECK_IN,
  UPLOAD_CHECKIN_PHOTO,
  UPLOAD_BEFORE_PHOTO,
  SUBMIT_CHECKLIST,
  UPDATE_NOTES,
  UPLOAD_AFTER_PHOTO,
  CHECK_OUT,
  END_JOURNEY,
}

data class SessionModel(
  val userId: String,
  val userName: String,
  val userRole: UserRole,
  val accessToken: String,
  val refreshToken: String,
)

data class RouteStopModel(
  val id: String,
  val routeDate: String,
  val routePlanId: String?,
  val routeVersion: Int,
  val sequence: Int,
  val clientId: String,
  val clientName: String,
  val addressLine: String,
  val city: String,
  val state: String,
  val latitude: Double,
  val longitude: Double,
  val radiusInMeters: Int,
  val status: String,
  val plannedStartAt: String?,
  val plannedEndAt: String?,
  val notes: String?,
  val remoteVisitId: String?,
)

data class ChecklistQuestionModel(
  val code: String,
  val label: String,
  val type: String,
  val required: Boolean,
  val sortOrder: Int,
)

data class VisitDraftModel(
  val localId: String,
  val routeStopId: String,
  val remoteVisitId: String?,
  val clientName: String,
  val checkInAt: Long?,
  val checkOutAt: Long?,
  val checkInLatitude: Double?,
  val checkInLongitude: Double?,
  val checkOutLatitude: Double?,
  val checkOutLongitude: Double?,
  val outsideGeofence: Boolean,
  val geofenceDistanceMeters: Double?,
  val outsideGeofenceJustification: String?,
  val notes: String,
  val checklistJson: String,
  val checklistCompleted: Boolean,
  val status: String,
  val completionStatus: VisitCompletionStatus?,
  val pendingSync: Boolean,
  val lastSyncedAt: Long?,
)

data class VisitPhotoModel(
  val id: String,
  val localVisitId: String,
  val routeStopId: String,
  val type: LocalEvidenceType,
  val localPath: String,
  val capturedAt: Long,
  val capturedLatitude: Double?,
  val capturedLongitude: Double?,
  val uploaded: Boolean,
  val remoteUrl: String?,
  val syncStatus: SyncQueueStatus,
)

data class VisitHistoryItemModel(
  val localId: String,
  val routeStopId: String,
  val clientName: String,
  val status: String,
  val completionStatus: VisitCompletionStatus?,
  val checkInAt: Long?,
  val checkOutAt: Long?,
  val pendingSync: Boolean,
  val lastSyncedAt: Long?,
)

data class SyncQueueItemModel(
  val id: String,
  val type: LocalSyncActionType,
  val routeStopId: String?,
  val localVisitId: String?,
  val status: SyncQueueStatus,
  val attempts: Int,
  val lastError: String?,
  val createdAt: Long,
  val nextRetryAt: Long?,
)

data class DashboardSummaryModel(
  val routeDate: String,
  val routeVersion: Int?,
  val totalStops: Int,
  val completedStops: Int,
  val pendingSyncCount: Int,
)
