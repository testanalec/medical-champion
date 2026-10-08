package com.champoncall.app.push

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.champoncall.app.ChampApp
import com.champoncall.app.MainActivity
import com.champoncall.app.R
import com.champoncall.app.data.Api
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.SavedBooking
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Links this phone to the customer's bookings so the server can send push updates. */
object Push {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private fun withToken(block: (String) -> Unit) {
        try {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                if (!token.isNullOrBlank()) block(token)
            }
        } catch (e: Exception) {
            // Firebase isn't configured in this build: push is simply unavailable.
        }
    }

    fun register(booking: SavedBooking) = withToken { token -> send(booking, token) }

    fun registerAll(context: Context) = withToken { token -> Bookings.all(context).forEach { send(it, token) } }

    fun onNewToken(context: Context, token: String) = Bookings.all(context).forEach { send(it, token) }

    private fun send(booking: SavedBooking, token: String) {
        scope.launch {
            runCatching {
                Api.post(
                    "/api/v1/public/track/${Api.enc(booking.number)}/push",
                    buildJsonObject {
                        put("t", booking.token)
                        put("token", token)
                        put("platform", "android")
                    },
                )
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun show(context: Context, title: String, body: String, requestNumber: String?) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (requestNumber != null) putExtra(MainActivity.EXTRA_REQUEST, requestNumber)
        }
        val pending = PendingIntent.getActivity(
            context,
            (requestNumber ?: "x").hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, ChampApp.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.gold))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        NotificationManagerCompat.from(context).notify((requestNumber ?: title).hashCode(), notification)
    }
}
