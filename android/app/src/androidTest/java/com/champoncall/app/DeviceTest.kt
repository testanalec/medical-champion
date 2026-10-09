package com.champoncall.app

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.test.uiautomator.UiDevice
import com.champoncall.app.data.Api
import com.champoncall.app.data.AppPrefs
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.Repo
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.fixtures.Fixtures
import com.champoncall.app.work.StatusWorker
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Runs the real app (launcher activity, links, background checks, notifications). */
@RunWith(AndroidJUnit4::class)
class DeviceTest {
    @get:Rule val compose = createEmptyComposeRule()
    @get:Rule val notifications: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)

    private lateinit var server: MockWebServer
    private val api = FakeServer()
    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Before
    fun setUp() {
        server = MockWebServer()
        server.dispatcher = api
        server.start()
        Api.base = server.url("/").toString().trimEnd('/')
        AppPrefs.reset(context)
        AppPrefs.setOnboarded(context)
        Repo.resetConfig()
        context.getSystemService(NotificationManager::class.java).cancelAll()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun launcherOpensHome() {
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.waitTag("hero-title")
            Screenshots.take("80_app_launch")
        }
    }

    @Test
    fun trackingLinkFromWhatsAppOpensTheRequestInTheApp() {
        api.track["MC-20001"] = Fixtures.trackEnRoute("MC-20001")
        val link = Intent(Intent.ACTION_VIEW, Uri.parse("https://champoncall.com/track/MC-20001?t=${Fixtures.TOKEN}"))
            .setClass(context, MainActivity::class.java)
        ActivityScenario.launch<MainActivity>(link).use {
            compose.waitTag("track-status")
            compose.waitText("Amit Kumar")
            Screenshots.take("81_link_opens_tracking")
        }
        val saved = Bookings.find(context, "MC-20001")
        assertNotNull(saved)
        assertEquals(Fixtures.TOKEN, saved!!.token)
    }

    @Test
    fun notificationTapOpensTheRequest() {
        Bookings.save(context, SavedBooking("MC-20001", Fixtures.TOKEN, "Hospital / OPD", System.currentTimeMillis()))
        api.track["MC-20001"] = Fixtures.trackEnRoute("MC-20001")
        val tap = Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_REQUEST, "MC-20001")
        ActivityScenario.launch<MainActivity>(tap).use {
            compose.waitTag("track-status")
            compose.waitText("Companion on the way")
        }
    }

    @Test
    fun backgroundCheckNotifiesWhenStatusChanges() {
        Bookings.save(context, SavedBooking("MC-20001", Fixtures.TOKEN, "Hospital / OPD", System.currentTimeMillis(), "COMPANION_ACCEPTED", "Companion accepted"))
        api.track["MC-20001"] = Fixtures.trackEnRoute("MC-20001")
        runBlocking { StatusWorker.checkAll(context) }

        assertEquals("EN_ROUTE", Bookings.find(context, "MC-20001")!!.lastStatus)
        val shown = context.getSystemService(NotificationManager::class.java).activeNotifications
        val n = shown.firstOrNull { it.notification.extras.getString("android.title") == "ChampOnCall · MC-20001" }
        assertNotNull("a status notification should be shown", n)
        assertTrue(n!!.notification.extras.getCharSequence("android.text").toString().contains("Amit Kumar is on the way"))

        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        device.openNotification()
        device.waitForIdle()
        Thread.sleep(2500)
        Screenshots.take("82_status_notification")
        device.pressBack()

        // No second notification when nothing changed
        context.getSystemService(NotificationManager::class.java).cancelAll()
        runBlocking { StatusWorker.checkAll(context) }
        assertTrue(context.getSystemService(NotificationManager::class.java).activeNotifications.isEmpty())
    }
}
