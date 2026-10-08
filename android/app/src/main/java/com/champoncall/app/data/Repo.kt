package com.champoncall.app.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Every server call the app makes, in one place. */
object Repo {
    private val configState = MutableStateFlow(AppConfig())
    val config: StateFlow<AppConfig> = configState

    /** Loads business settings; keeps the last good copy (or defaults) when offline. */
    suspend fun refreshConfig(): AppConfig {
        val fresh = runCatching { (Api.get("/api/v1/public/config") as? JsonObject)?.let(Parse::config) }.getOrNull()
        if (fresh != null) configState.value = fresh
        return configState.value
    }

    fun resetConfig() {
        configState.value = AppConfig()
    }

    suspend fun places(query: String, type: String?): List<Place> {
        val q = "/api/v1/public/places?q=${Api.enc(query)}" + (type?.let { "&type=$it" } ?: "")
        return (Api.get(q) as? JsonArray)?.let(Parse::places) ?: emptyList()
    }

    suspend fun book(form: BookingForm, idempotencyKey: String): BookResult {
        val res = Api.post("/api/v1/requests", form.toJson(idempotencyKey)).asObj() ?: throw ApiException("Unexpected reply from server")
        val link = res.str("track_url")?.let(Links::parseTrack) ?: throw ApiException("Unexpected reply from server")
        return BookResult(link.first, link.second, res.bool("human_review_required") ?: false)
    }

    suspend fun track(number: String, token: String): TrackInfo {
        val o = Api.get("/api/v1/public/track/${Api.enc(number)}?t=${Api.enc(token)}").asObj() ?: throw ApiException("Unexpected reply from server")
        return Parse.track(o)
    }

    /** Finds a booking made anywhere (website, WhatsApp, phone) from its number + the mobile used. */
    suspend fun lookup(number: String, phone: String): Pair<String, String> {
        val res = Api.post("/api/v1/public/track-lookup", buildJsonObject {
            put("request_number", number.trim().uppercase())
            put("phone", phone.trim())
        }).asObj()
        return res?.str("track_url")?.let(Links::parseTrack) ?: throw ApiException("No request found for that ID and mobile number")
    }

    suspend fun rate(number: String, token: String, stars: Int, trustAgain: Boolean, comment: String, reason: String) {
        Api.post("/api/v1/public/track/${Api.enc(number)}/rating?t=${Api.enc(token)}", buildJsonObject {
            put("overall", stars)
            put("trust_again", trustAgain)
            put("comment", comment.trim().ifBlank { null })
            put("reason", reason.trim().ifBlank { null })
        })
    }

    suspend fun pay(id: String, token: String): PayInfo {
        val o = Api.get("/api/v1/public/pay/${Api.enc(id)}?t=${Api.enc(token)}").asObj() ?: throw ApiException("Unexpected reply from server")
        return Parse.pay(o)
    }

    /** Sandbox checkout (used until the live payment gateway is switched on). Returns the new status. */
    suspend fun checkout(id: String, token: String, method: String, success: Boolean): String {
        val o = Api.post("/api/v1/public/pay/${Api.enc(id)}/checkout?t=${Api.enc(token)}", buildJsonObject {
            put("method", method)
            put("outcome", if (success) "success" else "failure")
        }).asObj()
        return o?.str("status") ?: "PENDING"
    }
}
