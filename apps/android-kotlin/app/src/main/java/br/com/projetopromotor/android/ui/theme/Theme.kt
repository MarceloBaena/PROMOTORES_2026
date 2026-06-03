package br.com.projetopromotor.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val LightColors =
  lightColorScheme(
    primary = Color(0xFF1F5D91),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD8E9F8),
    onPrimaryContainer = Color(0xFF102A43),
    secondary = Color(0xFF334E68),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE6EDF5),
    onSecondaryContainer = Color(0xFF12263A),
    tertiary = Color(0xFF2B6C63),
    onTertiary = Color.White,
    background = Color(0xFFF1F5F9),
    onBackground = Color(0xFF12263A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF12263A),
    surfaceVariant = Color(0xFFEAF0F6),
    onSurfaceVariant = Color(0xFF4D6278),
    outline = Color(0xFFC9D4E0),
    outlineVariant = Color(0xFFD8E1EA),
    error = Color(0xFFB3423F),
    onError = Color.White,
    errorContainer = Color(0xFFFBE9E8),
    onErrorContainer = Color(0xFF5A1E1B),
  )

private val DarkColors =
  darkColorScheme(
    primary = Color(0xFF74A9DB),
    onPrimary = Color(0xFF0C2135),
    primaryContainer = Color(0xFF173A59),
    onPrimaryContainer = Color(0xFFD9ECFF),
    secondary = Color(0xFF9CB6D0),
    onSecondary = Color(0xFF13263A),
    secondaryContainer = Color(0xFF21374C),
    onSecondaryContainer = Color(0xFFE2ECF7),
    tertiary = Color(0xFF79C6BA),
    onTertiary = Color(0xFF102E2A),
    background = Color(0xFF0D1722),
    onBackground = Color(0xFFEAF0F6),
    surface = Color(0xFF101C29),
    onSurface = Color(0xFFEAF0F6),
    surfaceVariant = Color(0xFF152536),
    onSurfaceVariant = Color(0xFFB7C5D4),
    outline = Color(0xFF30475D),
    outlineVariant = Color(0xFF24384C),
    error = Color(0xFFF0A4A1),
    onError = Color(0xFF601E1B),
    errorContainer = Color(0xFF7D2A26),
    onErrorContainer = Color(0xFFFFDAD7),
  )

private val CorporateTypography =
  Typography(
    headlineMedium =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 30.sp,
        lineHeight = 34.sp,
        letterSpacing = (-0.5).sp,
      ),
    headlineSmall =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 28.sp,
        letterSpacing = (-0.35).sp,
      ),
    titleLarge =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.2).sp,
      ),
    titleMedium =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 17.sp,
        lineHeight = 22.sp,
        letterSpacing = (-0.1).sp,
      ),
    titleSmall =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
      ),
    bodyLarge =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
      ),
    bodyMedium =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp,
      ),
    bodySmall =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 18.sp,
      ),
    labelLarge =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 13.sp,
        lineHeight = 18.sp,
      ),
    labelMedium =
      TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.4.sp,
      ),
  )

@Composable
fun PromoterTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
    typography = CorporateTypography,
    content = content,
  )
}
