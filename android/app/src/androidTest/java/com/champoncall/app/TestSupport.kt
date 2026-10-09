package com.champoncall.app

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.test.platform.app.InstrumentationRegistry
import com.champoncall.app.data.Api
import com.champoncall.app.data.AppPrefs
import com.champoncall.app.data.Repo
import com.champoncall.app.fixtures.Fixtures
import com.champoncall.app.ui.AppRoot
import com.champoncall.app.ui.ChampTheme
import com.champoncall.app.ui.Destination
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Before
import org.junit.Rule
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

data class Call(val method: String, val path: String, val body: String)

/** A fake ChampOnCall server: answers like the real one, and records what the app sent. */
class FakeServer : Dispatcher() {
    val calls = CopyOnWriteArrayList<Call>()
    val track = ConcurrentHashMap<String, String>()
    val pay = ConcurrentHashMap<String, String>()
    @Volatile var bookReply: String = Fixtures.bookReply()
    @Volatile var bookError: Pair<Int, String>? = null
    @Volatile var lookupNumber: String? = "MC-30003"

    fun bodyOf(pathPrefix: String): String? = calls.lastOrNull { it.path.startsWith(pathPrefix) }?.body

    private fun ok(json: String) = MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(json)
    private fun err(code: Int, message: String) = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json")
        .setBody("""{"error": "$message", "code": "error"}""")

    override fun dispatch(request: RecordedRequest): MockResponse {
        val full = request.path ?: ""
        val path = full.substringBefore("?")
        val body = request.body.readUtf8()
        calls += Call(request.method ?: "GET", full, body)
        return when {
            path == "/api/v1/public/config" -> ok(Fixtures.CONFIG)
            path == "/api/v1/public/places" -> ok(if (full.contains("type=hospital")) Fixtures.PLACES_HOSPITAL else Fixtures.PLACES_LOCALITY)
            path == "/api/v1/requests" -> bookError?.let { err(it.first, it.second) } ?: run {
                val number = Regex("\"request_number\": \"([^\"]+)\"").find(bookReply)?.groupValues?.get(1) ?: "MC-10452"
                track[number] = Fixtures.trackNew(number)
                ok(bookReply)
            }
            path == "/api/v1/public/track-lookup" -> lookupNumber?.let { n ->
                track.putIfAbsent(n, Fixtures.trackNew(n))
                ok(Fixtures.lookup(n))
            } ?: err(404, "No request found for that ID and mobile number")
            path.startsWith("/api/v1/public/track/") && path.endsWith("/push") -> ok("""{"ok": true}""")
            path.startsWith("/api/v1/public/track/") && path.endsWith("/rating") -> {
                val number = path.removePrefix("/api/v1/public/track/").removeSuffix("/rating")
                val paid = track[number]?.contains("\"payment_status\": \"PAID\"") == true
                track[number] = Fixtures.trackCompleted(number, paid = paid, rated = true)
                ok("""{"ok": true}""")
            }
            path.startsWith("/api/v1/public/track/") -> {
                val number = path.removePrefix("/api/v1/public/track/")
                track[number]?.let { ok(it) } ?: err(404, "We could not find this request. Please use the link from your WhatsApp messages.")
            }
            path.startsWith("/api/v1/public/pay/") && path.endsWith("/checkout") -> {
                val id = path.removePrefix("/api/v1/public/pay/").removeSuffix("/checkout")
                if (body.contains("\"failure\"")) {
                    ok("""{"ok": true, "status": "FAILED"}""")
                } else {
                    pay[id] = Fixtures.pay(id, paid = true)
                    track.keys.forEach { n -> if (track[n]?.contains("/pay/$id") == true) track[n] = Fixtures.trackCompleted(n, paid = true) }
                    ok("""{"ok": true, "status": "PAID"}""")
                }
            }
            path.startsWith("/api/v1/public/pay/") -> {
                val id = path.removePrefix("/api/v1/public/pay/")
                pay[id]?.let { ok(it) } ?: err(404, "Payment link not found")
            }
            else -> err(404, "Not found")
        }
    }
}

