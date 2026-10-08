package com.champoncall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.champoncall.app.R
import com.champoncall.app.data.ApiException
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.Format
import com.champoncall.app.data.Links
import com.champoncall.app.data.Repo
import com.champoncall.app.data.Stages
import com.champoncall.app.data.TrackInfo
import com.champoncall.app.data.URGENCY_LABEL
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun TrackScreen(number: String, onBack: () -> Unit, onFind: () -> Unit, onPay: (String, String) -> Unit) {
    val context = LocalContext.current
    val booking = remember(number) { Bookings.find(context, number) }
    var data by remember { mutableStateOf<TrackInfo?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var refresh by remember { mutableIntStateOf(0) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle

    LaunchedEffect(number, refresh) {
        if (booking == null) return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                try {
                    val t = Repo.track(booking.number, booking.token)
                    data = t
                    error = null
                    Bookings.updateStatus(context, booking.number, t.status, t.statusLabel, t.serviceType)
                } catch (e: ApiException) {
                    error = e.message
                }
                delay(10_000)
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Brand.Warm50)) {
        TopBar("Request $number", onBack)
        val d = data
        when {
            booking == null -> ErrorBox("This request isn’t saved on this phone yet. Find it with your request ID and mobile number.", "Find my request", onFind)
            d == null && error != null -> ErrorBox(error ?: "", "Try again") { refresh++ }
            d == null -> LoadingBox()
            else -> TrackBody(d, booking.number, booking.token, error, onPay) { refresh++ }
        }
    }
}

@Composable
private fun TrackBody(d: TrackInfo, number: String, token: String, error: String?, onPay: (String, String) -> Unit, reload: () -> Unit) {
    val context = LocalContext.current
    val stage = if (d.isClosed) -1 else Stages.index(d.status)
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).testTag("track-body"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (error != null) Notice("Couldn’t refresh just now: $error", icon = R.drawable.fi_refresh_cw)

        // Status header + progress
        Surface(shape = RoundedCornerShape(18.dp), color = Color.White, shadowElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
            Column {
                Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Brand.B700, Brand.B900))).padding(20.dp)) {
                    Text("REQUEST ${d.number}", color = Brand.B200, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.6.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(d.statusLabel, color = Color.White, fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 26.sp, lineHeight = 30.sp, modifier = Modifier.testTag("track-status"))
                    Spacer(Modifier.height(4.dp))
                    val line = listOfNotNull(d.serviceType?.let { s -> d.patientRef?.let { "$s for $it" } ?: s }, d.destination).joinToString(" · ")
                    if (line.isNotBlank()) Text(line, color = Brand.B100, fontSize = 14.sp)
                    Spacer(Modifier.height(10.dp))
                    val urgency = if (d.urgency == "SCHEDULED") "Scheduled · ${Format.dateTime(d.requestedAt) ?: ""}" else URGENCY_LABEL[d.urgency] ?: d.urgency
                    if (!urgency.isNullOrBlank()) Pill(urgency, Color.White.copy(alpha = 0.15f), Color.White, border = Color.White.copy(alpha = 0.2f))
                }
                if (stage >= 0) {
                    StageRow(stage, d.isCompleted)
                } else {
                    Text(
                        "This request was ${d.status.lowercase()}${d.cancellationReason?.let { " — $it" } ?: ""}. Please call us if you still need help.",
                        Modifier.padding(20.dp), color = Brand.Slate600, fontSize = 14.sp,
                    )
                }
                if (d.humanReview && !d.isCompleted && stage in 0..1) {
                    Notice(
                        "Our care team is personally reviewing this request and will call you before confirming.",
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
                    )
                }
            }
        }

        d.companion?.let { c ->
            AppCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(c.name, c.photoUrl, 56.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text("YOUR COMPANION", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Brand.Slate500, letterSpacing = 1.sp)
                        Text(c.name, fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.testTag("companion-name"))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Ic(R.drawable.fi_shield, tint = Brand.Emerald700, size = 13.dp)
                            Spacer(Modifier.width(4.dp))
                            Text("Verified", color = Brand.Emerald700, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            c.code?.let { Text("  ·  ID $it", color = Brand.Slate600, fontSize = 13.sp) }
                        }
                        if (c.languages.isNotEmpty()) Text("🗣 ${c.languages.joinToString(", ")}", color = Brand.Slate600, fontSize = 13.sp)
                    }
                    if (!d.isCompleted && d.actualArrival == null && d.eta != null) {
                        Column(
                            Modifier.clip(RoundedCornerShape(16.dp)).background(Brand.B50).padding(horizontal = 12.dp, vertical = 10.dp).testTag("eta"),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text("ETA", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Brand.B700)
                            Text(Format.time(d.eta) ?: "—", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Brand.B900)
                        }
                    }
                }
                if (d.actualArrival != null && !d.isCompleted) {
                    Pill("Arrived ${Format.time(d.actualArrival) ?: ""}", Brand.Emerald50, Brand.Emerald700)
                }
            }
        }

        if (d.isCompleted) {
            Summary(d, onPay)
            RatingCard(d, number, token, reload)
        }

        if (d.timeline.isNotEmpty()) {
            AppCard(spacing = 0.dp) {
                Text("Timeline", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Spacer(Modifier.height(14.dp))
                d.timeline.forEachIndexed { i, e ->
                    val last = i == d.timeline.lastIndex
                    Row(Modifier.fillMaxWidth()) {
                        Box(Modifier.width(16.dp), contentAlignment = Alignment.TopCenter) {
                            Box(Modifier.padding(top = 3.dp).size(14.dp).clip(CircleShape).background(if (last) Brand.Gold500 else Brand.B500))
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f).padding(bottom = if (last) 0.dp else 16.dp)) {
                            Text(e.label, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            e.notes?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 14.sp, color = Brand.Slate600) }
                        }
                        Text(Format.dateTime(e.createdAt) ?: "", fontSize = 12.sp, color = Brand.Slate500)
                    }
                }
            }
        }

        AppCard {
            Text("Need to talk to us?", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text("Our operations team is watching this visit" + (d.support.hours?.let { " · $it" } ?: ""), fontSize = 13.sp, color = Brand.Slate500)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppButton("Call support", { d.support.phone?.let { dial(context, it) } }, Modifier.weight(1f), BtnKind.Primary, icon = R.drawable.fi_phone)
                AppButton("WhatsApp", { d.support.whatsapp?.let { openWhatsApp(context, it, "Hi, about my request ${d.number}") } }, Modifier.weight(1f), BtnKind.WhatsApp, icon = R.drawable.fa_whatsapp)
            }
        }
        Row(Modifier.fillMaxWidth().clickable { dial(context, d.emergencyNumber) }.padding(bottom = 16.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Ic(R.drawable.fi_alert_triangle, tint = Brand.Slate500, size = 13.dp)
            Spacer(Modifier.width(6.dp))
            Text("Medical emergency? Call ${d.emergencyNumber} or ${d.ambulanceNumber}.", fontSize = 12.sp, color = Brand.Slate500)
        }
    }
}

