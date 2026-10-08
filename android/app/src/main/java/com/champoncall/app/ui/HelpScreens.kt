@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.champoncall.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.Image
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.champoncall.app.BuildConfig
import com.champoncall.app.R
import com.champoncall.app.data.AppConfig
import com.champoncall.app.data.Profile
import com.champoncall.app.data.Repo
import kotlinx.coroutines.launch

/** "Help" tab: contact, emergency numbers, policies, FAQ, saved details. */
@Composable
fun HelpScreen(onDoc: (String) -> Unit, onFind: () -> Unit) {
    val context = LocalContext.current
    val toast = LocalToast.current
    val config by Repo.config.collectAsState()
    var profile by remember { mutableStateOf(Profile.load(context)) }
    LaunchedEffect(Unit) { Repo.refreshConfig() }

    Column(Modifier.fillMaxSize().background(Brand.Warm50)) {
        TopBar("Help & info", null)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).testTag("help"),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            AppCard {
                Text("Talk to a real person", style = MaterialTheme.typography.titleMedium)
                Text("Our team is available ${config.supportHours}.", fontSize = 14.sp, color = Brand.Slate600)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AppButton("Call us", { dial(context, config.supportPhone) }, Modifier.weight(1f), BtnKind.Primary, icon = R.drawable.fi_phone)
                    AppButton("WhatsApp", { openWhatsApp(context, config.whatsappNumber, config.whatsappPrefill) }, Modifier.weight(1f), BtnKind.WhatsApp, icon = R.drawable.fa_whatsapp)
                }
                HelpRow(R.drawable.fi_phone_call, config.supportPhoneDisplay, { dial(context, config.supportPhone) })
                HelpRow(R.drawable.fi_mail, config.supportEmail, { sendEmail(context, config.supportEmail) })
                HelpRow(R.drawable.fi_map_pin, "Serving ${config.areas.joinToString(", ")}", null)
            }

            EmergencyCard(config)

            AppCard(spacing = 0.dp, padding = 6.dp) {
                HelpRow(R.drawable.fi_search, "Track a request", onFind, chevron = true)
                Divider()
                HelpRow(R.drawable.fi_shield, "Safety & medical boundary", { onDoc("safety") }, chevron = true)
                Divider()
                HelpRow(R.drawable.fi_help_circle, "Questions families ask", { onDoc("faq") }, chevron = true)
                Divider()
                HelpRow(R.drawable.fi_lock, "Privacy notice", { onDoc("privacy") }, chevron = true)
                Divider()
                HelpRow(R.drawable.fi_file_text, "Terms of service", { onDoc("terms") }, chevron = true)
            }

            if (profile.name.isNotBlank() || profile.phone.isNotBlank()) {
                AppCard {
                    Text("Your saved details", style = MaterialTheme.typography.titleMedium)
                    Text("Used to fill in your next booking faster. Stored only on this phone.", fontSize = 13.sp, color = Brand.Slate500)
                    Text(listOf(profile.name, profile.phone, profile.email).filter { it.isNotBlank() }.joinToString(" · "), fontSize = 14.sp)
                    AppButton("Clear saved details", {
                        Profile.clear(context)
                        profile = Profile()
                        toast("Saved details cleared")
                    }, kind = BtnKind.Secondary)
                }
            }

            Text(
                "ChampOnCall for Android · version ${BuildConfig.VERSION_NAME}\nNot an emergency service.",
                fontSize = 12.sp, color = Brand.Slate400, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
            )
        }
    }
}

@Composable
private fun Divider() = Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp).height(1.dp).background(Brand.Slate100))

@Composable
private fun HelpRow(icon: Int, text: String, onClick: (() -> Unit)?, chevron: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 12.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Brand.B50), contentAlignment = Alignment.Center) {
            Ic(icon, tint = Brand.B700, size = 16.dp)
        }
        Spacer(Modifier.width(12.dp))
        Text(text, fontSize = 15.sp, modifier = Modifier.weight(1f))
        if (chevron) Ic(R.drawable.fi_chevron_right, tint = Brand.Slate400)
    }
}

