@file:OptIn(ExperimentalMaterial3Api::class)

package com.champoncall.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.champoncall.app.data.Api
import com.champoncall.app.data.ApiException
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.SavedBooking
import com.champoncall.app.data.asObj
import com.champoncall.app.data.str
import com.champoncall.app.push.Push
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Composable
fun FindScreen(onBack: () -> Unit, onFound: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var number by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Find my booking") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Brand.Navy, titleContentColor = Color.White, navigationIconContentColor = Color.White),
            )
        },
        containerColor = Brand.Ivory,
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            SectionCard {
                Text("Booked on the website or WhatsApp? Enter your request number and the mobile number you used.", color = Brand.Muted)
                OutlinedTextField(
                    number, { number = it.uppercase().trim() }, label = { Text("Request number (e.g. MC-10452)") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    phone, { v -> phone = v.filter { it.isDigit() || it == '+' }.take(14) }, label = { Text("Mobile number") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, color = Brand.Danger) }
                Button(
                    enabled = !busy && number.length >= 3 && phone.count { it.isDigit() } >= 10,
                    onClick = {
                        busy = true
                        error = null
                        scope.launch {
                            try {
                                val res = Api.post("/api/v1/public/track-lookup", buildJsonObject {
                                    put("request_number", number)
                                    put("phone", phone)
                                }).asObj()
                                val parsed = res?.str("track_url")?.let { Bookings.parseTrackUrl(it) } ?: throw ApiException("Booking not found")
                                val saved = SavedBooking(parsed.first, parsed.second, "", System.currentTimeMillis())
                                Bookings.save(context, saved)
                                Push.register(saved)
                                onFound(parsed.first)
                            } catch (e: ApiException) {
                                error = e.message
                            } finally {
                                busy = false
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Brand.Navy),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (busy) "Finding…" else "Find booking") }
            }
        }
    }
}
