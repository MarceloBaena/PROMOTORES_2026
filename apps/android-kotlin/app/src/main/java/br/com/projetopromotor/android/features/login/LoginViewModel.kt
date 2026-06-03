package br.com.projetopromotor.android.features.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.core.work.SyncWorkScheduler
import br.com.projetopromotor.android.data.repository.AuthRepository
import br.com.projetopromotor.android.data.repository.RouteRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
  val email: String = "",
  val password: String = "",
  val isSubmitting: Boolean = false,
  val errorMessage: String? = null,
  val authenticated: Boolean = false,
)

class LoginViewModel(
  private val authRepository: AuthRepository,
  private val routeRepository: RouteRepository,
  private val syncWorkScheduler: SyncWorkScheduler,
) : ViewModel() {
  private val _uiState = MutableStateFlow(LoginUiState())
  val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

  fun updateEmail(email: String) {
    _uiState.update {
      it.copy(email = email, errorMessage = null)
    }
  }

  fun updatePassword(password: String) {
    _uiState.update {
      it.copy(password = password, errorMessage = null)
    }
  }

  fun login() {
    val snapshot = uiState.value

    if (snapshot.email.isBlank() || snapshot.password.isBlank()) {
      _uiState.update {
        it.copy(errorMessage = "Informe e-mail e senha para entrar.")
      }
      return
    }

    viewModelScope.launch {
      _uiState.update {
        it.copy(isSubmitting = true, errorMessage = null)
      }

      authRepository
        .login(
          email = snapshot.email.trim(),
          password = snapshot.password,
        )
        .onSuccess {
          runCatching {
            routeRepository.refreshSnapshot()
          }
          syncWorkScheduler.scheduleImmediateSync()
          _uiState.update {
            it.copy(isSubmitting = false, authenticated = true)
          }
        }
        .onFailure { error ->
          _uiState.update {
            it.copy(
              isSubmitting = false,
              errorMessage = error.message ?: "Nao foi possivel autenticar.",
            )
          }
        }
    }
  }

  companion object {
    fun factory(appContainer: AppContainer): ViewModelProvider.Factory =
      viewModelFactory {
        initializer {
          LoginViewModel(
            authRepository = appContainer.authRepository,
            routeRepository = appContainer.routeRepository,
            syncWorkScheduler = appContainer.syncWorkScheduler,
          )
        }
      }
  }
}
