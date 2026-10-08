package com.champoncall.app.data

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.roundToLong

/** Formatting shared by every screen (pure Kotlin, unit tested). */
object Format {
    /** 1499.0 -> "₹1,499"; 123456.5 -> "₹1,23,456.50" (Indian digit grouping). */
    fun inr(amount: Double?): String {
        if (amount == null || amount.isNaN()) return "—"
        val paise = (abs(amount) * 100).roundToLong()
        val rupees = paise / 100
        val fraction = paise % 100
        val digits = rupees.toString()
        val grouped = if (digits.length <= 3) digits else {
            val head = digits.dropLast(3)
            val tail = digits.takeLast(3)
            head.reversed().chunked(2).joinToString(",").reversed() + "," + tail
        }
        val sign = if (amount < 0) "-" else ""
        return "$sign₹$grouped" + if (fraction != 0L) ".${fraction.toString().padStart(2, '0')}" else ""
    }

    /** 252 -> "4h 12m"; 45 -> "45m". */
    fun duration(minutes: Int?): String {
        if (minutes == null) return "—"
        val h = minutes / 60
        val m = minutes % 60
        return if (h > 0) "${h}h ${m}m" else "${m}m"
    }

    /** Parses the server's ISO timestamps ("2026-10-08T09:30:00.000Z", "+05:30" offsets too). */
    fun parseIso(iso: String?): Date? {
        if (iso.isNullOrBlank() || iso.length < 19) return null
        return try {
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            val base = parser.parse(iso.substring(0, 19)) ?: return null
            val offset = Regex("([+-])(\\d{2}):?(\\d{2})$").find(iso)
            if (offset != null && !iso.endsWith("Z")) {
                val (sign, hh, mm) = offset.destructured
                val ms = (hh.toLong() * 60 + mm.toLong()) * 60_000L
                Date(base.time - if (sign == "+") ms else -ms)
            } else base
        } catch (e: Exception) {
            null
        }
    }

    fun toIso(millis: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(millis))

    /** "3:00 pm" */
    fun time(iso: String?, zone: TimeZone = TimeZone.getDefault()): String? =
        parseIso(iso)?.let { SimpleDateFormat("h:mm a", Locale.ENGLISH).apply { timeZone = zone }.format(it).lowercase(Locale.ENGLISH) }

    /** "8 Oct, 3:00 pm" */
    fun dateTime(iso: String?, zone: TimeZone = TimeZone.getDefault()): String? =
        parseIso(iso)?.let { dateTime(it.time, zone) }

    fun dateTime(millis: Long, zone: TimeZone = TimeZone.getDefault()): String =
        SimpleDateFormat("d MMM, h:mm a", Locale.ENGLISH).apply { timeZone = zone }.format(Date(millis))
            .replace("AM", "am").replace("PM", "pm")

    fun digits(phone: String): String = phone.filter { it.isDigit() }
}

val URGENCY_LABEL = mapOf(
    "ASAP" to "ASAP",
    "WITHIN_2_HOURS" to "Within 2 hours",
    "LATER_TODAY" to "Later today",
    "SCHEDULED" to "Scheduled",
)

val RELATIONSHIPS = listOf("Mother", "Father", "Spouse", "Someone Else")

/** The 8 progress stages shown on the tracking screen (same as the website). */
object Stages {
    val all: List<Pair<String, Set<String>>> = listOf(
        "Received" to setOf("NEW", "AWAITING_CONFIRMATION"),
        "Confirmed" to setOf("SEARCHING_COMPANION", "COMPANION_ASSIGNED"),
        "Companion assigned" to setOf("COMPANION_ACCEPTED"),
        "On the way" to setOf("EN_ROUTE"),
        "With your loved one" to setOf("WITH_PATIENT"),
        "At hospital" to setOf("AT_HOSPITAL"),
        "Returning" to setOf("RETURNING"),
        "Completed" to setOf("COMPLETED"),
    )

    /** Index of the current stage, or -1 for cancelled / unfulfilled / unknown. */
    fun index(status: String?): Int = all.indexOfFirst { status in it.second }

    fun isFinal(status: String?): Boolean = status == "COMPLETED" || status == "CANCELLED" || status == "UNFULFILLED"
}

/** Reads the request number and token out of tracking and payment links. */
object Links {
    /** ".../track/MC-10452?t=abc123" -> (MC-10452, abc123) */
    fun parseTrack(url: String): Pair<String, String>? {
        if (!url.contains("/track/")) return null
        val number = url.substringAfter("/track/").substringBefore("?").substringBefore("/").trim()
        val token = query(url, "t")
        return if (number.isNotBlank() && !token.isNullOrBlank()) number to token else null
    }

    /** ".../pay/<id>?t=abc" -> (id, abc) */
    fun parsePay(url: String): Pair<String, String>? {
        if (!url.contains("/pay/")) return null
        val id = url.substringAfter("/pay/").substringBefore("?").substringBefore("/").trim()
        val token = query(url, "t")
        return if (id.isNotBlank() && !token.isNullOrBlank()) id to token else null
    }

    fun query(url: String, key: String): String? {
        val q = url.substringAfter("?", "")
        if (q.isEmpty()) return null
        return q.split("&").firstOrNull { it.substringBefore("=") == key }?.substringAfter("=", "")
            ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
    }
}
