@file:OptIn(ExperimentalLayoutApi::class)

package com.champoncall.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.champoncall.app.R
import com.champoncall.app.data.AppConfig
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.Format
import com.champoncall.app.data.Repo
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.data.Stages

private val SERVICES = listOf(
    Triple(R.drawable.fa_hospital, "Hospital accompaniment", "From the front door to the ward and back."),
    Triple(R.drawable.fa_stethoscope, "OPD visits", "Queues, tokens, follow-ups handled."),
    Triple(R.drawable.fi_user_check, "Doctor appointments", "Someone beside them in the consultation room."),
    Triple(R.drawable.fa_vial, "Diagnostics", "Blood tests, scans, X-rays — no confusion."),
    Triple(R.drawable.fi_clipboard, "Registration", "Forms, IDs, insurance desk, billing counter."),
    Triple(R.drawable.fi_clock, "Queues & waiting", "We wait so they can sit and rest."),
    Triple(R.drawable.fi_file_text, "Reports & documents", "Collected, organised, photographed for you."),
    Triple(R.drawable.fa_pills, "Pharmacy", "Medicines picked up exactly as prescribed."),
    Triple(R.drawable.fa_procedures, "Admission coordination", "Paperwork, room allocation, settling in."),
    Triple(R.drawable.fi_home, "Discharge coordination", "Summary, bills, medicines, safe ride home."),
    Triple(R.drawable.fi_truck, "Transport coordination", "Cab arranged, wheelchair at the gate."),
    Triple(R.drawable.fi_message_circle, "Family updates", "Live WhatsApp updates at every step."),
    Triple(R.drawable.fa_wheelchair, "Return-home assistance", "Home safely, handed over to family."),
)

private val STEPS = listOf(
    "Tell us who needs help" to "Book in the app, message us on WhatsApp or call. Share your parent’s location, where they need to go and when.",
    "We assign a verified companion" to "Our operations team personally picks a background-checked, trained companion near them.",
    "We reach your loved one" to "Your companion arrives, verifies with a booking code and introduces themselves.",
    "We stay with them" to "Registration, queues, consultations, tests, pharmacy — they are never alone.",
    "You stay informed" to "Live updates in the app and on WhatsApp at every milestone, and a summary when they’re home.",
)

private val EXAMPLE_TIMELINE = listOf(
    Triple("12:01", "Request received", false), Triple("12:05", "Companion assigned — Amit K.", false),
    Triple("12:28", "Amit reached your mother", true), Triple("12:49", "Reached Medanta", false),
    Triple("13:10", "Registration completed", false), Triple("13:42", "Consultation underway", false),
    Triple("15:52", "Returning home", false), Triple("16:16", "Mother is home safely", true),
)

val FAQ = listOf(
    "Is this a medical or emergency service?" to "No. Our companions are trained, verified people who accompany and coordinate — they don’t diagnose, prescribe, give treatment or replace doctors, nurses, ambulances or emergency services. In an emergency, call 112 or 108 immediately.",
    "How quickly can someone reach my parent?" to "For urgent requests we aim to dispatch within minutes and reach within about an hour in most of Gurugram, depending on traffic and availability. Our team confirms a real ETA before you commit.",
    "Who are the companions?" to "Local, trained companions who have completed government ID verification, a background check, an interview and hospital navigation & escalation training before they can take any job.",
    "How do I know what’s happening?" to "You get updates at each milestone — companion assigned, arrived, reached hospital, consultation, returning home — in this app, on WhatsApp, and on the tracking screen with the full timeline.",
    "How does payment work?" to "You pay after the service via UPI, card or payment link. The base fee covers the first hours; longer visits are billed per extra hour. Out-of-pocket costs like cabs or parking are passed on at actuals, with receipts.",
    "What if my parent cannot walk?" to "Tell us. Our team reviews every request where someone is bedridden or needs significant support and will call you before confirming — some situations need medical transport rather than a companion.",
    "What information do you keep?" to "Only what we need to deliver the service. We avoid collecting medical history, companions see only job-relevant details, and every access is logged. See our privacy notice.",
)

