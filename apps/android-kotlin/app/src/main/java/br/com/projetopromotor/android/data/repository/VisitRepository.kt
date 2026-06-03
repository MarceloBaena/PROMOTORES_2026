package br.com.projetopromotor.android.data.repository

import br.com.projetopromotor.android.core.camera.TimestampOverlayInput
import br.com.projetopromotor.android.core.camera.TimestampedPhotoWriter
import br.com.projetopromotor.android.core.location.FieldCoordinates
import br.com.projetopromotor.android.core.storage.PhotoStorageManager
import br.com.projetopromotor.android.data.local.LocationEventDao
import br.com.projetopromotor.android.data.local.LocationEventEntity
import br.com.projetopromotor.android.data.local.SyncQueueDao
import br.com.projetopromotor.android.data.local.SyncQueueEntity
import br.com.projetopromotor.android.data.local.VisitDao
import br.com.projetopromotor.android.data.local.VisitDraftEntity
import br.com.projetopromotor.android.data.local.VisitPhotoEntity
import br.com.projetopromotor.android.domain.models.LocalEvidenceType
import br.com.projetopromotor.android.domain.models.LocalSyncActionType
import br.com.projetopromotor.android.domain.models.RouteStopModel
import br.com.projetopromotor.android.domain.models.SyncQueueStatus
import br.com.projetopromotor.android.domain.models.VisitCompletionStatus
import br.com.projetopromotor.android.domain.models.VisitDraftModel
import br.com.projetopromotor.android.domain.models.VisitHistoryItemModel
import br.com.projetopromotor.android.domain.models.VisitPhotoModel
import com.google.gson.Gson
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

interface VisitRepository {
  fun observeVisit(routeStopId: String): Flow<VisitDraftModel?>

  fun observeVisitPhotos(routeStopId: String): Flow<List<VisitPhotoModel>>

  fun observeLocalHistory(): Flow<List<VisitHistoryItemModel>>

  suspend fun ensureVisitDraft(stop: RouteStopModel): VisitDraftModel

  suspend fun registerCheckIn(
    stop: RouteStopModel,
    latitude: Double,
    longitude: Double,
    geofenceDistanceMeters: Double,
    outsideGeofence: Boolean,
    justification: String?,
  ): VisitDraftModel

  suspend fun savePhoto(
    localVisitId: String,
    routeStopId: String,
    clientName: String,
    evidenceType: LocalEvidenceType,
    sourceFile: File,
    mimeType: String,
    capturedAt: Long,
    latitude: Double?,
    longitude: Double?,
  )

  suspend fun saveChecklist(localVisitId: String, checklistJson: String)

  suspend fun saveNotes(localVisitId: String, notes: String)

  suspend fun recordLocationEvent(
    eventType: String,
    routeStopId: String,
    localVisitId: String,
    coordinates: FieldCoordinates,
    capturedAt: Long = System.currentTimeMillis(),
  )

  suspend fun completeVisit(
    localVisitId: String,
    notes: String,
    completionStatus: VisitCompletionStatus,
    latitude: Double,
    longitude: Double,
  )
}

