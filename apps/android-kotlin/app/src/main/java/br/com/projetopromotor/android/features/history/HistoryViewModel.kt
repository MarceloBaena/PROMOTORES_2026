package br.com.projetopromotor.android.features.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.data.repository.VisitRepository
import br.com.projetopromotor.android.domain.models.VisitHistoryItemModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class HistoryUiState(
  val items: List<VisitHistoryItemModel> = emptyList(),
)

class HistoryViewModel(
  private val visitRepository: VisitRepository,
) : ViewModel() {
  val uiState: StateFlow<HistoryUiState> =
    visitRepository.observeLocalHistory().map { items ->
      HistoryUiState(items = items)
    }.stateIn(
      scope = viewModelScope,
      started = SharingStarted.WhileSubscribed(5_000),
      initialValue = HistoryUiState(),
    )

  companion object {
    fun factory(appContainer: AppContainer): ViewModelProvider.Factory =
      viewModelFactory {
        initializer {
          HistoryViewModel(visitRepository = appContainer.visitRepository)
        }
      }
  }
}
