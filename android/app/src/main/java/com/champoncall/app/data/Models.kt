package com.champoncall.app.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

data class ServiceType(val id: String, val label: String)

data class PricingRule(
    val id: String,
    val name: String,
    val serviceType: String,
    val baseFee: Double,
    val includedMinutes: Int,
    val extensionPerHour: Double,
    val taxPercent: Double,
    val urgentSurcharge: Double,
) {
    val includedHours: Int get() = includedMinutes / 60
}

/** Business settings published by the server (contact numbers, services, prices). Defaults mirror the server's own. */
data class AppConfig(
    val brandName: String = "ChampOnCall",
    val tagline: String = "When you can't be there, we can.",
    val city: String = "Gurugram",
    val supportPhone: String = "+919205640777",
    val supportPhoneDisplay: String = "+91 92056 40777",
    val whatsappNumber: String = "919205640777",
    val whatsappPrefill: String = "Hi, I need a companion for my parent's hospital visit.",
    val supportEmail: String = "care@champoncall.com",
    val supportHours: String = "7 AM – 11 PM, all days",
    val emergencyNumber: String = "112",
    val emergencyLabel: String = "National Emergency Number",
    val ambulanceNumber: String = "108",
    val ambulanceLabel: String = "Ambulance",
    val services: List<ServiceType> = listOf(
        ServiceType("hospital_opd", "Hospital / OPD"),
        ServiceType("diagnostic", "Diagnostic Test"),
        ServiceType("admission", "Hospital Admission Support"),
        ServiceType("discharge", "Hospital Discharge"),
        ServiceType("doctor_appointment", "Doctor Appointment"),
        ServiceType("pharmacy", "Pharmacy / Reports Pickup"),
        ServiceType("not_sure", "Not Sure / Speak to Us"),
    ),
    val pricing: List<PricingRule> = listOf(
        PricingRule("default", "Medical Companion", "*", 1499.0, 240, 299.0, 18.0, 0.0),
        PricingRule("admission", "Admission Support", "admission", 1999.0, 360, 299.0, 18.0, 0.0),
    ),
    val areas: List<String> = listOf("Gurugram"),
    val verificationClaims: List<String> = listOf(
        "Government ID verified",
        "Background checked",
        "Trained in hospital navigation & escalation",
    ),
    val languages: List<String> = listOf("Hindi", "English", "Punjabi", "Haryanvi", "Bengali", "Tamil", "Telugu", "Marathi", "Urdu"),
    val loaded: Boolean = false,
) {
    fun generalRule(): PricingRule? = pricing.firstOrNull { it.serviceType == "*" } ?: pricing.firstOrNull()
    fun otherRules(): List<PricingRule> = generalRule().let { g -> pricing.filter { it !== g } }
    fun ruleFor(serviceType: String?): PricingRule? = pricing.firstOrNull { it.serviceType == serviceType } ?: generalRule()
}

data class Place(val name: String, val address: String, val lat: Double?, val lng: Double?, val inArea: Boolean?)

data class CompanionInfo(val name: String, val code: String?, val photoUrl: String?, val languages: List<String>)

data class Payment(
    val id: String?,
    val amount: Double?,
    val status: String?,
    val url: String?,
    val method: String?,
    val paidAt: String?,
) {
    val isUnpaid: Boolean get() = status in setOf("PENDING", "CREATED", "FAILED")
    val isPaid: Boolean get() = status == "PAID"
}

data class Breakdown(
    val baseFee: Double?,
    val includedMinutes: Int?,
    val extensionBlocks: Int,
    val extensionAmount: Double?,
    val urgentSurcharge: Double,
    val tax: Double,
    val taxPercent: Double?,
)

data class Expense(val category: String, val amount: Double?, val description: String?)
data class TimelineEvent(val type: String?, val label: String, val notes: String?, val createdAt: String?)
data class Rating(val overall: Int, val comment: String?)
data class Support(val phone: String?, val phoneDisplay: String?, val whatsapp: String?, val hours: String?)

