package br.com.projetopromotor.android.features.visit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.core.location.FieldLocationManager
import br.com.projetopromotor.android.core.work.SyncWorkScheduler
import br.com.projetopromotor.android.data.repository.RouteRepository
import br.com.projetopromotor.android.data.repository.SyncRepository
import br.com.projetopromotor.android.data.repository.VisitRepository
import br.com.projetopromotor.android.domain.models.ChecklistQuestionModel
import br.com.projetopromotor.android.domain.models.LocalEvidenceType
import br.com.projetopromotor.android.domain.models.RouteStopModel
import br.com.projetopromotor.android.domain.models.VisitCompletionStatus
import br.com.projetopromotor.android.domain.models.VisitDraftModel
import br.com.projetopromotor.android.domain.models.VisitPhotoModel
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ChecklistAnswerUiModel(
  val code: String,
  val label: String,
  val type: String,
  val required: Boolean,
  val booleanValue: Boolean,
  val textValue: String,
)

data class VisitFlowUiState(
  val stop: RouteStopModel? = null,
  val draft: VisitDraftModel? = null,
  val photos: List<VisitPhotoModel> = emptyList(),
  val checklist: List<ChecklistAnswerUiModel> = emptyList(),
  val notes: String = "",
  val outsideGeofenceJustification: String = "",
  val completionStatus: VisitCompletionStatus = VisitCompletionStatus.COMPLETED,
  val isProcessing: Boolean = false,
  val message: String? = null,
) {
  val hasCheckInPhoto: Boolean
    get() = photos.any { photo -> photo.type == LocalEvidenceType.CHECKIN }

  val hasBeforePhoto: Boolean
    get() = photos.any { photo -> photo.type == LocalEvidenceType.BEFORE }

  val hasAfterPhoto: Boolean
    get() = photos.any { photo -> photo.type == LocalEvidenceType.AFTER }

  val canSaveChecklist: Boolean
    get() = draft?.checkInAt != null && hasBeforePhoto

  val canFinish: Boolean
    get() =
      draft?.checkInAt != null &&
        hasCheckInPhoto &&
        hasBeforePhoto &&
        hasAfterPhoto &&
        (draft?.checklistCompleted == true)
}

