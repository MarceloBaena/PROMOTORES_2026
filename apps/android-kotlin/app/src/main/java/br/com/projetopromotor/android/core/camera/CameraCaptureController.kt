package br.com.projetopromotor.android.core.camera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

class CameraCaptureController(private val context: Context) {
  private val imageCapture = ImageCapture.Builder().build()

  suspend fun bindPreview(previewView: PreviewView, lifecycleOwner: LifecycleOwner) {
    val cameraProvider = getCameraProvider()
    val preview = Preview.Builder().build().also {
      it.surfaceProvider = previewView.surfaceProvider
    }

    cameraProvider.unbindAll()
    cameraProvider.bindToLifecycle(
      lifecycleOwner,
      CameraSelector.DEFAULT_BACK_CAMERA,
      preview,
      imageCapture,
    )
  }

  suspend fun capturePhoto(outputFile: File): File =
    suspendCancellableCoroutine { continuation ->
      val outputOptions = ImageCapture.OutputFileOptions.Builder(outputFile).build()

      imageCapture.takePicture(
        outputOptions,
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageSavedCallback {
          override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
            continuation.resume(outputFile)
          }

          override fun onError(exception: ImageCaptureException) {
            continuation.resumeWithException(exception)
          }
        },
      )
    }

  private suspend fun getCameraProvider(): ProcessCameraProvider =
    suspendCancellableCoroutine { continuation ->
      val providerFuture = ProcessCameraProvider.getInstance(context)
      providerFuture.addListener(
        {
          continuation.resume(providerFuture.get())
        },
        ContextCompat.getMainExecutor(context),
      )
    }
}

data class TimestampOverlayInput(
  val sourceFile: File,
  val targetFile: File,
  val occurredAt: Long,
  val latitude: Double?,
  val longitude: Double?,
  val clientLabel: String,
  val stageLabel: String,
)

class TimestampedPhotoWriter {
  fun stamp(input: TimestampOverlayInput): File {
    val bitmap = BitmapFactory.decodeFile(input.sourceFile.absolutePath)
      ?: error("Nao foi possivel abrir a foto capturada")
    val mutableBitmap = bitmap.copy(Bitmap.Config.ARGB_8888, true)
    val canvas = Canvas(mutableBitmap)
    val backgroundPaint = Paint().apply {
      color = Color.argb(190, 15, 23, 42)
      style = Paint.Style.FILL
      isAntiAlias = true
    }
    val textPaint = Paint().apply {
      color = Color.WHITE
      textSize = 34f
      isAntiAlias = true
    }

    val footerHeight = 184f
    canvas.drawRoundRect(
      24f,
      mutableBitmap.height - footerHeight,
      mutableBitmap.width - 24f,
      mutableBitmap.height - 24f,
      28f,
      28f,
      backgroundPaint,
    )

    val formatter = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale("pt", "BR"))
    val lines = listOf(
      input.stageLabel,
      input.clientLabel,
      "Data/Hora: ${formatter.format(Date(input.occurredAt))}",
      "Lat/Lng: ${input.latitude ?: 0.0}, ${input.longitude ?: 0.0}",
    )

    var currentY = mutableBitmap.height - 136f
    lines.forEach { line ->
      canvas.drawText(line, 48f, currentY, textPaint)
      currentY += 34f
    }

    FileOutputStream(input.targetFile).use { output ->
      mutableBitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)
    }

    return input.targetFile
  }
}
