package com.champoncall.app.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/** Everything the "Request a companion" form collects (same fields as the website form). */
data class BookingForm(
    val relationship: String = "",
    val patientName: String = "",
    val patientAge: String = "",
    val patientLanguage: String = "",
    val patientPhone: String = "",
    val pickupText: String = "",
    val pickupLat: Double? = null,
    val pickupLng: Double? = null,
    val pickupInArea: Boolean? = null,
    val serviceType: String = "",
    val destText: String = "",
    val destLat: Double? = null,
    val destLng: Double? = null,
    val urgency: String = "",
    val requestedAtMillis: Long? = null,
    val mobility: String = "",
    val instructions: String = "",
    val customerName: String = "",
    val customerPhone: String = "",
    val customerEmail: String = "",
    val consent: Boolean = false,
) {
    /** Human-readable list of what is still missing, in form order. Empty when the form can be sent. */
    fun missing(now: Long = System.currentTimeMillis()): List<String> = buildList {
        if (relationship.isBlank()) add("who needs help")
        if (pickupText.isBlank()) add("pickup address")
        if (serviceType.isBlank()) add("type of help")
        if (urgency.isBlank()) add("when")
        if (urgency == "SCHEDULED") {
            val at = requestedAtMillis
            if (at == null) add("date & time")
            else if (at < now + 29 * 60_000L) add("a time at least 30 minutes from now")
        }
        if (mobility.isBlank()) add("mobility")
        if (customerName.isBlank()) add("your name")
        if (customerPhone.isBlank()) add("your mobile")
        else if (Format.digits(customerPhone).length < 10) add("a valid 10-digit mobile number")
    }

    fun error(now: Long = System.currentTimeMillis()): String? {
        val m = missing(now)
        if (m.isNotEmpty()) return "Please add: ${m.joinToString(", ")}"
        if (!consent) return "Please accept the privacy notice and terms"
        return null
    }

    fun toJson(idempotencyKey: String): JsonObject = buildJsonObject {
        put("relationship", relationship)
        put("patient_name", patientName.trim().ifBlank { null })
        put("patient_age", patientAge.toIntOrNull())
        put("patient_language", patientLanguage.ifBlank { null })
        put("patient_phone", patientPhone.trim().ifBlank { null })
        put("pickup_address", pickupText.trim())
        put("pickup_lat", pickupLat)
        put("pickup_lng", pickupLng)
        put("pickup_source", if (pickupLat != null) "app_pin" else "typed")
        put("service_type", serviceType)
        put("destination_name", destText.trim().ifBlank { null })
        put("destination_lat", destLat)
        put("destination_lng", destLng)
        put("urgency", urgency)
        put("requested_at", if (urgency == "SCHEDULED") requestedAtMillis?.let { Format.toIso(it) } else null)
        put("mobility", mobility)
        put("special_instructions", instructions.trim().ifBlank { null })
        put("customer_name", customerName.trim())
        put("customer_phone", customerPhone.trim())
        put("customer_email", customerEmail.trim().ifBlank { null })
        put("consent", consent)
        put("emergency_acknowledged", true)
        put("idempotency_key", idempotencyKey)
        putJsonObject("utm") {
            put("utm_source", "android_app")
            put("utm_medium", "app")
        }
    }

    companion object {
        val URGENCIES = listOf("ASAP" to "ASAP", "WITHIN_2_HOURS" to "Within 2 hours", "LATER_TODAY" to "Later today", "SCHEDULED" to "Schedule")
        val MOBILITY = listOf("INDEPENDENT" to "Yes", "NEEDS_ASSISTANCE" to "Needs some assistance", "BEDRIDDEN" to "No / Bedridden")
        const val INSTRUCTIONS_MAX = 300
    }
}
