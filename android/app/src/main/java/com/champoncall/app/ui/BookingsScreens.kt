@file:OptIn(ExperimentalMaterial3Api::class)

package com.champoncall.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.champoncall.app.R
import com.champoncall.app.data.ApiException
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.Format
import com.champoncall.app.data.HistoryAuth
import com.champoncall.app.data.Profile
import com.champoncall.app.data.Repo
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.data.Stages
import com.champoncall.app.push.Push
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/** "My bookings" tab: every request made or found on this phone, with live status. */
@Composable
fun BookingsScreen(onTrack: (String) -> Unit, onBook: () -> Unit, onFind: () -> Unit, onVerify: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf(Bookings.all(context)) }
    var auth by remember { mutableStateOf(HistoryAuth.load(context)) }
    var refreshing by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }

    suspend fun refreshAll() {
        // Verified number: pull every booking made with it (app, website, WhatsApp, phone)
        if (auth != null) {
            Repo.syncHistory(context)
            auth = HistoryAuth.load(context)
            list = Bookings.all(context)
        }
        coroutineScope {
            Bookings.all(context).map { b ->
                async {
                    runCatching { Repo.track(b.number, b.token) }.getOrNull()?.let { t ->
                        Bookings.updateStatus(context, b.number, t.status, t.statusLabel, t.serviceType)
                    }
                }
            }.awaitAll()
        }
        list = Bookings.all(context)
    }

    LaunchedEffect(tick) { refreshAll() }

    Column(Modifier.fillMaxSize().background(Brand.Warm50)) {
        TopBar("My bookings", null) {
            Surface(onClick = onFind, shape = RoundedCornerShape(10.dp), color = Color.White, border = BorderStroke(1.dp, Brand.Slate200), modifier = Modifier.padding(end = 12.dp).testTag("bookings-find")) {
                Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Ic(R.drawable.fi_search, tint = Brand.Ink, size = 15.dp)
                    Spacer(Modifier.width(6.dp))
                    Text("Find", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        HistoryBanner(auth, onVerify) {
            auth?.let { a -> scope.launch { Repo.historyLogout(a.token) } }
            HistoryAuth.clear(context)
            auth = null
        }
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                refreshing = true
                scope.launch { refreshAll(); refreshing = false }
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            if (list.isEmpty()) {
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp).testTag("bookings-empty"),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Spacer(Modifier.height(30.dp))
                    Box(Modifier.size(76.dp).clip(CircleShape).background(Brand.B50), contentAlignment = Alignment.Center) {
                        Ic(R.drawable.fi_calendar, tint = Brand.B600, size = 32.dp)
                    }
                    Text("No bookings yet", style = MaterialTheme.typography.headlineSmall, color = Brand.B950)
                    Text(
                        "When you book a Champ, you can follow every step here. Booked on WhatsApp or the website? Verify your mobile number above to see those bookings too.",
                        textAlign = TextAlign.Center, color = Brand.Slate600, fontSize = 15.sp, lineHeight = 22.sp,
                    )
                    Spacer(Modifier.height(6.dp))
                    AppButton("Book a Champ", onBook, Modifier.fillMaxWidth(), BtnKind.Primary, icon = R.drawable.fi_user_check, large = true)
                    AppButton("Find a booking", onFind, Modifier.fillMaxWidth(), BtnKind.Secondary, icon = R.drawable.fi_search)
                }
            } else {
                LazyColumn(
                    Modifier.fillMaxSize().testTag("bookings-list"),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    val active = list.filter { !Stages.isFinal(it.lastStatus) }
                    val past = list.filter { Stages.isFinal(it.lastStatus) }
                    if (active.isNotEmpty()) {
                        item { Kicker("Active") }
                        items(active, key = { "a-" + it.number }) { BookingRow(it, onTrack) }
                    }
                    if (past.isNotEmpty()) {
                        item { Column { Spacer(Modifier.height(6.dp)); Kicker("Past") } }
                        items(past, key = { "p-" + it.number }) { BookingRow(it, onTrack) }
                    }
                }
            }
        }
    }
}

