package com.champoncall.app

import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.fixtures.Fixtures
import com.champoncall.app.ui.Destination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TrackTest : UiTest() {

    private fun save(number: String) =
        Bookings.save(context, SavedBooking(number, Fixtures.TOKEN, "Hospital / OPD", System.currentTimeMillis()))

    @Test
    fun liveTrackingShowsCompanionEtaAndTimeline() {
        save("MC-20001")
        api.track["MC-20001"] = Fixtures.trackEnRoute("MC-20001")
        launch(Destination.Track("MC-20001"))
        compose.waitText("Companion on the way")
        compose.waitTag("companion-name")
        compose.waitText("Amit Kumar")
        compose.waitText("CMP-101")
        compose.waitTag("eta")
        compose.waitTag("stages")
        shot("40_track_live")
        compose.waitText("Amit is on the way")
        compose.onNodeWithText("Need to talk to us?").performScrollTo()
        shot("41_track_timeline")
        // The saved booking now knows its latest status (used by notifications and "My bookings")
        assertEquals("EN_ROUTE", Bookings.find(context, "MC-20001")!!.lastStatus)
    }

    @Test
    fun completedVisitShowsBillThenPayThenRate() {
        save("MC-20002")
        api.track["MC-20002"] = Fixtures.trackCompleted("MC-20002")
        api.pay["pay-77"] = Fixtures.pay("pay-77")
        launch(Destination.Track("MC-20002"))
        compose.waitTag("summary")
        compose.waitText("₹2,654.46")
        compose.waitText("Extra time (2 × hour)")
        compose.waitText("Cab · Return cab (at actuals)")
        compose.onNodeWithTag("summary").performScrollTo()
        shot("42_track_visit_summary")

        compose.tap("pay-now")
        compose.waitTag("pay-amount")
        compose.waitText("₹2,654.46")
        shot("43_pay_checkout")
        compose.tap("method-card")
        compose.tap("pay-submit")
        compose.waitTag("pay-success")
        shot("44_pay_success")
        assertTrue(api.bodyOf("/api/v1/public/pay/pay-77/checkout")!!.contains("\"method\":\"card\""))

        compose.tap("pay-rate")
        compose.waitTag("rating")
        compose.waitText("Paid via UPI")
        compose.tap("star-5")
        compose.tap("trust-yes")
        compose.onNodeWithTag("rate-comment").performScrollTo().performTextInput("Priya was wonderful with Papa")
        shot("45_rating_form")
        compose.tap("rate-submit")
        compose.waitTag("rating-done")
        compose.waitText("Thank you for your feedback")
        shot("46_rating_thanks")
        val rating = api.bodyOf("/api/v1/public/track/MC-20002/rating")
        assertNotNull(rating)
        assertTrue(rating!!.contains("\"overall\":5"))
        assertTrue(rating.contains("\"trust_again\":true"))
    }

    @Test
    fun ratingNeedsStarsAndTrustAnswer() {
        save("MC-20002")
        api.track["MC-20002"] = Fixtures.trackCompleted("MC-20002", paid = true)
        launch(Destination.Track("MC-20002"))
        compose.waitTag("rating")
        compose.tap("rate-submit")
        compose.waitText("Please choose a star rating")
        compose.tap("star-4")
        compose.tap("rate-submit")
        compose.waitText("Please answer the trust question")
        compose.tap("trust-no")
        compose.waitTag("rate-reason")
        shot("47_rating_not_trusted")
    }

    @Test
    fun paymentLinkOpensCheckoutDirectly() {
        save("MC-20002")
        api.track["MC-20002"] = Fixtures.trackCompleted("MC-20002")
        api.pay["pay-77"] = Fixtures.pay("pay-77")
        launch(Destination.Pay("pay-77", Fixtures.TOKEN))
        compose.waitTag("pay-submit")
        compose.waitText("Sandbox gateway")
        compose.tap("pay-submit")
        compose.waitTag("pay-success")
    }

    @Test
    fun requestNotOnThisPhoneOffersToFindIt() {
        launch(Destination.Track("MC-99999"))
        compose.waitText("isn’t saved on this phone")
        shot("48_track_not_saved")
        compose.waitText("Find my request")
    }

    @Test
    fun invalidLinkShowsServerMessage() {
        save("MC-40404")
        launch(Destination.Track("MC-40404"))
        compose.waitTag("error-message")
        compose.waitText("We could not find this request")
        shot("49_track_error")
    }

    @Test
    fun cancelledRequestExplainsWhatHappened() {
        save("MC-50005")
        api.track["MC-50005"] = Fixtures.trackNew("MC-50005")
            .replace("\"status\": \"NEW\", \"status_label\": \"New\"", "\"status\": \"CANCELLED\", \"status_label\": \"Cancelled\"")
            .replace("\"cancellation_reason\": null", "\"cancellation_reason\": \"Customer cancelled\"")
        launch(Destination.Track("MC-50005"))
        compose.waitText("This request was cancelled — Customer cancelled")
    }
}
