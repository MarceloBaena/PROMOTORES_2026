package br.com.projetopromotor.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

enum class StatusTone {
  Neutral,
  Info,
  Success,
  Warning,
  Danger,
}

@Composable
fun ScreenHeaderCard(
  title: String,
  subtitle: String,
  modifier: Modifier = Modifier,
  eyebrow: String = "Operacao em campo",
) {
  Card(
    modifier = modifier.fillMaxWidth(),
    shape = RoundedCornerShape(28.dp),
    colors =
      CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.primaryContainer,
      ),
    border =
      androidx.compose.foundation.BorderStroke(
        width = 1.dp,
        color = MaterialTheme.colorScheme.outlineVariant,
      ),
    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
  ) {
    Column(
      modifier =
        Modifier
          .background(
            brush =
              Brush.verticalGradient(
                colors =
                  listOf(
                    MaterialTheme.colorScheme.primaryContainer,
                    MaterialTheme.colorScheme.surface,
                  ),
              ),
          )
          .padding(horizontal = 18.dp, vertical = 18.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      Text(
        text = eyebrow.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.Bold,
      )
      Text(
        text = title,
        style = MaterialTheme.typography.headlineSmall,
        color = MaterialTheme.colorScheme.onSurface,
        fontWeight = FontWeight.Bold,
      )
      Text(
        text = subtitle,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }
  }
}

@Composable
fun SectionCard(
  title: String,
  modifier: Modifier = Modifier,
  supportingText: String? = null,
  content: @Composable () -> Unit,
) {
  Card(
    modifier = modifier.fillMaxWidth(),
    colors =
      CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surface,
      ),
    shape = RoundedCornerShape(24.dp),
    border =
      androidx.compose.foundation.BorderStroke(
        1.dp,
        MaterialTheme.colorScheme.outlineVariant,
      ),
    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
  ) {
    Column(
      modifier = Modifier.padding(18.dp),
      verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(
          text = title,
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.SemiBold,
        )
        if (!supportingText.isNullOrBlank()) {
          Text(
            text = supportingText,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      }
      content()
    }
  }
}

@Composable
fun MetricCard(
  label: String,
  value: String,
  modifier: Modifier = Modifier,
  supportingText: String? = null,
) {
  Card(
    modifier = modifier.fillMaxWidth(),
    colors =
      CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surface,
      ),
    shape = RoundedCornerShape(22.dp),
    border =
      androidx.compose.foundation.BorderStroke(
        1.dp,
        MaterialTheme.colorScheme.outlineVariant,
      ),
  ) {
    Column(
      modifier = Modifier.padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Box(
        modifier =
          Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
      ) {
        Text(
          text = label.uppercase(),
          style = MaterialTheme.typography.labelMedium,
          color = MaterialTheme.colorScheme.primary,
          fontWeight = FontWeight.Bold,
        )
      }
      Text(
        text = value,
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
      )
      if (!supportingText.isNullOrBlank()) {
        Text(
          text = supportingText,
          style = MaterialTheme.typography.bodySmall,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
    }
  }
}

@Composable
fun StatusBadge(
  label: String,
  tone: StatusTone,
  modifier: Modifier = Modifier,
) {
  val (background, foreground, border) =
    when (tone) {
      StatusTone.Neutral -> Triple(Color(0xFFE9EFF5), Color(0xFF314457), Color(0xFFD4DDE7))
      StatusTone.Info -> Triple(Color(0xFFDCEBFA), Color(0xFF1F5D91), Color(0xFFBDD3E9))
      StatusTone.Success -> Triple(Color(0xFFDEF4E8), Color(0xFF1F6E49), Color(0xFFBFDFC8))
      StatusTone.Warning -> Triple(Color(0xFFFBECCF), Color(0xFF9A621B), Color(0xFFE7D3A7))
      StatusTone.Danger -> Triple(Color(0xFFF8E1E0), Color(0xFFAA403E), Color(0xFFE5B9B7))
    }

  Box(
    modifier =
      modifier
        .clip(RoundedCornerShape(999.dp))
        .border(1.dp, border, RoundedCornerShape(999.dp))
        .background(background)
        .padding(horizontal = 12.dp, vertical = 6.dp),
  ) {
    Text(
      text = label,
      color = foreground,
      style = MaterialTheme.typography.labelMedium,
      fontWeight = FontWeight.Bold,
    )
  }
}

@Composable
fun InlineMessageCard(
  message: String,
  tone: StatusTone,
  modifier: Modifier = Modifier,
) {
  val (background, foreground, border) =
    when (tone) {
      StatusTone.Success -> Triple(Color(0xFFEAF7EF), Color(0xFF1F6E49), Color(0xFFC5DEC8))
      StatusTone.Warning -> Triple(Color(0xFFFFF5E5), Color(0xFF9A621B), Color(0xFFE4CEA7))
      StatusTone.Danger -> Triple(Color(0xFFFDECEC), Color(0xFFAA403E), Color(0xFFE7C1BF))
      StatusTone.Info -> Triple(Color(0xFFEEF5FD), Color(0xFF1F5D91), Color(0xFFC9DBEE))
      StatusTone.Neutral -> Triple(Color(0xFFF3F6F9), Color(0xFF314457), Color(0xFFD7E0E9))
    }

  Row(
    modifier =
      modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(20.dp))
        .border(1.dp, border, RoundedCornerShape(20.dp))
        .background(background)
        .padding(horizontal = 14.dp, vertical = 12.dp),
  ) {
    Text(
      text = message,
      color = foreground,
      style = MaterialTheme.typography.bodyMedium,
      fontWeight = FontWeight.Medium,
    )
  }
}

fun operationalStatusTone(status: String): StatusTone =
  when (status) {
    "COMPLETED",
    "CHECKED_OUT" -> StatusTone.Success
    "IN_PROGRESS",
    "SYNC_PENDING" -> StatusTone.Info
    "PARTIAL" -> StatusTone.Warning
    "NOT_DONE" -> StatusTone.Danger
    else -> StatusTone.Neutral
  }