private val AREAS = listOf("DLF Phase 1–5", "Golf Course Road", "Sushant Lok", "Sohna Road", "South City", "Palam Vihar", "Nirvana Country", "Sector 56–57", "Cyber City", "Manesar")
private val HOSPITALS = listOf("Medanta – The Medicity", "Artemis Hospital", "Fortis Memorial (FMRI)", "Max Hospital Gurugram", "Paras Hospital", "CK Birla Hospital", "W Pratiksha Hospital", "Manipal Hospital")

@Composable
fun HomeScreen(
    onBook: () -> Unit,
    onTrack: (String) -> Unit,
    onFind: () -> Unit,
    onDoc: (String) -> Unit,
) {
    val context = LocalContext.current
    val config by Repo.config.collectAsState()
    var gate by remember { mutableStateOf(false) }
    // Filled straight away (not after loading) so the card is on screen from the first frame
    val active = remember { mutableStateListOf<SavedBooking>().apply { addAll(Bookings.all(context).filter { !Stages.isFinal(it.lastStatus) }.take(3)) } }

    LaunchedEffect(Unit) {
        Repo.refreshConfig()
        val open = active.toList()
        open.forEach { b ->
            runCatching { Repo.track(b.number, b.token) }.getOrNull()?.let { t ->
                Bookings.updateStatus(context, b.number, t.status, t.statusLabel, t.serviceType)
                val i = active.indexOfFirst { it.number == b.number }
                if (i >= 0) {
                    if (Stages.isFinal(t.status)) active.removeAt(i) else active[i] = active[i].copy(lastStatus = t.status, lastLabel = t.statusLabel, service = t.serviceType ?: active[i].service)
                }
            }
        }
    }

    val startWhatsApp = { gate = true }

    Column(Modifier.fillMaxSize().background(Brand.Warm50)) {
        HomeHeader(config)
        LazyColumn(Modifier.fillMaxSize().testTag("home-list")) {
            if (active.isNotEmpty()) {
                item("active") {
                    Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        active.forEach { b -> ActiveBookingCard(b) { onTrack(b.number) } }
                    }
                }
            }
            item("hero") { Hero(config, onBook, startWhatsApp) }
            item("chat") { ChatMock() }
            item("strip") { Column { Spacer(Modifier.height(28.dp)); EmergencyStrip(config) } }
            item("how") { HowItWorks() }
            item("services") { Services() }
            item("informed") { StayInformed() }
            item("safety") { TrustSafety(config) }
            item("pricing") { Pricing(config, onBook) }
            item("area") { WhereWeWork(config) }
            item("faq") { FaqSection() }
            item("cta") { FinalCta(config, onBook, startWhatsApp, onFind) }
            item("footer") { Footer(config, onFind, onBook, onDoc) }
        }
    }

    if (gate) {
        EmergencyGate(config, onDismiss = { gate = false }) {
            gate = false
            openWhatsApp(context, config.whatsappNumber, config.whatsappPrefill + " [ref: android_app]")
        }
    }
}

@Composable
private fun HomeHeader(config: AppConfig) {
    val context = LocalContext.current
    Surface(color = Brand.Warm50) {
        Column {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                BrandLogo(markSize = 42.dp)
                Spacer(Modifier.weight(1f))
                Surface(
                    onClick = { dial(context, config.supportPhone) },
                    shape = RoundedCornerShape(10.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Brand.Slate200),
                    modifier = Modifier.testTag("header-call"),
                ) {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Ic(R.drawable.fi_phone, tint = Brand.Ink, size = 15.dp)
                        Spacer(Modifier.width(6.dp))
                        Text("Call us", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Brand.Warm200.copy(alpha = 0.6f)))
        }
    }
}