data class TrackInfo(
    val number: String,
    val status: String,
    val statusLabel: String,
    val serviceType: String?,
    val urgency: String?,
    val requestedAt: String?,
    val patientRef: String?,
    val destination: String?,
    val companion: CompanionInfo?,
    val eta: String?,
    val actualArrival: String?,
    val durationMinutes: Int?,
    val completionType: String?,
    val finalAmount: Double?,
    val breakdown: Breakdown?,
    val paymentStatus: String?,
    val payment: Payment?,
    val expenses: List<Expense>,
    val timeline: List<TimelineEvent>,
    val rating: Rating?,
    val trustAgain: Boolean?,
    val canRate: Boolean,
    val humanReview: Boolean,
    val cancellationReason: String?,
    val support: Support,
    val emergencyNumber: String,
    val ambulanceNumber: String,
) {
    val isCompleted: Boolean get() = status == "COMPLETED"
    val isClosed: Boolean get() = status == "CANCELLED" || status == "UNFULFILLED"
}

data class PayInfo(
    val id: String,
    val amount: Double?,
    val status: String,
    val provider: String?,
    val requestNumber: String?,
    val durationMinutes: Int?,
    val expensesTotal: Double?,
    val method: String?,
    val paidAt: String?,
    val trackUrl: String?,
    val gatewayLive: Boolean,
    val link: String?,
    val failureReason: String?,
)

data class HistoryItem(
    val number: String,
    val token: String,
    val status: String,
    val statusLabel: String,
    val service: String,
    val createdAt: Long,
    val channel: String?,
)

data class HistoryResult(val phone: String, val token: String?, val items: List<HistoryItem>)

data class CodeResult(val demoCode: String?, val channel: String?)

data class BookResult(val number: String, val token: String, val humanReview: Boolean)

/** Converts server JSON into the models above. Pure Kotlin, so it is unit tested on the JVM. */
object Parse {
    fun config(o: JsonObject): AppConfig {
        val d = AppConfig()
        val brand = o.obj("brand")
        val contact = o.obj("contact")
        val emergency = o.obj("emergency")
        val services = o.arr("service_types").mapNotNull { el ->
            val s = el.asObj() ?: return@mapNotNull null
            val id = s.str("id") ?: return@mapNotNull null
            ServiceType(id, s.str("label") ?: id)
        }
        val pricing = o.arr("pricing").mapNotNull { el ->
            val p = el.asObj() ?: return@mapNotNull null
            PricingRule(
                id = p.str("id") ?: return@mapNotNull null,
                name = p.str("name") ?: "",
                serviceType = p.str("service_type") ?: "*",
                baseFee = p.dbl("base_fee") ?: return@mapNotNull null,
                includedMinutes = p.int("included_minutes") ?: 240,
                extensionPerHour = p.dbl("extension_rate_per_hour") ?: 0.0,
                taxPercent = p.dbl("tax_percent") ?: 0.0,
                urgentSurcharge = p.dbl("urgent_surcharge") ?: 0.0,
            )
        }
        val areas = o.arr("service_areas").mapNotNull { it.asObj()?.str("name") }
        return AppConfig(
            brandName = brand?.str("name") ?: d.brandName,
            tagline = brand?.str("tagline") ?: d.tagline,
            city = brand?.str("city") ?: d.city,
            supportPhone = contact?.str("support_phone") ?: d.supportPhone,
            supportPhoneDisplay = contact?.str("support_phone_display") ?: d.supportPhoneDisplay,
            whatsappNumber = contact?.str("whatsapp_number") ?: d.whatsappNumber,
            whatsappPrefill = contact?.str("whatsapp_prefill") ?: d.whatsappPrefill,
            supportEmail = contact?.str("support_email") ?: d.supportEmail,
            supportHours = contact?.str("support_hours") ?: d.supportHours,
            emergencyNumber = emergency?.str("primary_number") ?: d.emergencyNumber,
            emergencyLabel = emergency?.str("primary_label") ?: d.emergencyLabel,
            ambulanceNumber = emergency?.str("ambulance_number") ?: d.ambulanceNumber,
            ambulanceLabel = emergency?.str("ambulance_label") ?: d.ambulanceLabel,
            services = services.ifEmpty { d.services },
            pricing = pricing.ifEmpty { d.pricing },
            areas = areas.ifEmpty { d.areas },
            verificationClaims = o.strings("verification_claims").ifEmpty { d.verificationClaims },
            languages = o.obj("lists")?.strings("languages")?.ifEmpty { null } ?: d.languages,
            loaded = true,
        )
    }

    fun places(a: JsonArray): List<Place> = a.mapNotNull { el ->
        val p = el.asObj() ?: return@mapNotNull null
        val name = p.str("name") ?: return@mapNotNull null
        Place(name, p.str("address") ?: name, p.dbl("lat"), p.dbl("lng"), p.bool("in_area"))
    }

