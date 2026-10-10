@file:OptIn(ExperimentalMaterial3Api::class)

package com.champoncall.app.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.champoncall.app.R
import com.champoncall.app.data.ApiException
import com.champoncall.app.data.AppConfig
import com.champoncall.app.data.BookResult
import com.champoncall.app.data.BookingForm
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.Format
import com.champoncall.app.data.Place
import com.champoncall.app.data.Profile
import com.champoncall.app.data.RELATIONSHIPS
import com.champoncall.app.data.Repo
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.push.Push
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Calendar
import java.util.TimeZone
import java.util.UUID

@Composable
fun BookScreen(onBack: () -> Unit, onTrack: (String) -> Unit, onHome: () -> Unit, onDoc: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val toast = LocalToast.current
    val config by Repo.config.collectAsState()
    val profile = remember { Profile.load(context) }
    var f by remember { mutableStateOf(BookingForm(customerName = profile.name, customerPhone = profile.phone, customerEmail = profile.email)) }
    var gate by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf<BookResult?>(null) }
    val key = remember { UUID.randomUUID().toString() }
    var pickerOpen by remember { mutableStateOf(false) }
    var locating by remember { mutableStateOf(false) }
    var mapOpen by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { Repo.refreshConfig() }

    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.any { it }) {
            locating = true
            currentLocation(context) { loc ->
                locating = false
                if (loc == null) toast("Could not get your location. Please type the address.")
                else f = f.copy(pickupLat = loc.latitude, pickupLng = loc.longitude, pickupInArea = null, pickupText = f.pickupText.ifBlank { "Current location (pinned)" })
            }
        } else toast("Location permission was not given. Please type the address.")
    }

    val submit: () -> Unit = submit@{
        val err = f.error()
        if (err != null) {
            toast(err)
            return@submit
        }
        busy = true
        scope.launch {
            try {
                val res = Repo.book(f, key)
                val saved = SavedBooking(res.number, res.token, config.services.firstOrNull { it.id == f.serviceType }?.label ?: "", System.currentTimeMillis(), "NEW", "Request received")
                Bookings.save(context, saved)
                Profile.save(context, Profile(f.customerName.trim(), f.customerPhone.trim(), f.customerEmail.trim()))
                Push.register(saved)
                done = res
            } catch (e: ApiException) {
                toast(e.message ?: "Something went wrong")
            } finally {
                busy = false
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Brand.Warm50)) {
        TopBar(if (done == null) "Book a Champ" else "Request received", onBack)
        val result = done
        if (result != null) {
            BookSuccess(result, config, onTrack = { onTrack(result.number) }, onHome = onHome)
            return@Column
        }
        Column(
            Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp).testTag("book-form"),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column {
                Kicker("Book online")
                Spacer(Modifier.height(6.dp))
                Text("Request a companion", style = MaterialTheme.typography.headlineLarge, color = Brand.B950)
                Spacer(Modifier.height(6.dp))
            }

            // Booking on WhatsApp is just as good: our team takes the details on chat,
            // and those bookings also appear under "My bookings".
            AppCard(color = Brand.Emerald50, borderColor = Color(0xFFBBF7D0), modifier = Modifier.testTag("book-whatsapp-card")) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Ic(R.drawable.fa_whatsapp, tint = Brand.WhatsApp, size = 22.dp)
                    Spacer(Modifier.width(10.dp))
                    Text("Prefer to chat? Book on WhatsApp", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Brand.Emerald800)
                }
                Text(
                    "Send us a message and our team will take your booking on chat. WhatsApp bookings also show in “My bookings”.",
                    fontSize = 13.sp, lineHeight = 19.sp, color = Brand.Emerald800,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AppButton(
                        "Book on WhatsApp",
                        { openWhatsApp(context, config.whatsappNumber, config.whatsappPrefill) },
                        Modifier.weight(1.3f).testTag("book-whatsapp"), BtnKind.WhatsApp, icon = R.drawable.fa_whatsapp,
                    )
                    AppButton("Call us", { dial(context, config.supportPhone) }, Modifier.weight(1f), BtnKind.Secondary, icon = R.drawable.fi_phone)
                }
            }
            Text("Or fill in the form below:", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Brand.Slate600)

            AppCard {
                StepTitle("1. Who needs assistance?")
                Chips(RELATIONSHIPS.map { it to it }, f.relationship, { f = f.copy(relationship = it) }, "rel")
                Field("Their name") { AppTextField(f.patientName, { f = f.copy(patientName = it.take(80)) }, placeholder = "e.g. Kamla Devi", tag = "book-patient-name") }
                Field("Age") {
                    AppTextField(f.patientAge, { v -> f = f.copy(patientAge = v.filter { it.isDigit() }.take(3)) }, keyboardType = KeyboardType.Number, tag = "book-age")
                }
                Field("Preferred language") {
                    Chips(listOf("" to "Any") + config.languages.map { it to it }, f.patientLanguage, { f = f.copy(patientLanguage = it) }, "lang")
                }
                Field("Their mobile (optional)") {
                    AppTextField(f.patientPhone, { f = f.copy(patientPhone = it.take(16)) }, keyboardType = KeyboardType.Phone, tag = "book-patient-phone")
                }
            }

            AppCard {
                StepTitle("2. Where and what")
                Field("Pickup address", "House/flat, society, sector. Start typing an area to pin it.") {
                    PlaceField(
                        value = f.pickupText,
                        onValueChange = { f = f.copy(pickupText = it, pickupLat = null, pickupLng = null, pickupInArea = null) },
                        onPick = { p ->
                            val text = if (f.pickupText.isNotBlank() && !f.pickupText.contains(p.name, ignoreCase = true)) "${f.pickupText}, ${p.address}" else p.address
                            f = f.copy(pickupText = text, pickupLat = p.lat, pickupLng = p.lng, pickupInArea = p.inArea)
                        },
                        type = "locality",
                        placeholder = "e.g. B-12, Sushant Lok 1",
                        tag = "book-pickup",
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppButton(
                        if (locating) "Finding…" else "Current location",
                        {
                            val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                            val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                            if (fine || coarse) {
                                locating = true
                                currentLocation(context) { loc ->
                                    locating = false
                                    if (loc == null) toast("Could not get your location. Please type the address or pick it on the map.")
                                    else f = f.copy(pickupLat = loc.latitude, pickupLng = loc.longitude, pickupInArea = null, pickupText = f.pickupText.ifBlank { "Current location (pinned)" })
                                }
                            } else {
                                locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                            }
                        },
                        Modifier.weight(1f).testTag("book-current-location"), BtnKind.Secondary, icon = R.drawable.fi_navigation, enabled = !locating,
                    )
                    AppButton(
                        "Pick on map",
                        { mapOpen = true },
                        Modifier.weight(1f).testTag("book-map"), BtnKind.Secondary, icon = R.drawable.fi_map_pin,
                    )
                }
                if (f.pickupLat != null) {
                    Text(
                        "📍 Location pinned" + if (f.pickupInArea == false) " — this looks outside ${config.city}; our team will review before confirming" else "",
                        fontSize = 12.sp, color = Brand.Emerald700, modifier = Modifier.testTag("pinned"),
                    )
                }
                Field("Type of help") {
                    Chips(config.services.map { it.id to it.label }, f.serviceType, { f = f.copy(serviceType = it) }, "svc")
                }
                Field("Hospital / clinic", "Leave empty if not decided yet") {
                    PlaceField(
                        value = f.destText,
                        onValueChange = { f = f.copy(destText = it, destLat = null, destLng = null) },
                        onPick = { p -> f = f.copy(destText = p.name, destLat = p.lat, destLng = p.lng) },
                        type = "hospital",
                        placeholder = "e.g. Medanta",
                        tag = "book-dest",
                    )
                }
            }

            AppCard {
                StepTitle("3. When & mobility")
                Chips(BookingForm.URGENCIES, f.urgency, { f = f.copy(urgency = it) }, "urg")
                if (f.urgency == "SCHEDULED") {
                    Field("Date & time") {
                        Surface(
                            onClick = { pickerOpen = true },
                            shape = RoundedCornerShape(12.dp),
                            color = Color.White,
                            border = BorderStroke(1.dp, Brand.Slate300),
                            modifier = Modifier.fillMaxWidth().testTag("book-datetime"),
                        ) {
                            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Ic(R.drawable.fi_calendar, tint = Brand.B600)
                                Spacer(Modifier.width(10.dp))
                                Text(f.requestedAtMillis?.let { Format.dateTime(it) } ?: "Choose date & time", fontSize = 15.sp, color = if (f.requestedAtMillis == null) Brand.Slate400 else Brand.Ink)
                            }
                        }
                    }
                }
                Field("Can they walk independently?") {
                    Chips(BookingForm.MOBILITY, f.mobility, { f = f.copy(mobility = it) }, "mob")
                }
                if (f.mobility == "BEDRIDDEN") {
                    Notice("Thank you. A care team member will personally review this and call you before confirming — some situations need medical transport rather than a companion.", icon = null)
                }
                Field(
                    "Anything important we should know?",
                    "Only what the companion needs — e.g. “uses a walker”, “hard of hearing”. Please don’t share medical history. ${f.instructions.length}/${BookingForm.INSTRUCTIONS_MAX}",
                ) {
                    AppTextField(f.instructions, { f = f.copy(instructions = it.take(BookingForm.INSTRUCTIONS_MAX)) }, singleLine = false, minLines = 3, tag = "book-notes")
                }
            }

            AppCard {
                StepTitle("4. Your details")
                Field("Your name") { AppTextField(f.customerName, { f = f.copy(customerName = it.take(80)) }, tag = "book-name") }
                Field("Your mobile (WhatsApp)") {
                    AppTextField(f.customerPhone, { f = f.copy(customerPhone = it.take(16)) }, placeholder = "98765 43210", keyboardType = KeyboardType.Phone, tag = "book-phone")
                }
                Field("Email (optional)") {
                    AppTextField(f.customerEmail, { f = f.copy(customerEmail = it.take(120)) }, keyboardType = KeyboardType.Email, tag = "book-email")
                }
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(
                        checked = f.consent,
                        onCheckedChange = { f = f.copy(consent = it) },
                        colors = CheckboxDefaults.colors(checkedColor = Brand.B700),
                        modifier = Modifier.testTag("book-consent"),
                    )
                    Column(Modifier.padding(top = 12.dp)) {
                        Text(
                            "I agree to the privacy notice and terms, and I have the consent of the person receiving assistance to share their details for this service.",
                            fontSize = 14.sp, lineHeight = 20.sp, color = Brand.Slate600,
                            modifier = Modifier.clickable { f = f.copy(consent = !f.consent) },
                        )
                        Row {
                            LinkText("Privacy notice", { onDoc("privacy") }, fontColor())
                            Spacer(Modifier.width(16.dp))
                            LinkText("Terms", { onDoc("terms") }, fontColor())
                        }
                    }
                }
            }

            EstimateCard(config, f, busy, submit)
            Spacer(Modifier.height(24.dp))
        }
    }

    if (gate && done == null) {
        EmergencyGate(config, onDismiss = { gate = false }, onContinue = { gate = false })
    }
    if (mapOpen) {
        MapPicker(
            startLat = f.pickupLat,
            startLng = f.pickupLng,
            onDismiss = { mapOpen = false },
            onPicked = { lat, lng, address ->
                mapOpen = false
                val typed = f.pickupText.trim()
                val text = when {
                    address != null && (typed.isBlank() || typed.startsWith("Current location") || typed.startsWith("Pinned on map")) -> address
                    typed.isNotBlank() -> typed
                    else -> String.format(java.util.Locale.US, "Pinned on map (%.5f, %.5f)", lat, lng)
                }
                f = f.copy(pickupLat = lat, pickupLng = lng, pickupInArea = null, pickupText = text)
            },
        )
    }
    if (pickerOpen) {
        DateTimePicker(
            initial = f.requestedAtMillis,
            onDismiss = { pickerOpen = false },
            onPicked = { millis -> pickerOpen = false; f = f.copy(requestedAtMillis = millis) },
        )
    }
}

