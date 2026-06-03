package br.com.projetopromotor.android

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.HomeWork
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import br.com.projetopromotor.android.core.AppContainer
import br.com.projetopromotor.android.domain.models.SessionModel
import br.com.projetopromotor.android.features.dashboard.DashboardRoute
import br.com.projetopromotor.android.features.history.HistoryRoute
import br.com.projetopromotor.android.features.login.LoginRoute
import br.com.projetopromotor.android.features.route.RouteRoute
import br.com.projetopromotor.android.features.sync.SyncQueueRoute
import br.com.projetopromotor.android.features.visit.VisitFlowRoute
import kotlinx.coroutines.flow.collect

private sealed class AppDestination(
  val route: String,
  val label: String,
) {
  data object Login : AppDestination("login", "Login")

  data object Dashboard : AppDestination("dashboard", "Dashboard")

  data object Route : AppDestination("route", "Roteiro")

  data object History : AppDestination("history", "Historico")

  data object Sync : AppDestination("sync", "Sync")

  data object Visit : AppDestination("visit/{routeStopId}", "Atendimento") {
    fun createRoute(routeStopId: String) = "visit/$routeStopId"
  }
}

@Composable
fun PromoterApp(appContainer: AppContainer) {
  val sessionState by produceState<SessionGateState>(initialValue = SessionGateState.Loading) {
    appContainer.authRepository.session.collect { session ->
      value = SessionGateState.Ready(session)
    }
  }

  when (val state = sessionState) {
    SessionGateState.Loading -> {
      Scaffold(
        modifier = Modifier.fillMaxSize(),
      ) { padding ->
        Text(
          text = "Preparando base offline do promotor...",
          modifier = Modifier.padding(padding).padding(24.dp),
          style = MaterialTheme.typography.titleLarge,
          fontWeight = FontWeight.SemiBold,
        )
      }
    }

    is SessionGateState.Ready -> {
      PromoterNavigation(
        appContainer = appContainer,
        session = state.session,
      )
    }
  }
}

@Composable
private fun PromoterNavigation(
  appContainer: AppContainer,
  session: SessionModel?,
) {
  val navController = rememberNavController()
  val currentBackStackEntry by navController.currentBackStackEntryAsState()
  val currentDestination = currentBackStackEntry?.destination
  val bottomDestinations =
    listOf(
      AppDestination.Dashboard,
      AppDestination.Route,
      AppDestination.History,
      AppDestination.Sync,
    )

  Scaffold(
    containerColor = MaterialTheme.colorScheme.background,
    topBar = {
      val currentRoute = currentDestination?.route
      if (session != null && currentRoute != AppDestination.Login.route) {
        PromoterTopBar(currentRoute = currentRoute)
      }
    },
    bottomBar = {
      val currentRoute = currentDestination?.route

      if (session != null && currentRoute != AppDestination.Login.route && currentRoute?.startsWith("visit/") != true) {
        NavigationBar(
          containerColor = MaterialTheme.colorScheme.surface,
          tonalElevation = 0.dp,
          windowInsets = WindowInsets.navigationBars,
        ) {
          bottomDestinations.forEach { destination ->
            NavigationBarItem(
              selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true,
              onClick = {
                navController.navigate(destination.route) {
                  popUpTo(navController.graph.findStartDestination().id) {
                    saveState = true
                  }
                  launchSingleTop = true
                  restoreState = true
                }
              },
              icon = {
                Icon(
                  imageVector =
                    when (destination) {
                      AppDestination.Dashboard -> Icons.Outlined.HomeWork
                      AppDestination.Route -> Icons.Outlined.FactCheck
                      AppDestination.History -> Icons.Outlined.History
                      AppDestination.Sync -> Icons.Outlined.Sync
                      else -> Icons.Outlined.HomeWork
                    },
                  contentDescription = destination.label,
                )
              },
              label = { Text(destination.label) },
            )
          }
        }
      }
    },
  ) { paddingValues ->
    PromoterNavHost(
      navController = navController,
      appContainer = appContainer,
      paddingValues = paddingValues,
      isAuthenticated = session != null,
    )
  }
}