    fun track(o: JsonObject): TrackInfo {
        val c = o.obj("companion")
        val p = o.obj("payment")
        val b = o.obj("charge_breakdown")
        val s = o.obj("support")
        val e = o.obj("emergency")
        val r = o.obj("rating")
        return TrackInfo(
            number = o.str("request_number") ?: "",
            status = o.str("status") ?: "NEW",
            statusLabel = o.str("status_label") ?: o.str("status") ?: "",
            serviceType = o.str("service_type"),
            urgency = o.str("urgency"),
            requestedAt = o.str("requested_datetime"),
            patientRef = o.str("patient_ref"),
            destination = o.str("destination"),
            companion = c?.let {
                CompanionInfo(it.str("name") ?: it.str("first_name") ?: "Your companion", it.str("code"), it.str("photo_url"), it.strings("languages"))
            },
            eta = o.str("eta"),
            actualArrival = o.str("actual_arrival"),
            durationMinutes = o.int("duration_minutes"),
            completionType = o.str("completion_type"),
            finalAmount = o.dbl("final_amount"),
            breakdown = b?.let {
                Breakdown(
                    baseFee = it.dbl("base_fee"),
                    includedMinutes = it.int("included_minutes"),
                    extensionBlocks = it.int("extension_blocks") ?: 0,
                    extensionAmount = it.dbl("extension_amount"),
                    urgentSurcharge = it.dbl("urgent_surcharge") ?: 0.0,
                    tax = it.dbl("tax") ?: 0.0,
                    taxPercent = it.dbl("tax_percent"),
                )
            },
            paymentStatus = o.str("payment_status"),
            payment = p?.let { Payment(it.str("id"), it.dbl("amount"), it.str("status"), it.str("url"), it.str("method"), it.str("paid_at")) },
            expenses = o.arr("expenses").mapNotNull { el ->
                val x = el.asObj() ?: return@mapNotNull null
                Expense(x.str("category") ?: "Expense", x.dbl("amount"), x.str("description"))
            },
            timeline = o.arr("timeline").mapNotNull { el ->
                val x = el.asObj() ?: return@mapNotNull null
                TimelineEvent(x.str("event_type"), x.str("label") ?: x.str("event_type") ?: "", x.str("notes"), x.str("created_at"))
            },
            rating = r?.let { Rating(it.int("overall") ?: 0, it.str("comment")) },
            trustAgain = o.bool("trust_again"),
            canRate = o.bool("can_rate") ?: false,
            humanReview = o.bool("human_review_required") ?: false,
            cancellationReason = o.str("cancellation_reason"),
            support = Support(s?.str("phone"), s?.str("phone_display"), s?.str("whatsapp"), s?.str("hours")),
            emergencyNumber = e?.str("number") ?: "112",
            ambulanceNumber = e?.str("ambulance") ?: "108",
        )
    }

    fun history(o: JsonObject): HistoryResult = HistoryResult(
        phone = o.str("phone") ?: "",
        token = o.str("token"),
        items = o.arr("requests").mapNotNull { el ->
            val r = el.asObj() ?: return@mapNotNull null
            val link = r.str("track_url")?.let(Links::parseTrack) ?: return@mapNotNull null
            HistoryItem(
                number = link.first,
                token = link.second,
                status = r.str("status") ?: "NEW",
                statusLabel = r.str("status_label") ?: r.str("status") ?: "",
                service = r.str("service_type") ?: "",
                createdAt = Format.parseIso(r.str("created_at"))?.time ?: 0L,
                channel = r.str("channel"),
            )
        },
    )

    fun pay(o: JsonObject): PayInfo = PayInfo(
        id = o.str("id") ?: "",
        amount = o.dbl("amount"),
        status = o.str("status") ?: "PENDING",
        provider = o.str("provider"),
        requestNumber = o.str("request_number"),
        durationMinutes = o.int("duration_minutes"),
        expensesTotal = o.obj("breakdown")?.dbl("expenses"),
        method = o.str("method"),
        paidAt = o.str("paid_at"),
        trackUrl = o.str("track_url"),
        gatewayLive = o.bool("gateway_live") ?: false,
        link = o.str("link"),
        failureReason = o.str("failure_reason"),
    )
}
