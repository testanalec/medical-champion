package com.champoncall.app

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.Links
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.push.Push
import com.champoncall.app.ui.AppRoot
import com.champoncall.app.ui.ChampTheme
import com.champoncall.app.ui.Destination
import com.champoncall.app.ui.Navigator
import com.champoncall.app.work.StatusWork

class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_REQUEST = "request_number"
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(0xFFFBF8F2.toInt(), 0xFF13213C.toInt()),
            navigationBarStyle = SystemBarStyle.light(0xFFFFFFFF.toInt(), 0xFF13213C.toInt()),
        )
        val start = if (savedInstanceState == null) destinationFrom(intent) else null
        Push.registerAll(this)
        StatusWork.schedule(this)
        askNotificationPermission()
        setContent {
            ChampTheme { AppRoot(start = start) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        destinationFrom(intent)?.let { Navigator.incoming.tryEmit(it) }
    }

    /** Notification taps carry a request number; links carry /track/… or /pay/… URLs. */
    private fun destinationFrom(intent: Intent?): Destination? {
        if (intent == null) return null
        intent.getStringExtra(EXTRA_REQUEST)?.let { return Destination.Track(it) }
        val url = intent.dataString ?: return null
        Links.parseTrack(url)?.let { (number, token) ->
            val saved = SavedBooking(number, token, "", System.currentTimeMillis())
            Bookings.save(this, saved)
            Push.register(saved)
            return Destination.Track(number)
        }
        Links.parsePay(url)?.let { (id, token) -> return Destination.Pay(id, token) }
        return null
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
