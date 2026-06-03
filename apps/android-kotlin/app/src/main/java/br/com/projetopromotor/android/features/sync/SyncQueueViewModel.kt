package br.com.projetopromotor.android.features.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.data.repository.SyncRepository
import br.com.projetopromotor.android.domain.models.SyncQueueItemModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class SyncQueueUiState(
  val items: List<SyncQueueItemModel> = emptyList(),
  val isProcessing: Boolean = false,
  val message: String? = null,
)

class SyncQueueViewModel(
  private val syncRepository: SyncRepository,
) : ViewModel() {
  private val processing = MutableStateFlow(false)
  private val message = MutableStateFlow<String?>(null)

  val uiState: StateFlow<SyncQueueUiState> =
    combine(
      syncRepository.observeQueue(),
      processing,
      message,
    ) { items, isProcessing, currentMessage ->
      SyncQueueUiState(
        items = items,
        isProcessing = isProcessing,
        message = currentMessage,
      )
    }.stateIn(
      scope = viewModelScope,
      started = SharingStarted.WhileSubscribed(5_000),
      initialValue = SyncQueueUiState(),
    )

  fun syncNow() {
    viewModelScope.launch {
      processing.value = true
      runCatching {
        syncRepository.pushPendingQueue()
        syncRepository.pullLatestSnapshot()
        message.value = "Fila processada com sucesso."
      }.onFailure { error ->
        message.value = error.message ?: "Nao foi possivel concluir a sincronizacao."
      }
      processing.value = false
    }
  }

  fun dismissMessage() {
    message.value = null
  }

  companion object {
    fun factory(appContainer: AppContainer): ViewModelProvider.Factory =
      viewModelFactory {
        initializer {
          SyncQueueViewModel(syncRepository = appContainer.syncRepository)
        }
      }
  }
}
