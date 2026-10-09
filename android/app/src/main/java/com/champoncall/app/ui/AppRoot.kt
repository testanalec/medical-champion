package com.champoncall.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.champoncall.app.R
import com.champoncall.app.data.AppPrefs
import com.champoncall.app.data.Repo
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import android.os.Handler
import android.os.Looper

/** Where the app should go when opened from a notification or a link. */
sealed class Destination {
    data class Track(val number: String) : Destination()
    data class Pay(val id: String, val token: String) : Destination()
}

/** Destinations arriving while the app is already open (notifications, links). */
object Navigator {
    val incoming = MutableSharedFlow<Destination>(extraBufferCapacity = 4)
}

private data class Tab(val route: String, val label: String, val icon: Int)

private val TABS = listOf(
    Tab("home", "Home", R.drawable.fi_home),
    Tab("book", "Book", R.drawable.fi_plus),
    Tab("bookings", "My bookings", R.drawable.fi_list),
    Tab("help", "Help", R.drawable.fi_help_circle),
)
private val TAB_ROUTES = setOf("home", "bookings", "help")

@Composable
fun AppRoot(start: Destination? = null, nav: NavHostController = rememberNavController()) {
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val toast: (String) -> Unit = { msg -> scope.launch { snackbar.currentSnackbarData?.dismiss(); snackbar.showSnackbar(msg) } }
    val startRoute = remember { if (AppPrefs.onboarded(context)) "home" else "onboarding" }

    // Navigation must happen on the main thread; links and lookups can finish on a background thread.
    fun go(d: Destination): Unit = onMain {
        // The navigation graph is attached on the first frame; links can arrive just before that.
        if (runCatching { nav.graph }.isFailure) {
            onMainDelayed(50) { go(d) }
            return@onMain
        }
        when (d) {
            is Destination.Track -> nav.navigate("track/${d.number}") { launchSingleTop = true }
            is Destination.Pay -> nav.navigate("pay/${d.id}?t=${d.token}") { launchSingleTop = true }
        }
    }

    LaunchedEffect(Unit) {
        if (start != null && startRoute == "home") go(start)
        launch { Repo.refreshConfig() }
        Navigator.incoming.collect { go(it) }
    }

    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val tabs = route in TAB_ROUTES

    CompositionLocalProvider(LocalToast provides toast) {
        Scaffold(
            snackbarHost = { SnackbarHost(snackbar, Modifier.testTag("snackbar")) },
            bottomBar = {
                if (tabs) {
                    NavigationBar(containerColor = Color.White, tonalElevation = 0.dp) {
                        TABS.forEach { t ->
                            NavigationBarItem(
                                selected = route == t.route,
                                onClick = {
                                    if (t.route == "book") nav.navigate("book")
                                    else nav.navigate(t.route) {
                                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Ic(t.icon, size = 22.dp) },
                                label = { Text(t.label, fontSize = 11.sp) },
                                modifier = Modifier.testTag("tab-${t.route}"),
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = Brand.B800,
                                    selectedTextColor = Brand.B800,
                                    indicatorColor = Brand.Warm100,
                                    unselectedIconColor = Brand.Slate500,
                                    unselectedTextColor = Brand.Slate500,
                                ),
                            )
                        }
                    }
                }
            },
            containerColor = Brand.Warm50,
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                NavHost(nav, startDestination = startRoute) {
                    composable("onboarding") {
                        OnboardingScreen {
                            AppPrefs.setOnboarded(context)
                            nav.navigate("home") { popUpTo("onboarding") { inclusive = true } }
                            start?.let { go(it) }
                        }
                    }
                    composable("home") {
                        HomeScreen(
                            onBook = { nav.navigate("book") },
                            onTrack = { nav.navigate("track/$it") },
                            onFind = { nav.navigate("find") },
                            onDoc = { nav.navigate("doc/$it") },
                        )
                    }
                    composable("book") {
                        BookScreen(
                            onBack = { nav.popBackStack() },
                            onTrack = { n -> nav.navigate("track/$n") { popUpTo("book") { inclusive = true } } },
                            onHome = { nav.popBackStack("home", inclusive = false) },
                            onDoc = { nav.navigate("doc/$it") },
                        )
                    }
                    composable("bookings") {
                        BookingsScreen(
                            onTrack = { nav.navigate("track/$it") },
                            onBook = { nav.navigate("book") },
                            onFind = { nav.navigate("find") },
                        )
                    }
                    composable("help") {
                        HelpScreen(onDoc = { nav.navigate("doc/$it") }, onFind = { nav.navigate("find") })
                    }
                    composable("find") {
                        FindScreen(
                            onBack = { nav.popBackStack() },
                            onFound = { n -> onMain { nav.navigate("track/$n") { popUpTo("find") { inclusive = true } } } },
                        )
                    }
                    composable("track/{number}", arguments = listOf(navArgument("number") { type = NavType.StringType })) { e ->
                        TrackScreen(
                            number = e.arguments?.getString("number").orEmpty(),
                            onBack = { if (!nav.popBackStack()) nav.navigate("home") },
                            onFind = { nav.navigate("find") },
                            onPay = { id, t -> nav.navigate("pay/$id?t=$t") },
                        )
                    }
                    composable(
                        "pay/{id}?t={t}",
                        arguments = listOf(navArgument("id") { type = NavType.StringType }, navArgument("t") { type = NavType.StringType; defaultValue = "" }),
                    ) { e ->
                        PayScreen(
                            id = e.arguments?.getString("id").orEmpty(),
                            token = e.arguments?.getString("t").orEmpty(),
                            onBack = { if (!nav.popBackStack()) nav.navigate("home") },
                            onTrack = { n ->
                                if (!nav.popBackStack("track/{number}", inclusive = false)) nav.navigate("track/$n") { popUpTo("home") }
                            },
                        )
                    }
                    composable("doc/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { e ->
                        DocScreen(e.arguments?.getString("id").orEmpty(), onBack = { nav.popBackStack() })
                    }
                }
            }
        }
    }
}


private val mainHandler = Handler(Looper.getMainLooper())

fun onMainDelayed(ms: Long, block: () -> Unit) {
    mainHandler.postDelayed(block, ms)
}

/** Runs [block] on the main thread (immediately if already there). */
fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post(block)
}
