package br.com.projetopromotor.android.data.repository

import br.com.projetopromotor.android.core.network.PromoterApi
import br.com.projetopromotor.android.core.network.SyncPushActionDto
import br.com.projetopromotor.android.core.network.SyncPushRequestDto
import br.com.projetopromotor.android.data.local.LocationEventDao
import br.com.projetopromotor.android.data.local.SyncQueueDao
import br.com.projetopromotor.android.data.local.SyncQueueEntity
import br.com.projetopromotor.android.data.local.VisitDao
import br.com.projetopromotor.android.data.preferences.SessionPreferences
import br.com.projetopromotor.android.domain.models.LocalSyncActionType
import br.com.projetopromotor.android.domain.models.SyncQueueItemModel
import br.com.projetopromotor.android.domain.models.SyncQueueStatus
import com.google.gson.Gson
import com.google.gson.JsonObject
import java.io.File
import java.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody

interface SyncRepository {
  fun observeQueue(): Flow<List<SyncQueueItemModel>>

  suspend fun pushPendingQueue()

  suspend fun pullLatestSnapshot()
}

class SyncRepositoryImpl(
  private val api: PromoterApi,
  private val routeRepository: RouteRepository,
  private val visitDao: VisitDao,
  private val locationEventDao: LocationEventDao,
  private val syncQueueDao: SyncQueueDao,
  private val sessionPreferences: SessionPreferences,
  private val gson: Gson,
) : SyncRepository {
  override fun observeQueue(): Flow<List<SyncQueueItemModel>> =
    syncQueueDao.observeQueue().map { queue ->
      queue.map { item ->
        SyncQueueItemModel(
          id = item.id,
          type = LocalSyncActionType.valueOf(item.type),
          routeStopId = item.routeStopId,
          localVisitId = item.localVisitId,
          status = SyncQueueStatus.valueOf(item.status),
          attempts = item.attempts,
          lastError = item.lastError,
          createdAt = item.createdAt,
          nextRetryAt = item.nextRetryAt,
        )
      }
    }

  override suspend fun pushPendingQueue() {
    val readyItems = syncQueueDao.getReadyQueue(System.currentTimeMillis())
    val deviceId = sessionPreferences.getDeviceId()

    for (item in readyItems) {
      syncQueueDao.updateAttempt(
        queueId = item.id,
        status = SyncQueueStatus.PROCESSING.name,
        attempts = item.attempts + 1,
        lastError = null,
        lastAttemptAt = System.currentTimeMillis(),
        nextRetryAt = null,
      )

      runCatching {
        when (LocalSyncActionType.valueOf(item.type)) {
          LocalSyncActionType.START_JOURNEY,
          LocalSyncActionType.TRACK_POINT,
          LocalSyncActionType.CHECK_IN,
          LocalSyncActionType.SUBMIT_CHECKLIST,
          LocalSyncActionType.UPDATE_NOTES,
          LocalSyncActionType.CHECK_OUT,
          LocalSyncActionType.END_JOURNEY -> pushJsonAction(deviceId, item)
          LocalSyncActionType.UPLOAD_CHECKIN_PHOTO -> uploadCheckInPhoto(item)
          LocalSyncActionType.UPLOAD_BEFORE_PHOTO,
          LocalSyncActionType.UPLOAD_AFTER_PHOTO -> uploadVisitEvidence(item)
        }
      }.onSuccess {
        syncQueueDao.remove(item.id)
        markLocationEventSyncedIfNeeded(item)
        markVisitSyncedIfQueueIsEmpty(item.localVisitId)
      }.onFailure { error ->
        syncQueueDao.updateAttempt(
          queueId = item.id,
          status = SyncQueueStatus.FAILED.name,
          attempts = item.attempts + 1,
          lastError = error.message ?: "Falha ao sincronizar",
          lastAttemptAt = System.currentTimeMillis(),
          nextRetryAt = System.currentTimeMillis() + 60_000L,
        )
      }
    }
  }

  override suspend fun pullLatestSnapshot() {
    routeRepository.refreshSnapshot()
  }

  private suspend fun pushJsonAction(deviceId: String, item: SyncQueueEntity) {
    val payload = gson.fromJson(item.payloadJson, Map::class.java) as Map<String, Any?>
    val response =
      api.pushSyncBatch(
        SyncPushRequestDto(
          deviceId = deviceId,
          pushedAt = Instant.now().toString(),
          routeDate = RouteRepository.currentRouteDate(),
          lastPulledAt = sessionPreferences.getLastSyncAt()?.let { Instant.ofEpochMilli(it).toString() },
          actions = listOf(
            SyncPushActionDto(
              id = item.id,
              type = item.type,
              payload = payload,
            ),
          ),
        ),
      )
    val result = response.results.firstOrNull { it.id == item.id }

    if (result?.success != true) {
      error(result?.error ?: "Falha no push do item ${item.id}")
    }

    if (LocalSyncActionType.valueOf(item.type) == LocalSyncActionType.CHECK_IN) {
      val remoteVisitId = result.result?.get("id")?.asString
      if (!remoteVisitId.isNullOrBlank() && !item.localVisitId.isNullOrBlank()) {
        visitDao.linkRemoteVisit(item.localVisitId, remoteVisitId, System.currentTimeMillis())
      }
    }
  }

  private suspend fun markLocationEventSyncedIfNeeded(item: SyncQueueEntity) {
    if (LocalSyncActionType.valueOf(item.type) != LocalSyncActionType.TRACK_POINT) {
      return
    }

    val payload = gson.fromJson(item.payloadJson, JsonObject::class.java)
    val locationEventId = payload["locationEventId"]?.asString ?: return
    locationEventDao.markSynced(locationEventId)
  }

  private suspend fun markVisitSyncedIfQueueIsEmpty(localVisitId: String?) {
    if (localVisitId.isNullOrBlank()) {
      return
    }

    if (syncQueueDao.countByLocalVisitId(localVisitId) == 0) {
      visitDao.markVisitSynced(localVisitId, System.currentTimeMillis())
    }
  }

  private suspend fun uploadCheckInPhoto(item: SyncQueueEntity) {
    val payload = gson.fromJson(item.payloadJson, JsonObject::class.java)
    val photoFile = File(payload["filePath"].asString)
    val visitDraft = item.localVisitId?.let { visitDao.getVisitDraftByLocalId(it) }
      ?: error("Visita local nao encontrada para upload do check-in")

    if (visitDraft.checkInAt == null || visitDraft.checkInLatitude == null || visitDraft.checkInLongitude == null) {
      error("Check-in local incompleto para upload da foto")
    }

    val response =
      api.uploadCheckInWithPhoto(
        routeStopId = visitDraft.routeStopId.toRequestBody("text/plain".toMediaType()),
        checkedInAt = Instant.ofEpochMilli(visitDraft.checkInAt).toString().toRequestBody("text/plain".toMediaType()),
        capturedAt = payload["capturedAt"].asString.toRequestBody("text/plain".toMediaType()),
        latitude = visitDraft.checkInLatitude.toString().toRequestBody("text/plain".toMediaType()),
        longitude = visitDraft.checkInLongitude.toString().toRequestBody("text/plain".toMediaType()),
        justification = visitDraft.outsideGeofenceJustification?.toRequestBody("text/plain".toMediaType()),
        eventId = "checkin-photo-${item.id}".toRequestBody("text/plain".toMediaType()),
        photoEventId = "checkin-file-${item.id}".toRequestBody("text/plain".toMediaType()),
        file = MultipartBody.Part.createFormData(
          "file",
          photoFile.name,
          photoFile.asRequestBody((payload["mimeType"]?.asString ?: "image/jpeg").toMediaType()),
        ),
      )

    val remoteVisitId = response["id"]?.asString
    if (!remoteVisitId.isNullOrBlank() && !item.localVisitId.isNullOrBlank()) {
      visitDao.linkRemoteVisit(item.localVisitId, remoteVisitId, System.currentTimeMillis())
    }
  }

  private suspend fun uploadVisitEvidence(item: SyncQueueEntity) {
    val payload = gson.fromJson(item.payloadJson, JsonObject::class.java)
    val photoFile = File(payload["filePath"].asString)
    val visitDraft = item.localVisitId?.let { visitDao.getVisitDraftByLocalId(it) }
      ?: error("Visita local nao encontrada para upload da evidencia")
    val remoteVisitId = visitDraft.remoteVisitId ?: error("Visita ainda nao sincronizada")
    val photoId = payload["photoId"].asString
    val type =
      when (LocalSyncActionType.valueOf(item.type)) {
        LocalSyncActionType.UPLOAD_BEFORE_PHOTO -> "BEFORE"
        LocalSyncActionType.UPLOAD_AFTER_PHOTO -> "AFTER"
        else -> error("Tipo de evidencia invalido")
      }
    val category = if (type == "BEFORE") "BEFORE_1" else "AFTER_1"
    val response =
      api.uploadVisitPhoto(
        visitId = remoteVisitId,
        type = type,
        category = category,
        capturedAt = payload["capturedAt"].asString,
        eventId = "photo-${item.id}",
        file = MultipartBody.Part.createFormData(
          "file",
          photoFile.name,
          photoFile.asRequestBody((payload["mimeType"]?.asString ?: "image/jpeg").toMediaType()),
        ),
      )

    visitDao.markPhotoUploaded(photoId, response.url, response.id)
  }
}
