package com.champoncall.app.data

import com.champoncall.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class ApiException(message: String, val status: Int = 0) : Exception(message)

/** Talks to the ChampOnCall server: the same public API the website uses. */
object Api {
    /** Server address. Tests point this at a local mock server. */
    @Volatile
    var base: String = BuildConfig.API_BASE.trimEnd('/')

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun get(path: String): JsonElement = withContext(Dispatchers.IO) {
        execute(request(path).get().build())
    }

    suspend fun post(path: String, body: JsonObject): JsonElement = withContext(Dispatchers.IO) {
        execute(request(path).post(body.toString().toRequestBody(jsonType)).build())
    }

    private fun request(path: String) = Request.Builder()
        .url(absolute(path))
        .header("Accept", "application/json")
        .header("X-Client", "champoncall-android/${BuildConfig.VERSION_NAME}")

    private fun execute(request: Request): JsonElement {
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val parsed = runCatching { Json.parseToJsonElement(text) }.getOrNull()
                if (!response.isSuccessful) {
                    val message = (parsed as? JsonObject)?.str("error")
                    throw ApiException(message ?: "Something went wrong (${response.code}). Please try again.", response.code)
                }
                return parsed ?: JsonNull
            }
        } catch (e: IOException) {
            throw ApiException("Can't reach ChampOnCall. Please check your internet connection.")
        }
    }

    /** "/pay/x" -> "https://server/pay/x"; full URLs are returned unchanged. */
    fun absolute(pathOrUrl: String): String =
        if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) pathOrUrl else base + pathOrUrl

    fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")
}

// ---- small helpers for reading loosely-typed JSON
fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
fun JsonObject.arr(key: String): JsonArray = (this[key] as? JsonArray) ?: JsonArray(emptyList())
fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.let { if (it is JsonNull) null else it.booleanOrNull ?: it.contentOrNull?.toBooleanStrictOrNull() }
fun JsonObject.dbl(key: String): Double? = str(key)?.toDoubleOrNull()
fun JsonObject.int(key: String): Int? = str(key)?.toDoubleOrNull()?.toInt()
fun JsonObject.strings(key: String): List<String> = arr(key).mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
fun JsonElement.asObj(): JsonObject? = this as? JsonObject