/** Saves full-screen screenshots (status bar, dialogs and all) next to the test results. */
object Screenshots {
    private val dir: File by lazy {
        val arg = InstrumentationRegistry.getArguments().getString("additionalTestOutputDir")
        val base = arg?.let { File(it) } ?: InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null)!!
        File(base, "screenshots").apply { mkdirs() }
    }

    fun take(name: String) {
        // Espresso drops its own debug images here; they are noise in the published screenshots
        dir.listFiles { f -> f.name.startsWith("view-op-error") }?.forEach { it.delete() }
        DeviceSetup.dismissSystemDialogs()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.waitForIdleSync()
        Thread.sleep(350)
        val full = instrumentation.uiAutomation.takeScreenshot() ?: return
        val small = Bitmap.createScaledBitmap(full, full.width / 2, full.height / 2, true)
        File(dir, "$name.png").outputStream().use { small.compress(Bitmap.CompressFormat.PNG, 100, it) }
        Log.i("Screenshots", "saved $name to $dir")
    }
}

/** Keeps the shared CI emulator tidy: no "X isn't responding" system pop-ups over our screens. */
object DeviceSetup {
    fun prepare() {
        val ui = InstrumentationRegistry.getInstrumentation().uiAutomation
        runCatching { ui.executeShellCommand("settings put global hide_error_dialogs 1").close() }
        dismissSystemDialogs()
    }

    fun dismissSystemDialogs() {
        runCatching {
            val device = androidx.test.uiautomator.UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            device.findObject(androidx.test.uiautomator.By.text("Wait"))?.click()
        }
    }
}

abstract class UiTest {
    @get:Rule
    val compose = createComposeRule()

    lateinit var server: MockWebServer
    val api = FakeServer()
    val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Before
    fun startServer() {
        server = MockWebServer()
        server.dispatcher = api
        server.start()
        DeviceSetup.prepare()
        Api.base = server.url("/").toString().trimEnd('/')
        AppPrefs.reset(context)
        AppPrefs.setOnboarded(context)
        Repo.resetConfig()
    }

    @After
    fun stopServer() {
        server.shutdown()
    }

    fun launch(start: Destination? = null) {
        compose.setContent { ChampTheme { AppRoot(start) } }
    }

    fun shot(name: String) {
        // Screenshots show the screen as a customer sees it, without the on-screen keyboard
        runCatching { androidx.test.espresso.Espresso.closeSoftKeyboard() }
        compose.waitForIdle()
        Screenshots.take(name)
    }
}

const val WAIT = 15_000L

fun ComposeTestRule.waitText(text: String, substring: Boolean = true) =
    waitUntil(WAIT) { onAllNodes(hasText(text, substring = substring)).fetchSemanticsNodes().isNotEmpty() }

fun ComposeTestRule.waitTag(tag: String) =
    waitUntil(WAIT) { onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty() }

fun ComposeTestRule.waitGone(tag: String) =
    waitUntil(WAIT) { onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isEmpty() }

/** Waits for the pop-up message at the bottom to go away (it would cover what we tap next). */
fun ComposeTestRule.waitSnackbarGone() =
    waitUntil(WAIT) { onAllNodes(hasTestTag("snackbar")).fetchSemanticsNodes().all { it.children.isEmpty() } }

fun ComposeTestRule.tap(tag: String) {
    waitSnackbarGone()
    waitTag(tag)
    onNodeWithTag(tag).performScrollTo().performClick()
}

fun ComposeTestRule.tapNoScroll(tag: String) {
    waitSnackbarGone()
    waitTag(tag)
    onNodeWithTag(tag).performClick()
}

fun SemanticsNodeInteractionsProvider.scrollHomeTo(text: String) {
    onNodeWithTag("home-list").performScrollToNode(hasText(text, substring = true))
}

fun SemanticsNodeInteractionsProvider.scrollHomeToTag(tag: String) {
    onNodeWithTag("home-list").performScrollToNode(hasTestTag(tag))
}
