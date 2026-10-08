@file:OptIn(ExperimentalMaterial3Api::class)

package com.champoncall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.champoncall.app.data.Api
import com.champoncall.app.data.ApiException
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.arr
import com.champoncall.app.data.asObj
import com.champoncall.app.data.obj
import com.champoncall.app.data.str
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

private val STEPS = listOf("Booked", "Champ assigned", "On the way", "With your loved one", "Completed")

private fun stepIndex(status: String?): Int = when (status) {
    "NEW", "AWAITING_CONFIRMATION", "SEARCHING_COMPANION" -> 0
    "COMPANION_ASSIGNED", "COMPANION_ACCEPTED" -> 1
    "EN_ROUTE" -> 2
    "WITH_PATIENT", "AT_HOSPITAL", "RETURNING" -> 3
    "COMPLETED" -> 4
    else -> -1
}

@Composable
fun TrackScreen(number: String, onBack: () -> Unit, onFind: () -> Unit) {
    val context = LocalContext.current
    val booking = remember(number) { Bookings.find(context, number) }
    var data by remember { mutableStateOf<JsonObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(number) {
        if (booking == null) return@LaunchedEffect
        while (true) {
            try {
                data = Api.get("/api/v1/public/track/${Api.enc(number)}?t=${Api.enc(booking.token)}").asObj()
                error = null
            } catch (e: ApiException) {
                error = e.message
            }
            val status = data?.str("status")
            if (status == "COMPLETED" || status == "CANCELLED" || status == "UNFULFILLED") break
            delay(15_000)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(number) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Brand.Navy, titleContentColor = Color.White, navigationIconContentColor = Color.White),
            )
        },
        containerColor = Brand.Ivory,
    ) { padding ->
        val d = data
        if (booking == null) {
            Column(Modifier.padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("This booking isn't saved on this phone yet.", style = MaterialTheme.typography.titleMedium)
                Text("Find it with your request number and mobile number.", color = Brand.Muted)
                Button(onClick = onFind, colors = ButtonDefaults.buttonColors(containerColor = Brand.Navy)) { Text("Find my booking") }
            }
            return@Scaffold
        }
        if (d == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                if (error != null) Text(error!!, color = Brand.Danger, modifier = Modifier.padding(24.dp))
                else CircularProgressIndicator(color = Brand.Gold)
            }
            return@Scaffold
        }

        val status = d.str("status")
        val support = d.obj("support")
        val supportPhone = support?.str("phone")
        val whatsapp = support?.str("whatsapp")
        val emergency = d.obj("emergency")?.str("number") ?: "112"

        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // status header
            Column(
                Modifier.fillMaxWidth().background(Brand.Navy, RoundedCornerShape(20.dp)).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("STATUS", color = Brand.Gold, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp)
                Text(d.str("status_label") ?: status ?: "", color = Color.White, style = MaterialTheme.typography.headlineSmall)
                listOfNotNull(d.str("service_type"), d.str("patient_ref")).joinToString(" · ").takeIf { it.isNotBlank() }?.let {
                    Text(it, color = Color(0xFFB9C2D6))
                }
                d.str("destination")?.let { Text(it, color = Color(0xFFB9C2D6), fontSize = 13.sp) }
                formatTime(d.str("requested_datetime"))?.let { Text("Requested for $it", color = Color(0xFFB9C2D6), fontSize = 13.sp) }
                if (error != null) Text("Couldn't refresh: $error", color = Brand.Gold, fontSize = 12.sp)
            }

            if (status == "CANCELLED" || status == "UNFULFILLED") {
                SectionCard {
                    Text(if (status == "CANCELLED") "This booking was cancelled." else "We couldn't find a Champ for this booking.", fontWeight = FontWeight.SemiBold)
                    d.str("cancellation_reason")?.let { Text(it, color = Brand.Muted) }
                    Text("Talk to us and we'll help you right away.", color = Brand.Muted)
                }
            } else {
                SectionCard { Progress(stepIndex(status)) }
            }

            d.obj("companion")?.let { c ->
                SectionCard {
                    Text("Your Champ", color = Brand.Muted, fontSize = 13.sp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val name = c.str("name") ?: "Champ"
                        Box(Modifier.size(48.dp).background(Brand.GoldSoft, CircleShape), contentAlignment = Alignment.Center) {
                            Text(name.take(1).uppercase(), color = Brand.GoldDeep, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        }
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(name, style = MaterialTheme.typography.titleMedium)
                            val langs = (c["languages"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }?.joinToString(", ")
                            Text(listOfNotNull(c.str("code"), "✓ Verified", langs?.takeIf { it.isNotBlank() }).joinToString(" · "), color = Brand.Muted, fontSize = 13.sp)
                        }
                    }
                    formatTime(d.str("eta"))?.let { if (stepIndex(status) in 1..2) Text("Expected by $it", color = Brand.Navy, fontWeight = FontWeight.SemiBold) }
                }
            }

            d.obj("payment")?.let { p ->
                SectionCard {
                    Text("Payment", color = Brand.Muted, fontSize = 13.sp)
                    val paid = p.str("status") == "PAID"
                    Text("${formatInr(p.str("amount"))} · ${if (paid) "Paid" else "Due"}", style = MaterialTheme.typography.titleMedium, color = if (paid) Brand.Success else Brand.Navy)
                    val url = p.str("url")
                    if (!paid && !url.isNullOrBlank()) {
                        Button(
                            onClick = { openUrl(context, if (url.startsWith("http")) url else Api.base + url) },
                            colors = ButtonDefaults.buttonColors(containerColor = Brand.Gold, contentColor = Brand.Navy),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Pay now", fontWeight = FontWeight.Bold) }
                    }
                }
            }

            val timeline = d.arr("timeline").mapNotNull { it as? JsonObject }
            if (timeline.isNotEmpty()) {
                SectionCard {
                    Text("Updates", color = Brand.Muted, fontSize = 13.sp)
                    timeline.reversed().forEach { e ->
                        Row {
                            Box(Modifier.padding(top = 6.dp).size(8.dp).background(Brand.Gold, CircleShape))
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(e.str("label") ?: e.str("event_type") ?: "", fontWeight = FontWeight.SemiBold)
                                e.str("notes")?.takeIf { it.isNotBlank() }?.let { Text(it, color = Brand.Muted, fontSize = 13.sp) }
                                formatTime(e.str("created_at"))?.let { Text(it, color = Brand.Muted, fontSize = 12.sp) }
                            }
                        }
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = { supportPhone?.let { openDialer(context, it) } }, modifier = Modifier.weight(1f)) { Text("Call us", color = Brand.Navy) }
                Button(
                    onClick = { whatsapp?.let { openWhatsApp(context, it, "Hi, about my booking $number") } },
                    colors = ButtonDefaults.buttonColors(containerColor = Brand.WhatsApp),
                    modifier = Modifier.weight(1f),
                ) { Text("WhatsApp") }
            }
            support?.str("hours")?.let { Text("Support: $it", color = Brand.Muted, fontSize = 12.sp) }
            Text(
                "ChampOnCall is not an emergency service. In an emergency, call $emergency.",
                color = Brand.Danger, fontSize = 12.sp,
            )
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun Progress(current: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        STEPS.forEachIndexed { i, label ->
            val done = i <= current
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(26.dp).background(if (done) Brand.Navy else Brand.NavySoft, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (i < current || (done && i == STEPS.lastIndex)) "✓" else "${i + 1}", color = if (done) Color.White else Brand.Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    label,
                    fontWeight = if (i == current) FontWeight.Bold else FontWeight.Normal,
                    color = if (done) Brand.Navy else Brand.Muted,
                )
            }
        }
    }
}