@Composable
private fun EmergencyCard(config: AppConfig) {
    val context = LocalContext.current
    AppCard(color = Brand.Red50, borderColor = Brand.Red100) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Ic(R.drawable.fi_alert_triangle, tint = Brand.Red700, size = 20.dp)
            Spacer(Modifier.width(8.dp))
            Text("Medical emergency?", fontWeight = FontWeight.Bold, color = Brand.Red900, fontSize = 16.sp)
        }
        Text("We are not an ambulance or emergency service. If someone has life-threatening symptoms, call now.", color = Brand.Red900, fontSize = 14.sp, lineHeight = 20.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AppButton("Call ${config.emergencyNumber}", { dial(context, config.emergencyNumber) }, Modifier.weight(1f), BtnKind.Danger, icon = R.drawable.fi_phone)
            AppButton("Ambulance ${config.ambulanceNumber}", { dial(context, config.ambulanceNumber) }, Modifier.weight(1f), BtnKind.Secondary, contentColorOverride = Brand.Red700)
        }
    }
}

/** Policy pages and FAQ (same wording as the website). */
@Composable
fun DocScreen(id: String, onBack: () -> Unit) {
    val config by Repo.config.collectAsState()
    val title = when (id) {
        "privacy" -> "Privacy notice"
        "terms" -> "Terms of service"
        "safety" -> "Safety & medical boundary"
        else -> "Questions families ask"
    }
    Column(Modifier.fillMaxSize().background(Brand.Warm50)) {
        TopBar(title, onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp).testTag("doc-$id"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.headlineLarge, color = Brand.B950)
            when (id) {
                "privacy" -> PrivacyDoc(config)
                "terms" -> TermsDoc(config)
                "safety" -> SafetyDoc(config)
                else -> FaqList()
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}

@Composable private fun H(text: String) = Text(text, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = Brand.Ink, modifier = Modifier.padding(top = 10.dp))
@Composable private fun P(text: String) = Text(text, fontSize = 15.sp, lineHeight = 23.sp, color = Brand.Slate700)
@Composable private fun Updated(text: String) = Text("Last updated $text", fontSize = 13.sp, color = Brand.Slate500)

@Composable
private fun Bullets(items: List<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEach {
            Row {
                Text("•", fontSize = 15.sp, color = Brand.Slate700, modifier = Modifier.width(18.dp))
                Text(it, fontSize = 15.sp, lineHeight = 22.sp, color = Brand.Slate700)
            }
        }
    }
}

@Composable
private fun PrivacyDoc(c: AppConfig) {
    Updated("September 2026")
    Notice("Draft for legal review. Exact obligations under the Digital Personal Data Protection Act, 2023 and other applicable Indian law must be confirmed before production launch.", icon = null)
    P("${c.brandName} coordinates companions who accompany people to medical appointments. We collect only the information needed to deliver that service.")
    H("What we collect")
    Bullets(listOf(
        "Your name, mobile/WhatsApp number and optional email.",
        "About the person receiving help: name, age, relationship to you, pickup address/location, mobility level, language preference and short instructions you choose to share.",
        "Service records: timestamps, status updates, companion notes, expenses and receipts, payment references, ratings and feedback.",
        "WhatsApp message history with our business account, and location shared by our companions during a job where appropriate.",
    ))
    H("What we avoid")
    P("We do not ask for diagnoses, prescriptions or medical history. Please share only what the companion needs to help safely (for example “uses a walker”).")
    H("How we use it")
    Bullets(listOf(
        "To assess, dispatch, deliver and bill your request; to keep you updated; to handle incidents and complaints.",
        "To measure service quality (for example arrival times and whether you would trust us again).",
    ))
    H("Who can see it")
    Bullets(listOf(
        "Companions see only job-relevant details for jobs assigned to them, and the full address only after accepting.",
        "Our operations staff access data based on their role. Access to sensitive data is logged and auditable.",
        "Service providers who help us operate (messaging, payments, hosting) under contract. We never sell your data.",
    ))
    H("Retention")
    P("Each category of data has its own retention period (for example WhatsApp messages and location data are kept for a shorter time than payment records required by law). Data is securely deleted at the end of its period.")
    H("This app")
    P("The app stores your request numbers and the contact details you choose to save on this phone only. Location is used only when you tap “Use current location”. Notifications are used only for updates about your own requests.")
    H("Your choices")
    P("You can ask to access, correct or delete your information by writing to ${c.supportEmail}.")
}

@Composable
private fun TermsDoc(c: AppConfig) {
    Updated("September 2026")
    Notice("Draft for legal review before production launch.", icon = null)
    H("The service")
    P("We arrange a trained, verified companion to accompany a person to and during hospital, clinic, diagnostic, pharmacy, admission, discharge and related visits, and to coordinate and share updates with the family.")
    H("What the service is not")
    P("The service is not medical treatment, diagnosis, nursing, ambulance, emergency response or clinical care. Companions do not diagnose, prescribe, give treatment or replace doctors, nurses, ambulances or emergency services. In an emergency call ${c.emergencyNumber} or ${c.ambulanceNumber}.")
    H("Booking and confirmation")
    P("A request is confirmed only when our team confirms it. Requests outside our service area or involving people who cannot walk may need review and may not be fulfilled.")
    H("Charges")
    P("Charges follow the pricing shown at booking: a base fee including a set duration, then an hourly extension, plus applicable taxes. Approved out-of-pocket expenses are billed at actuals with receipts. Hospital, doctor and medicine bills are paid directly to the provider. Payment is due on completion.")
    H("Cancellations and refunds")
    P("You may cancel before a companion is dispatched without charge. Refunds for service issues are handled case by case by our team.")
}

@Composable
private fun SafetyDoc(c: AppConfig) {
    val context = LocalContext.current
    P("Families trust us with the people they love most. Here is exactly how we keep that trust.")
    H("Our companions do not")
    Bullets(DO_NOT)
    H("Verification")
    P("Before taking any job, a companion must have completed each of these, individually recorded and checked by our team:")
    Bullets(c.verificationClaims + "Interview and onboarding")
    H("During every visit")
    Bullets(listOf(
        "The companion verifies the handover with a booking code shared only with your family.",
        "Every milestone is time-stamped and visible to our operations team, who can intervene at any time.",
        "Companions are trained to escalate to emergency services immediately if a person’s condition deteriorates.",
        "Incidents are recorded, reviewed and closed with a documented resolution.",
    ))
    H("Emergencies")
    P("If someone has life-threatening symptoms, do not wait for a companion. Call ${c.emergencyNumber} (${c.emergencyLabel}) or ${c.ambulanceNumber} (${c.ambulanceLabel}).")
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        AppButton("Call ${c.emergencyNumber}", { dial(context, c.emergencyNumber) }, Modifier.weight(1f), BtnKind.Danger, icon = R.drawable.fi_phone)
        AppButton("Call ${c.ambulanceNumber}", { dial(context, c.ambulanceNumber) }, Modifier.weight(1f), BtnKind.Secondary, contentColorOverride = Brand.Red700)
    }
}

