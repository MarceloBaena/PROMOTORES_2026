package br.com.projetopromotor.android.core.network

import com.google.gson.JsonObject
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

data class LoginRequestDto(
  val email: String,
  val password: String,
)

data class SessionUserDto(
  val id: String,
  val name: String,
  val role: String,
)

data class AuthSessionDto(
  val accessToken: String,
  val refreshToken: String,
  val user: SessionUserDto,
)

data class ChecklistTemplateDto(
  val code: String,
  val label: String,
  val type: String,
  val required: Boolean,
)

data class NotificationDto(
  val id: String,
  val type: String,
  val title: String,
  val message: String,
  val routePlanId: String?,
  val routePlanItemId: String?,
  val payload: JsonObject?,
  val readAt: String?,
  val createdAt: String,
)

data class CoordinatesDto(
  val latitude: Double,
  val longitude: Double,
)

data class GeofenceDto(
  val latitude: Double,
  val longitude: Double,
  val radiusInMeters: Int,
)

data class RouteClientDto(
  val id: String,
  val tradeName: String,
  val legalName: String,
  val address: String,
  val city: String,
  val state: String,
  val coordinates: CoordinatesDto,
  val geofence: GeofenceDto,
)

data class RouteStopDto(
  val id: String,
  val sequence: Int,
  val plannedDate: String,
  val status: String,
  val operationalStatus: String,
  val plannedStartAt: String?,
  val plannedEndAt: String?,
  val notes: String?,
  val visitId: String?,
  val client: RouteClientDto,
)

data class RouteSnapshotDto(
  val id: String,
  val date: String,
  val promoterId: String,
  val promoterName: String,
  val status: String,
  val version: Int,
  val notes: String?,
  val nextInstruction: String?,
  val stops: List<RouteStopDto>,
)

data class PullSnapshotDto(
  val route: RouteSnapshotDto?,
  val checklistTemplate: List<ChecklistTemplateDto>,
  val activeJourney: JsonObject?,
  val notifications: List<NotificationDto>,
)

data class SyncPullResponseDto(
  val serverTime: String,
  val deviceId: String?,
  val routeDate: String,
  val routeVersion: Int?,
  val hasRouteChange: Boolean,
  val snapshot: PullSnapshotDto,
)

data class SyncPushActionDto(
  val id: String,
  val type: String,
  val payload: Map<String, @JvmSuppressWildcards Any?>,
)

data class SyncPushRequestDto(
  val deviceId: String,
  val pushedAt: String,
  val routeDate: String?,
  val lastPulledAt: String?,
  val actions: List<SyncPushActionDto>,
)

data class SyncPushResultDto(
  val id: String,
  val success: Boolean,
  val result: JsonObject?,
  val error: String?,
)

data class SyncPushResponseDto(
  val serverTime: String,
  val deviceId: String?,
  val pushedAt: String,
  val acceptedActions: Int,
  val rejectedActions: Int,
  val results: List<SyncPushResultDto>,
  val snapshot: PullSnapshotDto,
)

data class PhotoUploadResponseDto(
  val id: String?,
  val url: String,
)

interface PromoterApi {
  @POST("api/auth/login")
  suspend fun login(@Body request: LoginRequestDto): AuthSessionDto

  @GET("sync/pull")
  suspend fun pullSyncSnapshot(
    @Query("deviceId") deviceId: String,
    @Query("routeDate") routeDate: String?,
    @Query("lastPulledAt") lastPulledAt: String?,
    @Query("lastKnownRouteVersion") lastKnownRouteVersion: Int?,
  ): SyncPullResponseDto

  @POST("sync/push")
  suspend fun pushSyncBatch(@Body request: SyncPushRequestDto): SyncPushResponseDto

  @Multipart
  @POST("operations/visits/check-in-with-photo")
  suspend fun uploadCheckInWithPhoto(
    @Part("routeStopId") routeStopId: RequestBody,
    @Part("checkedInAt") checkedInAt: RequestBody,
    @Part("capturedAt") capturedAt: RequestBody,
    @Part("latitude") latitude: RequestBody,
    @Part("longitude") longitude: RequestBody,
    @Part("justification") justification: RequestBody?,
    @Part("eventId") eventId: RequestBody,
    @Part("photoEventId") photoEventId: RequestBody,
    @Part file: MultipartBody.Part,
  ): JsonObject

  @Multipart
  @POST("operations/visits/{visitId}/photos")
  suspend fun uploadVisitPhoto(
    @Path("visitId") visitId: String,
    @Query("type") type: String,
    @Query("category") category: String,
    @Query("capturedAt") capturedAt: String,
    @Query("eventId") eventId: String,
    @Part file: MultipartBody.Part,
  ): PhotoUploadResponseDto
}
