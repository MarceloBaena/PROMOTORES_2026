package br.com.projetopromotor.android.data.repository

import br.com.projetopromotor.android.core.network.PromoterApi
import br.com.projetopromotor.android.core.network.SyncPullResponseDto
import br.com.projetopromotor.android.data.local.ChecklistQuestionEntity
import br.com.projetopromotor.android.data.local.RouteDao
import br.com.projetopromotor.android.data.local.RoutePlanEntity
import br.com.projetopromotor.android.data.local.RouteStopEntity
import br.com.projetopromotor.android.data.preferences.SessionPreferences
import br.com.projetopromotor.android.domain.models.ChecklistQuestionModel
import br.com.projetopromotor.android.domain.models.RouteStopModel
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

interface RouteRepository {
  fun observeTodayRoute(routeDate: String = currentRouteDate()): Flow<List<RouteStopModel>>

  fun observeChecklistTemplate(): Flow<List<ChecklistQuestionModel>>

  suspend fun refreshSnapshot(
    routeDate: String = currentRouteDate(),
    lastKnownVersion: Int? = null,
  )

  suspend fun currentRouteVersion(routeDate: String = currentRouteDate()): Int?

  companion object {
    fun currentRouteDate(): String =
      LocalDate.now(ZoneId.of("America/Cuiaba")).toString()
  }
}

class RouteRepositoryImpl(
  private val routeDao: RouteDao,
  private val api: PromoterApi,
  private val sessionPreferences: SessionPreferences,
) : RouteRepository {
  override fun observeTodayRoute(routeDate: String): Flow<List<RouteStopModel>> =
    routeDao.observeStops(routeDate).map { stops ->
      stops.map { stop ->
        RouteStopModel(
          id = stop.id,
          routeDate = stop.routeDate,
          routePlanId = stop.routePlanId,
          routeVersion = stop.routeVersion,
          sequence = stop.sequence,
          clientId = stop.clientId,
          clientName = stop.clientName,
          addressLine = stop.addressLine,
          city = stop.city,
          state = stop.state,
          latitude = stop.latitude,
          longitude = stop.longitude,
          radiusInMeters = stop.radiusInMeters,
          status = stop.status,
          plannedStartAt = stop.plannedStartAt,
          plannedEndAt = stop.plannedEndAt,
          notes = stop.notes,
          remoteVisitId = stop.remoteVisitId,
        )
      }
    }

  override fun observeChecklistTemplate(): Flow<List<ChecklistQuestionModel>> =
    routeDao.observeChecklistTemplate().map { questions ->
      questions.map { question ->
        ChecklistQuestionModel(
          code = question.code,
          label = question.label,
          type = question.type,
          required = question.required,
          sortOrder = question.sortOrder,
        )
      }
    }

  override suspend fun refreshSnapshot(routeDate: String, lastKnownVersion: Int?) {
    val response =
      api.pullSyncSnapshot(
        deviceId = sessionPreferences.getDeviceId(),
        routeDate = routeDate,
        lastPulledAt = sessionPreferences.getLastSyncAt()?.let { java.time.Instant.ofEpochMilli(it).toString() },
        lastKnownRouteVersion = lastKnownVersion ?: currentRouteVersion(routeDate),
      )

    persistSnapshot(response)
    sessionPreferences.saveLastSyncAt(System.currentTimeMillis())
  }

  override suspend fun currentRouteVersion(routeDate: String): Int? =
    routeDao.getRoutePlan(routeDate)?.routeVersion

  private suspend fun persistSnapshot(snapshot: SyncPullResponseDto) {
    val route = snapshot.snapshot.route
    routeDao.clearStops(snapshot.routeDate)
    routeDao.clearChecklistQuestions()

    if (snapshot.snapshot.checklistTemplate.isNotEmpty()) {
      routeDao.upsertChecklistQuestions(
        snapshot.snapshot.checklistTemplate.mapIndexed { index, question ->
          ChecklistQuestionEntity(
            code = question.code,
            label = question.label,
            type = question.type,
            required = question.required,
            sortOrder = index + 1,
          )
        },
      )
    }

    if (route == null) {
      routeDao.upsertRoutePlan(
        RoutePlanEntity(
          routeDate = snapshot.routeDate,
          routePlanId = null,
          promoterId = null,
          promoterName = null,
          routeVersion = snapshot.routeVersion ?: 0,
          routeStatus = null,
          publishedAt = null,
          updatedAt = snapshot.serverTime,
          nextInstruction = null,
        ),
      )
      return
    }

    routeDao.upsertRoutePlan(
      RoutePlanEntity(
        routeDate = snapshot.routeDate,
        routePlanId = route.id,
        promoterId = route.promoterId,
        promoterName = route.promoterName,
        routeVersion = route.version,
        routeStatus = route.status,
        publishedAt = null,
        updatedAt = snapshot.serverTime,
        nextInstruction = route.nextInstruction,
      ),
    )
    routeDao.upsertStops(
      route.stops.map { stop ->
        RouteStopEntity(
          id = stop.id,
          routeDate = snapshot.routeDate,
          routePlanId = route.id,
          routeVersion = route.version,
          sequence = stop.sequence,
          clientId = stop.client.id,
          clientName = stop.client.tradeName,
          addressLine = stop.client.address,
          city = stop.client.city,
          state = stop.client.state,
          latitude = stop.client.coordinates.latitude,
          longitude = stop.client.coordinates.longitude,
          radiusInMeters = stop.client.geofence.radiusInMeters,
          status = stop.status,
          plannedStartAt = stop.plannedStartAt,
          plannedEndAt = stop.plannedEndAt,
          notes = stop.notes,
          remoteVisitId = stop.visitId,
        )
      },
    )
  }
}
