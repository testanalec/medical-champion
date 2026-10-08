package com.champoncall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
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
import com.champoncall.app.data.AppConfig
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.asObj
import com.champoncall.app.data.str

@Composable
fun HomeScreen(onBook: () -> Unit, onTrack: (String) -> Unit, onFind: () -> Unit) {
    val context = LocalContext.current
    var config by remember { mutableStateOf(AppConfig()) }
    val bookings = remember { Bookings.all(context) }
    val statuses = remember { mutableStateMapOf<String, String>() }

    LaunchedEffect(Unit) {
        config = AppConfig.load()
        bookings.take(5).forEach { b ->
            runCatching {
                Api.get("/api/v1/public/track/${Api.enc(b.number)}?t=${Api.enc(b.token)}").asObj()?.str("status_label")
            }.getOrNull()?.let { statuses[b.number] = it }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.Ivory)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        BrandHeader()

        // Hero
        Column(
            Modifier
                .fillMaxWidth()
                .background(Brand.Navy, RoundedCornerShape(24.dp))
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Your parents need help.", color = Color.White, style = MaterialTheme.typography.headlineMedium)
            Text("You can't be there.", color = Brand.NavySoft, style = MaterialTheme.typography.headlineMedium)
            Text("We can.", color = Brand.Gold, style = MaterialTheme.typography.headlineMedium)
            Text(
                "A verified Champ reaches your loved one, goes with them to the hospital, clinic or lab, and keeps you updated until they're home.",
                color = Brand.NavySoft,
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(4.dp))
            Button(
                onClick = onBook,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Brand.Gold, contentColor = Brand.Navy),
            ) { Text("Book a Champ", fontWeight = FontWeight.Bold, fontSize = 17.sp) }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(
                onClick = { openDialer(context, config.supportPhone) },
                modifier = Modifier.weight(1f).height(48.dp),
                shape = RoundedCornerShape(14.dp),
            ) { Text("Call us", color = Brand.Navy) }
            Button(
                onClick = { openWhatsApp(context, config.whatsappNumber, config.whatsappPrefill) },
                modifier = Modifier.weight(1f).height(48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Brand.WhatsApp),
            ) { Text("WhatsApp") }
        }

        // Bookings
        Text("Your bookings", style = MaterialTheme.typography.titleLarge, color = Brand.Navy)
        if (bookings.isEmpty()) {
            SectionCard {
                Text("No bookings yet.", style = MaterialTheme.typography.titleMedium)
                Text(
                    "When you book a Champ, you can follow every step here and get notified as things happen.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Brand.Muted,
                )
            }
        } else {
            bookings.forEach { b ->
                SectionCard(Modifier.clickable { onTrack(b.number) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).background(Brand.Gold, CircleShape))
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(b.number, style = MaterialTheme.typography.titleMedium, color = Brand.Navy)
                            if (b.service.isNotBlank()) Text(b.service, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                        }
                        Text(statuses[b.number] ?: "View", color = Brand.GoldDeep, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        TextButton(onClick = onFind) { Text("Booked on the website or WhatsApp? Find your booking", color = Brand.NavyMid) }

        Text(
            "ChampOnCall is not an emergency or ambulance service. In an emergency, call ${config.emergencyNumber} immediately.",
            style = MaterialTheme.typography.bodyMedium,
            color = Brand.Muted,
        )
        Text("Support: ${config.supportPhoneDisplay} · ${config.supportHours}", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
        Spacer(Modifier.height(12.dp))
    }
}
