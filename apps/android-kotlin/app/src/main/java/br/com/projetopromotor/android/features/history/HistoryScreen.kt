package br.com.projetopromotor.android.features.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.domain.models.VisitCompletionStatus
import br.com.projetopromotor.android.domain.models.VisitHistoryItemModel
import br.com.projetopromotor.android.ui.components.SectionCard
import br.com.projetopromotor.android.ui.components.ScreenHeaderCard
import br.com.projetopromotor.android.ui.components.StatusBadge
import br.com.projetopromotor.android.ui.components.StatusTone
import br.com.projetopromotor.android.ui.components.operationalStatusTone

@Composable
fun HistoryRoute(appContainer: AppContainer) {
  val viewModel: HistoryViewModel = viewModel(factory = HistoryViewModel.factory(appContainer))
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()

  HistoryScreen(uiState = uiState)
}

@Composable
fun HistoryScreen(uiState: HistoryUiState) {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    item {
      ScreenHeaderCard(
        title = "Historico local",
        subtitle = "Visitas armazenadas no aparelho, incluindo pendencias que ainda aguardam sincronizacao.",
        eyebrow = "Base offline",
      )
    }

    if (uiState.items.isEmpty()) {
      item {
        SectionCard(
          title = "Sem historico local",
          supportingText = "As visitas concluidas ou em andamento aparecerao aqui.",
        ) {
          Text("Nenhum atendimento foi salvo no aparelho ate o momento.")
        }
      }
    } else {
      items(uiState.items, key = { it.localId }) { item ->
        HistoryCard(item = item)
      }
    }
  }
}

@Composable
private fun HistoryCard(item: VisitHistoryItemModel) {
  SectionCard(
    title = item.clientName,
    supportingText = "Visita local ${item.localId}",
  ) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        StatusBadge(
          label = item.status.replace('_', ' '),
          tone = operationalStatusTone(item.status),
        )
        StatusBadge(
          label = if (item.pendingSync) "PENDENTE SYNC" else "SINCRONIZADO",
          tone = if (item.pendingSync) StatusTone.Warning else StatusTone.Success,
        )
      }
      Text("Check-in: ${formatTimestamp(item.checkInAt)}")
      Text("Check-out: ${formatTimestamp(item.checkOutAt)}")
      Text(
        "Resultado: ${
          when (item.completionStatus) {
            VisitCompletionStatus.COMPLETED -> "Concluida"
            VisitCompletionStatus.PARTIAL -> "Parcial"
            VisitCompletionStatus.NOT_DONE -> "Nao realizada"
            null -> "Em andamento"
          }
        }",
      )
      Text("Ultima sincronizacao: ${formatTimestamp(item.lastSyncedAt)}")
    }
  }
}

private fun formatTimestamp(value: Long?): String =
  if (value == null) {
    "Nao registrado"
  } else {
    java.time.Instant
      .ofEpochMilli(value)
      .atZone(java.time.ZoneId.of("America/Cuiaba"))
      .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
  }
