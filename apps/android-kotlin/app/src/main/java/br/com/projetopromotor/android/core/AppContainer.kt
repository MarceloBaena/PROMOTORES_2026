package br.com.projetopromotor.android.core

import android.content.Context
import androidx.room.Room
import br.com.projetopromotor.android.BuildConfig
import br.com.projetopromotor.android.core.camera.CameraCaptureController
import br.com.projetopromotor.android.core.camera.TimestampedPhotoWriter
import br.com.projetopromotor.android.core.location.FieldLocationManager
import br.com.projetopromotor.android.core.network.PromoterApi
import br.com.projetopromotor.android.core.storage.PhotoStorageManager
import br.com.projetopromotor.android.core.work.SyncWorkScheduler
import br.com.projetopromotor.android.data.local.PromoterDatabase
import br.com.projetopromotor.android.data.preferences.SessionPreferences
import br.com.projetopromotor.android.data.repository.AuthRepository
import br.com.projetopromotor.android.data.repository.AuthRepositoryImpl
import br.com.projetopromotor.android.data.repository.RouteRepository
import br.com.projetopromotor.android.data.repository.RouteRepositoryImpl
import br.com.projetopromotor.android.data.repository.SyncRepository
import br.com.projetopromotor.android.data.repository.SyncRepositoryImpl
import br.com.projetopromotor.android.data.repository.VisitRepository
import br.com.projetopromotor.android.data.repository.VisitRepositoryImpl
import com.google.gson.Gson
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class AppContainer(context: Context) {
  private val applicationContext = context.applicationContext
  private val gson = Gson()
  private val database =
    Room.databaseBuilder(
      applicationContext,
      PromoterDatabase::class.java,
      "promotor_android.db",
    ).fallbackToDestructiveMigration().build()

  val sessionPreferences = SessionPreferences(applicationContext)
  val cameraCaptureController = CameraCaptureController(applicationContext)
  val timestampedPhotoWriter = TimestampedPhotoWriter()
  val photoStorageManager = PhotoStorageManager(applicationContext)
  val fieldLocationManager =
    FieldLocationManager(applicationContext, database.locationEventDao())
  val syncWorkScheduler = SyncWorkScheduler(applicationContext)

  private val loggingInterceptor =
    HttpLoggingInterceptor().apply {
      level = HttpLoggingInterceptor.Level.BODY
    }

  private val authInterceptor =
    okhttp3.Interceptor { chain ->
      val token = runBlocking { sessionPreferences.getAccessToken() }
      val request =
        chain.request().newBuilder().apply {
          if (!token.isNullOrBlank()) {
            addHeader("Authorization", "Bearer $token")
          }
        }.build()

      chain.proceed(request)
    }

  private val okHttpClient =
    OkHttpClient.Builder()
      .addInterceptor(authInterceptor)
      .addInterceptor(loggingInterceptor)
      .build()

  private val retrofit =
    Retrofit.Builder()
      .baseUrl(BuildConfig.API_BASE_URL)
      .client(okHttpClient)
      .addConverterFactory(GsonConverterFactory.create(gson))
      .build()

  val promoterApi: PromoterApi = retrofit.create(PromoterApi::class.java)

  val authRepository: AuthRepository =
    AuthRepositoryImpl(
      api = promoterApi,
      sessionPreferences = sessionPreferences,
    )

  val routeRepository: RouteRepository =
    RouteRepositoryImpl(
      routeDao = database.routeDao(),
      api = promoterApi,
      sessionPreferences = sessionPreferences,
    )

  val visitRepository: VisitRepository =
    VisitRepositoryImpl(
      visitDao = database.visitDao(),
      locationEventDao = database.locationEventDao(),
      syncQueueDao = database.syncQueueDao(),
      gson = gson,
      timestampedPhotoWriter = timestampedPhotoWriter,
      photoStorageManager = photoStorageManager,
    )

  val syncRepository: SyncRepository =
    SyncRepositoryImpl(
      api = promoterApi,
      routeRepository = routeRepository,
      visitDao = database.visitDao(),
      locationEventDao = database.locationEventDao(),
      syncQueueDao = database.syncQueueDao(),
      sessionPreferences = sessionPreferences,
      gson = gson,
    )
}
