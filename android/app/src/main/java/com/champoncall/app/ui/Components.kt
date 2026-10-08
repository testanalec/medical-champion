@file:OptIn(ExperimentalLayoutApi::class)

package com.champoncall.app.ui

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.champoncall.app.R
import com.champoncall.app.data.Api
import com.champoncall.app.data.AppConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URL

/** Shows a short message at the bottom of the screen (snackbar). */
val LocalToast = staticCompositionLocalOf<(String) -> Unit> { {} }

@Composable
fun Ic(res: Int, modifier: Modifier = Modifier, tint: Color = LocalContentColor.current, size: Dp = 18.dp, desc: String? = null) {
    Icon(painterResource(res), contentDescription = desc, modifier = modifier.size(size), tint = tint)
}

enum class BtnKind { Primary, Secondary, WhatsApp, Gold, Danger, Ghost, OnDark, Light }

@Composable
fun AppButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: BtnKind = BtnKind.Primary,
    icon: Int? = null,
    trailingIcon: Int? = null,
    large: Boolean = false,
    loading: Boolean = false,
    enabled: Boolean = true,
    contentColorOverride: Color? = null,
) {
    val (container, content) = when (kind) {
        BtnKind.Primary -> Brand.B700 to Color.White
        BtnKind.Secondary -> Color.White to Brand.Ink
        BtnKind.WhatsApp -> Brand.WhatsApp to Color.White
        BtnKind.Gold -> Brand.Gold500 to Color.White
        BtnKind.Danger -> Brand.Red600 to Color.White
        BtnKind.Ghost -> Color.Transparent to Brand.Slate600
        BtnKind.OnDark -> Color.White.copy(alpha = 0.10f) to Color.White
        BtnKind.Light -> Color.White to Brand.B900
    }
    val fg = contentColorOverride ?: content
    val border = when (kind) {
        BtnKind.Secondary -> BorderStroke(1.dp, Brand.Slate200)
        BtnKind.OnDark -> BorderStroke(1.dp, Color.White.copy(alpha = 0.3f))
        else -> null
    }
    Button(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled && !loading,
        shape = RoundedCornerShape(if (large) 16.dp else 12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = container,
            contentColor = fg,
            disabledContainerColor = if (container == Color.Transparent) container else container.copy(alpha = 0.55f),
            disabledContentColor = fg.copy(alpha = 0.8f),
        ),
        border = border,
        elevation = if (kind == BtnKind.Ghost || kind == BtnKind.OnDark) null else ButtonDefaults.buttonElevation(defaultElevation = 1.dp, pressedElevation = 0.dp),
        contentPadding = PaddingValues(horizontal = if (large) 22.dp else 16.dp, vertical = if (large) 15.dp else 11.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(18.dp), color = fg, strokeWidth = 2.dp)
            Spacer(Modifier.width(10.dp))
        } else if (icon != null) {
            Ic(icon, tint = fg, size = if (large) 20.dp else 17.dp)
            Spacer(Modifier.width(9.dp))
        }
        Text(text, fontWeight = FontWeight.SemiBold, fontSize = if (large) 15.sp else 14.sp, textAlign = TextAlign.Center)
        if (trailingIcon != null && !loading) {
            Spacer(Modifier.width(8.dp))
            Ic(trailingIcon, tint = fg, size = 17.dp)
        }
    }
}

@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    color: Color = Color.White,
    padding: Dp = 18.dp,
    borderColor: Color = Brand.Slate200,
    spacing: Dp = 12.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = color,
        border = BorderStroke(1.dp, borderColor),
        shadowElevation = 1.dp,
    ) {
        Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(spacing), content = content)
    }
}

@Composable
fun Kicker(text: String, color: Color = Brand.B600, modifier: Modifier = Modifier, align: TextAlign? = null) {
    Text(text.uppercase(), modifier = modifier, color = color, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.7.sp, textAlign = align)
}

@Composable
fun SectionTitle(text: String, color: Color = Brand.B950, modifier: Modifier = Modifier, align: TextAlign? = null) {
    Text(text, modifier = modifier, style = MaterialTheme.typography.headlineMedium, color = color, textAlign = align)
}

@Composable
fun Chips(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, tagPrefix: String? = null) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (value, label) ->
            val on = selected == value
            Surface(
                onClick = { onSelect(value) },
                shape = RoundedCornerShape(12.dp),
                color = if (on) Brand.B700 else Color.White,
                contentColor = if (on) Color.White else Brand.Slate700,
                border = if (on) null else BorderStroke(1.dp, Brand.Slate300),
                modifier = Modifier
                    .semantics { this.selected = on; role = Role.RadioButton }
                    .then(if (tagPrefix != null) Modifier.testTag("$tagPrefix-$value") else Modifier),
            ) {
                Text(label, modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp), fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
fun Field(label: String, hint: String? = null, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Brand.Slate600)
        content()
        if (hint != null) Text(hint, fontSize = 12.sp, lineHeight = 16.sp, color = Brand.Slate500)
    }
}

