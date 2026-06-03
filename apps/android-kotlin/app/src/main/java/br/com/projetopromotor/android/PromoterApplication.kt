package br.com.projetopromotor.android

import android.app.Application
import br.com.projetopromotor.android.core.AppContainer

class PromoterApplication : Application() {
  val container: AppContainer by lazy {
    AppContainer(this)
  }

  override fun onCreate() {
    super.onCreate()
    container.syncWorkScheduler.ensurePeriodicSync()
  }
}