@Composable
private fun ActiveBookingCard(b: SavedBooking, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        color = Brand.B900,
        modifier = Modifier.fillMaxWidth().testTag("active-${b.number}"),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Ic(R.drawable.fi_activity, tint = Brand.Gold400, size = 20.dp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("YOUR REQUEST · ${b.number}", color = Brand.B200, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                Text(b.lastLabel ?: "Checking status…", color = Color.White, fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 19.sp)
                if (b.service.isNotBlank()) Text(b.service, color = Brand.B200, fontSize = 13.sp)
            }
            Ic(R.drawable.fi_chevron_right, tint = Color.White, size = 22.dp)
        }
    }
}

@Composable
private fun Hero(config: AppConfig, onBook: () -> Unit, onWhatsApp: () -> Unit) {
    val context = LocalContext.current
    Column(
        Modifier
            .fillMaxWidth()
            .background(Brush.radialGradient(listOf(Brand.B100, Brand.Warm50), center = Offset(1000f, 0f), radius = 1100f))
            .padding(horizontal = 20.dp)
            .padding(top = 26.dp, bottom = 8.dp),
    ) {
        Row(
            Modifier.clip(RoundedCornerShape(50)).background(Color.White).border(1.dp, Brand.B100, RoundedCornerShape(50)).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(Brand.Emerald500))
            Spacer(Modifier.width(8.dp))
            Text("Serving ${config.city}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Brand.B800)
        }
        Spacer(Modifier.height(20.dp))
        Text("Your parents need help.", style = MaterialTheme.typography.displaySmall, color = Brand.B950, modifier = Modifier.testTag("hero-title"))
        Text("You can’t be there.", style = MaterialTheme.typography.displaySmall, color = Brand.Slate500)
        Text(
            "We can.",
            style = MaterialTheme.typography.displaySmall,
            color = Brand.Gold500,
            modifier = Modifier.drawBehind {
                val y = size.height - 2.dp.toPx()
                val path = Path().apply {
                    moveTo(2f, y)
                    cubicTo(size.width * 0.25f, y - 9f, size.width * 0.75f, y - 10f, size.width - 2f, y - 3f)
                }
                drawPath(path, Brand.Gold400.copy(alpha = 0.6f), style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round))
            },
        )
        Spacer(Modifier.height(18.dp))
        Text(
            "A verified companion reaches your mother or father, takes them to the hospital, clinic or lab, stays with them through every queue — and keeps you updated until they’re home.",
            style = MaterialTheme.typography.bodyLarge,
            color = Brand.Slate600,
            fontSize = 17.sp,
            lineHeight = 27.sp,
        )
        Spacer(Modifier.height(24.dp))
        AppButton("BOOK A CHAMP", onBook, Modifier.fillMaxWidth().testTag("hero-book"), BtnKind.Primary, icon = R.drawable.fi_user_check, trailingIcon = R.drawable.fi_arrow_right, large = true)
        Spacer(Modifier.height(10.dp))
        AppButton("GET HELP NOW ON WHATSAPP", onWhatsApp, Modifier.fillMaxWidth().testTag("hero-whatsapp"), BtnKind.WhatsApp, icon = R.drawable.fa_whatsapp, large = true)
        Spacer(Modifier.height(10.dp))
        AppButton("CALL US", { dial(context, config.supportPhone) }, Modifier.fillMaxWidth(), BtnKind.Secondary, icon = R.drawable.fi_phone, large = true)
        Spacer(Modifier.height(20.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TrustBit(R.drawable.fi_shield, "Background-verified companions", Brand.B600)
            TrustBit(R.drawable.fa_whatsapp, "Live updates", Brand.WhatsApp)
            TrustBit(R.drawable.fi_credit_card, "Pay after the visit", Brand.B600)
        }
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun TrustBit(icon: Int, text: String, tint: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Ic(icon, tint = tint, size = 15.dp)
        Spacer(Modifier.width(6.dp))
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Brand.Slate600)
    }
}

private data class Msg(val me: Boolean, val text: String, val time: String, val bold: String? = null)