@Composable
private fun PromoterTopBar(currentRoute: String?) {
  Surface(
    modifier = Modifier.fillMaxWidth(),
    color = MaterialTheme.colorScheme.surface,
    shadowElevation = 1.dp,
    tonalElevation = 0.dp,
  ) {
    Row(
      modifier =
        Modifier
          .fillMaxWidth()
          .padding(horizontal = 18.dp, vertical = 14.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      androidx.compose.foundation.layout.Column(
        modifier = Modifier.weight(1f),
      ) {
        Text(
          text = "Formula Campo",
          style = MaterialTheme.typography.labelMedium,
          color = MaterialTheme.colorScheme.primary,
          fontWeight = FontWeight.Bold,
        )
        Text(
          text = sectionTitleForRoute(currentRoute),
          style = MaterialTheme.typography.titleLarge,
          color = MaterialTheme.colorScheme.onSurface,
          fontWeight = FontWeight.SemiBold,
        )
      }
      Row(
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Icon(
          imageVector = Icons.Outlined.CloudDone,
          contentDescription = "Modo offline-first",
          tint = MaterialTheme.colorScheme.primary,
        )
        Text(
          text = "Offline-first",
          modifier = Modifier.padding(start = 6.dp),
          style = MaterialTheme.typography.labelLarge,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
    }
  }
}

@Composable
private fun PromoterNavHost(
  navController: NavHostController,
  appContainer: AppContainer,
  paddingValues: PaddingValues,
  isAuthenticated: Boolean,
) {
  NavHost(
    navController = navController,
    startDestination = if (isAuthenticated) AppDestination.Dashboard.route else AppDestination.Login.route,
    modifier = Modifier.padding(paddingValues),
  ) {
    composable(AppDestination.Login.route) {
      LoginRoute(
        appContainer = appContainer,
        onAuthenticated = {
          navController.navigate(AppDestination.Dashboard.route) {
            popUpTo(AppDestination.Login.route) {
              inclusive = true
            }
          }
        },
      )
    }
    composable(AppDestination.Dashboard.route) {
      DashboardRoute(
        appContainer = appContainer,
        onOpenRoute = {
          navController.navigate(AppDestination.Route.route)
        },
        onOpenHistory = {
          navController.navigate(AppDestination.History.route)
        },
        onOpenSync = {
          navController.navigate(AppDestination.Sync.route)
        },
        onOpenVisit = { routeStopId ->
          navController.navigate(AppDestination.Visit.createRoute(routeStopId))
        },
      )
    }
    composable(AppDestination.Route.route) {
      RouteRoute(
        appContainer = appContainer,
        onOpenVisit = { routeStopId ->
          navController.navigate(AppDestination.Visit.createRoute(routeStopId))
        },
      )
    }
    composable(AppDestination.History.route) {
      HistoryRoute(appContainer = appContainer)
    }
    composable(AppDestination.Sync.route) {
      SyncQueueRoute(appContainer = appContainer)
    }
    composable(AppDestination.Visit.route) { backStackEntry ->
      val routeStopId = backStackEntry.arguments?.getString("routeStopId").orEmpty()
      VisitFlowRoute(
        appContainer = appContainer,
        routeStopId = routeStopId,
        onBack = {
          navController.popBackStack()
        },
      )
    }
  }
}

private sealed interface SessionGateState {
  data object Loading : SessionGateState

  data class Ready(val session: SessionModel?) : SessionGateState
}

private fun sectionTitleForRoute(route: String?): String =
  when {
    route == AppDestination.Dashboard.route -> "Painel operacional"
    route == AppDestination.Route.route -> "Roteiro do dia"
    route == AppDestination.History.route -> "Historico local"
    route == AppDestination.Sync.route -> "Fila de sincronizacao"
    route?.startsWith("visit/") == true -> "Atendimento em campo"
    else -> "Workspace"
  }
