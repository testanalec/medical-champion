@file:OptIn(ExperimentalMaterial3Api::class)

package com.champoncall.app.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.champoncall.app.data.Api
import com.champoncall.app.data.AppConfig
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.data.asObj
import com.champoncall.app.data.obj
import com.champoncall.app.data.str
import com.champoncall.app.push.Push
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.UUID

private data class Place(val name: String, val address: String, val lat: Double?, val lng: Double?)

private val RELATIONSHIPS = listOf("Mother", "Father", "Spouse", "Someone Else")
private val URGENCY = listOf("ASAP" to "As soon as possible", "WITHIN_2_HOURS" to "Within 2 hours", "LATER_TODAY" to "Later today", "SCHEDULED" to "Schedule")
private val MOBILITY = listOf("INDEPENDENT" to "Walks on their own", "NEEDS_ASSISTANCE" to "Needs some help", "BEDRIDDEN" to "Bedridden")

@Composable
fun BookScreen(onBack: () -> Unit, onBooked: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var config by remember { mutableStateOf(AppConfig()) }
    LaunchedEffect(Unit) { config = AppConfig.load() }

    // who
    var relationship by remember { mutableStateOf<String?>(null) }
    var patientName by remember { mutableStateOf("") }
    var patientAge by remember { mutableStateOf("") }
    var language by remember { mutableStateOf<String?>(null) }
    // where & what
    var pickup by remember { mutableStateOf("") }
    var pickupPlace by remember { mutableStateOf<Place?>(null) }
    var service by remember { mutableStateOf<String?>(null) }
    var hospital by remember { mutableStateOf("") }
    var hospitalPlace by remember { mutableStateOf<Place?>(null) }
    // when
    var urgency by remember { mutableStateOf<String?>(null) }
    var scheduledAt by remember { mutableStateOf<Calendar?>(null) }
    var mobility by remember { mutableStateOf<String?>(null) }
    // you
    var customerName by remember { mutableStateOf("") }
    var customerPhone by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var consent by remember { mutableStateOf(false) }
    var notEmergency by remember { mutableStateOf(false) }

    var quoteText by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val idempotencyKey = remember { UUID.randomUUID().toString() }

    LaunchedEffect(service, urgency) {
        val s = service ?: return@LaunchedEffect
        quoteText = runCatching {
            val q = Api.post("/api/v1/public/quote", buildJsonObject {
                put("service_type", s)
                put("urgency", urgency ?: "ASAP")
            }).asObj()?.obj("quote")
            q?.let { "Estimated ${formatInr(it.str("total"))} for the first ${it.str("included_minutes") ?: "few"} minutes, including taxes. Extra time is billed only if needed." }
        }.getOrNull()
    }

    fun submit() {
        val missing = listOfNotNull(
            if (relationship == null) "who needs help" else null,
            if (pickup.isBlank()) "pickup address" else null,
            if (service == null) "type of help" else null,
            if (urgency == null) "when" else null,
            if (urgency == "SCHEDULED" && scheduledAt == null) "date & time" else null,
            if (mobility == null) "mobility" else null,
            if (customerName.isBlank()) "your name" else null,
            if (customerPhone.filter { it.isDigit() }.length < 10) "your mobile number" else null,
        )
        if (missing.isNotEmpty()) { error = "Please add: " + missing.joinToString(", "); return }
        if (!notEmergency) { error = "Please confirm this is not a medical emergency."; return }
        if (!consent) { error = "Please accept the privacy notice and terms."; return }
        error = null
        submitting = true
        scope.launch {
            try {
                val body = buildJsonObject {
                    put("relationship", relationship)
                    put("patient_name", patientName.ifBlank { null })
                    put("patient_age", patientAge.toIntOrNull())
                    put("patient_language", language)
                    put("pickup_address", pickupPlace?.let { p -> if (pickup.contains(p.address)) pickup else "$pickup, ${p.address}" } ?: pickup)
                    put("pickup_lat", pickupPlace?.lat)
                    put("pickup_lng", pickupPlace?.lng)
                    put("pickup_source", if (pickupPlace?.lat != null) "app_pin" else "typed")
                    put("service_type", service)
                    put("destination_name", hospital.ifBlank { null })
                    put("destination_address", hospitalPlace?.address)
                    put("destination_lat", hospitalPlace?.lat)
                    put("destination_lng", hospitalPlace?.lng)
                    put("urgency", urgency)
                    put("requested_at", if (urgency == "SCHEDULED") scheduledAt?.let { isoTime(it) } else null)
                    put("mobility", mobility)
                    put("special_instructions", notes.ifBlank { null })
                    put("customer_name", customerName.trim())
                    put("customer_phone", customerPhone.trim())
                    put("consent", true)
                    put("emergency_acknowledged", true)
                    put("idempotency_key", idempotencyKey)
                    putJsonObject("utm") { put("utm_source", "android_app") }
                }
                val res = Api.post("/api/v1/requests", body).asObj() ?: throw IllegalStateException("Unexpected reply")
                val (number, token) = Bookings.parseTrackUrl(res.str("track_url") ?: "")
                    ?: throw IllegalStateException("Booking saved, but we couldn't open tracking. Please check WhatsApp.")
                val label = config.services.firstOrNull { it.first == service }?.second ?: ""
                val saved = SavedBooking(number, token, label, System.currentTimeMillis())
                Bookings.save(context, saved)
                Push.register(saved)
                onBooked(number)
            } catch (e: Exception) {
                error = e.message ?: "Something went wrong. Please try again."
            } finally {
                submitting = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Book a Champ") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Brand.Navy, titleContentColor = Color.White, navigationIconContentColor = Color.White),
            )
        },
        containerColor = Brand.Ivory,
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SectionCard {
                StepTitle("1", "Who needs help?")
                ChoiceChips(RELATIONSHIPS.map { it to it }, relationship) { relationship = it }
                OutlinedTextField(patientName, { patientName = it }, label = { Text("Their name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    patientAge, { v -> patientAge = v.filter { it.isDigit() }.take(3) }, label = { Text("Age") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth(),
                )
                Text("Preferred language", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                ChoiceChips(config.languages.map { it to it }, language) { language = if (language == it) null else it }
            }

            SectionCard {
                StepTitle("2", "Where and what")
                PlaceField(
                    label = "Pickup address", hint = "House / flat, society, sector", type = "locality",
                    value = pickup, onValue = { pickup = it; pickupPlace = null }, onPick = { pickupPlace = it; if (!pickup.contains(it.name, ignoreCase = true)) pickup = if (pickup.isBlank()) it.address else "$pickup, ${it.name}" },
                    picked = pickupPlace != null,
                )
                Text("Type of help", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                ChoiceChips(config.services, service) { service = it }
                PlaceField(
                    label = "Hospital / clinic (optional)", hint = "e.g. Medanta", type = "hospital",
                    value = hospital, onValue = { hospital = it; hospitalPlace = null }, onPick = { hospitalPlace = it; hospital = it.name },
                    picked = hospitalPlace != null,
                )
            }

            SectionCard {
                StepTitle("3", "When and mobility")
                ChoiceChips(URGENCY, urgency) { urgency = it }
                if (urgency == "SCHEDULED") {
                    OutlinedButton(onClick = {
                        val now = Calendar.getInstance()
                        DatePickerDialog(context, { _, y, m, d ->
                            TimePickerDialog(context, { _, h, min ->
                                scheduledAt = Calendar.getInstance().apply { set(y, m, d, h, min, 0) }
                            }, now.get(Calendar.HOUR_OF_DAY) + 1, 0, false).show()
                        }, now.get(Calendar.YEAR), now.get(Calendar.MONTH), now.get(Calendar.DAY_OF_MONTH)).apply {
                            datePicker.minDate = now.timeInMillis - 1000
                        }.show()
                    }, modifier = Modifier.fillMaxWidth()) {
                        Text(scheduledAt?.let { SimpleDateFormat("EEE d MMM, h:mm a", Locale.getDefault()).format(it.time) } ?: "Pick date & time", color = Brand.Navy)
                    }
                }
                Text("Can they walk on their own?", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                ChoiceChips(MOBILITY, mobility) { mobility = it }
                if (mobility == "BEDRIDDEN") {
                    Text(
                        "Thank you. Our care team will call you before confirming — some situations need medical transport rather than a companion.",
                        style = MaterialTheme.typography.bodyMedium, color = Brand.GoldDeep,
                    )
                }
            }

            SectionCard {
                StepTitle("4", "Your details")
                OutlinedTextField(customerName, { customerName = it }, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    customerPhone, { customerPhone = it }, label = { Text("Your mobile (WhatsApp)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(notes, { notes = it }, label = { Text("Anything we should know? (optional)") }, minLines = 2, modifier = Modifier.fillMaxWidth())
            }

            quoteText?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = Brand.Navy, modifier = Modifier.background(Brand.GoldSoft, RoundedCornerShape(14.dp)).padding(14.dp))
            }

            CheckRow(notEmergency, { notEmergency = it }, "This is not a medical emergency. In an emergency I will call ${config.emergencyNumber}.")
            CheckRow(consent, { consent = it }, "I agree to the privacy notice and terms, and consent to sharing these details with ChampOnCall.")

            error?.let { Text(it, color = Brand.Danger, style = MaterialTheme.typography.bodyMedium) }

            Button(
                onClick = { submit() },
                enabled = !submitting,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Brand.Navy),
            ) {
                if (submitting) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.height(22.dp))
                else Text("Request my Champ", fontWeight = FontWeight.Bold)
            }
            Text("We'll confirm on WhatsApp. You pay only after the visit.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun StepTitle(number: String, title: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            number, color = Color.White, fontWeight = FontWeight.Bold,
            modifier = Modifier.background(Brand.Gold, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 2.dp),
        )
        Text("  $title", style = MaterialTheme.typography.titleLarge, color = Brand.Navy)
    }
}

@Composable
private fun CheckRow(checked: Boolean, onChange: (Boolean) -> Unit, text: String) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }, verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onChange)
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

/** Text field with live place suggestions from the server's Gurugram gazetteer. */
@Composable
private fun PlaceField(
    label: String,
    hint: String,
    type: String,
    value: String,
    onValue: (String) -> Unit,
    onPick: (Place) -> Unit,
    picked: Boolean,
) {
    var suggestions by remember { mutableStateOf<List<Place>>(emptyList()) }
    LaunchedEffect(value, picked) {
        suggestions = emptyList()
        val q = value.trim()
        if (picked || q.length < 3) return@LaunchedEffect
        delay(350)
        suggestions = runCatching {
            val res = Api.get("/api/v1/public/places?type=$type&q=${Api.enc(q.substringAfterLast(',').trim().ifBlank { q })}")
            (res as? kotlinx.serialization.json.JsonArray).orEmpty().mapNotNull { el ->
                val o = el as? JsonObject ?: return@mapNotNull null
                val name = o.str("name") ?: return@mapNotNull null
                Place(name, o.str("address") ?: name, o.str("lat")?.toDoubleOrNull(), o.str("lng")?.toDoubleOrNull())
            }.take(5)
        }.getOrDefault(emptyList())
    }
    Column {
        OutlinedTextField(
            value, onValue, label = { Text(label) }, placeholder = { Text(hint) },
            supportingText = if (picked) ({ Text("📍 Location pinned", color = Brand.Success) }) else null,
            modifier = Modifier.fillMaxWidth(),
        )
        suggestions.forEach { p ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .clickable { suggestions = emptyList(); onPick(p) }
                    .padding(horizontal = 8.dp, vertical = 10.dp),
            ) {
                Text(p.name, style = MaterialTheme.typography.titleMedium, color = Brand.Navy)
                if (p.address != p.name) Text(p.address, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
            }
            HorizontalDivider()
        }
    }
}

private fun isoTime(c: Calendar): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).format(c.time)
