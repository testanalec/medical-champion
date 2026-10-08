package com.champoncall.app

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.ContextCompat
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.champoncall.app.push.Push
import com.champoncall.app.ui.BookScreen
import com.champoncall.app.ui.ChampTheme
import com.champoncall.app.ui.FindScreen
import com.champoncall.app.ui.HomeScreen
import com.champoncall.app.ui.TrackScreen

class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_REQUEST = "request_number"
    }

    private val pendingTrack = mutableStateOf<String?>(null)
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingTrack.value = intent?.getStringExtra(EXTRA_REQUEST)
        Push.registerAll(this)
        askNotificationPermission()

        setContent {
            ChampTheme {
                val nav = rememberNavController()
                val target = pendingTrack.value
                LaunchedEffect(target) {
                    if (target != null) {
                        nav.navigate("track/$target") { launchSingleTop = true }
                        pendingTrack.value = null
                    }
                }
                NavHost(navController = nav, startDestination = "home") {
                    composable("home") {
                        HomeScreen(
                            onBook = { nav.navigate("book") },
                            onTrack = { nav.navigate("track/$it") },
                            onFind = { nav.navigate("find") },
                        )
                    }
                    composable("book") {
                        BookScreen(
                            onBack = { nav.popBackStack() },
                            onBooked = { number -> nav.navigate("track/$number") { popUpTo("home") } },
                        )
                    }
                    composable("find") {
                        FindScreen(
                            onBack = { nav.popBackStack() },
                            onFound = { number -> nav.navigate("track/$number") { popUpTo("home") } },
                        )
                    }
                    composable("track/{number}", arguments = listOf(navArgument("number") { type = NavType.StringType })) { entry ->
                        TrackScreen(
                            number = entry.arguments?.getString("number").orEmpty(),
                            onBack = { if (!nav.popBackStack()) finish() },
                            onFind = { nav.navigate("find") },
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_REQUEST)?.let { pendingTrack.value = it }
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
