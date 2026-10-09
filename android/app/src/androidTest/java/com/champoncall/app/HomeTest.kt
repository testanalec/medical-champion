package com.champoncall.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.fixtures.Fixtures
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HomeTest : UiTest() {

    @Test
    fun landingPageHasEverySectionOfTheWebsite() {
        launch()
        compose.waitTag("hero-title")
        compose.onNodeWithText("Your parents need help.").assertIsDisplayed()
        compose.waitText("Serving Gurugram")
        shot("01_home_top")

        compose.scrollHomeTo("Someone will be there.")
        compose.waitText("We assign a verified companion")
        shot("02_home_how_it_works")

        compose.scrollHomeTo("Every part of the hospital visit")
        compose.waitText("Hospital accompaniment")
        shot("03_home_services")

        compose.scrollHomeTo("Know exactly what’s happening")
        shot("04_home_stay_informed")

        compose.scrollHomeTo("Clear about what we do")
        compose.waitText("Government ID verified")
        shot("05_home_trust_safety")

        compose.scrollHomeToTag("price-general")
        compose.waitText("₹1,499")
        compose.waitText("first 4 hours · then ₹299/hour")
        compose.waitText("₹1,999")
        shot("06_home_pricing")

        compose.scrollHomeTo("Hospitals our companions visit regularly")
        shot("07_home_where_we_work")

        compose.scrollHomeTo("Things families ask us")
        compose.scrollHomeToTag("faq-0")
        compose.onNodeWithTag("faq-0").performClick()
        compose.waitText("Our companions are trained, verified people")
        shot("08_home_faq")

        compose.scrollHomeToTag("footer")
        compose.waitText("Privacy notice")
        shot("09_home_footer")
    }

    @Test
    fun whatsAppButtonAsksAboutEmergencyFirst() {
        launch()
        compose.tapNoScroll("hero-whatsapp")
        compose.waitTag("emergency-gate")
        compose.onNodeWithText("CALL EMERGENCY SERVICE (112)").assertIsDisplayed()
        compose.onNodeWithText("Call ambulance (108)").assertIsDisplayed()
        shot("10_home_emergency_gate")
    }

    @Test
    fun activeRequestIsShownOnTopOfHome() {
        Bookings.save(context, SavedBooking("MC-20001", Fixtures.TOKEN, "Hospital / OPD", System.currentTimeMillis(), "NEW", "New"))
        api.track["MC-20001"] = Fixtures.trackEnRoute("MC-20001")
        launch()
        compose.waitTag("active-MC-20001")
        compose.waitText("Companion on the way")
        shot("11_home_active_request")
        compose.tapNoScroll("active-MC-20001")
        compose.waitTag("track-status")
        compose.waitText("Amit Kumar")
    }

    @Test
    fun bottomTabsWork() {
        launch()
        compose.tapNoScroll("tab-bookings")
        compose.waitTag("bookings-empty")
        shot("12_bookings_empty")
        compose.tapNoScroll("tab-help")
        compose.waitTag("help")
        compose.tapNoScroll("tab-home")
        compose.waitTag("hero-title")
        compose.tapNoScroll("tab-book")
        compose.waitTag("emergency-gate")
    }
}