@Composable
fun AppTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
    minLines: Int = 1,
    tag: String? = null,
    enabled: Boolean = true,
    leading: Int? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth().then(if (tag != null) Modifier.testTag(tag) else Modifier),
        placeholder = placeholder?.let { { Text(it, color = Brand.Slate400) } },
        singleLine = singleLine,
        minLines = minLines,
        enabled = enabled,
        leadingIcon = leading?.let { { Ic(it, tint = Brand.B600) } },
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        shape = RoundedCornerShape(12.dp),
        textStyle = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Brand.B500,
            unfocusedBorderColor = Brand.Slate300,
            focusedContainerColor = Color.White,
            unfocusedContainerColor = Color.White,
            disabledContainerColor = Brand.Slate50,
            cursorColor = Brand.B700,
        ),
    )
}

@Composable
fun CheckItem(text: String, icon: Int = R.drawable.fi_check, tint: Color = Brand.B600, color: Color = Brand.Slate700, fontSize: Int = 14) {
    Row(verticalAlignment = Alignment.Top) {
        Ic(icon, Modifier.padding(top = 2.dp), tint = tint, size = 16.dp)
        Spacer(Modifier.width(9.dp))
        Text(text, color = color, fontSize = fontSize.sp, lineHeight = (fontSize + 6).sp)
    }
}

@Composable
fun Pill(text: String, bg: Color, fg: Color, modifier: Modifier = Modifier, border: Color? = null) {
    Text(
        text,
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(bg)
            .then(if (border != null) Modifier.border(1.dp, border, RoundedCornerShape(50)) else Modifier)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        color = fg,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
    )
}

@Composable
fun Notice(text: String, bg: Color = Brand.Amber50, fg: Color = Brand.Amber900, border: Color = Brand.Amber200, icon: Int? = R.drawable.fi_alert_triangle, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(bg)
            .border(1.dp, border, RoundedCornerShape(12.dp))
            .padding(12.dp),
    ) {
        if (icon != null) {
            Ic(icon, Modifier.padding(top = 2.dp), tint = fg, size = 16.dp)
            Spacer(Modifier.width(10.dp))
        }
        Text(text, color = fg, fontSize = 14.sp, lineHeight = 20.sp)
    }
}

/** Logo mark + two-tone wordmark, as in the website header. */
@Composable
fun BrandLogo(light: Boolean = false, markSize: Dp = 44.dp, compact: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Image(
            painterResource(R.drawable.champ_logo),
            contentDescription = "ChampOnCall",
            modifier = Modifier.size(markSize).shadow(3.dp, CircleShape).clip(CircleShape),
        )
        if (!compact) {
            Spacer(Modifier.width(11.dp))
            Column {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = if (light) Color.White else Brand.B900)) { append("Champ") }
                        withStyle(SpanStyle(color = if (light) Brand.Gold400 else Brand.Gold500)) { append("OnCall") }
                    },
                    fontFamily = Fraunces,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 22.sp,
                    lineHeight = 22.sp,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "TRUSTED HELP, ANY TIME",
                    fontSize = 9.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.4.sp,
                    color = if (light) Brand.B200 else Brand.B500,
                )
            }
        }
    }
}

/** Light header bar with back arrow, used by inner screens. */
@Composable
fun TopBar(title: String, onBack: (() -> Unit)?, actions: @Composable RowScope.() -> Unit = {}) {
    Surface(color = Brand.Warm50, shadowElevation = 0.dp) {
        Column {
            Row(
                Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (onBack != null) {
                    IconButton(onClick = onBack, modifier = Modifier.testTag("back")) { Ic(R.drawable.fi_arrow_left, tint = Brand.Ink, size = 22.dp, desc = "Back") }
                } else Spacer(Modifier.width(12.dp))
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 1)
                actions()
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Brand.Warm200.copy(alpha = 0.6f)))
        }
    }
}

