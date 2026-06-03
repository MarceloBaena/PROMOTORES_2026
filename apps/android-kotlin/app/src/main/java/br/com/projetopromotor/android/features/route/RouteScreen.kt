package br.com.projetopromotor.android.features.route

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import br.com.projetopromotor.android.ui.components.ScreenHeaderCard
import br.com.projetopromotor.android.ui.components.SectionCard
import br.com.projetopromotor.android.ui.components.StatusBadge
import br.com.projetopromotor.android.ui.components.StatusTone
import br.com.projetopromotor.android.ui.components.operationalStatusTone

@Composable
fun RouteRoute(
  appContainer: AppContainer,
  onOpenVisit: (String) -> Unit,
) {
  val viewModel: RouteViewModel = viewModel(factory = RouteViewModel.factory(appContainer))
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()

  RouteScreen(
    uiState = uiState,
    onSearchChange = viewModel::updateSearch,
    onRefresh = viewModel::refresh,
    onDismissMessage = viewModel::dismissMessage,
    onOpenVisit = onOpenVisit,
  )
}

@Composable
fun RouteScreen(
  uiState: RouteUiState,
  onSearchChange: (String) -> Unit,
  onRefresh: () -> Unit,
  onDismissMessage: () -> Unit,
  onOpenVisit: (String) -> Unit,
) {
  LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    item {
      ScreenHeaderCard(
        title = "Roteiro do dia",
        subtitle = "Clientes ordenados por sequencia de visita, com operacao local mesmo sem internet.",
        eyebrow = "Agenda local",
      )
    }

    item {
      OutlinedTextField(
        value = uiState.search,
        onValueChange = onSearchChange,
        label = { Text("Buscar cliente ou cidade") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
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
        Button(
          onClick = onDismissMessage,
          modifier = Modifier.fillMaxWidth(),
        ) {
          Text("Continuar")
        }
      }
    }

    item {
      Button(
        onClick = onRefresh,
        modifier = Modifier.fillMaxWidth(),
      ) {
        Text(if (uiState.isRefreshing) "Atualizando roteiro..." else "Atualizar roteiro")
      }
    }

    if (uiState.stops.isEmpty()) {
      item {
        SectionCard(
          title = "Sem paradas encontradas",
          supportingText = "Quando houver roteiro publicado, ele ficara salvo localmente para uso offline.",
        ) {
          Text("Nenhum cliente corresponde ao filtro atual.")
        }
      }
    } else {
      items(uiState.stops, key = { it.id }) { stop ->
        RouteStopCard(
          stop = stop,
          onOpenVisit = onOpenVisit,
        )
      }
    }
  }
}

@Composable
private fun RouteStopCard(
  stop: RouteStopModel,
  onOpenVisit: (String) -> Unit,
) {
  SectionCard(
    title = "${stop.sequence}. ${stop.clientName}",
    supportingText = "${stop.addressLine}, ${stop.city} - ${stop.state}",
    modifier = Modifier.clickable { onOpenVisit(stop.id) },
  ) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        Text(
          text = "Raio permitido: ${stop.radiusInMeters} m",
          style = MaterialTheme.typography.bodyMedium,
        )
        StatusBadge(
          label = stop.status.replace('_', ' '),
          tone = operationalStatusTone(stop.status),
        )
      }
      if (!stop.notes.isNullOrBlank()) {
        Text(
          text = stop.notes,
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
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
}
