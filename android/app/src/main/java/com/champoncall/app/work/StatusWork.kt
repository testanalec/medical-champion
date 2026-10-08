package com.champoncall.app.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.champoncall.app.data.Bookings
import com.champoncall.app.data.Repo
import com.champoncall.app.data.Stages
import com.champoncall.app.data.TrackInfo
import com.champoncall.app.push.Push
import java.util.concurrent.TimeUnit

/**
 * Checks open bookings in the background and shows a notification when the status changes.
 * Works even before Firebase push is set up (Android runs it about every 15 minutes).
 */
class StatusWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        checkAll(applicationContext)
        return Result.success()
    }

    companion object {
        suspend fun checkAll(context: Context) {
            Bookings.all(context).filter { !Stages.isFinal(it.lastStatus) }.forEach { b ->
                val t = runCatching { Repo.track(b.number, b.token) }.getOrNull() ?: return@forEach
                val changed = b.lastStatus != null && b.lastStatus != t.status
                Bookings.updateStatus(context, b.number, t.status, t.statusLabel, t.serviceType)
                if (changed) Push.show(context, "ChampOnCall · ${t.number}", message(t), t.number)
            }
        }

        fun message(t: TrackInfo): String = when (t.status) {
            "COMPANION_ACCEPTED", "COMPANION_ASSIGNED" -> t.companion?.let { "${it.name} is your companion${it.code?.let { c -> " (ID $c)" } ?: ""}." } ?: t.statusLabel
            "EN_ROUTE" -> "${t.companion?.name ?: "Your companion"} is on the way."
            "WITH_PATIENT" -> "${t.companion?.name ?: "Your companion"} has reached ${t.patientRef ?: "your loved one"}."
            "AT_HOSPITAL" -> "Reached ${t.destination ?: "the hospital"}."
            "RETURNING" -> "On the way back home."
            "COMPLETED" -> "Visit completed. Tap to see the summary" + if (t.payment?.isUnpaid == true) " and pay." else "."
            "CANCELLED" -> "Your request was cancelled."
            else -> t.statusLabel
        }

        fun schedule(context: Context) {
            runCatching {
                val request = PeriodicWorkRequestBuilder<StatusWorker>(15, TimeUnit.MINUTES)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build()
                WorkManager.getInstance(context).enqueueUniquePeriodicWork("booking-status", ExistingPeriodicWorkPolicy.KEEP, request)
            }
        }
    }
}

/** Short name used by the activity. */
object StatusWork {
    fun schedule(context: Context) = StatusWorker.schedule(context)
}