/** "Is this a medical emergency?" — shown before any booking starts (website FR-EMR-001). */
@Composable
fun EmergencyGate(config: AppConfig, onDismiss: () -> Unit, onContinue: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(24.dp), color = Color.White, modifier = Modifier.testTag("emergency-gate")) {
            Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Ic(R.drawable.fi_alert_triangle, tint = Brand.Red600, size = 22.dp)
                    Spacer(Modifier.width(10.dp))
                    Text("Is this a medical emergency?", style = MaterialTheme.typography.titleMedium, fontSize = 18.sp)
                }
                Text(
                    buildAnnotatedString {
                        append("If the person has potentially ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("life-threatening symptoms") }
                        append(" — chest pain, difficulty breathing, unconsciousness, heavy bleeding, signs of stroke — or needs immediate medical intervention, contact the appropriate emergency medical service or hospital ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("immediately") }
                        append(".")
                    },
                    fontSize = 15.sp,
                    lineHeight = 23.sp,
                    color = Brand.Slate700,
                )
                Text("Our companions are not doctors, nurses, paramedics or an ambulance service.", fontSize = 13.sp, color = Brand.Slate500)
                Spacer(Modifier.height(2.dp))
                AppButton("CALL EMERGENCY SERVICE (${config.emergencyNumber})", { dial(context, config.emergencyNumber) }, Modifier.fillMaxWidth(), BtnKind.Danger, icon = R.drawable.fi_phone, large = true)
                AppButton("Call ambulance (${config.ambulanceNumber})", { dial(context, config.ambulanceNumber) }, Modifier.fillMaxWidth(), BtnKind.Secondary, contentColorOverride = Brand.Red700)
                AppButton("CONTINUE WITH COMPANION REQUEST", onContinue, Modifier.fillMaxWidth().testTag("gate-continue"), BtnKind.Primary, trailingIcon = R.drawable.fi_arrow_right, large = true)
            }
        }
    }
}

@Composable
fun EmergencyStrip(config: AppConfig) {
    val context = androidx.compose.ui.platform.LocalContext.current
    Row(
        Modifier
            .fillMaxWidth()
            .background(Brand.Red50)
            .border(1.dp, Brand.Red100)
            .clickable { dial(context, config.emergencyNumber) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Ic(R.drawable.fi_alert_triangle, tint = Brand.Red900, size = 18.dp)
        Spacer(Modifier.width(10.dp))
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("Medical emergency? ") }
                append("We are not an ambulance or emergency service. Call ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, textDecoration = TextDecoration.Underline)) { append(config.emergencyNumber) }
                append(" or ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, textDecoration = TextDecoration.Underline)) { append(config.ambulanceNumber) }
                append(" immediately.")
            },
            color = Brand.Red900,
            fontSize = 13.sp,
            lineHeight = 19.sp,
        )
    }
}

@Composable
fun Avatar(name: String, photoUrl: String?, size: Dp = 52.dp) {
    val bitmap by produceState<ImageBitmap?>(null, photoUrl) {
        value = if (photoUrl.isNullOrBlank()) null else withContext(Dispatchers.IO) {
            runCatching { URL(Api.absolute(photoUrl)).openStream().use { BitmapFactory.decodeStream(it)?.asImageBitmap() } }.getOrNull()
        }
    }
    val img = bitmap
    if (img != null) {
        Image(img, contentDescription = name, modifier = Modifier.size(size).clip(CircleShape), contentScale = ContentScale.Crop)
    } else {
        val initials = name.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifBlank { "?" }
        Box(Modifier.size(size).clip(CircleShape).background(Brand.B100), contentAlignment = Alignment.Center) {
            Text(initials, color = Brand.B800, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.36f).sp)
        }
    }
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Brand.Gold400, modifier = Modifier.testTag("loading"))
    }
}

@Composable
fun ErrorBox(message: String, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(56.dp).clip(CircleShape).background(Brand.Red50), contentAlignment = Alignment.Center) {
            Ic(R.drawable.fi_alert_triangle, tint = Brand.Red600, size = 26.dp)
        }
        Text(message, textAlign = TextAlign.Center, color = Brand.Slate700, fontSize = 15.sp, modifier = Modifier.testTag("error-message"))
        if (actionLabel != null && onAction != null) AppButton(actionLabel, onAction, kind = BtnKind.Secondary)
    }
}

@Composable
fun LinkText(text: String, onClick: () -> Unit, color: Color = Brand.B700, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier.clickable(onClick = onClick).padding(vertical = 4.dp),
        color = color,
        fontWeight = FontWeight.SemiBold,
        textDecoration = TextDecoration.Underline,
        fontSize = 14.sp,
    )
}

fun bold(vararg parts: Pair<String, Boolean>): AnnotatedString = buildAnnotatedString {
    parts.forEach { (t, b) -> if (b) withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(t) } else append(t) }
}

// ---- intents
fun dial(context: Context, phone: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.trim()}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

fun openWhatsApp(context: Context, number: String, text: String) {
    openUrl(context, "https://wa.me/${number.filter { it.isDigit() }}?text=${Uri.encode(text)}")
}

fun openUrl(context: Context, url: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Api.absolute(url))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

fun sendEmail(context: Context, email: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}
