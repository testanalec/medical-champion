package com.champoncall.app.fixtures

/**
 * Sample replies in exactly the shape the ChampOnCall server sends (see src/server/routes/public.ts).
 * Used by the JVM unit tests and by the mock server in the emulator tests.
 */
object Fixtures {
    const val TOKEN = "tok_9f2c1a7b5e"

    val CONFIG = """
    {
      "brand": {"name": "ChampOnCall", "tagline": "When you can't be there, we can.", "city": "Gurugram"},
      "contact": {"support_phone": "+911244000000", "support_phone_display": "+91 124 400 0000", "whatsapp_number": "919205640777",
                  "whatsapp_prefill": "Hi, I need a companion for my parent's hospital visit.", "support_email": "care@champoncall.com",
                  "support_hours": "7 AM – 11 PM, all days"},
      "emergency": {"primary_number": "112", "primary_label": "National Emergency Number", "ambulance_number": "108", "ambulance_label": "Ambulance"},
      "service_types": [
        {"id": "hospital_opd", "label": "Hospital / OPD"}, {"id": "diagnostic", "label": "Diagnostic Test"},
        {"id": "admission", "label": "Hospital Admission Support"}, {"id": "discharge", "label": "Hospital Discharge"},
        {"id": "doctor_appointment", "label": "Doctor Appointment"}, {"id": "pharmacy", "label": "Pharmacy / Reports Pickup"},
        {"id": "not_sure", "label": "Not Sure / Speak to Us"}
      ],
      "pricing": [
        {"id": "5b1d0c2e-1", "name": "Medical Companion", "service_type": "*", "base_fee": "1499.00", "included_minutes": 240,
         "extension_rate_per_hour": "299.00", "tax_percent": "18.00", "urgent_surcharge": "0.00"},
        {"id": "5b1d0c2e-2", "name": "Admission Support", "service_type": "admission", "base_fee": "1999.00", "included_minutes": 360,
         "extension_rate_per_hour": "299.00", "tax_percent": "18.00", "urgent_surcharge": "0.00"}
      ],
      "service_areas": [{"name": "Gurugram", "city": "Gurugram"}],
      "verification_claims": ["Government ID verified", "Background checked", "Trained in hospital navigation & escalation"],
      "lists": {"languages": ["Hindi", "English", "Punjabi", "Haryanvi", "Bengali", "Tamil", "Telugu", "Marathi", "Urdu"]},
      "demo_mode": true, "demo_accounts": [], "integrations": {"whatsapp": true, "razorpay": false, "sms": false}
    }
    """.trimIndent()

    val PLACES_LOCALITY = """
    [
      {"name": "Sushant Lok 1", "type": "locality", "lat": 28.4646, "lng": 77.0784, "address": "Sushant Lok Phase 1, Gurugram", "in_area": true},
      {"name": "Sushant Lok 2", "type": "locality", "lat": 28.4382, "lng": 77.0722, "address": "Sushant Lok Phase 2, Sector 56, Gurugram", "in_area": true}
    ]
    """.trimIndent()

    val PLACES_HOSPITAL = """
    [
      {"name": "Medanta – The Medicity", "type": "hospital", "lat": 28.4394, "lng": 77.0406, "address": "CH Baktawar Singh Rd, Sector 38, Gurugram", "in_area": true},
      {"name": "Max Hospital Gurugram", "type": "hospital", "lat": 28.4691, "lng": 77.0726, "address": "B Block, Sushant Lok 1, Gurugram", "in_area": true}
    ]
    """.trimIndent()

    fun bookReply(number: String = "MC-10452", review: Boolean = false) = """
    {"id": "c1a2", "request_number": "$number", "status": "NEW", "human_review_required": $review, "review_reasons": [],
     "track_url": "/track/$number?t=$TOKEN", "duplicate": false}
    """.trimIndent()

    private fun support() = """
      "support": {"phone": "+911244000000", "phone_display": "+91 124 400 0000", "whatsapp": "919205640777", "hours": "7 AM – 11 PM, all days"},
      "emergency": {"number": "112", "ambulance": "108"}
    """.trimIndent()

    fun trackNew(number: String = "MC-10452") = """
    {
      "request_number": "$number", "status": "NEW", "status_label": "New", "service_type": "Hospital / OPD", "urgency": "ASAP",
      "requested_datetime": "2026-10-08T06:30:00.000Z", "patient_ref": "your mother", "customer_name": "Rahul",
      "destination": "Medanta – The Medicity", "companion": null, "eta": null, "actual_arrival": null, "service_start_time": null,
      "service_end_time": null, "duration_minutes": null, "completion_type": null, "quoted_amount": "1499.00", "final_amount": null,
      "charge_breakdown": null, "payment_status": "NOT_DUE", "payment": null, "expenses": [],
      "timeline": [{"event_type": "created", "label": "Request received", "notes": null, "created_at": "2026-10-08T06:31:00.000Z"}],
      "rating": null, "trust_again": null, "can_rate": false, "human_review_required": false, "cancellation_reason": null,
      ${support()}
    }
    """.trimIndent()

