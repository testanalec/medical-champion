package com.champoncall.app.data

import android.content.Context
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class SavedBooking(
    val number: String,
    val token: String,
    val service: String,
    val createdAt: Long,
)

/** Bookings made or found on this phone, kept so the customer can follow them later. */
object Bookings {
    private const val PREFS = "champoncall"
    private const val KEY = "bookings"

    fun all(context: Context): List<SavedBooking> {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return emptyList()
        val arr = runCatching { Json.parseToJsonElement(raw) as? JsonArray }.getOrNull() ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val number = o.str("number") ?: return@mapNotNull null
            val token = o.str("token") ?: return@mapNotNull null
            SavedBooking(number, token, o.str("service") ?: "", o.str("createdAt")?.toLongOrNull() ?: 0L)
        }.sortedByDescending { it.createdAt }
    }

    fun find(context: Context, number: String): SavedBooking? = all(context).firstOrNull { it.number == number }

    fun save(context: Context, booking: SavedBooking) {
        val list = all(context).filterNot { it.number == booking.number } + booking
        val json = buildJsonArray {
            list.forEach { b ->
                add(buildJsonObject {
                    put("number", b.number)
                    put("token", b.token)
                    put("service", b.service)
                    put("createdAt", b.createdAt.toString())
                })
            }
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json.toString()).apply()
    }

    /** "/track/MC-10452?t=abc123" -> (MC-10452, abc123) */
    fun parseTrackUrl(url: String): Pair<String, String>? {
        val number = url.substringAfter("/track/", "").substringBefore("?")
        val token = url.substringAfter("t=", "").substringBefore("&")
        return if (number.isNotBlank() && token.isNotBlank()) number to token else null
    }
}
