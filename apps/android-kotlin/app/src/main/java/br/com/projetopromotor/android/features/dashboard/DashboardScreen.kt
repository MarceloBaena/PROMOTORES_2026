package br.com.projetopromotor.android.features.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.domain.models.RouteStopModel
import br.com.projetopromotor.android.ui.components.InlineMessageCard
import br.com.projetopromotor.android.ui.components.MetricCard
import br.com.projetopromotor.android.ui.components.ScreenHeaderCard
import br.com.projetopromotor.android.ui.components.SectionCard
import br.com.projetopromotor.android.ui.components.StatusBadge
import br.com.projetopromotor.android.ui.components.StatusTone
import br.com.projetopromotor.android.ui.components.operationalStatusTone

@Composable
fun DashboardRoute(
  appContainer: AppContainer,
  onOpenRoute: () -> Unit,
  onOpenHistory: () -> Unit,
  onOpenSync: () -> Unit,
  onOpenVisit: (String) -> Unit,
) {
  val viewModel: DashboardViewModel = viewModel(factory = DashboardViewModel.factory(appContainer))
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()

  DashboardScreen(
    uiState = uiState,
    onRefresh = viewModel::refresh,
    onDismissMessage = viewModel::dismissMessage,
    onOpenRoute = onOpenRoute,
    onOpenHistory = onOpenHistory,
    onOpenSync = onOpenSync,
    onOpenVisit = onOpenVisit,
  )
}

@Composable
fun DashboardScreen(
  uiState: DashboardUiState,
  onRefresh: () -> Unit,
  onDismissMessage: () -> Unit,
  onOpenRoute: () -> Unit,
  onOpenHistory: () -> Unit,
  onOpenSync: () -> Unit,
  onOpenVisit: (String) -> Unit,
) {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    verticalArrangement = Arrangement.spacedBy(16.dp),
    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
  ) {
    item {
      ScreenHeaderCard(
        title = "Operacao do dia",
        subtitle = "Visao rapida da equipe em campo com base local priorizada e sincronizacao posterior.",
        eyebrow = "Painel operacional",
      )
    }

    if (!uiState.message.isNullOrBlank()) {
      item {
        InlineMessageCard(
          message = uiState.message,
          tone = if (uiState.isRefreshing) StatusTone.Info else StatusTone.Success,
        )
      }
      item {
        TextButton(
          onClick = onDismissMessage,
          modifier = Modifier.fillMaxWidth(),
        ) {
          Text("Ocultar mensagem")
        }
      }
    }

    item {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        MetricCard(
          label = "Visitas do dia",
          value = uiState.totalStops.toString(),
          supportingText = "Roteiro atual salvo localmente",
          modifier = Modifier.weight(1f),
        )
        MetricCard(
          label = "Concluidas",
          value = uiState.completedStops.toString(),
          supportingText = "${uiState.completionRate}% do roteiro",
          modifier = Modifier.weight(1f),
        )
      }
    }

    item {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        MetricCard(
          label = "Pendentes",
          value = uiState.pendingStops.toString(),
          supportingText = "Paradas ainda em aberto",
          modifier = Modifier.weight(1f),
        )
        MetricCard(
          label = "Fila offline",
          value = uiState.pendingSyncCount.toString(),
          supportingText = "Itens aguardando push",
          modifier = Modifier.weight(1f),
        )
      }
    }

    item {
      SectionCard(
        title = "Proxima parada",
        supportingText = "A API de sync pull/push mantem o roteiro atualizado sem duplicidade.",
      ) {
        if (uiState.nextStop == null) {
          Text("Nenhuma visita pendente para hoje.")
        } else {
          NextStopContent(
            stop = uiState.nextStop,
            onOpenVisit = onOpenVisit,
          )
        }
      }
    }

    item {
      SectionCard(
        title = "Acoes rapidas",
        supportingText = "Fluxo pensado para uso de campo, com foco em poucos toques.",
      ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Button(
            onClick = onRefresh,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text(if (uiState.isRefreshing) "Sincronizando..." else "Sincronizar agora")
          }
          Button(
            onClick = onOpenRoute,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text("Abrir roteiro do dia")
          }
          Button(
            onClick = onOpenHistory,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text("Abrir historico local")
          }
          Button(
            onClick = onOpenSync,
            modifier = Modifier.fillMaxWidth(),
          ) {
            Text("Ver pendencias de sincronizacao")
          }
        }
      }
    }
  }
}

@Composable
private fun NextStopContent(
  stop: RouteStopModel,
  onOpenVisit: (String) -> Unit,
) {
  Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
    ) {
      Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
          text = "${stop.sequence}. ${stop.clientName}",
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.SemiBold,
        )
        Text(
          text = "${stop.addressLine}, ${stop.city} - ${stop.state}",
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.72f),
        )
      }
      StatusBadge(
        label = stop.status.replace('_', ' '),
        tone = operationalStatusTone(stop.status),
      )
    }
    Button(
      onClick = { onOpenVisit(stop.id) },
      modifier = Modifier.fillMaxWidth(),
    ) {
      Text("Abrir atendimento")
    }
  }
}
