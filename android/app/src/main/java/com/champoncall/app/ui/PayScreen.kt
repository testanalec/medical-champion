package com.champoncall.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.champoncall.app.R
import com.champoncall.app.data.ApiException
import com.champoncall.app.data.Format
import com.champoncall.app.data.PayInfo
import com.champoncall.app.data.Repo
import kotlinx.coroutines.launch

private val METHODS = listOf(
    Triple("upi", "UPI", "GPay, PhonePe, Paytm, BHIM") to R.drawable.fi_smartphone,
    Triple("card", "Card", "Visa, Mastercard, RuPay") to R.drawable.fi_credit_card,
    Triple("netbanking", "Netbanking", "All major banks") to R.drawable.fi_globe,
)

@Composable
fun PayScreen(id: String, token: String, onBack: () -> Unit, onTrack: (String) -> Unit) {
    val context = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var p by remember { mutableStateOf<PayInfo?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var method by remember { mutableStateOf("upi") }
    var busy by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableIntStateOf(0) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle

    // Reload whenever the screen comes back (e.g. after paying in the browser).
    LaunchedEffect(id, reloadKey) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            try {
                p = Repo.pay(id, token)
                error = null
            } catch (e: ApiException) {
                error = e.message
            }
        }
    }

    fun pay(success: Boolean) {
        busy = if (success) "success" else "failure"
        scope.launch {
            try {
                Repo.checkout(id, token, method, success)
                val fresh = Repo.pay(id, token)
                p = fresh
                if (fresh.status == "PAID") toast("Payment successful")
                else if (fresh.status == "FAILED") toast("Payment failed. You can try again.")
            } catch (e: ApiException) {
                toast(e.message ?: "Payment could not be completed")
            } finally {
                busy = null
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Brand.Warm50)) {
        TopBar("Payment", onBack)
        val info = p
        when {
            info == null && error != null -> ErrorBox(error ?: "", "Try again") { reloadKey++ }
            info == null -> LoadingBox()
            else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                Surface(shape = RoundedCornerShape(18.dp), color = Color.White, shadowElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                    Column {
                        Column(Modifier.fillMaxWidth().background(Color(0xFF0F172A)).padding(22.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Ic(R.drawable.fi_lock, tint = Brand.Slate300, size = 12.dp)
                                Spacer(Modifier.width(6.dp))
                                Text("Secure checkout · " + if (info.provider == "razorpay") "Razorpay" else "Payment gateway (sandbox)", color = Brand.Slate300, fontSize = 12.sp)
                            }
                            Spacer(Modifier.height(8.dp))
                            Text("ChampOnCall · ${info.requestNumber ?: ""}", color = Brand.Slate300, fontSize = 14.sp)
                            Text(Format.inr(info.amount), color = Color.White, fontSize = 38.sp, fontWeight = FontWeight.Bold, modifier = Modifier.testTag("pay-amount"))
                            if (info.durationMinutes != null) {
                                Text(
                                    "Companion service · ${Format.duration(info.durationMinutes)}" + (info.expensesTotal?.takeIf { it > 0 }?.let { " · incl. ${Format.inr(it)} expenses" } ?: ""),
                                    color = Brand.Slate400, fontSize = 12.sp,
                                )
                            }
                        }
                        when {
                            info.status == "PAID" -> Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Ic(R.drawable.fi_check_circle, tint = Brand.Emerald500, size = 56.dp)
                                Spacer(Modifier.height(12.dp))
                                Text("Payment received", fontWeight = FontWeight.Bold, fontSize = 20.sp, modifier = Modifier.testTag("pay-success"))
                                Text(listOfNotNull(info.method?.uppercase(), Format.dateTime(info.paidAt)).joinToString(" · "), color = Brand.Slate500, fontSize = 14.sp)
                                Spacer(Modifier.height(20.dp))
                                info.requestNumber?.let { n ->
                                    AppButton("Rate your experience", { onTrack(n) }, Modifier.fillMaxWidth().testTag("pay-rate"), BtnKind.Primary)
                                    AppButton("View summary", { onTrack(n) }, Modifier.fillMaxWidth(), BtnKind.Ghost)
                                }
                            }
                            info.status == "CANCELLED" -> Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("This payment link has been replaced.", fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.height(14.dp))
                                info.requestNumber?.let { n -> AppButton("Open latest summary", { onTrack(n) }) }
                            }
                            info.status == "REFUNDED" || info.status == "PARTIALLY_REFUNDED" -> Text(
                                "This payment has been ${if (info.status == "REFUNDED") "refunded" else "partially refunded"}.",
                                Modifier.fillMaxWidth().padding(28.dp), fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                            )
                            info.gatewayLive -> Column(Modifier.padding(22.dp)) {
                                AppButton(
                                    "Continue to pay ${Format.inr(info.amount)}",
                                    { info.link?.let { openUrl(context, it) } },
                                    Modifier.fillMaxWidth().testTag("pay-gateway"), BtnKind.Gold, icon = R.drawable.fi_credit_card, large = true,
                                )
                                Spacer(Modifier.height(10.dp))
                                Text("You’ll pay on the secure Razorpay page. Come back here afterwards — this screen updates automatically.", fontSize = 12.sp, color = Brand.Slate500, textAlign = TextAlign.Center)
                            }
                            else -> Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (info.status == "FAILED") {
                                    Notice("${info.failureReason ?: "Last attempt failed"} — please try again.", bg = Brand.Red50, fg = Brand.Red900, border = Brand.Red100, icon = R.drawable.fi_xcircle)
                                }
                                Text("Pay using", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                METHODS.forEach { (m, icon) ->
                                    val (key, label, sub) = m
                                    val on = method == key
                                    Surface(
                                        onClick = { method = key },
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (on) Brand.B50 else Color.White,
                                        border = BorderStroke(if (on) 2.dp else 1.dp, if (on) Brand.B600 else Brand.Slate200),
                                        modifier = Modifier.fillMaxWidth().testTag("method-$key"),
                                    ) {
                                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(Color.White), contentAlignment = Alignment.Center) {
                                                Ic(icon, tint = Brand.B700)
                                            }
                                            Spacer(Modifier.width(12.dp))
                                            Column {
                                                Text(label, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                                Text(sub, fontSize = 12.sp, color = Brand.Slate500)
                                            }
                                        }
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                AppButton("Pay ${Format.inr(info.amount)}", { pay(true) }, Modifier.fillMaxWidth().testTag("pay-submit"), BtnKind.Gold, large = true, loading = busy == "success", enabled = busy == null)
                                Spacer(Modifier.height(6.dp))
                                Notice(
                                    "Sandbox gateway. No money moves. Payment status is confirmed through a signed server-side webhook, exactly as with Razorpay in production.",
                                    icon = R.drawable.fi_info,
                                )
                                LinkText("Simulate a failed payment", { if (busy == null) pay(false) }, color = Brand.Amber900)
                            }
                        }
                    }
                }
            }
        }
    }
}
