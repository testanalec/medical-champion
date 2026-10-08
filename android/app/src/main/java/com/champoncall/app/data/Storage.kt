package com.champoncall.app.data

import android.content.Context
import android.content.SharedPreferences
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
    val lastStatus: String? = null,
    val lastLabel: String? = null,
)

private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences("champoncall", Context.MODE_PRIVATE)

/** Bookings made or found on this phone, so the customer can follow them later. */
object Bookings {
    private const val KEY = "bookings"

    fun all(context: Context): List<SavedBooking> {
        val raw = prefs(context).getString(KEY, null) ?: return emptyList()
        val arr = runCatching { Json.parseToJsonElement(raw) as? JsonArray }.getOrNull() ?: return emptyList()
        return arr.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val number = o.str("number") ?: return@mapNotNull null
            val token = o.str("token") ?: return@mapNotNull null
            SavedBooking(number, token, o.str("service") ?: "", o.str("createdAt")?.toLongOrNull() ?: 0L, o.str("lastStatus"), o.str("lastLabel"))
        }.sortedByDescending { it.createdAt }
    }

    fun find(context: Context, number: String): SavedBooking? = all(context).firstOrNull { it.number.equals(number, ignoreCase = true) }

    /** Adds or replaces a booking (keeps the original creation time and known status). */
    fun save(context: Context, booking: SavedBooking) {
        val existing = find(context, booking.number)
        val merged = if (existing == null) booking else booking.copy(
            createdAt = existing.createdAt,
            service = booking.service.ifBlank { existing.service },
            lastStatus = booking.lastStatus ?: existing.lastStatus,
            lastLabel = booking.lastLabel ?: existing.lastLabel,
        )
        write(context, all(context).filterNot { it.number.equals(booking.number, ignoreCase = true) } + merged)
    }

    fun updateStatus(context: Context, number: String, status: String, label: String, service: String? = null) {
        val list = all(context)
        if (list.none { it.number == number }) return
        write(context, list.map { if (it.number == number) it.copy(lastStatus = status, lastLabel = label, service = service ?: it.service) else it })
    }

    fun remove(context: Context, number: String) = write(context, all(context).filterNot { it.number == number })

    fun clear(context: Context) = prefs(context).edit().remove(KEY).apply()

    private fun write(context: Context, list: List<SavedBooking>) {
        val json = buildJsonArray {
            list.forEach { b ->
                add(buildJsonObject {
                    put("number", b.number)
                    put("token", b.token)
                    put("service", b.service)
                    put("createdAt", b.createdAt.toString())
                    put("lastStatus", b.lastStatus)
                    put("lastLabel", b.lastLabel)
                })
            }
        }
        prefs(context).edit().putString(KEY, json.toString()).apply()
    }
}

/** The customer's own details, remembered so the next booking is quicker. */
data class Profile(val name: String = "", val phone: String = "", val email: String = "") {
    companion object {
        fun load(context: Context): Profile {
            val p = prefs(context)
            return Profile(p.getString("profile_name", "") ?: "", p.getString("profile_phone", "") ?: "", p.getString("profile_email", "") ?: "")
        }

        fun save(context: Context, profile: Profile) {
            prefs(context).edit()
                .putString("profile_name", profile.name)
                .putString("profile_phone", profile.phone)
                .putString("profile_email", profile.email)
                .apply()
        }

        fun clear(context: Context) = save(context, Profile())
    }
}

object AppPrefs {
    fun onboarded(context: Context): Boolean = prefs(context).getBoolean("onboarded", false)
    fun setOnboarded(context: Context, value: Boolean = true) = prefs(context).edit().putBoolean("onboarded", value).apply()
    fun reset(context: Context) = prefs(context).edit().clear().apply()
}
