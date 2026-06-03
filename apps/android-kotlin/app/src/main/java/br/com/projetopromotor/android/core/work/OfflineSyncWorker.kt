package br.com.projetopromotor.android.core.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import br.com.projetopromotor.android.PromoterApplication
import java.util.concurrent.TimeUnit

class OfflineSyncWorker(
  context: Context,
  workerParameters: WorkerParameters,
) : CoroutineWorker(context, workerParameters) {
  override suspend fun doWork(): Result {
    val app = applicationContext as PromoterApplication

    return runCatching {
      app.container.syncRepository.pushPendingQueue()
      app.container.syncRepository.pullLatestSnapshot()
      Result.success()
    }.getOrElse {
      Result.retry()
    }
  }
}

class SyncWorkScheduler(private val context: Context) {
  fun ensurePeriodicSync() {
    val request =
      PeriodicWorkRequestBuilder<OfflineSyncWorker>(15, TimeUnit.MINUTES)
        .setConstraints(
          Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build(),
        )
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()

    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      "promotor_offline_sync_periodic",
      ExistingPeriodicWorkPolicy.KEEP,
      request,
    )
  }

  fun scheduleImmediateSync() {
    val request =
      OneTimeWorkRequestBuilder<OfflineSyncWorker>()
        .setConstraints(
          Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build(),
        )
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()

    WorkManager.getInstance(context).enqueueUniqueWork(
      "promotor_offline_sync",
      ExistingWorkPolicy.REPLACE,
      request,
    )
  }
}
