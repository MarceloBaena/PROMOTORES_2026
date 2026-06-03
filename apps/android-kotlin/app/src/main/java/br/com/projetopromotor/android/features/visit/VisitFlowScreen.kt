package br.com.projetopromotor.android.features.visit

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.domain.models.LocalEvidenceType
import br.com.projetopromotor.android.domain.models.VisitCompletionStatus
import br.com.projetopromotor.android.domain.models.VisitPhotoModel
import br.com.projetopromotor.android.ui.components.InlineMessageCard
import br.com.projetopromotor.android.ui.components.ScreenHeaderCard
import br.com.projetopromotor.android.ui.components.SectionCard
import br.com.projetopromotor.android.ui.components.StatusBadge
import br.com.projetopromotor.android.ui.components.StatusTone
import br.com.projetopromotor.android.ui.components.operationalStatusTone
import coil.compose.AsyncImage
import java.io.File
import kotlinx.coroutines.launch

private enum class CaptureStage {
  CheckIn,
  Before,
  After,
}

@Composable
fun VisitFlowRoute(
  appContainer: AppContainer,
  routeStopId: String,
  onBack: () -> Unit,
) {
  val viewModel: VisitFlowViewModel =
    viewModel(
      factory = VisitFlowViewModel.factory(appContainer, routeStopId),
    )
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()

  VisitFlowScreen(
    uiState = uiState,
    appContainer = appContainer,
    onBack = onBack,
    onUpdateNotes = viewModel::updateNotes,
    onUpdateJustification = viewModel::updateJustification,
    onUpdateCompletionStatus = viewModel::updateCompletionStatus,
    onUpdateChecklistBoolean = viewModel::updateChecklistBoolean,
    onUpdateChecklistText = viewModel::updateChecklistText,
    onSaveNotes = viewModel::saveNotes,
    onSaveChecklist = viewModel::saveChecklist,
    onCaptureEvidence = viewModel::captureEvidence,
    onCompleteVisit = viewModel::completeVisit,
    onDismissMessage = viewModel::dismissMessage,
  )
}