@Composable
private fun StageRow(stage: Int, done: Boolean) {
    val scroll = rememberScrollState()
    val itemWidth = 84.dp
    val px = with(LocalDensity.current) { itemWidth.toPx() }
    LaunchedEffect(stage) { scroll.animateScrollTo(((stage - 1).coerceAtLeast(0) * px).toInt()) }
    Row(Modifier.fillMaxWidth().horizontalScroll(scroll).padding(horizontal = 8.dp, vertical = 18.dp).testTag("stages")) {
        Stages.all.forEachIndexed { i, (label, _) ->
            val complete = i < stage || done
            val current = i == stage && !done
            Box(Modifier.width(itemWidth)) {
                if (i > 0) {
                    Box(Modifier.offset(x = -itemWidth / 2, y = 13.dp).width(itemWidth).height(2.dp).background(if (i <= stage) Brand.B600 else Brand.Slate200))
                }
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(28.dp).clip(CircleShape).background(Color.White).padding(2.dp).clip(CircleShape)
                            .background(if (complete) Brand.B600 else if (current) Brand.Gold500 else Brand.Slate200),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (complete) Ic(R.drawable.fi_check, tint = Color.White, size = 14.dp)
                        else Text("${i + 1}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (current) Color.White else Brand.Slate500)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        label, fontSize = 11.sp, lineHeight = 13.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                        color = if (i <= stage) Brand.Ink else Brand.Slate400, modifier = Modifier.padding(horizontal = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun Summary(d: TrackInfo, onPay: (String, String) -> Unit) {
    val context = LocalContext.current
    val b = d.breakdown
    AppCard(modifier = Modifier.testTag("summary")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Ic(R.drawable.fi_file_text, tint = Brand.B600)
            Spacer(Modifier.width(8.dp))
            Text("Visit summary", fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.weight(1f))
            d.paymentStatus?.let { PayBadge(it) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat("Duration", Format.duration(d.durationMinutes), Modifier.weight(1f))
            Stat("Outcome", d.completionType ?: "—", Modifier.weight(1f))
            Stat("Companion", d.companion?.name ?: "—", Modifier.weight(1f))
        }
        Column {
            if (b != null) {
                LineRow("Base fee (first ${(b.includedMinutes ?: 0) / 60} h)", Format.inr(b.baseFee))
                if (b.extensionBlocks > 0) LineRow("Extra time (${b.extensionBlocks} × hour)", Format.inr(b.extensionAmount))
                if (b.urgentSurcharge > 0) LineRow("Urgent dispatch", Format.inr(b.urgentSurcharge))
                if (b.tax > 0) LineRow("GST (${b.taxPercent?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() } ?: ""}%)", Format.inr(b.tax))
            }
            d.expenses.forEach { e -> LineRow("${e.category}${e.description?.let { " · $it" } ?: ""} (at actuals)", Format.inr(e.amount)) }
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Total", fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                Text(Format.inr(d.finalAmount), fontWeight = FontWeight.Bold, fontSize = 19.sp, modifier = Modifier.testTag("summary-total"))
            }
        }
        val p = d.payment
        if (p != null && p.isUnpaid && !p.url.isNullOrBlank()) {
            AppButton(
                "PAY NOW · ${Format.inr(p.amount)}",
                {
                    val link = Links.parsePay(p.url)
                    if (link != null) onPay(link.first, link.second) else openUrl(context, p.url)
                },
                Modifier.fillMaxWidth().testTag("pay-now"), BtnKind.Gold, icon = R.drawable.fi_credit_card, large = true,
            )
        }
        if (p?.isPaid == true) {
            Notice(
                "Paid${p.method?.let { " via ${it.uppercase()}" } ?: ""}${Format.dateTime(p.paidAt)?.let { " · $it" } ?: ""}",
                bg = Brand.Emerald50, fg = Brand.Emerald800, border = Brand.Emerald50, icon = R.drawable.fi_check,
            )
        }
    }
}

@Composable
fun PayBadge(status: String) {
    val label = if (status == "NOT_DUE") "Not due" else status.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() }
    val (bg, fg) = when (status) {
        "PAID" -> Brand.Emerald50 to Brand.Emerald700
        "FAILED" -> Brand.Red50 to Brand.Red700
        "PENDING", "CREATED", "DUE" -> Brand.Amber50 to Brand.Amber900
        else -> Brand.Slate100 to Brand.Slate600
    }
    Pill(label, bg, fg)
}

@Composable
private fun Stat(label: String, value: String, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(12.dp)).background(Brand.Slate50).padding(10.dp)) {
        Text(label, fontSize = 11.sp, color = Brand.Slate500)
        Text(value, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 2)
    }
}

