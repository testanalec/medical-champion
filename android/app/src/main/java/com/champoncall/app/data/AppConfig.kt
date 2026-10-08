package com.champoncall.app.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Business settings from the server (contact numbers, services, languages), with safe defaults. */
data class AppConfig(
    val supportPhone: String = "+911244000000",
    val supportPhoneDisplay: String = "+91 124 400 0000",
    val whatsappNumber: String = "919205640777",
    val whatsappPrefill: String = "Hi, I need a Champ.",
    val supportHours: String = "7 AM – 11 PM, all days",
    val emergencyNumber: String = "112",
    val services: List<Pair<String, String>> = listOf(
        "hospital_opd" to "Hospital / OPD",
        "diagnostic" to "Diagnostic Test",
        "admission" to "Hospital Admission Support",
        "discharge" to "Hospital Discharge",
        "doctor_appointment" to "Doctor Appointment",
        "pharmacy" to "Pharmacy / Reports Pickup",
        "not_sure" to "Not Sure / Speak to Us",
    ),
    val languages: List<String> = listOf("Hindi", "English", "Punjabi", "Haryanvi", "Bengali", "Tamil", "Telugu", "Marathi", "Urdu"),
) {
    companion object {
        @Volatile private var cached: AppConfig? = null

        suspend fun load(): AppConfig {
            cached?.let { return it }
            val fresh = runCatching { parse(Api.get("/api/v1/public/config") as JsonObject) }.getOrNull()
            if (fresh != null) cached = fresh
            return fresh ?: AppConfig()
        }

        private fun parse(o: JsonObject): AppConfig {
            val d = AppConfig()
            val contact = o.obj("contact")
            val emergency = o.obj("emergency")
            val services = o.arr("service_types").mapNotNull {
                val s = it as? JsonObject ?: return@mapNotNull null
                val id = s.str("id") ?: return@mapNotNull null
                id to (s.str("label") ?: id)
            }
            val languages = o.obj("lists")?.arr("languages")?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
            return d.copy(
                supportPhone = contact?.str("support_phone") ?: d.supportPhone,
                supportPhoneDisplay = contact?.str("support_phone_display") ?: d.supportPhoneDisplay,
                whatsappNumber = contact?.str("whatsapp_number") ?: d.whatsappNumber,
                whatsappPrefill = contact?.str("whatsapp_prefill") ?: d.whatsappPrefill,
                supportHours = contact?.str("support_hours") ?: d.supportHours,
                emergencyNumber = emergency?.str("primary_number") ?: d.emergencyNumber,
                services = services.ifEmpty { d.services },
                languages = languages.ifEmpty { d.languages },
            )
        }
    }
}
