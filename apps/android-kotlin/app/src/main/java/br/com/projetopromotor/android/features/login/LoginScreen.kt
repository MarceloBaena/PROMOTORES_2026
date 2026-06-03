package br.com.projetopromotor.android.features.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.ui.components.InlineMessageCard
import br.com.projetopromotor.android.ui.components.ScreenHeaderCard
import br.com.projetopromotor.android.ui.components.SectionCard
import br.com.projetopromotor.android.ui.components.StatusTone

@Composable
fun LoginRoute(
  appContainer: AppContainer,
  onAuthenticated: () -> Unit,
) {
  val viewModel: LoginViewModel = viewModel(factory = LoginViewModel.factory(appContainer))
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()

  LaunchedEffect(uiState.authenticated) {
    if (uiState.authenticated) {
      onAuthenticated()
    }
  }

  LoginScreen(
    uiState = uiState,
    onEmailChange = viewModel::updateEmail,
    onPasswordChange = viewModel::updatePassword,
    onLogin = viewModel::login,
  )
}

@Composable
fun LoginScreen(
  uiState: LoginUiState,
  onEmailChange: (String) -> Unit,
  onPasswordChange: (String) -> Unit,
  onLogin: () -> Unit,
) {
  Column(
    modifier =
      Modifier
        .fillMaxSize()
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 20.dp, vertical = 28.dp),
    verticalArrangement = Arrangement.spacedBy(18.dp),
  ) {
    Spacer(modifier = Modifier.height(20.dp))
    ScreenHeaderCard(
      title = "Acesso operacional",
      subtitle = "Autentique o dispositivo para liberar roteiro local, evidencias e sincronizacao segura.",
      eyebrow = "Formula Campo",
    )

    SectionCard(
      title = "Entrar no dispositivo",
      supportingText = "Depois da autenticacao inicial, o acesso continua disponivel offline enquanto a sessao estiver valida.",
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        OutlinedTextField(
          value = uiState.email,
          onValueChange = onEmailChange,
          label = { Text("E-mail") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
          shape = RoundedCornerShape(18.dp),
          colors =
            TextFieldDefaults.colors(
              focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
              unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
            ),
        )
        OutlinedTextField(
          value = uiState.password,
          onValueChange = onPasswordChange,
          label = { Text("Senha") },
          singleLine = true,
          visualTransformation = PasswordVisualTransformation(),
          modifier = Modifier.fillMaxWidth(),
          shape = RoundedCornerShape(18.dp),
          colors =
            TextFieldDefaults.colors(
              focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
              unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
            ),
        )
        if (!uiState.errorMessage.isNullOrBlank()) {
          InlineMessageCard(
            message = uiState.errorMessage,
            tone = StatusTone.Danger,
          )
        }
        Button(
          onClick = onLogin,
          enabled = !uiState.isSubmitting,
          modifier = Modifier.fillMaxWidth(),
          shape = RoundedCornerShape(18.dp),
        ) {
          if (uiState.isSubmitting) {
            CircularProgressIndicator(
              color = MaterialTheme.colorScheme.onPrimary,
              strokeWidth = 2.dp,
              modifier = Modifier.padding(vertical = 4.dp),
            )
          } else {
            Text("Entrar e preparar roteiro")
          }
        }
      }
    }

    SectionCard(
      title = "Diretrizes operacionais",
      supportingText = "Fluxo simples, objetivo e aderente ao trabalho de campo.",
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Check-in exige foto do estabelecimento com data e hora visiveis.")
        Text("Foto do antes e foto do depois sao obrigatorias para finalizar a visita.")
        Text("Latitude, longitude e validacao por raio ficam registradas localmente.")
        Text("A fila offline evita duplicidade usando sincronizacao push/pull com idempotencia.")
      }
    }
  }
}