@Composable
private fun LineRow(label: String, value: String) {
    Column {
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
            Text(label, fontSize = 14.sp, color = Brand.Slate600, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(12.dp))
            Text(value, fontSize = 14.sp)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Brand.Slate100))
    }
}

@Composable
private fun RatingCard(d: TrackInfo, number: String, token: String, reload: () -> Unit) {
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val r = d.rating
    if (r != null) {
        AppCard(modifier = Modifier.testTag("rating-done")) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Row {
                    (1..5).forEach { i -> Text("★", fontSize = 26.sp, color = if (i <= r.overall) Brand.Amber400 else Brand.Slate200) }
                }
                Text("Thank you for your feedback", fontWeight = FontWeight.SemiBold)
                d.trustAgain?.let {
                    Text(
                        if (it) "We’re honoured you’d trust us again." else "We’re sorry — our team will reach out to understand what went wrong.",
                        fontSize = 13.sp, color = Brand.Slate500, textAlign = TextAlign.Center,
                    )
                }
            }
        }
        return
    }
    var stars by remember { mutableIntStateOf(0) }
    var trust by remember { mutableStateOf<Boolean?>(null) }
    var comment by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    AppCard(modifier = Modifier.testTag("rating")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Ic(R.drawable.fi_star, tint = Brand.Amber400)
            Spacer(Modifier.width(8.dp))
            Text("Rate your experience", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
        Row {
            (1..5).forEach { s ->
                Text(
                    "★",
                    fontSize = 40.sp,
                    color = if (s <= stars) Brand.Amber400 else Brand.Slate200,
                    modifier = Modifier.clickable { stars = s }.padding(horizontal = 2.dp).testTag("star-$s"),
                )
            }
        }
        Text("Would you trust us to help your parent again?", fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AppButton("Yes", { trust = true }, Modifier.weight(1f).testTag("trust-yes"), if (trust == true) BtnKind.WhatsApp else BtnKind.Secondary, icon = R.drawable.fi_thumbs_up)
            AppButton("No", { trust = false }, Modifier.weight(1f).testTag("trust-no"), if (trust == false) BtnKind.Danger else BtnKind.Secondary, icon = R.drawable.fi_thumbs_down)
        }
        if (trust == false) {
            Field("What should we have done better?") { AppTextField(reason, { reason = it.take(500) }, tag = "rate-reason") }
        }
        Field("Anything you’d like to share? (optional)") { AppTextField(comment, { comment = it.take(1000) }, singleLine = false, minLines = 3, tag = "rate-comment") }
        AppButton(
            "Submit feedback",
            {
                when {
                    stars == 0 -> toast("Please choose a star rating")
                    trust == null -> toast("Please answer the trust question")
                    else -> {
                        busy = true
                        scope.launch {
                            try {
                                Repo.rate(number, token, stars, trust == true, comment, reason)
                                toast("Thank you for rating us")
                                reload()
                            } catch (e: ApiException) {
                                toast(e.message ?: "Could not send your rating")
                            } finally {
                                busy = false
                            }
                        }
                    }
                }
            },
            Modifier.fillMaxWidth().testTag("rate-submit"), BtnKind.Primary, loading = busy,
        )
    }
}
