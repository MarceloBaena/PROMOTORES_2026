package br.com.projetopromotor.android.data.repository

import br.com.projetopromotor.android.core.network.LoginRequestDto
import br.com.projetopromotor.android.core.network.PromoterApi
import br.com.projetopromotor.android.data.preferences.SessionPreferences
import br.com.projetopromotor.android.domain.models.SessionModel
import br.com.projetopromotor.android.domain.models.UserRole
import kotlinx.coroutines.flow.Flow

interface AuthRepository {
  val session: Flow<SessionModel?>

  suspend fun login(email: String, password: String): Result<SessionModel>

  suspend fun logout()
}

class AuthRepositoryImpl(
  private val api: PromoterApi,
  private val sessionPreferences: SessionPreferences,
) : AuthRepository {
  override val session: Flow<SessionModel?> = sessionPreferences.session

  override suspend fun login(email: String, password: String): Result<SessionModel> =
    runCatching {
      val response = api.login(
        LoginRequestDto(
          email = email,
          password = password,
        ),
      )

      val session =
        SessionModel(
          userId = response.user.id,
          userName = response.user.name,
          userRole = UserRole.valueOf(response.user.role),
          accessToken = response.accessToken,
          refreshToken = response.refreshToken,
        )

      sessionPreferences.saveSession(session)
      session
    }

  override suspend fun logout() {
    sessionPreferences.clearSession()
  }
}