@Composable
private fun BookingRow(b: SavedBooking, onTrack: (String) -> Unit) {
    val final = Stages.isFinal(b.lastStatus)
    Surface(
        onClick = { onTrack(b.number) },
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Brand.Slate200),
        shadowElevation = 1.dp,
        modifier = Modifier.fillMaxWidth().testTag("booking-${b.number}"),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(if (final) Brand.Slate100 else Brand.B700), contentAlignment = Alignment.Center) {
                Ic(if (b.lastStatus == "COMPLETED") R.drawable.fi_check else R.drawable.fi_activity, tint = if (final) Brand.Slate600 else Brand.Gold400, size = 20.dp)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(b.number, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                if (b.service.isNotBlank()) Text(b.service, fontSize = 13.sp, color = Brand.Slate600)
                val via = when (b.channel?.lowercase()) {
                    "whatsapp" -> "WhatsApp"
                    "web" -> "Website"
                    "app", "android" -> "App"
                    "phone", "ops" -> "Phone"
                    else -> null
                }
                if (b.createdAt > 0) Text(listOfNotNull(Format.dateTime(b.createdAt), via?.let { "via $it" }).joinToString(" · "), fontSize = 12.sp, color = Brand.Slate400)
            }
            Column(horizontalAlignment = Alignment.End) {
                Pill(
                    b.lastLabel ?: "Tap to view",
                    when (b.lastStatus) {
                        "COMPLETED" -> Brand.Emerald50
                        "CANCELLED", "UNFULFILLED" -> Brand.Slate100
                        null -> Brand.Slate100
                        else -> Brand.B50
                    },
                    when (b.lastStatus) {
                        "COMPLETED" -> Brand.Emerald700
                        "CANCELLED", "UNFULFILLED", null -> Brand.Slate600
                        else -> Brand.B700
                    },
                )
            }
        }
    }
}

/** Find a booking made on the website, WhatsApp or by phone. */
@Composable
fun FindScreen(onBack: () -> Unit, onFound: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val toast = LocalToast.current
    var number by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf(Profile.load(context).phone) }
    var busy by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(Brand.Warm50)) {
        TopBar("Track a request", onBack)
        Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp)) {
            AppCard(padding = 22.dp) {
                Ic(R.drawable.fi_search, tint = Brand.B600, size = 28.dp)
                Text("Track your request", style = MaterialTheme.typography.titleLarge)
                Text("Use the link in your WhatsApp messages, or enter your request ID and the mobile number you booked with.", fontSize = 14.sp, color = Brand.Slate500, lineHeight = 20.sp)
                Field("Request ID") { AppTextField(number, { number = it.uppercase().trim().take(20) }, placeholder = "MC-10452", tag = "find-number") }
                Field("Mobile number") { AppTextField(phone, { phone = it.take(16) }, placeholder = "98765 43210", keyboardType = KeyboardType.Phone, tag = "find-phone") }
                AppButton(
                    "Track",
                    {
                        if (number.isBlank() || Format.digits(phone).length < 10) {
                            toast("Please enter your request ID and 10-digit mobile number")
                        } else {
                            busy = true
                            scope.launch {
                                try {
                                    val (n, t) = Repo.lookup(number, phone)
                                    val saved = SavedBooking(n, t, "", System.currentTimeMillis())
                                    Bookings.save(context, saved)
                                    Push.register(saved)
                                    onFound(n)
                                } catch (e: ApiException) {
                                    toast(e.message ?: "No request found")
                                } finally {
                                    busy = false
                                }
                            }
                        }
                    },
                    Modifier.fillMaxWidth().testTag("find-submit"), BtnKind.Primary, loading = busy, large = true,
                )
            }
        }
    }
}

@Composable
private fun HistoryBanner(auth: HistoryAuth?, onVerify: () -> Unit, onSignOut: () -> Unit) {
    if (auth == null) {
        Surface(
            onClick = onVerify,
            color = Brand.B900,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp).testTag("bookings-verify"),
        ) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(38.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                    Ic(R.drawable.fi_smartphone, tint = Brand.Gold400, size = 18.dp)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("See all your bookings", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text("Including WhatsApp, website and phone bookings. Verify your mobile number.", color = Brand.B200, fontSize = 12.sp, lineHeight = 16.sp)
                }
                Ic(R.drawable.fi_chevron_right, tint = Color.White, size = 20.dp)
            }
        }
    } else {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 8.dp).testTag("bookings-verified"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Ic(R.drawable.fi_check_circle, tint = Brand.Emerald600, size = 15.dp)
            Spacer(Modifier.width(6.dp))
            Text("All bookings for ${formatPhone(auth.phone)}", fontSize = 13.sp, color = Brand.Slate600, modifier = Modifier.weight(1f))
            LinkText("Sign out", onSignOut, color = Brand.Slate500)
        }
    }
}

