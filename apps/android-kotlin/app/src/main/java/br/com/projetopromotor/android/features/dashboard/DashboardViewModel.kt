package br.com.projetopromotor.android.features.dashboard

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

data class DashboardUiState(
  val routeDate: String = RouteRepository.currentRouteDate(),
  val totalStops: Int = 0,
  val completedStops: Int = 0,
  val pendingStops: Int = 0,
  val pendingSyncCount: Int = 0,
  val nextStop: RouteStopModel? = null,
  val isRefreshing: Boolean = false,
  val message: String? = null,
) {
  val completionRate: Int
    get() = if (totalStops == 0) 0 else ((completedStops.toDouble() / totalStops.toDouble()) * 100).toInt()
}

class DashboardViewModel(
  private val routeRepository: RouteRepository,
  private val syncRepository: SyncRepository,
) : ViewModel() {
  private val refreshing = MutableStateFlow(false)
  private val message = MutableStateFlow<String?>(null)

  val uiState: StateFlow<DashboardUiState> =
    combine(
      routeRepository.observeTodayRoute(),
      syncRepository.observeQueue(),
      refreshing,
      message,
    ) { stops, queue, isRefreshing, currentMessage ->
      DashboardUiState(
        totalStops = stops.size,
        completedStops =
          stops.count { stop ->
            stop.status == "COMPLETED" || stop.status == "CHECKED_OUT"
          },
        pendingStops =
          stops.count { stop ->
            stop.status == "PLANNED" || stop.status == "IN_PROGRESS" || stop.status == "SYNC_PENDING"
          },
        pendingSyncCount = queue.size,
        nextStop =
          stops.firstOrNull { stop ->
            stop.status == "IN_PROGRESS" || stop.status == "PLANNED" || stop.status == "SYNC_PENDING"
          },
        isRefreshing = isRefreshing,
        message = currentMessage,
      )
    }.stateIn(
      scope = viewModelScope,
      started = SharingStarted.WhileSubscribed(5_000),
      initialValue = DashboardUiState(),
    )

  init {
    refresh()
  }

  fun refresh() {
    viewModelScope.launch {
      refreshing.value = true
      runCatching {
        syncRepository.pushPendingQueue()
        syncRepository.pullLatestSnapshot()
        message.value = "Dados operacionais sincronizados."
      }.onFailure { error ->
        message.value = error.message ?: "Sem conexao no momento. Dados locais mantidos."
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
          DashboardViewModel(
            routeRepository = appContainer.routeRepository,
            syncRepository = appContainer.syncRepository,
          )
        }
      }
  }
}
