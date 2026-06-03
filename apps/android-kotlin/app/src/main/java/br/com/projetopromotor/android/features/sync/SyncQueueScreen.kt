package br.com.projetopromotor.android.features.sync

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.domain.models.SyncQueueItemModel
import br.com.projetopromotor.android.domain.models.SyncQueueStatus
import br.com.projetopromotor.android.ui.components.InlineMessageCard
import br.com.projetopromotor.android.ui.components.ScreenHeaderCard
import br.com.projetopromotor.android.ui.components.SectionCard
import br.com.projetopromotor.android.ui.components.StatusBadge
import br.com.projetopromotor.android.ui.components.StatusTone

@Composable
fun SyncQueueRoute(appContainer: AppContainer) {
  val viewModel: SyncQueueViewModel = viewModel(factory = SyncQueueViewModel.factory(appContainer))
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()

  SyncQueueScreen(
    uiState = uiState,
    onSyncNow = viewModel::syncNow,
    onDismissMessage = viewModel::dismissMessage,
  )
}

@Composable
fun SyncQueueScreen(
  uiState: SyncQueueUiState,
  onSyncNow: () -> Unit,
  onDismissMessage: () -> Unit,
) {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    item {
      ScreenHeaderCard(
        title = "Fila de sincronizacao",
        subtitle = "Cada item guarda o status local do atendimento e pode ser reenviado sem duplicidade.",
        eyebrow = "Sync controlado",
      )
    }

    item {
      Button(
        onClick = onSyncNow,
        modifier = Modifier.fillMaxWidth(),
      ) {
        Text(if (uiState.isProcessing) "Sincronizando..." else "Processar fila agora")
      }
    }

    if (!uiState.message.isNullOrBlank()) {
      item {
        InlineMessageCard(
          message = uiState.message,
          tone = if (uiState.isProcessing) StatusTone.Info else StatusTone.Success,
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

    if (uiState.items.isEmpty()) {
      item {
        SectionCard(
          title = "Fila vazia",
          supportingText = "Nenhum item pendente no momento.",
        ) {
          Text("As evidencias e os atendimentos locais ja foram enviados ou ainda nao foram gerados.")
        }
      }
    } else {
      items(uiState.items, key = { it.id }) { item ->
        QueueItemCard(item = item)
      }
    }
  }
}

@Composable
private fun QueueItemCard(item: SyncQueueItemModel) {
  SectionCard(
    title = item.type.name.replace('_', ' '),
    supportingText = "Criado em ${formatQueueTimestamp(item.createdAt)}",
  ) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        StatusBadge(
          label = item.status.name,
          tone =
            when (item.status) {
              SyncQueueStatus.PENDING -> StatusTone.Warning
              SyncQueueStatus.PROCESSING -> StatusTone.Info
              SyncQueueStatus.FAILED -> StatusTone.Danger
              SyncQueueStatus.SYNCED -> StatusTone.Success
            },
        )
        Text("Tentativas: ${item.attempts}")
      }
      if (!item.localVisitId.isNullOrBlank()) {
        Text("Visita local: ${item.localVisitId}")
      }
      if (!item.routeStopId.isNullOrBlank()) {
        Text("Parada: ${item.routeStopId}")
      }
      if (!item.lastError.isNullOrBlank()) {
        Text(
          text = "Erro: ${item.lastError}",
          color = MaterialTheme.colorScheme.error,
        )
      }
    }
  }
}

private fun formatQueueTimestamp(value: Long): String =
  java.time.Instant
    .ofEpochMilli(value)
    .atZone(java.time.ZoneId.of("America/Cuiaba"))
    .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
