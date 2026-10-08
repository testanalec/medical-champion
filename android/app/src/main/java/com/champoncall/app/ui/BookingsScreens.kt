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
fun BookingsScreen(onTrack: (String) -> Unit, onBook: () -> Unit, onFind: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf(Bookings.all(context)) }
    var refreshing by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) }

    suspend fun refreshAll() {
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
                        "When you book a Champ, you can follow every step here. Booked on the website or WhatsApp? Find it with your request ID.",
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
                if (b.createdAt > 0) Text("Saved ${Format.dateTime(b.createdAt)}", fontSize = 12.sp, color = Brand.Slate400)
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
