package br.com.projetopromotor.android.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "route_plan")
data class RoutePlanEntity(
  @PrimaryKey val routeDate: String,
  val routePlanId: String?,
  val promoterId: String?,
  val promoterName: String?,
  val routeVersion: Int,
  val routeStatus: String?,
  val publishedAt: String?,
  val updatedAt: String?,
  val nextInstruction: String?,
)

@Entity(tableName = "route_stop")
data class RouteStopEntity(
  @PrimaryKey val id: String,
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

@Entity(tableName = "checklist_question")
data class ChecklistQuestionEntity(
  @PrimaryKey val code: String,
  val label: String,
  val type: String,
  val required: Boolean,
  val sortOrder: Int,
)

@Entity(tableName = "visit_draft")
data class VisitDraftEntity(
  @PrimaryKey val localId: String,
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
  val completionStatus: String?,
  val pendingSync: Boolean,
  val lastSyncedAt: Long?,
  val localUpdatedAt: Long,
)

@Entity(tableName = "visit_photo")
data class VisitPhotoEntity(
  @PrimaryKey val id: String,
  val localVisitId: String,
  val routeStopId: String,
  val type: String,
  val localPath: String,
  val mimeType: String,
  val capturedAt: Long,
  val capturedLatitude: Double?,
  val capturedLongitude: Double?,
  val uploaded: Boolean,
  val remoteUrl: String?,
  val remotePhotoId: String?,
  val syncStatus: String,
  val uploadAttempts: Int,
)

@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
  @PrimaryKey val id: String,
  val type: String,
  val routeStopId: String?,
  val localVisitId: String?,
  val payloadJson: String,
  val status: String,
  val attempts: Int,
  val lastError: String?,
  val createdAt: Long,
  val lastAttemptAt: Long?,
  val nextRetryAt: Long?,
)

@Entity(tableName = "location_event")
data class LocationEventEntity(
  @PrimaryKey val id: String,
  val eventType: String,
  val routeStopId: String?,
  val localVisitId: String?,
  val latitude: Double,
  val longitude: Double,
  val accuracyMeters: Float?,
  val capturedAt: Long,
  val synced: Boolean,
)

@Dao
interface RouteDao {
  @Query("SELECT * FROM route_plan WHERE routeDate = :routeDate LIMIT 1")
  suspend fun getRoutePlan(routeDate: String): RoutePlanEntity?

  @Query("SELECT * FROM route_stop WHERE routeDate = :routeDate ORDER BY sequence ASC")
  fun observeStops(routeDate: String): Flow<List<RouteStopEntity>>

  @Query("SELECT * FROM checklist_question ORDER BY sortOrder ASC")
  fun observeChecklistTemplate(): Flow<List<ChecklistQuestionEntity>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertRoutePlan(routePlan: RoutePlanEntity)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertStops(routeStops: List<RouteStopEntity>)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertChecklistQuestions(questions: List<ChecklistQuestionEntity>)

  @Query("DELETE FROM route_stop WHERE routeDate = :routeDate")
  suspend fun clearStops(routeDate: String)

  @Query("DELETE FROM checklist_question")
  suspend fun clearChecklistQuestions()
}

@Dao
interface VisitDao {
  @Query("SELECT * FROM visit_draft WHERE routeStopId = :routeStopId LIMIT 1")
  fun observeVisitDraft(routeStopId: String): Flow<VisitDraftEntity?>

  @Query("SELECT * FROM visit_draft ORDER BY localUpdatedAt DESC")
  fun observeVisitHistory(): Flow<List<VisitDraftEntity>>

  @Query("SELECT * FROM visit_draft WHERE routeStopId = :routeStopId LIMIT 1")
  suspend fun getVisitDraft(routeStopId: String): VisitDraftEntity?

  @Query("SELECT * FROM visit_draft WHERE localId = :localVisitId LIMIT 1")
  suspend fun getVisitDraftByLocalId(localVisitId: String): VisitDraftEntity?

  @Query("SELECT * FROM visit_photo WHERE localVisitId = :localVisitId ORDER BY capturedAt ASC")
  fun observePhotos(localVisitId: String): Flow<List<VisitPhotoEntity>>

  @Query("SELECT * FROM visit_photo WHERE localVisitId = :localVisitId ORDER BY capturedAt ASC")
  suspend fun getPhotos(localVisitId: String): List<VisitPhotoEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertVisitDraft(draft: VisitDraftEntity)

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertPhoto(photo: VisitPhotoEntity)

  @Query("UPDATE visit_draft SET remoteVisitId = :remoteVisitId, pendingSync = 1, localUpdatedAt = :updatedAt WHERE localId = :localVisitId")
  suspend fun linkRemoteVisit(localVisitId: String, remoteVisitId: String, updatedAt: Long)

  @Query("UPDATE visit_draft SET pendingSync = 0, lastSyncedAt = :lastSyncedAt WHERE localId = :localVisitId")
  suspend fun markVisitSynced(localVisitId: String, lastSyncedAt: Long)

  @Query("UPDATE visit_photo SET uploaded = 1, remoteUrl = :remoteUrl, remotePhotoId = :remotePhotoId, syncStatus = 'SYNCED' WHERE id = :photoId")
  suspend fun markPhotoUploaded(photoId: String, remoteUrl: String, remotePhotoId: String?)
}

@Dao
interface SyncQueueDao {
  @Query("SELECT * FROM sync_queue ORDER BY createdAt ASC")
  fun observeQueue(): Flow<List<SyncQueueEntity>>

  @Query("SELECT * FROM sync_queue WHERE status IN ('PENDING', 'FAILED') AND (nextRetryAt IS NULL OR nextRetryAt <= :now) ORDER BY createdAt ASC")
  suspend fun getReadyQueue(now: Long): List<SyncQueueEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun enqueue(item: SyncQueueEntity)

  @Query("UPDATE sync_queue SET status = :status, attempts = :attempts, lastError = :lastError, lastAttemptAt = :lastAttemptAt, nextRetryAt = :nextRetryAt WHERE id = :queueId")
  suspend fun updateAttempt(
    queueId: String,
    status: String,
    attempts: Int,
    lastError: String?,
    lastAttemptAt: Long?,
    nextRetryAt: Long?,
  )

  @Query("SELECT COUNT(*) FROM sync_queue WHERE localVisitId = :localVisitId")
  suspend fun countByLocalVisitId(localVisitId: String): Int

  @Query("DELETE FROM sync_queue WHERE id = :queueId")
  suspend fun remove(queueId: String)
}

@Dao
interface LocationEventDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insert(event: LocationEventEntity)

  @Query("SELECT * FROM location_event WHERE synced = 0 ORDER BY capturedAt ASC")
  suspend fun getPending(): List<LocationEventEntity>

  @Query("UPDATE location_event SET synced = 1 WHERE id = :eventId")
  suspend fun markSynced(eventId: String)
}

@Database(
  entities = [
    RoutePlanEntity::class,
    RouteStopEntity::class,
    ChecklistQuestionEntity::class,
    VisitDraftEntity::class,
    VisitPhotoEntity::class,
    SyncQueueEntity::class,
    LocationEventEntity::class,
  ],
  version = 1,
  exportSchema = false,
)
abstract class PromoterDatabase : RoomDatabase() {
  abstract fun routeDao(): RouteDao
  abstract fun visitDao(): VisitDao
  abstract fun syncQueueDao(): SyncQueueDao
  abstract fun locationEventDao(): LocationEventDao
}
