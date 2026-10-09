package com.champoncall.app

import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.Profile
import com.champoncall.app.fixtures.Fixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BookTest : UiTest() {

    private fun type(tag: String, text: String) {
        compose.waitTag(tag)
        compose.onNodeWithTag(tag).performScrollTo().performTextInput(text)
    }

    private fun openForm() {
        launch()
        compose.tapNoScroll("hero-book")
        compose.waitTag("emergency-gate")
    }

    private fun fillRequired() {
        compose.tap("rel-Mother")
        type("book-pickup", "B-12, Sushant Lok 1")
        compose.tap("svc-hospital_opd")
        compose.tap("urg-ASAP")
        compose.tap("mob-INDEPENDENT")
        type("book-name", "Rahul Kumar")
        type("book-phone", "9871510465")
        compose.tap("book-consent")
    }

    @Test
    fun completeBookingFlow() {
        openForm()
        shot("20_book_emergency_gate")
        compose.tapNoScroll("gate-continue")
        compose.waitGone("emergency-gate")
        compose.waitTag("book-form")
        shot("21_book_form_top")

        // Submitting an empty form explains what is missing
        compose.tap("book-submit")
        compose.waitText("Please add: who needs help")
        shot("22_book_validation")
        compose.waitSnackbarGone()

        compose.tap("rel-Mother")
        type("book-patient-name", "Kamla Devi")
        type("book-age", "72")
        compose.tap("lang-Hindi")

        type("book-pickup", "Sushant")
        compose.waitTag("book-pickup-option-0")
        shot("23_book_place_suggestions")
        compose.tap("book-pickup-option-0")
        compose.waitTag("pinned")

        compose.tap("svc-hospital_opd")
        type("book-dest", "Med")
        compose.waitTag("book-dest-option-0")
        compose.tap("book-dest-option-0")
        shot("24_book_where_and_what")

        compose.tap("urg-ASAP")
        compose.tap("mob-INDEPENDENT")
        type("book-notes", "Uses a walker")
        type("book-name", "Rahul Kumar")
        type("book-phone", "9871510465")
        compose.tap("book-consent")
        compose.onNodeWithTag("estimate").performScrollTo()
        compose.waitText("₹1,499")
        shot("25_book_ready_to_confirm")

        compose.tap("book-submit")
        compose.waitTag("book-success")
        compose.waitText("MC-10452")
        shot("26_book_success")

        // What the app sent to the server
        val sent = api.bodyOf("/api/v1/requests")
        assertNotNull(sent)
        listOf(
            "\"relationship\":\"Mother\"", "\"patient_name\":\"Kamla Devi\"", "\"patient_age\":72", "\"patient_language\":\"Hindi\"",
            "Sushant Lok Phase 1", "\"pickup_lat\":28.4646", "\"service_type\":\"hospital_opd\"",
            "\"destination_name\":\"Medanta – The Medicity\"", "\"urgency\":\"ASAP\"", "\"mobility\":\"INDEPENDENT\"",
            "\"special_instructions\":\"Uses a walker\"", "\"customer_name\":\"Rahul Kumar\"", "\"customer_phone\":\"9871510465\"",
            "\"consent\":true", "\"emergency_acknowledged\":true", "\"utm_source\":\"android_app\"",
        ).forEach { assertTrue("request should contain $it but was $sent", sent!!.contains(it)) }

        // Saved on the phone for later
        assertNotNull(Bookings.find(context, "MC-10452"))
        assertEquals("Rahul Kumar", Profile.load(context).name)

        compose.tap("book-track")
        compose.waitTag("track-status")
        compose.waitText("Request received")
        shot("27_track_after_booking")
    }

    @Test
    fun bedriddenShowsCareTeamNotice() {
        openForm()
        compose.tapNoScroll("gate-continue")
        compose.tap("mob-BEDRIDDEN")
        compose.waitText("A care team member will personally review this")
        shot("28_book_bedridden_notice")
    }

    @Test
    fun scheduledVisitAsksForDateAndTime() {
        openForm()
        compose.tapNoScroll("gate-continue")
        fillRequired()
        compose.tap("urg-SCHEDULED")
        compose.tap("book-submit")
        compose.waitText("date & time")
        compose.tap("book-datetime")
        compose.waitTag("date-ok")
        shot("29_book_date_picker")
        compose.tapNoScroll("date-ok")
        compose.waitTag("time-ok")
        shot("29b_book_time_picker")
    }

    @Test
    fun serverErrorsAreShownToTheCustomer() {
        api.bookError = 400 to "Please enter a valid mobile number"
        openForm()
        compose.tapNoScroll("gate-continue")
        fillRequired()
        compose.tap("book-submit")
        compose.waitText("Please enter a valid mobile number")
        shot("30_book_server_error")
    }

    @Test
    fun secondBookingRemembersCustomerDetails() {
        Profile.save(context, Profile("Rahul Kumar", "9871510465", ""))
        openForm()
        compose.tapNoScroll("gate-continue")
        compose.onNodeWithTag("book-name").performScrollTo()
        compose.waitText("Rahul Kumar")
        compose.waitText("9871510465")
    }

    @Test
    fun humanReviewMessageAfterBooking() {
        api.bookReply = Fixtures.bookReply("MC-10460", review = true)
        openForm()
        compose.tapNoScroll("gate-continue")
        fillRequired()
        compose.tap("book-submit")
        compose.waitTag("book-success")
        compose.waitText("a care team member will call you personally")
    }

    @Test
    fun whatsAppBookingIsOfferedOnTheForm() {
        openForm()
        compose.tapNoScroll("gate-continue")
        compose.waitTag("book-whatsapp-card")
        compose.waitTag("book-whatsapp")
        compose.waitText("Prefer to chat? Book on WhatsApp")
    }

    @Test
    fun pickupCanBePickedOnTheMap() {
        openForm()
        compose.tapNoScroll("gate-continue")
        compose.tap("book-map")
        compose.waitTag("map-picker")
        Thread.sleep(4000) // let map tiles load for the screenshot
        shot("31_book_map_picker")
        compose.tapNoScroll("map-confirm")
        compose.waitGone("map-picker")
        compose.waitTag("pinned")
        shot("32_book_map_pinned")
    }
}