    fun trackEnRoute(number: String = "MC-20001") = """
    {
      "request_number": "$number", "status": "EN_ROUTE", "status_label": "Companion on the way", "service_type": "Hospital / OPD", "urgency": "ASAP",
      "requested_datetime": "2026-10-08T06:30:00.000Z", "patient_ref": "your mother", "customer_name": "Rahul",
      "destination": "Medanta – The Medicity",
      "companion": {"first_name": "Amit", "name": "Amit Kumar", "code": "CMP-101", "photo_url": null, "languages": ["Hindi", "English"], "verified": true},
      "eta": "2026-10-08T07:25:00.000Z", "actual_arrival": null, "service_start_time": null, "service_end_time": null,
      "duration_minutes": null, "completion_type": null, "quoted_amount": "1499.00", "final_amount": null, "charge_breakdown": null,
      "payment_status": "NOT_DUE", "payment": null, "expenses": [],
      "timeline": [
        {"event_type": "created", "label": "Request received", "notes": null, "created_at": "2026-10-08T06:31:00.000Z"},
        {"event_type": "confirmed", "label": "Request confirmed", "notes": null, "created_at": "2026-10-08T06:33:00.000Z"},
        {"event_type": "assigned", "label": "Companion assigned — Amit K.", "notes": null, "created_at": "2026-10-08T06:35:00.000Z"},
        {"event_type": "accepted", "label": "Companion accepted", "notes": null, "created_at": "2026-10-08T06:36:00.000Z"},
        {"event_type": "en_route", "label": "Amit is on the way", "notes": "ETA 12:55", "created_at": "2026-10-08T06:40:00.000Z"}
      ],
      "rating": null, "trust_again": null, "can_rate": false, "human_review_required": false, "cancellation_reason": null,
      ${support()}
    }
    """.trimIndent()

    fun trackCompleted(number: String = "MC-20002", paid: Boolean = false, rated: Boolean = false) = """
    {
      "request_number": "$number", "status": "COMPLETED", "status_label": "Completed", "service_type": "Hospital / OPD", "urgency": "SCHEDULED",
      "requested_datetime": "2026-10-07T04:30:00.000Z", "patient_ref": "your father", "customer_name": "Rahul",
      "destination": "Max Hospital Gurugram",
      "companion": {"first_name": "Priya", "name": "Priya Sharma", "code": "CMP-104", "photo_url": null, "languages": ["Hindi", "English", "Punjabi"], "verified": true},
      "eta": "2026-10-07T04:20:00.000Z", "actual_arrival": "2026-10-07T04:18:00.000Z", "service_start_time": "2026-10-07T04:20:00.000Z",
      "service_end_time": "2026-10-07T09:32:00.000Z", "duration_minutes": 312, "completion_type": "Completed as planned",
      "quoted_amount": "1499.00", "final_amount": "2654.46",
      "charge_breakdown": {"rule_id": "5b1d0c2e-1", "rule_name": "Medical Companion", "base_fee": 1499, "included_minutes": 240,
        "duration_minutes": 312, "extra_minutes": 72, "extension_blocks": 2, "extension_amount": 598, "urgent_surcharge": 0,
        "subtotal": 2097, "tax_percent": 18, "tax": 377.46, "expenses": 180, "total": 2654.46},
      "payment_status": "${if (paid) "PAID" else "PENDING"}",
      "payment": {"id": "pay-77", "amount": "2654.46", "status": "${if (paid) "PAID" else "PENDING"}", "url": "https://champoncall.com/pay/pay-77?t=$TOKEN",
        "provider": "sandbox", "method": ${if (paid) "\"upi\"" else "null"}, "paid_at": ${if (paid) "\"2026-10-07T10:02:00.000Z\"" else "null"}},
      "expenses": [{"category": "Cab", "amount": "180.00", "description": "Return cab", "approval_status": "APPROVED"}],
      "timeline": [
        {"event_type": "created", "label": "Request received", "notes": null, "created_at": "2026-10-06T12:00:00.000Z"},
        {"event_type": "assigned", "label": "Companion assigned — Priya S.", "notes": null, "created_at": "2026-10-06T12:10:00.000Z"},
        {"event_type": "with_patient", "label": "Priya reached your father", "notes": null, "created_at": "2026-10-07T04:18:00.000Z"},
        {"event_type": "at_hospital", "label": "Reached Max Hospital Gurugram", "notes": null, "created_at": "2026-10-07T04:52:00.000Z"},
        {"event_type": "completed", "label": "Your father is home safely", "notes": null, "created_at": "2026-10-07T09:32:00.000Z"}
      ],
      "rating": ${if (rated) "{\"overall\": 5, \"comment\": \"Wonderful\"}" else "null"}, "trust_again": ${if (rated) "true" else "null"},
      "can_rate": ${!rated}, "human_review_required": false, "cancellation_reason": null,
      ${support()}
    }
    """.trimIndent()

    fun pay(id: String = "pay-77", paid: Boolean = false, number: String = "MC-20002") = """
    {"id": "$id", "amount": "2654.46", "currency": "INR", "status": "${if (paid) "PAID" else "PENDING"}", "provider": "sandbox",
     "request_number": "$number", "breakdown": {"base_fee": 1499, "expenses": 180, "total": 2654.46}, "duration_minutes": 312,
     "method": ${if (paid) "\"card\"" else "null"}, "paid_at": ${if (paid) "\"2026-10-07T10:02:00.000Z\"" else "null"},
     "track_url": "/track/$number?t=$TOKEN", "gateway_live": false, "link": "https://champoncall.com/pay/$id?t=$TOKEN", "failure_reason": null}
    """.trimIndent()

    fun lookup(number: String = "MC-30003") = """{"track_url": "/track/$number?t=$TOKEN"}"""

    const val NOT_FOUND = """{"error": "We could not find this request. Please use the link from your WhatsApp messages.", "code": "not_found"}"""
}
