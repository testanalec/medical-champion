package com.champoncall.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object Brand {
    val Navy = Color(0xFF13213C)
    val NavyMid = Color(0xFF263A5C)
    val NavySoft = Color(0xFFDFE5EF)
    val Gold = Color(0xFFC9A24A)
    val GoldDeep = Color(0xFF9A7425)
    val GoldSoft = Color(0xFFF5EFE3)
    val Ivory = Color(0xFFFBF8F2)
    val Ink = Color(0xFF111A2E)
    val Muted = Color(0xFF5A6275)
    val WhatsApp = Color(0xFF128C4A)
    val Success = Color(0xFF15803D)
    val Danger = Color(0xFFB42318)
}

private val colors = lightColorScheme(
    primary = Brand.Navy,
    onPrimary = Color.White,
    secondary = Brand.Gold,
    onSecondary = Brand.Navy,
    background = Brand.Ivory,
    onBackground = Brand.Ink,
    surface = Color.White,
    onSurface = Brand.Ink,
    surfaceVariant = Brand.GoldSoft,
    onSurfaceVariant = Brand.Muted,
    outline = Color(0xFFD9D3C6),
    error = Brand.Danger,
)

private val serif = FontFamily.Serif
private val type = Typography(
    headlineLarge = TextStyle(fontFamily = serif, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 36.sp),
    headlineMedium = TextStyle(fontFamily = serif, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp),
    titleLarge = TextStyle(fontFamily = serif, fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 23.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
)

@Composable
fun ChampTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = type, content = content)
}