private fun fontColor() = Brand.B700

@Composable
private fun StepTitle(text: String) {
    Text(text, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = Brand.Ink)
}

@Composable
private fun EstimateCard(config: AppConfig, f: BookingForm, busy: Boolean, onSubmit: () -> Unit) {
    val rule = config.ruleFor(f.serviceType.ifBlank { null })
    AppCard {
        if (rule != null) {
            Column(Modifier.testTag("estimate")) {
                Text("Estimated", fontSize = 12.sp, color = Brand.Slate500)
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, fontSize = 20.sp)) { append(Format.inr(rule.baseFee)) }
                        withStyle(SpanStyle(color = Brand.Slate500, fontSize = 14.sp)) {
                            append("  first ${rule.includedHours} h · then ${Format.inr(rule.extensionPerHour)}/h")
                            if (rule.taxPercent > 0) append(" + ${rule.taxPercent.toInt()}% GST")
                        }
                    },
                )
                Text("Pay after the service", fontSize = 12.sp, color = Brand.Slate500)
            }
        }
        AppButton("Confirm request", onSubmit, Modifier.fillMaxWidth().testTag("book-submit"), BtnKind.Primary, large = true, loading = busy)
    }
}

@Composable
private fun BookSuccess(result: BookResult, config: AppConfig, onTrack: () -> Unit, onHome: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        AppCard(padding = 24.dp, spacing = 10.dp) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(72.dp).clip(CircleShape).background(Brand.Emerald50), contentAlignment = Alignment.Center) {
                    Ic(R.drawable.fi_check_circle, tint = Brand.Emerald500, size = 44.dp)
                }
                Spacer(Modifier.height(14.dp))
                Text("We’ve received your request.", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, modifier = Modifier.testTag("book-success"))
                Spacer(Modifier.height(8.dp))
                Text("Request ID", color = Brand.Slate600)
                Text(result.number, fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 38.sp, color = Brand.B800, modifier = Modifier.testTag("book-request-number"))
                Spacer(Modifier.height(10.dp))
                Text(
                    "Our support team is reviewing it and will contact you shortly" +
                        (if (result.humanReview) " — because of the details you shared, a care team member will call you personally before confirming" else "") + ".",
                    color = Brand.Slate600, textAlign = TextAlign.Center, fontSize = 15.sp, lineHeight = 22.sp,
                )
            }
            Notice(
                "This is not an emergency service. If your loved one has life-threatening symptoms, call ${config.emergencyNumber} or ${config.ambulanceNumber} now.",
                bg = Brand.Red50, fg = Brand.Red900, border = Brand.Red100,
            )
            Notice(
                "We’ll send you a notification at every step. You can follow this request any time from “My bookings”.",
                bg = Brand.B50, fg = Brand.B800, border = Brand.B100, icon = R.drawable.fi_bell,
            )
            AppButton("Track this request", onTrack, Modifier.fillMaxWidth().testTag("book-track"), BtnKind.Primary, trailingIcon = R.drawable.fi_arrow_right, large = true)
            AppButton("Back to home", onHome, Modifier.fillMaxWidth(), BtnKind.Ghost)
        }
    }
}