fun formatPhone(p: String): String {
    val d = p.filter { it.isDigit() }
    return if (d.length == 12 && d.startsWith("91")) "+91 ${d.substring(2, 7)} ${d.substring(7)}" else p
}

/** Verify the customer's mobile number with a code on WhatsApp, then load all their bookings. */
@Composable
fun VerifyScreen(onBack: () -> Unit, onDone: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val toast = LocalToast.current
    val config by Repo.config.collectAsState()
    var phone by remember { mutableStateOf(Profile.load(context).phone) }
    var code by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    var demoCode by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    fun send() {
        if (Format.digits(phone).length < 10) { toast("Please enter your 10-digit mobile number"); return }
        busy = true
        scope.launch {
            try {
                val r = Repo.historyCode(phone)
                demoCode = r.demoCode
                sent = true
                toast(if (r.demoCode != null) "Test mode: code shown on screen" else "Code sent to your WhatsApp")
            } catch (e: ApiException) {
                toast(e.message ?: "Could not send the code")
            } finally {
                busy = false
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Brand.Warm50)) {
        TopBar("Your bookings", onBack)
        Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp)) {
            AppCard(padding = 22.dp) {
                Ic(R.drawable.fi_smartphone, tint = Brand.B600, size = 28.dp)
                Text("Verify your mobile number", style = MaterialTheme.typography.titleLarge)
                Text(
                    "We’ll send a 6-digit code to your WhatsApp. Then you’ll see every booking made with this number — in the app, on WhatsApp, on the website or by phone.",
                    fontSize = 14.sp, color = Brand.Slate500, lineHeight = 20.sp,
                )
                Field("Mobile number") {
                    AppTextField(phone, { phone = it.take(16); sent = false; code = "" }, placeholder = "98765 43210", keyboardType = KeyboardType.Phone, tag = "verify-phone")
                }
                if (!sent) {
                    AppButton("Send code on WhatsApp", { send() }, Modifier.fillMaxWidth().testTag("verify-send"), BtnKind.WhatsApp, icon = R.drawable.fa_whatsapp, loading = busy, large = true)
                    Text("Not getting the code? Send “Hi” to us on WhatsApp first, then try again.", fontSize = 12.sp, color = Brand.Slate500)
                    LinkText("Open WhatsApp", { openWhatsApp(context, config.whatsappNumber, "Hi") })
                } else {
                    demoCode?.let { Notice("Test mode — your code is $it", icon = R.drawable.fi_info, modifier = Modifier.testTag("verify-demo-code")) }
                    Field("6-digit code") {
                        AppTextField(code, { v -> code = v.filter { it.isDigit() }.take(6) }, placeholder = "123456", keyboardType = KeyboardType.NumberPassword, tag = "verify-code")
                    }
                    AppButton(
                        "Verify and show my bookings",
                        {
                            if (code.length != 6) toast("Please enter the 6-digit code")
                            else {
                                busy = true
                                scope.launch {
                                    try {
                                        val r = Repo.historyVerify(phone, code)
                                        HistoryAuth.save(context, HistoryAuth(r.token ?: "", r.phone))
                                        Repo.saveHistory(context, r.items)
                                        val p = Profile.load(context)
                                        if (p.phone.isBlank()) Profile.save(context, p.copy(phone = phone.trim()))
                                        r.items.forEach { Push.register(SavedBooking(it.number, it.token, it.service, it.createdAt)) }
                                        toast(if (r.items.isEmpty()) "Verified. No bookings found for this number yet." else "Found ${r.items.size} booking${if (r.items.size == 1) "" else "s"}")
                                        onDone()
                                    } catch (e: ApiException) {
                                        toast(e.message ?: "Could not verify")
                                    } finally {
                                        busy = false
                                    }
                                }
                            }
                        },
                        Modifier.fillMaxWidth().testTag("verify-submit"), BtnKind.Primary, loading = busy, large = true,
                    )
                    LinkText("Resend code", { send() })
                }
            }
        }
    }
}
