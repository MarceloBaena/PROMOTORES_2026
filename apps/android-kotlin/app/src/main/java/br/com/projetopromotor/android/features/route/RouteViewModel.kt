package br.com.projetopromotor.android.features.route

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.data.repository.RouteRepository
import br.com.projetopromotor.android.data.repository.SyncRepository
import br.com.projetopromotor.android.domain.models.RouteStopModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class RouteUiState(
  val search: String = "",
  val stops: List<RouteStopModel> = emptyList(),
  val isRefreshing: Boolean = false,
  val message: String? = null,
)

class RouteViewModel(
  private val routeRepository: RouteRepository,
  private val syncRepository: SyncRepository,
) : ViewModel() {
  private val search = MutableStateFlow("")
  private val refreshing = MutableStateFlow(false)
  private val message = MutableStateFlow<String?>(null)

  val uiState: StateFlow<RouteUiState> =
    combine(
      routeRepository.observeTodayRoute(),
      search,
      refreshing,
      message,
    ) { stops, query, isRefreshing, currentMessage ->
      val normalized = query.trim()
      val filtered =
        if (normalized.isBlank()) {
          stops
        } else {
          stops.filter { stop ->
            listOf(stop.clientName, stop.addressLine, stop.city, stop.state).any { value ->
              value.contains(normalized, ignoreCase = true)
            }
          }
        }

      RouteUiState(
        search = query,
        stops = filtered,
        isRefreshing = isRefreshing,
        message = currentMessage,
      )
    }.stateIn(
      scope = viewModelScope,
      started = SharingStarted.WhileSubscribed(5_000),
      initialValue = RouteUiState(),
    )

  init {
    refresh()
  }

  fun updateSearch(value: String) {
    search.value = value
  }

  fun refresh() {
    viewModelScope.launch {
      refreshing.value = true
      runCatching {
        syncRepository.pushPendingQueue()
        routeRepository.refreshSnapshot()
        message.value = "Roteiro atualizado."
      }.onFailure { error ->
        message.value = error.message ?: "Sem internet. Exibindo roteiro salvo no aparelho."
      }
      refreshing.value = false
    }
  }

  fun dismissMessage() {
    message.value = null
  }

  companion object {
    fun factory(appContainer: AppContainer): ViewModelProvider.Factory =
      viewModelFactory {
        initializer {
          RouteViewModel(
            routeRepository = appContainer.routeRepository,
            syncRepository = appContainer.syncRepository,
          )
        }
      }
  }
}
