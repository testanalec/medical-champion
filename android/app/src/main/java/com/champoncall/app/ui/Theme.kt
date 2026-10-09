package com.champoncall.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.champoncall.app.R

/** The website's colour tokens (navy brand scale, warm ivory, gold accent). */
object Brand {
    val B50 = Color(0xFFF1F4F9)
    val B100 = Color(0xFFDFE5EF)
    val B200 = Color(0xFFBFCADD)
    val B300 = Color(0xFF93A5C3)
    val B500 = Color(0xFF48618A)
    val B600 = Color(0xFF354B70)
    val B700 = Color(0xFF263A5C)
    val B800 = Color(0xFF1B2C4A)
    val B900 = Color(0xFF13213C)
    val B950 = Color(0xFF0B1426)
    val Warm50 = Color(0xFFFBF8F2)
    val Warm100 = Color(0xFFF5EFE3)
    val Warm200 = Color(0xFFE8DCC4)
    val Gold400 = Color(0xFFC9A24A)
    val Gold500 = Color(0xFF9A7425)
    val Gold600 = Color(0xFF7D5E1D)
    val WhatsApp = Color(0xFF128C4A)
    val Ink = Color(0xFF111A2E)
    val Slate50 = Color(0xFFF8FAFC)
    val Slate100 = Color(0xFFF1F5F9)
    val Slate200 = Color(0xFFE2E8F0)
    val Slate300 = Color(0xFFCBD5E1)
    val Slate400 = Color(0xFF94A3B8)
    val Slate500 = Color(0xFF64748B)
    val Slate600 = Color(0xFF475569)
    val Slate700 = Color(0xFF334155)
    val Red50 = Color(0xFFFEF2F2)
    val Red100 = Color(0xFFFEE2E2)
    val Red500 = Color(0xFFEF4444)
    val Red600 = Color(0xFFDC2626)
    val Red700 = Color(0xFFB91C1C)
    val Red900 = Color(0xFF7F1D1D)
    val Amber50 = Color(0xFFFFFBEB)
    val Amber200 = Color(0xFFFDE68A)
    val Amber400 = Color(0xFFFBBF24)
    val Amber900 = Color(0xFF78350F)
    val Emerald50 = Color(0xFFECFDF5)
    val Emerald500 = Color(0xFF10B981)
    val Emerald600 = Color(0xFF059669)
    val Emerald700 = Color(0xFF047857)
    val Emerald800 = Color(0xFF065F46)
    val White = Color.White
}

val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
)

val Fraunces = FontFamily(
    Font(R.font.fraunces_medium, FontWeight.Medium),
    Font(R.font.fraunces_semibold, FontWeight.SemiBold),
)

private val colors = lightColorScheme(
    primary = Brand.B700,
    onPrimary = Color.White,
    primaryContainer = Brand.B100,
    onPrimaryContainer = Brand.B900,
    secondary = Brand.Gold500,
    onSecondary = Color.White,
    secondaryContainer = Brand.Warm100,
    onSecondaryContainer = Brand.Gold600,
    tertiary = Brand.WhatsApp,
    tertiaryContainer = Brand.Warm100,
    onTertiaryContainer = Brand.Gold600,
    surfaceContainerHighest = Brand.Slate100,
    surfaceContainerLowest = Color.White,
    background = Brand.Warm50,
    onBackground = Brand.Ink,
    surface = Color.White,
    onSurface = Brand.Ink,
    surfaceVariant = Brand.Slate100,
    onSurfaceVariant = Brand.Slate600,
    surfaceContainer = Color.White,
    surfaceContainerHigh = Color.White,
    surfaceContainerLow = Brand.Warm50,
    outline = Brand.Slate300,
    outlineVariant = Brand.Slate200,
    error = Brand.Red600,
)

// No colour here: text takes the colour of its surface/button (LocalContentColor).
private val base = TextStyle(fontFamily = Inter)

private val typography = Typography(
    displaySmall = TextStyle(fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 38.sp, lineHeight = 42.sp, letterSpacing = (-0.5).sp),
    headlineLarge = TextStyle(fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.3).sp),
    headlineMedium = TextStyle(fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 26.sp, lineHeight = 32.sp, letterSpacing = (-0.2).sp),
    headlineSmall = TextStyle(fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = base.copy(fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = base.copy(fontWeight = FontWeight.Bold, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = base.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = base.copy(fontSize = 16.sp, lineHeight = 25.sp),
    bodyMedium = base.copy(fontSize = 14.sp, lineHeight = 21.sp),
    bodySmall = base.copy(fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = base.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = base.copy(fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = base.copy(fontWeight = FontWeight.SemiBold, fontSize = 11.sp, lineHeight = 14.sp),
)

@Composable
fun ChampTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
