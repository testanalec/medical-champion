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
import kotlinx.serialization.json.contentOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class ApiException(message: String) : Exception(message)

/** Talks to the ChampOnCall server (same API the website uses). */
object Api {
    val base: String = BuildConfig.API_BASE.trimEnd('/')

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun get(path: String): JsonElement = withContext(Dispatchers.IO) {
        execute(Request.Builder().url(base + path).get().build())
    }

    suspend fun post(path: String, body: JsonObject): JsonElement = withContext(Dispatchers.IO) {
        execute(Request.Builder().url(base + path).post(body.toString().toRequestBody(jsonType)).build())
    }

    private fun execute(request: Request): JsonElement {
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val parsed = runCatching { Json.parseToJsonElement(text) }.getOrNull()
                if (!response.isSuccessful) {
                    val message = (parsed as? JsonObject)?.str("error")
                    throw ApiException(message ?: "Something went wrong (${response.code}). Please try again.")
                }
                return parsed ?: JsonNull
            }
        } catch (e: IOException) {
            throw ApiException("Can't reach ChampOnCall. Please check your internet connection.")
        }
    }

    fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")
}

// ---- small helpers for reading loosely-typed JSON
fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
fun JsonObject.arr(key: String): JsonArray = (this[key] as? JsonArray) ?: JsonArray(emptyList())
fun JsonObject.bool(key: String): Boolean = str(key) == "true"
fun JsonElement.asObj(): JsonObject? = this as? JsonObject
