package com.champoncall.app

import com.champoncall.app.data.BookingForm
import com.champoncall.app.data.Format
import com.champoncall.app.data.Links
import com.champoncall.app.data.Parse
import com.champoncall.app.data.Stages
import com.champoncall.app.fixtures.Fixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class FormatTest {
    @Test fun rupeesUseIndianGrouping() {
        assertEquals("₹1,499", Format.inr(1499.0))
        assertEquals("₹299", Format.inr(299.0))
        assertEquals("₹2,654.46", Format.inr(2654.46))
        assertEquals("₹1,23,456.50", Format.inr(123456.5))
        assertEquals("₹12,34,56,789", Format.inr(123456789.0))
        assertEquals("₹0", Format.inr(0.0))
        assertEquals("—", Format.inr(null))
    }

    @Test fun durations() {
        assertEquals("5h 12m", Format.duration(312))
        assertEquals("45m", Format.duration(45))
        assertEquals("4h 0m", Format.duration(240))
        assertEquals("—", Format.duration(null))
    }

    @Test fun timesShowInIndianTime() {
        val ist = TimeZone.getTimeZone("Asia/Kolkata")
        assertEquals("12:55 pm", Format.time("2026-10-08T07:25:00.000Z", ist))
        assertEquals("8 Oct, 12:55 pm", Format.dateTime("2026-10-08T07:25:00.000Z", ist))
        assertEquals("8 Oct, 12:55 pm", Format.dateTime("2026-10-08T12:55:00+05:30", ist))
        assertNull(Format.time(null, ist))
        assertNull(Format.time("not a date", ist))
    }

    @Test fun isoRoundTrip() {
        val millis = 1_791_477_159_000L
        assertEquals(millis, Format.parseIso(Format.toIso(millis))!!.time)
    }
}

class LinksTest {
    @Test fun trackLinks() {
        assertEquals("MC-10452" to "abc123", Links.parseTrack("/track/MC-10452?t=abc123"))
        assertEquals("MC-10452" to "abc123", Links.parseTrack("https://champoncall.com/track/MC-10452?t=abc123&view=rate"))
        assertNull(Links.parseTrack("https://champoncall.com/track/MC-10452"))
        assertNull(Links.parseTrack("https://champoncall.com/book"))
    }

    @Test fun payLinks() {
        assertEquals("pay-77" to "tok", Links.parsePay("https://champoncall.com/pay/pay-77?t=tok"))
        assertEquals("pay-77" to "tok", Links.parsePay("/pay/pay-77?t=tok"))
        assertNull(Links.parsePay("https://rzp.io/i/abcdef"))
    }
}

class StagesTest {
    @Test fun statusesMapToTheWebsiteStages() {
        assertEquals(0, Stages.index("NEW"))
        assertEquals(0, Stages.index("AWAITING_CONFIRMATION"))
        assertEquals(1, Stages.index("SEARCHING_COMPANION"))
        assertEquals(1, Stages.index("COMPANION_ASSIGNED"))
        assertEquals(2, Stages.index("COMPANION_ACCEPTED"))
        assertEquals(3, Stages.index("EN_ROUTE"))
        assertEquals(4, Stages.index("WITH_PATIENT"))
        assertEquals(5, Stages.index("AT_HOSPITAL"))
        assertEquals(6, Stages.index("RETURNING"))
        assertEquals(7, Stages.index("COMPLETED"))
        assertEquals(-1, Stages.index("CANCELLED"))
        assertEquals(-1, Stages.index(null))
        assertTrue(Stages.isFinal("COMPLETED"))
        assertTrue(Stages.isFinal("UNFULFILLED"))
        assertFalse(Stages.isFinal("EN_ROUTE"))
        assertFalse(Stages.isFinal(null))
    }
}

class ParseTest {
    private fun obj(s: String) = Json.parseToJsonElement(s) as JsonObject

    @Test fun config() {
        val c = Parse.config(obj(Fixtures.CONFIG))
        assertTrue(c.loaded)
        assertEquals("Gurugram", c.city)
        assertEquals(7, c.services.size)
        assertEquals("Hospital / OPD", c.services.first().label)
        assertEquals(1499.0, c.generalRule()!!.baseFee, 0.0)
        assertEquals(4, c.generalRule()!!.includedHours)
        assertEquals(1999.0, c.ruleFor("admission")!!.baseFee, 0.0)
        assertEquals(1499.0, c.ruleFor("diagnostic")!!.baseFee, 0.0)
        assertEquals(1, c.otherRules().size)
        assertEquals("108", c.ambulanceNumber)
        assertEquals("care@champoncall.com", c.supportEmail)
        assertEquals(9, c.languages.size)
    }

    @Test fun configFallsBackToDefaults() {
        val c = Parse.config(obj("{}"))
        assertEquals("112", c.emergencyNumber)
        assertEquals(7, c.services.size)
        assertEquals(2, c.pricing.size)
    }

    @Test fun places() {
        val p = Parse.places(Json.parseToJsonElement(Fixtures.PLACES_HOSPITAL) as JsonArray)
        assertEquals(2, p.size)
        assertEquals("Medanta – The Medicity", p[0].name)
        assertEquals(28.4394, p[0].lat!!, 0.0001)
        assertEquals(true, p[0].inArea)
    }

    @Test fun trackInProgress() {
        val t = Parse.track(obj(Fixtures.trackEnRoute()))
        assertEquals("MC-20001", t.number)
        assertEquals("EN_ROUTE", t.status)
        assertEquals("Amit Kumar", t.companion!!.name)
        assertEquals(listOf("Hindi", "English"), t.companion!!.languages)
        assertEquals(5, t.timeline.size)
        assertEquals("ETA 12:55", t.timeline.last().notes)
        assertNull(t.payment)
        assertFalse(t.isCompleted)
        assertEquals("112", t.emergencyNumber)
        assertEquals("919205640777", t.support.whatsapp)
    }

