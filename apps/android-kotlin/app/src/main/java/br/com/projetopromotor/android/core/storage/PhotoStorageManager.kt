package br.com.projetopromotor.android.core.storage

import android.content.Context
import br.com.projetopromotor.android.domain.models.LocalEvidenceType
import java.io.File

class PhotoStorageManager(context: Context) {
  private val rootDirectory = File(context.filesDir, "visit-evidences")

  fun createRawCaptureFile(routeStopId: String, stageLabel: String): File {
    val rawDirectory = File(resolveVisitDirectory(routeStopId), "raw").apply { mkdirs() }
    return File(
      rawDirectory,
      "${stageLabel.lowercase()}-${System.currentTimeMillis()}.jpg",
    )
  }

  fun createStampedEvidenceFile(
    routeStopId: String,
    evidenceType: LocalEvidenceType,
    capturedAt: Long,
  ): File {
    val finalDirectory = File(resolveVisitDirectory(routeStopId), "final").apply { mkdirs() }
    return File(
      finalDirectory,
      "${evidenceType.name.lowercase()}-${capturedAt}.jpg",
    )
  }

  fun deleteIfExists(file: File) {
    if (file.exists()) {
      file.delete()
    }
  }

  private fun resolveVisitDirectory(routeStopId: String): File =
    File(rootDirectory, routeStopId).apply { mkdirs() }
}