private data class Slide(val icon: Int, val title: String, val text: String)

/** First-launch introduction (three short slides). */
@Composable
fun OnboardingScreen(onDone: () -> Unit) {
    val slides = listOf(
        Slide(R.drawable.fi_user_check, "Your parents need help.\nWe can be there.", "A verified Champ reaches your mother or father and takes them to the hospital, clinic or lab — and stays with them through every queue."),
        Slide(R.drawable.fi_bell, "Know what’s happening, as it happens.", "Live tracking and a notification at every step: Champ assigned, arrived, at the hospital, returning home."),
        Slide(R.drawable.fi_credit_card, "Pay after the visit.", "Simple, transparent pricing. No subscriptions. Pay by UPI, card or netbanking once your loved one is home."),
    )
    val pager = rememberPagerState { slides.size }
    val scope = rememberCoroutineScope()
    Column(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Brand.B900, Brand.B950))).padding(24.dp).testTag("onboarding"),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            BrandLogo(light = true, markSize = 40.dp)
            Spacer(Modifier.weight(1f))
            Text("Skip", color = Brand.B200, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable(onClick = onDone).padding(8.dp).testTag("onboarding-skip"))
        }
        HorizontalPager(pager, modifier = Modifier.weight(1f)) { i ->
            val s = slides[i]
            Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(150.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) {
                    if (i == 0) Image(painterResource(R.drawable.champ_logo), null, Modifier.size(118.dp).clip(CircleShape))
                    else Ic(s.icon, tint = Brand.Gold400, size = 60.dp)
                }
                Spacer(Modifier.height(36.dp))
                Text(s.title, color = Color.White, style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
                Spacer(Modifier.height(14.dp))
                Text(s.text, color = Brand.B100, fontSize = 16.sp, lineHeight = 24.sp, textAlign = TextAlign.Center)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 24.dp)) {
            slides.indices.forEach { i ->
                Box(Modifier.height(8.dp).width(if (pager.currentPage == i) 24.dp else 8.dp).clip(CircleShape).background(if (pager.currentPage == i) Brand.Gold400 else Brand.B500))
            }
        }
        val last = pager.currentPage == slides.lastIndex
        AppButton(
            if (last) "GET STARTED" else "NEXT",
            { if (last) onDone() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
            Modifier.fillMaxWidth().testTag("onboarding-next"), BtnKind.Light, large = true, trailingIcon = R.drawable.fi_arrow_right,
        )
        Spacer(Modifier.height(8.dp))
    }
}
