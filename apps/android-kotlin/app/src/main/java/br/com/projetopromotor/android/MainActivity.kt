package br.com.projetopromotor.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import br.com.projetopromotor.android.ui.theme.PromoterTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      PromoterTheme {
        PromoterApp(appContainer = (application as PromoterApplication).container)
      }
    }
  }
}