@Composable
private fun ChatMock() {
    val msgs = listOf(
        Msg(true, "Hi, Mummy has an OPD at Medanta at 12:30. I’m in Bengaluru 🙏", "11:52"),
        Msg(false, "Amit Kumar has been assigned.\n✅ Verified · ID CMP-101\n🗣 Hindi, English\n⏱ ETA 12:25", "12:05", "Companion Assigned"),
        Msg(false, "🏠 Amit has reached your mother.", "12:28"),
        Msg(false, "Amit and your mother have reached the hospital. We’ll keep you updated.", "12:49", "Reached Hospital"),
        Msg(false, "📋 Consultation underway — token 14", "13:42"),
    )
    Box(Modifier.fillMaxWidth().padding(horizontal = 28.dp), contentAlignment = Alignment.Center) {
        Surface(
            shape = RoundedCornerShape(34.dp),
            color = Color(0xFF0F172A),
            shadowElevation = 10.dp,
            modifier = Modifier.widthIn(max = 340.dp).fillMaxWidth(),
        ) {
            Column(Modifier.padding(9.dp).clip(RoundedCornerShape(26.dp))) {
                Row(Modifier.fillMaxWidth().background(Color(0xFF075E54)).padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Image(painterResource(R.drawable.champ_logo), null, Modifier.size(34.dp).clip(CircleShape).background(Color.White))
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text("ChampOnCall", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text("Business account", color = Color(0xFFD1FAE5), fontSize = 11.sp)
                    }
                }
                Column(
                    Modifier.fillMaxWidth().background(Color(0xFFEFEAE2)).padding(horizontal = 10.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    msgs.forEach { m ->
                        Box(Modifier.fillMaxWidth(), contentAlignment = if (m.me) Alignment.CenterEnd else Alignment.CenterStart) {
                            Column(
                                Modifier
                                    .fillMaxWidth(0.86f)
                                    .clip(RoundedCornerShape(topStart = if (m.me) 12.dp else 3.dp, topEnd = if (m.me) 3.dp else 12.dp, bottomStart = 12.dp, bottomEnd = 12.dp))
                                    .background(if (m.me) Color(0xFFD9FDD3) else Color.White)
                                    .padding(horizontal = 10.dp, vertical = 7.dp),
                            ) {
                                if (m.bold != null) Text(m.bold, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text(m.text, fontSize = 13.sp, lineHeight = 18.sp, color = Color(0xFF1E293B))
                                Text(m.time + if (m.me) " ✓✓" else "", fontSize = 10.sp, color = Brand.Slate400, modifier = Modifier.align(Alignment.End))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Section(bg: Color, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().background(bg).padding(horizontal = 20.dp, vertical = 40.dp)) { content() }
}

@Composable
private fun HowItWorks() = Section(Color.White) {
    Kicker("How it works")
    Spacer(Modifier.height(8.dp))
    SectionTitle("Someone will be there. From the first message to “they’re home”.")
    Spacer(Modifier.height(24.dp))
    STEPS.forEachIndexed { i, (t, d) ->
        Row(Modifier.padding(bottom = if (i < STEPS.lastIndex) 20.dp else 0.dp)) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(Brand.B700), contentAlignment = Alignment.Center) {
                Text("${i + 1}", color = Color.White, fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            }
            Spacer(Modifier.width(14.dp))
            Column {
                Text(t, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Brand.Ink)
                Spacer(Modifier.height(3.dp))
                Text(d, fontSize = 14.sp, lineHeight = 21.sp, color = Brand.Slate600)
            }
        }
    }
}

@Composable
private fun Services() = Section(Brand.Warm50) {
    Kicker("What we help with")
    Spacer(Modifier.height(8.dp))
    SectionTitle("Every part of the hospital visit — handled.")
    Spacer(Modifier.height(10.dp))
    Text("Hospitals are confusing and exhausting, especially alone. Our companions know the desks, the corridors and the process.", color = Brand.Slate600, fontSize = 15.sp, lineHeight = 23.sp)
    Spacer(Modifier.height(20.dp))
    SERVICES.chunked(2).forEach { row ->
        Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            row.forEach { (icon, title, desc) ->
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Brand.Warm200),
                    modifier = Modifier.weight(1f).heightIn(min = 150.dp),
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Brand.B50), contentAlignment = Alignment.Center) {
                            Ic(icon, tint = Brand.B700, size = 19.dp)
                        }
                        Spacer(Modifier.height(12.dp))
                        Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp, lineHeight = 19.sp)
                        Spacer(Modifier.height(4.dp))
                        Text(desc, fontSize = 13.sp, lineHeight = 18.sp, color = Brand.Slate600)
                    }
                }
            }
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun StayInformed() = Section(Brand.B900) {
    Kicker("You stay informed", color = Brand.B300)
    Spacer(Modifier.height(8.dp))
    SectionTitle("Know exactly what’s happening — even from another city.", color = Color.White)
    Spacer(Modifier.height(12.dp))
    Text(
        "Every milestone is recorded and shared with you in the app and on WhatsApp. Our operations team watches every active visit and can step in the moment something doesn’t go to plan.",
        color = Brand.B100, fontSize = 15.sp, lineHeight = 23.sp,
    )
    Spacer(Modifier.height(18.dp))
    listOf("Someone trustworthy is taking ownership.", "You know what is happening, as it happens.", "Operations can intervene whenever something goes wrong.").forEach {
        Row(Modifier.padding(bottom = 10.dp)) {
            Box(Modifier.padding(top = 2.dp).size(20.dp).clip(CircleShape).background(Brand.Gold500), contentAlignment = Alignment.Center) {
                Ic(R.drawable.fi_check, tint = Color.White, size = 12.dp)
            }
            Spacer(Modifier.width(12.dp))
            Text(it, color = Brand.B50, fontSize = 15.sp, lineHeight = 22.sp)
        }
    }
    Spacer(Modifier.height(18.dp))
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color.White.copy(alpha = 0.05f))
            .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(24.dp)).padding(20.dp),
    ) {
        Text("Example visit · MC-10452", color = Brand.B200, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(14.dp))
        EXAMPLE_TIMELINE.forEachIndexed { i, (t, l, hi) ->
            Row(Modifier.padding(bottom = if (i < EXAMPLE_TIMELINE.lastIndex) 12.dp else 0.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(11.dp).clip(CircleShape).background(if (hi) Brand.Gold400 else Brand.B300))
                Spacer(Modifier.width(14.dp))
                Text(t, color = Brand.B300, fontSize = 13.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.width(52.dp))
                Text(l, color = if (hi) Color.White else Brand.B50, fontSize = 14.sp, fontWeight = if (hi) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
    }
}

@Composable
private fun TrustSafety(config: AppConfig) = Section(Color.White) {
    Kicker("Trust & safety")
    Spacer(Modifier.height(8.dp))
    SectionTitle("Clear about what we do — and what we don’t.")
    Spacer(Modifier.height(20.dp))
    SafetyCard(Brand.B50, Brand.B100, R.drawable.fi_shield, "Every companion is", Brand.B900, Brand.B600, config.verificationClaims + "Supported live by our operations team", R.drawable.fi_check)
    Spacer(Modifier.height(12.dp))
    SafetyCard(
        Brand.Warm50, Brand.Warm200, R.drawable.fi_heart, "Our companions do", Brand.Ink, Brand.Emerald600,
        listOf("Accompany, guide and reassure", "Handle registration, queues & paperwork", "Coordinate transport, pharmacy & reports", "Keep your family updated", "Escalate to emergency services if needed"),
        R.drawable.fi_check, titleIconTint = Brand.Gold500,
    )
    Spacer(Modifier.height(12.dp))
    SafetyCard(Color.White, Brand.Red100, R.drawable.fi_x, "Our companions do not", Brand.Red900, Brand.Red500, DO_NOT, R.drawable.fi_x)
}

val DO_NOT = listOf("Diagnose medical conditions", "Prescribe medication", "Provide clinical treatment", "Replace doctors", "Replace nurses", "Replace ambulances", "Replace emergency medical services")

@Composable
private fun SafetyCard(bg: Color, border: Color, icon: Int, title: String, titleColor: Color, itemTint: Color, items: List<String>, itemIcon: Int, titleIconTint: Color = titleColor) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(bg).border(1.dp, border, RoundedCornerShape(24.dp)).padding(22.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Ic(icon, tint = titleIconTint, size = 18.dp)
            Spacer(Modifier.width(8.dp))
            Text(title, fontWeight = FontWeight.Bold, color = titleColor, fontSize = 16.sp)
        }
        Spacer(Modifier.height(14.dp))
        items.forEach {
            Box(Modifier.padding(bottom = 9.dp)) { CheckItem(it, icon = itemIcon, tint = itemTint, color = if (bg == Brand.B50) Brand.B900 else Brand.Slate700) }
        }
    }
}

@Composable
private fun Pricing(config: AppConfig, onBook: () -> Unit) = Section(Brand.Warm50) {
    val context = LocalContext.current
    val general = config.generalRule()
    Kicker("Simple pricing", modifier = Modifier.fillMaxWidth(), align = TextAlign.Center)
    Spacer(Modifier.height(8.dp))
    SectionTitle("Pay after the visit. No subscriptions.", modifier = Modifier.fillMaxWidth(), align = TextAlign.Center)
    Spacer(Modifier.height(24.dp))
    if (general != null) {
        Box {
            Column(
                Modifier.fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(24.dp)).background(Color.White)
                    .border(2.dp, Brand.B600, RoundedCornerShape(24.dp)).padding(24.dp).testTag("price-general"),
            ) {
                Text(general.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text("OPD, doctor visits, diagnostics, discharge, pharmacy", fontSize = 13.sp, color = Brand.Slate500)
                Spacer(Modifier.height(16.dp))
                Text(Format.inr(general.baseFee), fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 46.sp, color = Brand.B950)
                Text("first ${general.includedHours} hours · then ${Format.inr(general.extensionPerHour)}/hour", fontSize = 14.sp, color = Brand.Slate600)
                Spacer(Modifier.height(16.dp))
                listOf("Pickup from home & return", "Registration, queues, consultation", "Tests, reports & pharmacy", "Live updates + visit summary").forEach {
                    Box(Modifier.padding(bottom = 8.dp)) { CheckItem(it) }
                }
                Spacer(Modifier.height(12.dp))
                AppButton("Book now", onBook, Modifier.fillMaxWidth().testTag("price-book"), BtnKind.Primary, icon = R.drawable.fi_user_check)
            }
            Text(
                "Most visits",
                Modifier.padding(start = 24.dp).clip(RoundedCornerShape(50)).background(Brand.B700).padding(horizontal = 12.dp, vertical = 5.dp),
                color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold,
            )
        }
    }
    config.otherRules().forEach { p ->
        Spacer(Modifier.height(16.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color.White).border(1.dp, Brand.Warm200, RoundedCornerShape(24.dp)).padding(24.dp)) {
            Text(p.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text("Longer stays for hospital admission", fontSize = 13.sp, color = Brand.Slate500)
            Spacer(Modifier.height(16.dp))
            Text(Format.inr(p.baseFee), fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 46.sp, color = Brand.B950)
            Text("first ${p.includedHours} hours · then ${Format.inr(p.extensionPerHour)}/hour", fontSize = 14.sp, color = Brand.Slate600)
            Spacer(Modifier.height(16.dp))
            listOf("Admission paperwork & insurance desk", "Room allocation & settling in", "Handover to ward staff", "Updates to the whole family").forEach {
                Box(Modifier.padding(bottom = 8.dp)) { CheckItem(it) }
            }
            Spacer(Modifier.height(12.dp))
            AppButton("Talk to us", { dial(context, config.supportPhone) }, Modifier.fillMaxWidth(), BtnKind.Secondary, icon = R.drawable.fi_phone)
        }
    }
    Spacer(Modifier.height(18.dp))
    val gst = general?.taxPercent?.takeIf { it > 0 }?.let { "Prices exclude ${it.toInt()}% GST. " } ?: ""
    Text(
        gst + "Cabs, parking and other approved out-of-pocket costs are billed at actuals with receipts. Hospital, doctor and medicine bills are paid directly to the provider. Pay by UPI, cards or payment link.",
        fontSize = 13.sp, lineHeight = 19.sp, color = Brand.Slate500, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun WhereWeWork(config: AppConfig) = Section(Color.White) {
    Kicker("Where we work")
    Spacer(Modifier.height(8.dp))
    SectionTitle("Serving ${config.city}")
    Spacer(Modifier.height(10.dp))
    Text(
        "From DLF and Golf Course Road to Sohna Road, Palam Vihar and New Gurugram. Outside the area? Message us anyway — our team will review personally before promising anything.",
        color = Brand.Slate600, fontSize = 15.sp, lineHeight = 23.sp,
    )
    Spacer(Modifier.height(16.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AREAS.forEach {
            Row(Modifier.clip(RoundedCornerShape(50)).background(Brand.Warm100).padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                Ic(R.drawable.fi_map_pin, tint = Brand.B600, size = 13.dp)
                Spacer(Modifier.width(5.dp))
                Text(it, fontSize = 13.sp, color = Brand.Slate700)
            }
        }
    }
    Spacer(Modifier.height(22.dp))
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brand.Warm50).border(1.dp, Brand.Warm200, RoundedCornerShape(24.dp)).padding(20.dp)) {
        Text("Hospitals our companions visit regularly", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Brand.Slate700)
        Spacer(Modifier.height(12.dp))
        HOSPITALS.forEach {
            Row(
                Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(12.dp)).background(Color.White)
                    .border(1.dp, Brand.Warm200, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Ic(R.drawable.fa_hospital, tint = Brand.B600, size = 15.dp)
                Spacer(Modifier.width(10.dp))
                Text(it, fontSize = 14.sp)
            }
        }
        Text("We are independent and not affiliated with these hospitals.", fontSize = 12.sp, color = Brand.Slate500)
    }
}

@Composable
private fun FaqSection() = Section(Brand.Warm50) {
    Kicker("Questions", modifier = Modifier.fillMaxWidth(), align = TextAlign.Center)
    Spacer(Modifier.height(8.dp))
    SectionTitle("Things families ask us", modifier = Modifier.fillMaxWidth(), align = TextAlign.Center)
    Spacer(Modifier.height(20.dp))
    FaqList()
}

@Composable
fun FaqList() {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color.White).border(1.dp, Brand.Warm200, RoundedCornerShape(24.dp))) {
        FAQ.forEachIndexed { i, (q, a) ->
            var open by rememberSaveable { mutableStateOf(false) }
            Column(Modifier.fillMaxWidth().clickable { open = !open }.padding(horizontal = 18.dp, vertical = 16.dp).testTag("faq-$i")) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(q, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(10.dp))
                    Ic(R.drawable.fi_chevron_down, tint = Brand.Slate600, modifier = Modifier.rotate(if (open) 180f else 0f))
                }
                AnimatedVisibility(open) {
                    Text(a, fontSize = 14.sp, lineHeight = 21.sp, color = Brand.Slate600, modifier = Modifier.padding(top = 10.dp))
                }
            }
            if (i < FAQ.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(Brand.Warm200))
        }
    }
}

