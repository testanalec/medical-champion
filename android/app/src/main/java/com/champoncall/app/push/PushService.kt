package com.champoncall.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Push.onNewToken(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "ChampOnCall"
        val body = message.notification?.body ?: message.data["body"] ?: return
        Push.show(applicationContext, title, body, message.data["request_number"])
    }
}