    @Test fun trackCompletedWithBill() {
        val t = Parse.track(obj(Fixtures.trackCompleted()))
        assertTrue(t.isCompleted)
        assertEquals(312, t.durationMinutes)
        assertEquals(2654.46, t.finalAmount!!, 0.001)
        val b = t.breakdown!!
        assertEquals(2, b.extensionBlocks)
        assertEquals(598.0, b.extensionAmount!!, 0.0)
        assertEquals(377.46, b.tax, 0.001)
        assertEquals(1, t.expenses.size)
        assertTrue(t.payment!!.isUnpaid)
        assertEquals("pay-77" to Fixtures.TOKEN, Links.parsePay(t.payment!!.url!!))
        assertTrue(t.canRate)
        assertNull(t.rating)
    }

    @Test fun trackRated() {
        val t = Parse.track(obj(Fixtures.trackCompleted(paid = true, rated = true)))
        assertEquals(5, t.rating!!.overall)
        assertEquals(true, t.trustAgain)
        assertTrue(t.payment!!.isPaid)
    }

    @Test fun historyListsEveryChannel() {
        val h = Parse.history(obj(Fixtures.history()))
        assertEquals("hist_tok_1", h.token)
        assertEquals("+919871510465", h.phone)
        assertEquals(2, h.items.size)
        assertEquals("MC-61001", h.items[0].number)
        assertEquals(Fixtures.TOKEN, h.items[0].token)
        assertEquals("whatsapp", h.items[0].channel)
        assertEquals("Completed", h.items[1].statusLabel)
        assertTrue(h.items[0].createdAt > h.items[1].createdAt)
        assertNull(Parse.history(obj(Fixtures.history(token = null))).token)
    }

    @Test fun supportNumberDefault() {
        assertEquals("+919205640777", com.champoncall.app.data.AppConfig().supportPhone)
        assertEquals("+919205640777", Parse.config(obj(Fixtures.CONFIG)).supportPhone)
    }

    @Test fun pay() {
        val p = Parse.pay(obj(Fixtures.pay()))
        assertEquals("PENDING", p.status)
        assertEquals(2654.46, p.amount!!, 0.001)
        assertEquals(180.0, p.expensesTotal!!, 0.0)
        assertFalse(p.gatewayLive)
        assertEquals("MC-20002", p.requestNumber)
    }
}

class BookingFormTest {
    private val now = 1_791_000_000_000L
    private val complete = BookingForm(
        relationship = "Mother", pickupText = "B-12, Sushant Lok 1", serviceType = "hospital_opd", urgency = "ASAP",
        mobility = "INDEPENDENT", customerName = "Rahul", customerPhone = "98715 10465", consent = true,
    )

    @Test fun emptyFormListsEverythingMissing() {
        assertEquals(
            listOf("who needs help", "pickup address", "type of help", "when", "mobility", "your name", "your mobile"),
            BookingForm().missing(now),
        )
        assertEquals("Please add: who needs help, pickup address, type of help, when, mobility, your name, your mobile", BookingForm().error(now))
    }

    @Test fun completeFormIsValid() {
        assertTrue(complete.missing(now).isEmpty())
        assertNull(complete.error(now))
    }

    @Test fun consentIsRequired() {
        assertEquals("Please accept the privacy notice and terms", complete.copy(consent = false).error(now))
    }

    @Test fun phoneMustHaveTenDigits() {
        assertEquals(listOf("a valid 10-digit mobile number"), complete.copy(customerPhone = "98765").missing(now))
    }

    @Test fun scheduledNeedsAFutureTime() {
        assertEquals(listOf("date & time"), complete.copy(urgency = "SCHEDULED").missing(now))
        assertEquals(listOf("a time at least 30 minutes from now"), complete.copy(urgency = "SCHEDULED", requestedAtMillis = now + 5 * 60_000L).missing(now))
        assertTrue(complete.copy(urgency = "SCHEDULED", requestedAtMillis = now + 2 * 3600_000L).missing(now).isEmpty())
    }

    @Test fun jsonMatchesTheServerFields() {
        val j = complete.copy(patientAge = "72", destText = "Medanta – The Medicity", destLat = 28.4394, destLng = 77.0406, pickupLat = 28.46, pickupLng = 77.07).toJson("key-1")
        assertEquals("Mother", j["relationship"]!!.jsonPrimitive.content)
        assertEquals("72", j["patient_age"]!!.jsonPrimitive.content)
        assertEquals("app_pin", j["pickup_source"]!!.jsonPrimitive.content)
        assertEquals("Medanta – The Medicity", j["destination_name"]!!.jsonPrimitive.content)
        assertEquals("ASAP", j["urgency"]!!.jsonPrimitive.content)
        assertTrue(j["consent"]!!.jsonPrimitive.boolean)
        assertTrue(j["emergency_acknowledged"]!!.jsonPrimitive.boolean)
        assertEquals("key-1", j["idempotency_key"]!!.jsonPrimitive.content)
        assertEquals("android_app", j["utm"]!!.jsonObject["utm_source"]!!.jsonPrimitive.content)
        assertTrue(j["requested_at"] is JsonPrimitive && (j["requested_at"] as JsonPrimitive).let { it.toString() == "null" })
        assertNotNull(j["customer_phone"])
    }

    @Test fun scheduledJsonCarriesTheTime() {
        val at = now + 3 * 3600_000L
        val j = complete.copy(urgency = "SCHEDULED", requestedAtMillis = at).toJson("k")
        assertEquals(Format.toIso(at), j["requested_at"]!!.jsonPrimitive.content)
    }
}