@Composable
fun VisitFlowScreen(
  uiState: VisitFlowUiState,
  appContainer: AppContainer,
  onBack: () -> Unit,
  onUpdateNotes: (String) -> Unit,
  onUpdateJustification: (String) -> Unit,
  onUpdateCompletionStatus: (VisitCompletionStatus) -> Unit,
  onUpdateChecklistBoolean: (String, Boolean) -> Unit,
  onUpdateChecklistText: (String, String) -> Unit,
  onSaveNotes: () -> Unit,
  onSaveChecklist: () -> Unit,
  onCaptureEvidence: (LocalEvidenceType, File) -> Unit,
  onCompleteVisit: () -> Unit,
  onDismissMessage: () -> Unit,
) {
  val context = LocalContext.current
  val lifecycleOwner = LocalLifecycleOwner.current
  val coroutineScope = rememberCoroutineScope()
  val previewView = remember(context) { PreviewView(context) }
  var captureStage by rememberSaveable { mutableStateOf<CaptureStage?>(null) }
  var localCaptureMessage by rememberSaveable { mutableStateOf<String?>(null) }
  var permissionsGranted by remember {
    mutableStateOf(hasOperationalPermissions(context))
  }
  val permissionLauncher =
    rememberLauncherForActivityResult(
      contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
      permissionsGranted = result.values.all { granted -> granted }
      if (!permissionsGranted) {
        localCaptureMessage = "Camera e localizacao sao obrigatorias para registrar evidencias."
      }
    }

  LaunchedEffect(captureStage, permissionsGranted) {
    if (captureStage != null && permissionsGranted) {
      appContainer.cameraCaptureController.bindPreview(previewView, lifecycleOwner)
    }
  }

  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    item {
      Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TextButton(
          onClick = onBack,
          modifier = Modifier.fillMaxWidth(),
        ) {
          Text("Voltar ao roteiro")
        }
        ScreenHeaderCard(
          title = uiState.stop?.clientName ?: "Atendimento",
          subtitle =
            uiState.stop?.let { stop ->
              "${stop.addressLine}, ${stop.city} - ${stop.state}"
            } ?: "Parada carregando do banco local",
          eyebrow = "Atendimento em campo",
        )
      }
    }

    if (!uiState.message.isNullOrBlank()) {
      item {
        InlineMessageCard(
          message = uiState.message,
          tone = StatusTone.Success,
        )
      }
      item {
        Button(
          onClick = onDismissMessage,
          modifier = Modifier.fillMaxWidth(),
        ) {
          Text("Continuar")
        }
      }
    }

    if (!localCaptureMessage.isNullOrBlank()) {
      item {
        InlineMessageCard(
          message = localCaptureMessage,
          tone = StatusTone.Warning,
        )
      }
    }

    item {
      SectionCard(
        title = "Status da visita",
        supportingText = "As evidencias ficam gravadas com data, hora e coordenadas.",
      ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
          ) {
            StatusBadge(
              label = uiState.draft?.status ?: (uiState.stop?.status ?: "PLANNED"),
              tone = operationalStatusTone(uiState.draft?.status ?: (uiState.stop?.status ?: "PLANNED")),
            )
            Text("Raio: ${uiState.stop?.radiusInMeters ?: 0} m")
          }
          Text("Check-in com foto: ${if (uiState.hasCheckInPhoto) "OK" else "Pendente"}")
          Text("Foto do antes: ${if (uiState.hasBeforePhoto) "OK" else "Pendente"}")
          Text("Checklist: ${if (uiState.draft?.checklistCompleted == true) "OK" else "Pendente"}")
          Text("Foto do depois: ${if (uiState.hasAfterPhoto) "OK" else "Pendente"}")
        }
      }
    }

    item {
      SectionCard(
        title = "Captura operacional",
        supportingText = "Check-in, antes e depois usam CameraX e gravam o carimbo visual na imagem.",
      ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          if (!permissionsGranted) {
            Button(
              onClick = {
                permissionLauncher.launch(
                  arrayOf(
                    Manifest.permission.CAMERA,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                  ),
                )
              },
              modifier = Modifier.fillMaxWidth(),
            ) {
              Text("Conceder camera e localizacao")
            }
          }

          if (uiState.draft?.outsideGeofence == true || captureStage == CaptureStage.CheckIn) {
            OutlinedTextField(
              value = uiState.outsideGeofenceJustification,
              onValueChange = onUpdateJustification,
              label = { Text("Justificativa se estiver fora do raio") },
              modifier = Modifier.fillMaxWidth(),
            )
          }

          Button(
            onClick = {
              if (permissionsGranted) {
                captureStage = CaptureStage.CheckIn
              } else {
                permissionLauncher.launch(
                  arrayOf(
                    Manifest.permission.CAMERA,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                  ),
                )
              }
            },
            enabled = !uiState.isProcessing,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text("Check-in com foto obrigatoria")
          }
          Button(
            onClick = { captureStage = CaptureStage.Before },
            enabled = permissionsGranted && !uiState.isProcessing,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text("Capturar foto do antes")
          }
          Button(
            onClick = { captureStage = CaptureStage.After },
            enabled = permissionsGranted && !uiState.isProcessing,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text("Capturar foto do depois")
          }

          if (captureStage != null && permissionsGranted) {
            Card(
              colors =
                CardDefaults.cardColors(
                  containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                ),
            ) {
              Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
              ) {
                Text(
                  text =
                    when (captureStage) {
                      CaptureStage.CheckIn -> "Camera pronta para check-in"
                      CaptureStage.Before -> "Camera pronta para foto do antes"
                      CaptureStage.After -> "Camera pronta para foto do depois"
                      null -> ""
                    },
                  style = MaterialTheme.typography.titleMedium,
                  fontWeight = FontWeight.SemiBold,
                )
                AndroidView(
                  factory = { previewView },
                  modifier =
                    Modifier
                      .fillMaxWidth()
                      .height(260.dp),
                )
                Button(
                  onClick = {
                    coroutineScope.launch {
                      runCatching {
                        val routeStopId = uiState.stop?.id ?: error("Parada indisponivel para captura.")
                        val outputFile =
                          appContainer.photoStorageManager.createRawCaptureFile(
                            routeStopId = routeStopId,
                            stageLabel = (captureStage ?: CaptureStage.CheckIn).name,
                          )
                        val rawFile = appContainer.cameraCaptureController.capturePhoto(outputFile)
                        onCaptureEvidence(
                          when (captureStage) {
                            CaptureStage.CheckIn -> LocalEvidenceType.CHECKIN
                            CaptureStage.Before -> LocalEvidenceType.BEFORE
                            CaptureStage.After -> LocalEvidenceType.AFTER
                            null -> LocalEvidenceType.CHECKIN
                          },
                          rawFile,
                        )
                        captureStage = null
                        localCaptureMessage = null
                      }.onFailure { error ->
                        localCaptureMessage = error.message ?: "Falha ao capturar a foto."
                      }
                    }
                  },
                  modifier = Modifier.fillMaxWidth(),
                ) {
                  Text("Capturar e salvar")
                }
                TextButton(
                  onClick = { captureStage = null },
                  modifier = Modifier.fillMaxWidth(),
                ) {
                  Text("Cancelar captura")
                }
              }
            }
          }
        }
      }
    }

    item {
      SectionCard(
        title = "Checklist da loja",
        supportingText = "O template vem do sync pull e e persistido no Room.",
      ) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
          uiState.checklist.forEach { answer ->
            if (answer.type == "BOOLEAN") {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
              ) {
                Column(modifier = Modifier.weight(1f)) {
                  Text(
                    text = answer.label,
                    fontWeight = FontWeight.SemiBold,
                  )
                  Text(
                    text = if (answer.required) "Obrigatorio" else "Opcional",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.64f),
                  )
                }
                Switch(
                  checked = answer.booleanValue,
                  onCheckedChange = { checked ->
                    onUpdateChecklistBoolean(answer.code, checked)
                  },
                )
              }
            } else {
              OutlinedTextField(
                value = answer.textValue,
                onValueChange = { value ->
                  onUpdateChecklistText(answer.code, value)
                },
                label = { Text(answer.label) },
                modifier = Modifier.fillMaxWidth(),
              )
            }
          }
          Button(
            onClick = onSaveChecklist,
            enabled = uiState.canSaveChecklist && !uiState.isProcessing,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text("Salvar checklist")
          }
        }
      }
    }

    item {
      SectionCard(
        title = "Observacoes operacionais",
        supportingText = "Notas locais entram na fila de sincronizacao com idempotencia.",
      ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
          OutlinedTextField(
            value = uiState.notes,
            onValueChange = onUpdateNotes,
            label = { Text("Notas da visita") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
          )
          Button(
            onClick = onSaveNotes,
            enabled = !uiState.isProcessing,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text("Salvar observacoes")
          }
        }
      }
    }

    item {
      SectionCard(
        title = "Finalizacao",
        supportingText = "A visita so fecha com todas as etapas obrigatorias concluidas.",
      ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
          CompletionStatusSelector(
            selected = uiState.completionStatus,
            onSelected = onUpdateCompletionStatus,
          )
          Button(
            onClick = onCompleteVisit,
            enabled = uiState.canFinish && !uiState.isProcessing,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text("Finalizar atendimento")
          }
        }
      }
    }

    if (uiState.photos.isNotEmpty()) {
      item {
        SectionCard(
          title = "Evidencias locais",
          supportingText = "As imagens permanecem no aparelho ate o upload confirmado.",
        ) {
          LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(uiState.photos, key = { it.id }) { photo ->
              EvidenceCard(photo = photo)
            }
          }
        }
      }
    }
  }
}