class VisitFlowViewModel(
  private val routeStopId: String,
  private val routeRepository: RouteRepository,
  private val visitRepository: VisitRepository,
  private val syncRepository: SyncRepository,
  private val locationManager: FieldLocationManager,
  private val syncWorkScheduler: SyncWorkScheduler,
  private val gson: Gson = Gson(),
) : ViewModel() {
  private val notesOverride = MutableStateFlow<String?>(null)
  private val justification = MutableStateFlow("")
  private val completionStatus = MutableStateFlow(VisitCompletionStatus.COMPLETED)
  private val checklistOverrides = MutableStateFlow<Map<String, Any?>>(emptyMap())
  private val processing = MutableStateFlow(false)
  private val message = MutableStateFlow<String?>(null)

  private val stopFlow =
    routeRepository.observeTodayRoute().map { stops ->
      stops.firstOrNull { stop -> stop.id == routeStopId }
    }

  private val draftFlow = visitRepository.observeVisit(routeStopId)
  private val photosFlow = visitRepository.observeVisitPhotos(routeStopId)
  private val templateFlow = routeRepository.observeChecklistTemplate()

  val uiState: StateFlow<VisitFlowUiState> =
    combine(
      stopFlow,
      draftFlow,
      photosFlow,
      templateFlow,
      notesOverride,
      justification,
      completionStatus,
      checklistOverrides,
      processing,
      message,
    ) { stop, draft, photos, template, notesValue, justificationValue, selectedCompletion, overrides, isProcessing, currentMessage ->
      VisitFlowUiState(
        stop = stop,
        draft = draft,
        photos = photos,
        checklist =
          buildChecklistAnswers(
            template = template,
            checklistJson = draft?.checklistJson.orEmpty(),
            overrides = overrides,
          ),
        notes = notesValue ?: draft?.notes.orEmpty(),
        outsideGeofenceJustification = justificationValue,
        completionStatus = selectedCompletion,
        isProcessing = isProcessing,
        message = currentMessage,
      )
    }.stateIn(
      scope = viewModelScope,
      started = SharingStarted.WhileSubscribed(5_000),
      initialValue = VisitFlowUiState(),
    )

  init {
    refresh()
  }

  fun refresh() {
    viewModelScope.launch {
      runCatching {
        syncRepository.pushPendingQueue()
        routeRepository.refreshSnapshot()
      }
    }
  }

  fun updateNotes(notes: String) {
    notesOverride.value = notes
  }

  fun updateJustification(value: String) {
    justification.value = value
  }

  fun updateCompletionStatus(status: VisitCompletionStatus) {
    completionStatus.value = status
  }

  fun updateChecklistBoolean(code: String, value: Boolean) {
    checklistOverrides.value = checklistOverrides.value + (code to value)
  }

  fun updateChecklistText(code: String, value: String) {
    checklistOverrides.value = checklistOverrides.value + (code to value)
  }

  fun saveNotes() {
    val state = uiState.value
    val stop = state.stop ?: return emitMessage("Parada nao encontrada no roteiro local.")
    val notes = state.notes.trim()

    if (notes.isBlank()) {
      emitMessage("Digite uma observacao para salvar.")
      return
    }

    executeAction {
      val draft = visitRepository.ensureVisitDraft(stop)
      if (draft.checkInAt == null) {
        error("Realize o check-in antes de salvar observacoes.")
      }
      visitRepository.saveNotes(draft.localId, notes)
      syncWorkScheduler.scheduleImmediateSync()
      emitMessage("Observacoes salvas no aparelho e preparadas para sincronizacao.")
    }
  }

  fun saveChecklist() {
    val state = uiState.value
    val draft = state.draft ?: return emitMessage("Realize o check-in antes do checklist.")

    if (!state.hasBeforePhoto) {
      emitMessage("A foto do antes e obrigatoria antes de enviar o checklist.")
      return
    }

    val invalidTextQuestion =
      state.checklist.firstOrNull { answer ->
        answer.type == "TEXT" && answer.required && answer.textValue.trim().isBlank()
      }

    if (invalidTextQuestion != null) {
      emitMessage("Preencha o campo obrigatorio: ${invalidTextQuestion.label}.")
      return
    }

    executeAction {
      val checklistPayload =
        state.checklist.map { answer ->
          mapOf(
            "code" to answer.code,
            "label" to answer.label,
            "type" to answer.type,
            "required" to answer.required,
            "value" to if (answer.type == "BOOLEAN") answer.booleanValue else answer.textValue.trim(),
          )
        }
      visitRepository.saveChecklist(
        localVisitId = draft.localId,
        checklistJson = gson.toJson(checklistPayload),
      )
      if (state.notes.trim().isNotBlank()) {
        visitRepository.saveNotes(draft.localId, state.notes.trim())
      }
      syncWorkScheduler.scheduleImmediateSync()
      emitMessage("Checklist salvo com sucesso para sincronizacao posterior.")
    }
  }

  fun captureEvidence(
    evidenceType: LocalEvidenceType,
    sourceFile: File,
  ) {
    val state = uiState.value
    val stop = state.stop ?: return emitMessage("Parada nao encontrada no roteiro local.")

    executeAction {
      val coordinates = locationManager.getCurrentCoordinates()
      val capturedAt = System.currentTimeMillis()

      when (evidenceType) {
        LocalEvidenceType.CHECKIN -> {
          val (insideGeofence, distanceMeters) =
            locationManager.isInsideGeofence(
              currentLatitude = coordinates.latitude,
              currentLongitude = coordinates.longitude,
              targetLatitude = stop.latitude,
              targetLongitude = stop.longitude,
              radiusMeters = stop.radiusInMeters,
            )
          val justificationText = state.outsideGeofenceJustification.trim().ifBlank { null }

          if (!insideGeofence && justificationText.isNullOrBlank()) {
            error("Check-in fora do raio exige justificativa operacional.")
          }

          val draft =
            visitRepository.registerCheckIn(
              stop = stop,
              latitude = coordinates.latitude,
              longitude = coordinates.longitude,
              geofenceDistanceMeters = distanceMeters,
              outsideGeofence = !insideGeofence,
              justification = justificationText,
            )
          visitRepository.recordLocationEvent(
            eventType = "CHECK_IN",
            routeStopId = stop.id,
            localVisitId = draft.localId,
            coordinates = coordinates,
            capturedAt = capturedAt,
          )
          visitRepository.savePhoto(
            localVisitId = draft.localId,
            routeStopId = stop.id,
            clientName = stop.clientName,
            evidenceType = LocalEvidenceType.CHECKIN,
            sourceFile = sourceFile,
            mimeType = "image/jpeg",
            capturedAt = capturedAt,
            latitude = coordinates.latitude,
            longitude = coordinates.longitude,
          )
          syncWorkScheduler.scheduleImmediateSync()
          emitMessage("Check-in salvo localmente com foto e coordenadas.")
        }

        LocalEvidenceType.BEFORE,
        LocalEvidenceType.AFTER -> {
          val draft = state.draft ?: error("Realize o check-in com foto antes de continuar.")

          if (draft.checkInAt == null) {
            error("Check-in obrigatorio antes da captura de evidencias.")
          }

          if (evidenceType == LocalEvidenceType.AFTER && !draft.checklistCompleted) {
            error("Conclua o checklist antes da foto do depois.")
          }

          visitRepository.recordLocationEvent(
            eventType = "PHOTO_${evidenceType.name}",
            routeStopId = stop.id,
            localVisitId = draft.localId,
            coordinates = coordinates,
            capturedAt = capturedAt,
          )
          visitRepository.savePhoto(
            localVisitId = draft.localId,
            routeStopId = stop.id,
            clientName = stop.clientName,
            evidenceType = evidenceType,
            sourceFile = sourceFile,
            mimeType = "image/jpeg",
            capturedAt = capturedAt,
            latitude = coordinates.latitude,
            longitude = coordinates.longitude,
          )
          syncWorkScheduler.scheduleImmediateSync()
          emitMessage(
            when (evidenceType) {
              LocalEvidenceType.BEFORE -> "Foto do antes salva no aparelho."
              LocalEvidenceType.AFTER -> "Foto do depois salva no aparelho."
              LocalEvidenceType.CHECKIN -> ""
            },
          )
        }
      }
    }
  }

  fun completeVisit() {
    val state = uiState.value
    val draft = state.draft ?: return emitMessage("Nenhuma visita iniciada para esta parada.")

    if (!state.canFinish) {
      emitMessage("Finalize check-in, foto do antes, checklist e foto do depois antes do checkout.")
      return
    }

    executeAction {
      val coordinates = locationManager.getCurrentCoordinates()
      visitRepository.recordLocationEvent(
        eventType = "CHECK_OUT",
        routeStopId = draft.routeStopId,
        localVisitId = draft.localId,
        coordinates = coordinates,
        capturedAt = System.currentTimeMillis(),
      )
      val notes = state.notes.trim()
      if (notes.isNotBlank()) {
        visitRepository.saveNotes(draft.localId, notes)
      }
      visitRepository.completeVisit(
        localVisitId = draft.localId,
        notes = notes,
        completionStatus = state.completionStatus,
        latitude = coordinates.latitude,
        longitude = coordinates.longitude,
      )
      syncWorkScheduler.scheduleImmediateSync()
      emitMessage("Atendimento finalizado e preparado para sincronizacao.")
    }
  }

  fun dismissMessage() {
    message.value = null
  }

  private fun executeAction(block: suspend () -> Unit) {
    viewModelScope.launch {
      processing.value = true
      runCatching {
        block()
      }.onFailure { error ->
        emitMessage(error.message ?: "Falha ao executar a acao.")
      }
      processing.value = false
    }
  }

  private fun emitMessage(value: String) {
    message.value = value
  }

  private fun buildChecklistAnswers(
    template: List<ChecklistQuestionModel>,
    checklistJson: String,
    overrides: Map<String, Any?>,
  ): List<ChecklistAnswerUiModel> {
    val persisted = parseChecklistAnswers(checklistJson)

    return template.sortedBy { it.sortOrder }.map { question ->
      val rawValue = overrides[question.code] ?: persisted[question.code]
      ChecklistAnswerUiModel(
        code = question.code,
        label = question.label,
        type = question.type,
        required = question.required,
        booleanValue =
          when (rawValue) {
            is Boolean -> rawValue
            is String -> rawValue.equals("true", ignoreCase = true)
            else -> false
          },
        textValue =
          when (rawValue) {
            is String -> rawValue
            else -> ""
          },
      )
    }
  }

  private fun parseChecklistAnswers(checklistJson: String): Map<String, Any?> {
    if (checklistJson.isBlank() || checklistJson == "[]") {
      return emptyMap()
    }

    val listType = object : TypeToken<List<Map<String, Any?>>>() {}.type

    return runCatching {
      val items: List<Map<String, Any?>> = gson.fromJson(checklistJson, listType) ?: emptyList()
      items.associate { item ->
        item["code"].toString() to item["value"]
      }
    }.getOrDefault(emptyMap())
  }

  companion object {
    fun factory(
      appContainer: AppContainer,
      routeStopId: String,
    ): ViewModelProvider.Factory =
      viewModelFactory {
        initializer {
          VisitFlowViewModel(
            routeStopId = routeStopId,
            routeRepository = appContainer.routeRepository,
            visitRepository = appContainer.visitRepository,
            syncRepository = appContainer.syncRepository,
            locationManager = appContainer.fieldLocationManager,
            syncWorkScheduler = appContainer.syncWorkScheduler,
          )
        }
      }
  }
}
