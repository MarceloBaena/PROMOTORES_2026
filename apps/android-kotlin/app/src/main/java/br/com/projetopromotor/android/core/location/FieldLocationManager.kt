package br.com.projetopromotor.android.core.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import br.com.projetopromotor.android.data.local.LocationEventDao
import br.com.projetopromotor.android.data.local.LocationEventEntity
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

data class FieldCoordinates(
  val latitude: Double,
  val longitude: Double,
  val accuracyMeters: Float?,
)

class FieldLocationManager(
  context: Context,
  private val locationEventDao: LocationEventDao,
) {
  private val fusedClient: FusedLocationProviderClient =
    LocationServices.getFusedLocationProviderClient(context)

  @SuppressLint("MissingPermission")
  suspend fun getCurrentCoordinates(): FieldCoordinates =
    suspendCancellableCoroutine { continuation ->
      val request = CurrentLocationRequest.Builder().build()

      fusedClient
        .getCurrentLocation(request, null)
        .addOnSuccessListener { location ->
          if (location == null) {
            continuation.resumeWithException(
              IllegalStateException("Localizacao indisponivel no momento"),
            )
          } else {
            continuation.resume(
              FieldCoordinates(
                latitude = location.latitude,
                longitude = location.longitude,
                accuracyMeters = location.accuracy,
              ),
            )
          }
        }
        .addOnFailureListener { error ->
          continuation.resumeWithException(error)
        }
    }

  fun calculateDistanceMeters(
    currentLatitude: Double,
    currentLongitude: Double,
    targetLatitude: Double,
    targetLongitude: Double,
  ): Double {
    val results = FloatArray(1)
    Location.distanceBetween(
      currentLatitude,
      currentLongitude,
      targetLatitude,
      targetLongitude,
      results,
    )
    return results.first().toDouble()
  }

  fun isInsideGeofence(
    currentLatitude: Double,
    currentLongitude: Double,
    targetLatitude: Double,
    targetLongitude: Double,
    radiusMeters: Int,
  ): Pair<Boolean, Double> {
    val distance = calculateDistanceMeters(
      currentLatitude = currentLatitude,
      currentLongitude = currentLongitude,
      targetLatitude = targetLatitude,
      targetLongitude = targetLongitude,
    )

    return distance <= radiusMeters to distance
  }

  suspend fun storeLocationEvent(
    eventType: String,
    routeStopId: String?,
    localVisitId: String?,
    coordinates: FieldCoordinates,
  ) {
    locationEventDao.insert(
      LocationEventEntity(
        id = UUID.randomUUID().toString(),
        eventType = eventType,
        routeStopId = routeStopId,
        localVisitId = localVisitId,
        latitude = coordinates.latitude,
        longitude = coordinates.longitude,
        accuracyMeters = coordinates.accuracyMeters,
        capturedAt = System.currentTimeMillis(),
        synced = false,
      ),
    )
  }
}
