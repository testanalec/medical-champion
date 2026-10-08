@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.champoncall.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.champoncall.app.R
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

@Composable
fun BrandHeader(modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Image(painterResource(R.drawable.champ_logo), contentDescription = null, modifier = Modifier.size(48.dp))
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = Brand.Navy)) { append("Champ") }
                    withStyle(SpanStyle(color = Brand.GoldDeep)) { append("OnCall") }
                },
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 24.sp),
            )
            Text(
                "TRUSTED HELP, ANY TIME",
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.6.sp,
                color = Brand.NavyMid,
            )
        }
    }
}

@Composable
fun SectionCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { content() }
    }
}

@Composable
fun ChoiceChips(options: List<Pair<String, String>>, selected: String?, onSelect: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (value, label) ->
            FilterChip(
                selected = selected == value,
                onClick = { onSelect(value) },
                label = { Text(label) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = Brand.Navy,
                    selectedLabelColor = androidx.compose.ui.graphics.Color.White,
                ),
            )
        }
    }
}

// ---- formatting & intents
fun formatInr(amount: String?): String {
    val v = amount?.toDoubleOrNull() ?: return "—"
    val f = NumberFormat.getCurrencyInstance(Locale("en", "IN"))
    f.maximumFractionDigits = if (v % 1.0 == 0.0) 0 else 2
    return f.format(v)
}

/** "2026-10-08T09:30:00.000Z" -> "8 Oct, 3:00 pm" in the phone's time zone */
fun formatTime(iso: String?): String? {
    if (iso.isNullOrBlank() || iso.length < 19) return null
    return try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val date = parser.parse(iso.substring(0, 19)) ?: return null
        SimpleDateFormat("d MMM, h:mm a", Locale.getDefault()).format(date)
    } catch (e: Exception) {
        null
    }
}

fun openDialer(context: Context, phone: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }
}

fun openWhatsApp(context: Context, number: String, text: String) {
    val url = "https://wa.me/${number.filter { it.isDigit() }}?text=${Uri.encode(text)}"
    openUrl(context, url)
}

fun openUrl(context: Context, url: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
}