@Composable
private fun FinalCta(config: AppConfig, onBook: () -> Unit, onWhatsApp: () -> Unit, onFind: () -> Unit) {
    val context = LocalContext.current
    Box(Modifier.fillMaxWidth().background(Brand.Warm50).padding(start = 16.dp, end = 16.dp, bottom = 40.dp)) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp))
                .background(Brush.linearGradient(listOf(Brand.B700, Brand.B900)))
                .padding(horizontal = 22.dp, vertical = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Ic(R.drawable.fi_users, tint = Brand.B200, size = 32.dp)
            Spacer(Modifier.height(14.dp))
            Text("When you can’t be there, we can.", style = MaterialTheme.typography.headlineMedium, color = Color.White, textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            Text("Tell us who needs help. A real person on our team will take it from there.", color = Brand.B100, textAlign = TextAlign.Center, fontSize = 15.sp, lineHeight = 22.sp)
            Spacer(Modifier.height(22.dp))
            AppButton("BOOK A CHAMP", onBook, Modifier.fillMaxWidth(), BtnKind.Light, icon = R.drawable.fi_user_check, large = true)
            Spacer(Modifier.height(10.dp))
            AppButton("GET HELP NOW ON WHATSAPP", onWhatsApp, Modifier.fillMaxWidth(), BtnKind.WhatsApp, icon = R.drawable.fa_whatsapp, large = true)
            Spacer(Modifier.height(10.dp))
            AppButton("CALL US", { dial(context, config.supportPhone) }, Modifier.fillMaxWidth(), BtnKind.OnDark, icon = R.drawable.fi_phone, large = true)
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Already booked? ", color = Brand.B200, fontSize = 14.sp)
                LinkText("Track your request", onFind, color = Color.White)
            }
        }
    }
}