/** Text field with place suggestions from the server (same search as the website). */
@Composable
fun PlaceField(
    value: String,
    onValueChange: (String) -> Unit,
    onPick: (Place) -> Unit,
    type: String,
    placeholder: String,
    tag: String,
) {
    var typing by remember { mutableStateOf(false) }
    var results by remember { mutableStateOf<List<Place>>(emptyList()) }
    val focus = androidx.compose.ui.platform.LocalFocusManager.current
    LaunchedEffect(value, typing) {
        if (!typing || value.trim().length < 2) {
            results = emptyList()
            return@LaunchedEffect
        }
        delay(250)
        results = runCatching { Repo.places(value.trim(), type) }.getOrDefault(emptyList())
    }
    Column {
        AppTextField(value, { new ->
            // Keyboards can re-send the same text after a suggestion is picked; only real edits count.
            val v = new.take(300)
            if (v != value) { typing = true; onValueChange(v) }
        }, placeholder = placeholder, tag = tag, leading = if (type == "hospital") R.drawable.fa_hospital else R.drawable.fi_map_pin)
        if (typing && results.isNotEmpty()) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color.White,
                shadowElevation = 6.dp,
                border = BorderStroke(1.dp, Brand.Slate200),
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp).testTag("$tag-options"),
            ) {
                Column(Modifier.padding(4.dp)) {
                    results.take(6).forEachIndexed { i, p ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable {
                                typing = false
                                results = emptyList()
                                focus.clearFocus()
                                onPick(p)
                            }.padding(horizontal = 10.dp, vertical = 9.dp).testTag("$tag-option-$i"),
                        ) {
                            Ic(R.drawable.fi_map_pin, Modifier.padding(top = 3.dp), tint = Brand.B600, size = 15.dp)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(p.name, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                Text(p.address + if (p.inArea == false) " · outside service area" else "", fontSize = 12.sp, color = Brand.Slate500, lineHeight = 16.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DateTimePicker(initial: Long?, onDismiss: () -> Unit, onPicked: (Long) -> Unit) {
    val now = System.currentTimeMillis()
    val minStart = now + 30 * 60_000L
    val todayUtc = remember {
        val c = Calendar.getInstance()
        val u = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        u.clear()
        u.set(c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH))
        u.timeInMillis
    }
    var step by remember { mutableStateOf(0) }
    var dateUtc by remember { mutableStateOf<Long?>(null) }
    val dateState = rememberDatePickerState(
        initialSelectedDateMillis = todayUtc,
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis >= todayUtc && utcTimeMillis <= todayUtc + 60L * 24 * 3600_000
        },
    )
    val initCal = Calendar.getInstance().apply { timeInMillis = initial ?: (minStart + 30 * 60_000L) }
    val timeState = rememberTimePickerState(initialHour = initCal.get(Calendar.HOUR_OF_DAY), initialMinute = (initCal.get(Calendar.MINUTE) / 5) * 5, is24Hour = false)

    if (step == 0) {
        DatePickerDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                TextButton(onClick = { dateUtc = dateState.selectedDateMillis ?: todayUtc; step = 1 }, modifier = Modifier.testTag("date-ok")) { Text("Next") }
            },
            dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        ) { DatePicker(state = dateState) }
    } else {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Pickup time") },
            text = { TimePicker(state = timeState) },
            confirmButton = {
                TextButton(onClick = {
                    val u = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = dateUtc ?: todayUtc }
                    val local = Calendar.getInstance().apply {
                        clear()
                        set(u.get(Calendar.YEAR), u.get(Calendar.MONTH), u.get(Calendar.DAY_OF_MONTH), timeState.hour, timeState.minute)
                    }
                    onPicked(local.timeInMillis)
                }, modifier = Modifier.testTag("time-ok")) { Text("Done") }
            },
            dismissButton = { TextButton(onClick = { step = 0 }) { Text("Back") } },
        )
    }
}

