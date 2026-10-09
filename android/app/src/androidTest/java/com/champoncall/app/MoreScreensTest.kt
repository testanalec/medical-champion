package com.champoncall.app

import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextClearance
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.champoncall.app.data.AppPrefs
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.fixtures.Fixtures
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MoreScreensTest : UiTest() {

    @Test
    fun findABookingMadeOnTheWebsite() {
        launch()
        compose.tapNoScroll("tab-bookings")
        compose.tapNoScroll("bookings-find")
        compose.waitTag("find-number")
        compose.onNodeWithTag("find-number").performTextInput("mc-30003")
        compose.onNodeWithTag("find-phone").performTextInput("9871510465")
        compose.waitText("MC-30003")
        shot("50_find_booking")
        compose.tap("find-submit")
        compose.waitTag("track-status")
        compose.waitText("Request received")
        assertNotNull(Bookings.find(context, "MC-30003"))
        assertTrue(api.bodyOf("/api/v1/public/track-lookup")!!.contains("\"request_number\":\"MC-30003\""))
        compose.tapNoScroll("back")
        compose.waitTag("booking-MC-30003")
        shot("51_bookings_list")
    }

    @Test
    fun wrongDetailsShowAClearMessage() {
        api.lookupNumber = null
        launch()
        compose.tapNoScroll("tab-bookings")
        compose.tapNoScroll("bookings-find")
        compose.onNodeWithTag("find-number").performTextInput("MC-1")
        compose.onNodeWithTag("find-phone").performTextInput("9000000000")
        compose.tap("find-submit")
        compose.waitText("No request found for that ID and mobile number")
    }

    @Test
    fun bookingsListGroupsActiveAndPast() {
        Bookings.save(context, SavedBooking("MC-20001", Fixtures.TOKEN, "Hospital / OPD", System.currentTimeMillis()))
        Bookings.save(context, SavedBooking("MC-20002", Fixtures.TOKEN, "Hospital / OPD", System.currentTimeMillis() - 86_400_000L))
        api.track["MC-20001"] = Fixtures.trackEnRoute("MC-20001")
        api.track["MC-20002"] = Fixtures.trackCompleted("MC-20002", paid = true, rated = true)
        launch()
        compose.tapNoScroll("tab-bookings")
        compose.waitText("Companion on the way")
        compose.waitText("Completed")
        compose.waitText("ACTIVE")
        compose.waitText("PAST")
        shot("52_bookings_active_and_past")
        compose.tapNoScroll("booking-MC-20002")
        compose.waitTag("rating-done")
    }

    @Test
    fun helpAndPolicyPages() {
        launch()
        compose.tapNoScroll("tab-help")
        compose.waitTag("help")
        compose.waitText("Talk to a real person")
        compose.waitText("Medical emergency?")
        shot("60_help")
        listOf(
            "Safety & medical boundary" to "doc-safety",
            "Privacy notice" to "doc-privacy",
            "Terms of service" to "doc-terms",
            "Questions families ask" to "doc-faq",
        ).forEachIndexed { i, (label, tag) ->
            compose.onNodeWithText(label).performScrollTo().performClick()
            compose.waitTag(tag)
            shot("6${i + 1}_$tag")
            compose.tapNoScroll("back")
            compose.waitTag("help")
        }
    }

    @Test
    fun firstLaunchShowsIntroduction() {
        AppPrefs.setOnboarded(context, false)
        launch()
        compose.waitTag("onboarding")
        shot("70_onboarding_1")
        compose.tapNoScroll("onboarding-next")
        compose.waitText("Know what’s happening")
        shot("71_onboarding_2")
        compose.tapNoScroll("onboarding-next")
        compose.waitText("GET STARTED")
        shot("72_onboarding_3")
        compose.tapNoScroll("onboarding-next")
        compose.waitTag("hero-title")
        assertTrue(AppPrefs.onboarded(context))
    }

    @Test
    fun verifiedNumberShowsWhatsAppAndWebsiteBookings() {
        launch()
        compose.tapNoScroll("tab-bookings")
        compose.waitTag("bookings-verify")
        shot("53_bookings_verify_banner")
        compose.tapNoScroll("bookings-verify")
        compose.waitTag("verify-phone")
        compose.onNodeWithTag("verify-phone").performTextInput("9871510465")
        compose.tap("verify-send")
        compose.waitTag("verify-demo-code")
        compose.onNodeWithTag("verify-code").performTextInput("111111")
        compose.tap("verify-submit")
        compose.waitText("Incorrect OTP")
        compose.waitSnackbarGone()
        compose.onNodeWithTag("verify-code").performTextClearance()
        compose.onNodeWithTag("verify-code").performTextInput("123456")
        shot("54_verify_code")
        compose.tap("verify-submit")
        compose.waitTag("bookings-verified")
        compose.waitTag("booking-MC-61001")
        compose.waitTag("booking-MC-61002")
        compose.waitText("via WhatsApp")
        shot("55_bookings_all_channels")
        assertNotNull(com.champoncall.app.data.HistoryAuth.load(context))
        compose.tapNoScroll("booking-MC-61001")
        compose.waitText("Companion on the way")
    }
}