@Composable
private fun Footer(config: AppConfig, onFind: () -> Unit, onBook: () -> Unit, onDoc: (String) -> Unit) {
    val context = LocalContext.current
    Column(Modifier.fillMaxWidth().background(Brand.B950).padding(horizontal = 20.dp, vertical = 36.dp).testTag("footer")) {
        BrandLogo(light = true)
        Spacer(Modifier.height(16.dp))
        Text(
            "${config.tagline} Verified companions who accompany your parents to hospitals, clinics and diagnostic centres across ${config.city} — and keep you updated every step of the way.",
            color = Brand.B200, fontSize = 14.sp, lineHeight = 21.sp,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            bold(
                "Not an emergency service. " to true,
                "We do not diagnose, prescribe, treat or replace doctors, nurses, ambulances or emergency medical services. In an emergency call ${config.emergencyNumber} or ${config.ambulanceNumber}." to false,
            ),
            color = Brand.B200, fontSize = 12.sp, lineHeight = 18.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.05f))
                .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(12.dp)).padding(12.dp),
        )
        Spacer(Modifier.height(26.dp))
        Text("CONTACT", color = Brand.B300, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.6.sp)
        Spacer(Modifier.height(10.dp))
        FooterLink(config.supportPhoneDisplay) { dial(context, config.supportPhone) }
        FooterLink(config.supportEmail) { sendEmail(context, config.supportEmail) }
        Text(config.supportHours, color = Brand.B300, fontSize = 14.sp, modifier = Modifier.padding(vertical = 5.dp))
        Text("Serving ${config.areas.joinToString(", ")}", color = Brand.B300, fontSize = 14.sp, modifier = Modifier.padding(vertical = 5.dp))
        Spacer(Modifier.height(22.dp))
        Text("COMPANY", color = Brand.B300, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.6.sp)
        Spacer(Modifier.height(10.dp))
        FooterLink("Track a request", onFind)
        FooterLink("Book online", onBook)
        FooterLink("Safety & medical boundary") { onDoc("safety") }
        FooterLink("Privacy notice") { onDoc("privacy") }
        FooterLink("Terms of service") { onDoc("terms") }
        Spacer(Modifier.height(24.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.1f)))
        Spacer(Modifier.height(16.dp))
        Text("© ${java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)} ChampOnCall. All rights reserved.", color = Brand.B300, fontSize = 12.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
    }
}

@Composable
private fun FooterLink(text: String, onClick: () -> Unit) {
    Text(text, color = Brand.B100, fontSize = 14.sp, modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 6.dp))
}