@Composable
private fun CompletionStatusSelector(
  selected: VisitCompletionStatus,
  onSelected: (VisitCompletionStatus) -> Unit,
) {
  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text(
      text = "Resultado do atendimento",
      style = MaterialTheme.typography.titleSmall,
      fontWeight = FontWeight.SemiBold,
    )
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      VisitCompletionStatus.entries.forEach { status ->
        Button(
          onClick = { onSelected(status) },
          modifier = Modifier.weight(1f),
        ) {
          Text(
            when (status) {
              VisitCompletionStatus.COMPLETED -> "Concluida"
              VisitCompletionStatus.PARTIAL -> "Parcial"
              VisitCompletionStatus.NOT_DONE -> "Nao realizada"
            },
          )
        }
      }
    }
    Text(
      text =
        "Selecionado: ${
          when (selected) {
            VisitCompletionStatus.COMPLETED -> "Concluida"
            VisitCompletionStatus.PARTIAL -> "Parcial"
            VisitCompletionStatus.NOT_DONE -> "Nao realizada"
          }
        }",
      style = MaterialTheme.typography.bodySmall,
    )
  }
}

@Composable
private fun EvidenceCard(photo: VisitPhotoModel) {
  Card(
    modifier = Modifier.size(width = 160.dp, height = 190.dp),
    colors =
      CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
      ),
  ) {
    Column(
      modifier = Modifier.padding(10.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      AsyncImage(
        model = File(photo.localPath),
        contentDescription = photo.type.name,
        modifier =
          Modifier
            .fillMaxWidth()
            .height(120.dp),
      )
      Text(
        text = photo.type.name,
        fontWeight = FontWeight.SemiBold,
      )
      StatusBadge(
        label = if (photo.uploaded) "UPLOAD OK" else "LOCAL",
        tone = if (photo.uploaded) StatusTone.Success else StatusTone.Warning,
      )
    }
  }
}

private fun hasOperationalPermissions(context: Context): Boolean =
  ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
