package br.com.projetopromotor.android.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import br.com.projetopromotor.android.domain.models.SessionModel
import br.com.projetopromotor.android.domain.models.UserRole
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.sessionDataStore by preferencesDataStore(name = "promotor_session")

class SessionPreferences(private val context: Context) {
  private object Keys {
    val AccessToken = stringPreferencesKey("access_token")
    val RefreshToken = stringPreferencesKey("refresh_token")
    val UserId = stringPreferencesKey("user_id")
    val UserName = stringPreferencesKey("user_name")
    val UserRole = stringPreferencesKey("user_role")
    val DeviceId = stringPreferencesKey("device_id")
    val LastSyncAt = longPreferencesKey("last_sync_at")
  }

  val session: Flow<SessionModel?> =
    context.sessionDataStore.data
      .catch {
        if (it is IOException) {
          emit(emptyPreferences())
        } else {
          throw it
        }
      }
      .map(::toSession)

  suspend fun saveSession(session: SessionModel) {
    context.sessionDataStore.edit { preferences ->
      preferences[Keys.AccessToken] = session.accessToken
      preferences[Keys.RefreshToken] = session.refreshToken
      preferences[Keys.UserId] = session.userId
      preferences[Keys.UserName] = session.userName
      preferences[Keys.UserRole] = session.userRole.name
    }
  }

  suspend fun clearSession() {
    context.sessionDataStore.edit { preferences ->
      preferences.remove(Keys.AccessToken)
      preferences.remove(Keys.RefreshToken)
      preferences.remove(Keys.UserId)
      preferences.remove(Keys.UserName)
      preferences.remove(Keys.UserRole)
    }
  }

  suspend fun getAccessToken(): String? = context.sessionDataStore.data.first()[Keys.AccessToken]

  suspend fun getDeviceId(): String {
    val current = context.sessionDataStore.data.first()[Keys.DeviceId]

    if (!current.isNullOrBlank()) {
      return current
    }

    val generated = UUID.randomUUID().toString()
    context.sessionDataStore.edit { preferences ->
      preferences[Keys.DeviceId] = generated
    }
    return generated
  }

  suspend fun saveLastSyncAt(timestamp: Long) {
    context.sessionDataStore.edit { preferences ->
      preferences[Keys.LastSyncAt] = timestamp
    }
  }

  suspend fun getLastSyncAt(): Long? = context.sessionDataStore.data.first()[Keys.LastSyncAt]

  private fun toSession(preferences: Preferences): SessionModel? {
    val accessToken = preferences[Keys.AccessToken] ?: return null
    val refreshToken = preferences[Keys.RefreshToken] ?: return null
    val userId = preferences[Keys.UserId] ?: return null
    val userName = preferences[Keys.UserName] ?: return null
    val roleName = preferences[Keys.UserRole] ?: return null

    return SessionModel(
      userId = userId,
      userName = userName,
      userRole = UserRole.valueOf(roleName),
      accessToken = accessToken,
      refreshToken = refreshToken,
    )
  }
}