/** One-shot location fix using the platform location service (no Google Play dependency). */
@SuppressLint("MissingPermission")
fun currentLocation(context: Context, onResult: (Location?) -> Unit) {
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    if (lm == null) { onResult(null); return }
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
        .filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
    val recent = providers.mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
        .filter { System.currentTimeMillis() - it.time < 10 * 60_000L }
        .maxByOrNull { it.time }
    if (recent != null) { onResult(recent); return }
    val provider = providers.firstOrNull { it != LocationManager.PASSIVE_PROVIDER } ?: run { onResult(null); return }
    var finished = false
    val handler = android.os.Handler(Looper.getMainLooper())
    val finish: (Location?) -> Unit = { loc -> if (!finished) { finished = true; onResult(loc) } }
    try {
        if (Build.VERSION.SDK_INT >= 30) {
            lm.getCurrentLocation(provider, null, ContextCompat.getMainExecutor(context)) { finish(it) }
        } else {
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) { finish(location); lm.removeUpdates(this) }
                // Older Android versions need these implemented (they have no default there).
                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String, status: Int, extras: android.os.Bundle?) {}
                override fun onProviderEnabled(provider: String) {}
                override fun onProviderDisabled(provider: String) {}
            }
            @Suppress("DEPRECATION")
            lm.requestSingleUpdate(provider, listener, Looper.getMainLooper())
            handler.postDelayed({ lm.removeUpdates(listener); finish(null) }, 20_000)
        }
    } catch (e: Exception) {
        finish(null)
    }
    handler.postDelayed({ finish(null) }, 25_000)
}