class VisitRepositoryImpl(
  private val visitDao: VisitDao,
  private val locationEventDao: LocationEventDao,
  private val syncQueueDao: SyncQueueDao,
  private val gson: Gson,
  private val timestampedPhotoWriter: TimestampedPhotoWriter,
  private val photoStorageManager: PhotoStorageManager,
) : VisitRepository {
  override fun observeVisit(routeStopId: String): Flow<VisitDraftModel?> =
    visitDao.observeVisitDraft(routeStopId).map { draft -> draft?.toModel() }

  override fun observeVisitPhotos(routeStopId: String): Flow<List<VisitPhotoModel>> =
    observeVisit(routeStopId).map { it?.localId }.flatMapLatest { localVisitId ->
      if (localVisitId == null) {
        flowOf(emptyList())
      } else {
        visitDao.observePhotos(localVisitId).map { photos ->
          photos.map { photo -> photo.toModel() }
        }
      }
    }

  override fun observeLocalHistory(): Flow<List<VisitHistoryItemModel>> =
    visitDao.observeVisitHistory().map { visits ->
      visits.map { visit ->
        VisitHistoryItemModel(
          localId = visit.localId,
          routeStopId = visit.routeStopId,
          clientName = visit.clientName,
          status = visit.status,
          completionStatus = visit.completionStatus?.let(VisitCompletionStatus::valueOf),
          checkInAt = visit.checkInAt,
          checkOutAt = visit.checkOutAt,
          pendingSync = visit.pendingSync,
          lastSyncedAt = visit.lastSyncedAt,
        )
      }
    }

  override suspend fun ensureVisitDraft(stop: RouteStopModel): VisitDraftModel {
    val existing = visitDao.getVisitDraft(stop.id)

    if (existing != null) {
      return existing.toModel()
    }

    val draft =
      VisitDraftEntity(
        localId = UUID.randomUUID().toString(),
        routeStopId = stop.id,
        remoteVisitId = stop.remoteVisitId,
        clientName = stop.clientName,
        checkInAt = null,
        checkOutAt = null,
        checkInLatitude = null,
        checkInLongitude = null,
        checkOutLatitude = null,
        checkOutLongitude = null,
        outsideGeofence = false,
        geofenceDistanceMeters = null,
        outsideGeofenceJustification = null,
        notes = "",
        checklistJson = "[]",
        checklistCompleted = false,
        status = stop.status,
        completionStatus = null,
        pendingSync = false,
        lastSyncedAt = null,
        localUpdatedAt = System.currentTimeMillis(),
      )

    visitDao.upsertVisitDraft(draft)
    return draft.toModel()
  }

  override suspend fun registerCheckIn(
    stop: RouteStopModel,
    latitude: Double,
    longitude: Double,
    geofenceDistanceMeters: Double,
    outsideGeofence: Boolean,
    justification: String?,
  ): VisitDraftModel {
    val draft = ensureVisitDraft(stop)

    if (draft.checkOutAt != null) {
      error("A visita local ja foi finalizada.")
    }

    if (draft.checkInAt != null) {
      return draft
    }

    val checkedInAt = System.currentTimeMillis()
    val updatedDraft =
      VisitDraftEntity(
        localId = draft.localId,
        routeStopId = stop.id,
        remoteVisitId = draft.remoteVisitId,
        clientName = stop.clientName,
        checkInAt = checkedInAt,
        checkOutAt = draft.checkOutAt,
        checkInLatitude = latitude,
        checkInLongitude = longitude,
        checkOutLatitude = draft.checkOutLatitude,
        checkOutLongitude = draft.checkOutLongitude,
        outsideGeofence = outsideGeofence,
        geofenceDistanceMeters = geofenceDistanceMeters,
        outsideGeofenceJustification = justification,
        notes = draft.notes,
        checklistJson = draft.checklistJson,
        checklistCompleted = draft.checklistCompleted,
        status = "IN_PROGRESS",
        completionStatus = draft.completionStatus?.name,
        pendingSync = true,
        lastSyncedAt = draft.lastSyncedAt,
        localUpdatedAt = checkedInAt,
      )
    visitDao.upsertVisitDraft(updatedDraft)
    enqueueAction(
      type = LocalSyncActionType.CHECK_IN,
      routeStopId = stop.id,
      localVisitId = draft.localId,
      payload = mapOf(
        "routeStopId" to stop.id,
        "checkedInAt" to Instant.ofEpochMilli(checkedInAt).toString(),
        "location" to mapOf("latitude" to latitude, "longitude" to longitude),
        "justification" to justification,
        "eventId" to "checkin-${UUID.randomUUID()}",
      ),
    )
    return updatedDraft.toModel()
  }

  override suspend fun savePhoto(
    localVisitId: String,
    routeStopId: String,
    clientName: String,
    evidenceType: LocalEvidenceType,
    sourceFile: File,
    mimeType: String,
    capturedAt: Long,
    latitude: Double?,
    longitude: Double?,
  ) {
    val draft = visitDao.getVisitDraftByLocalId(localVisitId)
      ?: error("Visita local nao encontrada para salvar evidencia.")

    if (draft.checkOutAt != null) {
      error("A visita local ja foi finalizada.")
    }

    if (evidenceType != LocalEvidenceType.CHECKIN && draft.checkInAt == null) {
      error("O check-in com foto obrigatoria precisa acontecer antes das demais evidencias.")
    }

    if (evidenceType == LocalEvidenceType.AFTER && !draft.checklistCompleted) {
      error("O checklist precisa estar concluido antes da foto do depois.")
    }

    val stampedFile = photoStorageManager.createStampedEvidenceFile(
      routeStopId = routeStopId,
      evidenceType = evidenceType,
      capturedAt = capturedAt,
    )
    val finalFile =
      try {
        timestampedPhotoWriter.stamp(
          TimestampOverlayInput(
            sourceFile = sourceFile,
            targetFile = stampedFile,
            occurredAt = capturedAt,
            latitude = latitude,
            longitude = longitude,
            clientLabel = clientName,
            stageLabel = when (evidenceType) {
              LocalEvidenceType.CHECKIN -> "CHECK-IN"
              LocalEvidenceType.BEFORE -> "ANTES"
              LocalEvidenceType.AFTER -> "DEPOIS"
            },
          ),
        )
      } finally {
        photoStorageManager.deleteIfExists(sourceFile)
      }
    visitDao.upsertVisitDraft(
      draft.copy(
        pendingSync = true,
        localUpdatedAt = capturedAt,
      ),
    )
    val photoId = UUID.randomUUID().toString()
    visitDao.upsertPhoto(
      VisitPhotoEntity(
        id = photoId,
        localVisitId = localVisitId,
        routeStopId = routeStopId,
        type = evidenceType.name,
        localPath = finalFile.absolutePath,
        mimeType = mimeType,
        capturedAt = capturedAt,
        capturedLatitude = latitude,
        capturedLongitude = longitude,
        uploaded = false,
        remoteUrl = null,
        remotePhotoId = null,
        syncStatus = SyncQueueStatus.PENDING.name,
        uploadAttempts = 0,
      ),
    )
    enqueueAction(
      type = when (evidenceType) {
        LocalEvidenceType.CHECKIN -> LocalSyncActionType.UPLOAD_CHECKIN_PHOTO
        LocalEvidenceType.BEFORE -> LocalSyncActionType.UPLOAD_BEFORE_PHOTO
        LocalEvidenceType.AFTER -> LocalSyncActionType.UPLOAD_AFTER_PHOTO
      },
      routeStopId = routeStopId,
      localVisitId = localVisitId,
      payload = mapOf(
        "photoId" to photoId,
        "filePath" to finalFile.absolutePath,
        "mimeType" to mimeType,
        "capturedAt" to Instant.ofEpochMilli(capturedAt).toString(),
        "latitude" to latitude,
        "longitude" to longitude,
      ),
    )
  }

  override suspend fun saveChecklist(localVisitId: String, checklistJson: String) {
    val draft = visitDao.getVisitDraftByLocalId(localVisitId)
      ?: error("Visita local nao encontrada para salvar checklist.")

    if (draft.checkInAt == null) {
      error("O check-in precisa ser realizado antes do checklist.")
    }

    val photos = visitDao.getPhotos(localVisitId)
    val hasBeforePhoto = photos.any { photo -> photo.type == LocalEvidenceType.BEFORE.name }

    if (!hasBeforePhoto) {
      error("A foto do antes e obrigatoria antes do checklist.")
    }

    val updated =
      draft.copy(
        checklistJson = checklistJson,
        checklistCompleted = true,
        pendingSync = true,
        localUpdatedAt = System.currentTimeMillis(),
      )
    visitDao.upsertVisitDraft(updated)
    enqueueAction(
      type = LocalSyncActionType.SUBMIT_CHECKLIST,
      routeStopId = draft.routeStopId,
      localVisitId = localVisitId,
      payload = mapOf(
        "visitId" to (draft.remoteVisitId ?: localVisitId),
        "body" to mapOf(
          "items" to gson.fromJson(checklistJson, List::class.java),
          "eventId" to "checklist-${UUID.randomUUID()}",
        ),
      ),
    )
  }

  override suspend fun saveNotes(localVisitId: String, notes: String) {
    val draft = visitDao.getVisitDraftByLocalId(localVisitId)
      ?: error("Visita local nao encontrada para salvar observacoes.")

    if (draft.checkInAt == null) {
      error("O check-in precisa ser realizado antes das observacoes.")
    }

    val trimmedNotes = notes.trim()

    if (trimmedNotes.isBlank()) {
      error("As observacoes da visita nao podem ficar vazias.")
    }

    visitDao.upsertVisitDraft(
      draft.copy(
        notes = trimmedNotes,
        pendingSync = true,
        localUpdatedAt = System.currentTimeMillis(),
      ),
    )
    enqueueAction(
      type = LocalSyncActionType.UPDATE_NOTES,
      routeStopId = draft.routeStopId,
      localVisitId = localVisitId,
      payload = mapOf(
        "visitId" to (draft.remoteVisitId ?: localVisitId),
        "notes" to trimmedNotes,
      ),
    )
  }

  override suspend fun recordLocationEvent(
    eventType: String,
    routeStopId: String,
    localVisitId: String,
    coordinates: FieldCoordinates,
    capturedAt: Long,
  ) {
    val draft = visitDao.getVisitDraftByLocalId(localVisitId)
      ?: error("Visita local nao encontrada para registrar localizacao.")
    val locationEventId = UUID.randomUUID().toString()

    locationEventDao.insert(
      LocationEventEntity(
        id = locationEventId,
        eventType = eventType,
        routeStopId = routeStopId,
        localVisitId = localVisitId,
        latitude = coordinates.latitude,
        longitude = coordinates.longitude,
        accuracyMeters = coordinates.accuracyMeters,
        capturedAt = capturedAt,
        synced = false,
      ),
    )
    visitDao.upsertVisitDraft(
      draft.copy(
        pendingSync = true,
        localUpdatedAt = capturedAt,
      ),
    )
    enqueueAction(
      type = LocalSyncActionType.TRACK_POINT,
      routeStopId = routeStopId,
      localVisitId = localVisitId,
      payload = mapOf(
        "locationEventId" to locationEventId,
        "capturedAt" to Instant.ofEpochMilli(capturedAt).toString(),
        "location" to mapOf(
          "latitude" to coordinates.latitude,
          "longitude" to coordinates.longitude,
        ),
        "accuracyM" to coordinates.accuracyMeters,
        "source" to eventType.toGpsSource(),
        "eventId" to "gps-${draft.routeStopId}-${UUID.randomUUID()}",
      ),
    )
  }

  override suspend fun completeVisit(
    localVisitId: String,
    notes: String,
    completionStatus: VisitCompletionStatus,
    latitude: Double,
    longitude: Double,
  ) {
    val draft = visitDao.getVisitDraftByLocalId(localVisitId)
      ?: error("Visita local nao encontrada para checkout.")

    if (draft.checkInAt == null) {
      error("Nao e possivel finalizar sem check-in.")
    }

    if (draft.checkOutAt != null) {
      error("A visita local ja foi finalizada.")
    }

    val photos = visitDao.getPhotos(localVisitId)
    val hasCheckInPhoto = photos.any { photo -> photo.type == LocalEvidenceType.CHECKIN.name }
    val hasBeforePhoto = photos.any { photo -> photo.type == LocalEvidenceType.BEFORE.name }
    val hasAfterPhoto = photos.any { photo -> photo.type == LocalEvidenceType.AFTER.name }

    if (!hasCheckInPhoto) {
      error("Nao e possivel finalizar sem a foto obrigatoria de check-in.")
    }

    if (!hasBeforePhoto) {
      error("Nao e possivel finalizar sem a foto obrigatoria do antes.")
    }

    if (!draft.checklistCompleted) {
      error("Nao e possivel finalizar sem checklist concluido.")
    }

    if (!hasAfterPhoto) {
      error("Nao e possivel finalizar sem a foto obrigatoria do depois.")
    }

    val checkedOutAt = System.currentTimeMillis()
    val trimmedNotes = notes.trim()
    visitDao.upsertVisitDraft(
      draft.copy(
        notes = trimmedNotes,
        checkOutAt = checkedOutAt,
        checkOutLatitude = latitude,
        checkOutLongitude = longitude,
        completionStatus = completionStatus.name,
        pendingSync = true,
        status = "CHECKED_OUT",
        localUpdatedAt = checkedOutAt,
      ),
    )
    enqueueAction(
      type = LocalSyncActionType.CHECK_OUT,
      routeStopId = draft.routeStopId,
      localVisitId = localVisitId,
      payload = mapOf(
        "visitId" to (draft.remoteVisitId ?: localVisitId),
        "body" to mapOf(
          "checkedOutAt" to Instant.ofEpochMilli(checkedOutAt).toString(),
          "location" to mapOf("latitude" to latitude, "longitude" to longitude),
          "completionStatus" to completionStatus.name,
          "notes" to trimmedNotes,
          "eventId" to "checkout-${UUID.randomUUID()}",
        ),
      ),
    )
  }

  private suspend fun enqueueAction(
    type: LocalSyncActionType,
    routeStopId: String?,
    localVisitId: String?,
    payload: Map<String, Any?>,
  ) {
    syncQueueDao.enqueue(
      SyncQueueEntity(
        id = UUID.randomUUID().toString(),
        type = type.name,
        routeStopId = routeStopId,
        localVisitId = localVisitId,
        payloadJson = gson.toJson(payload),
        status = SyncQueueStatus.PENDING.name,
        attempts = 0,
        lastError = null,
        createdAt = System.currentTimeMillis(),
        lastAttemptAt = null,
        nextRetryAt = null,
      ),
    )
  }

  private fun String.toGpsSource(): String =
    when (this) {
      "CHECK_IN" -> "CHECK_IN"
      "CHECK_OUT" -> "CHECK_OUT"
      else -> "TRACKING"
    }

  private fun VisitDraftEntity.toModel() =
    VisitDraftModel(
      localId = localId,
      routeStopId = routeStopId,
      remoteVisitId = remoteVisitId,
      clientName = clientName,
      checkInAt = checkInAt,
      checkOutAt = checkOutAt,
      checkInLatitude = checkInLatitude,
      checkInLongitude = checkInLongitude,
      checkOutLatitude = checkOutLatitude,
      checkOutLongitude = checkOutLongitude,
      outsideGeofence = outsideGeofence,
      geofenceDistanceMeters = geofenceDistanceMeters,
      outsideGeofenceJustification = outsideGeofenceJustification,
      notes = notes,
      checklistJson = checklistJson,
      checklistCompleted = checklistCompleted,
      status = status,
      completionStatus = completionStatus?.let(VisitCompletionStatus::valueOf),
      pendingSync = pendingSync,
      lastSyncedAt = lastSyncedAt,
    )

  private fun VisitPhotoEntity.toModel() =
    VisitPhotoModel(
      id = id,
      localVisitId = localVisitId,
      routeStopId = routeStopId,
      type = LocalEvidenceType.valueOf(type),
      localPath = localPath,
      capturedAt = capturedAt,
      capturedLatitude = capturedLatitude,
      capturedLongitude = capturedLongitude,
      uploaded = uploaded,
      remoteUrl = remoteUrl,
      syncStatus = SyncQueueStatus.valueOf(syncStatus),
    )
}
