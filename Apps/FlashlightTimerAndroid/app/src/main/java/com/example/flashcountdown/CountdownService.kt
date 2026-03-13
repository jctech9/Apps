package com.example.flashcountdown

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat

class CountdownService : Service() {

    companion object {
        const val ACTION_START = "com.example.flashcountdown.START"
        const val EXTRA_TOTAL_SECONDS = "totalSeconds"

        private const val CHANNEL_ID = "countdown"
        private const val NOTIFICATION_ID = 1
    }

    private val handler = Handler(Looper.getMainLooper())
    private var endElapsedRealtimeMs: Long = 0L

    private var wakeLock: PowerManager.WakeLock? = null
    private var torchCameraId: String? = null
    private var torchOn = false

    private val ticker = object : Runnable {
        override fun run() {
            val remainingMs = endElapsedRealtimeMs - SystemClock.elapsedRealtime()
            if (remainingMs <= 0L) {
                setTorch(false)
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return
            }

            val remainingSeconds = (remainingMs / 1000L).toInt()
            updateNotification(remainingSeconds)
            handler.postDelayed(this, 1000L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        torchCameraId = findTorchCameraId()
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_START) {
            val totalSeconds = intent.getIntExtra(EXTRA_TOTAL_SECONDS, 0)
            if (totalSeconds > 0) {
                startCountdown(totalSeconds)
            }
        }
        return START_NOT_STICKY
    }

    private fun startCountdown(totalSeconds: Int) {
        handler.removeCallbacks(ticker)
        setTorch(false)

        endElapsedRealtimeMs = SystemClock.elapsedRealtime() + (totalSeconds * 1000L)

        acquireWakeLock(totalSeconds)
        setTorch(true)

        val notification = buildNotification(totalSeconds)
        startForeground(NOTIFICATION_ID, notification)

        handler.post(ticker)
    }

    private fun buildNotification(remainingSeconds: Int): Notification {
        val text = "Faltam ${formatHms(remainingSeconds)}"
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Flash ligado")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(remainingSeconds: Int) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(remainingSeconds))
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val existing = nm.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return
        val channel = NotificationChannel(CHANNEL_ID, "Countdown", NotificationManager.IMPORTANCE_LOW)
        nm.createNotificationChannel(channel)
    }

    private fun acquireWakeLock(totalSeconds: Int) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock?.release()
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FlashCountdown:Timer").apply {
            setReferenceCounted(false)
            acquire(totalSeconds * 1000L + 60_000L)
        }
    }

    private fun setTorch(enabled: Boolean) {
        val id = torchCameraId ?: return
        val cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            cameraManager.setTorchMode(id, enabled)
            torchOn = enabled
        } catch (_: CameraAccessException) {
            // ignore
        }
    }

    private fun findTorchCameraId(): String? {
        val cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        return try {
            cameraManager.cameraIdList.firstOrNull { id ->
                val chars = cameraManager.getCameraCharacteristics(id)
                chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }
        } catch (_: CameraAccessException) {
            null
        }
    }

    private fun formatHms(totalSeconds: Int): String {
        val clamped = if (totalSeconds < 0) 0 else totalSeconds
        val h = clamped / 3600
        val m = (clamped % 3600) / 60
        val s = clamped % 60
        return String.format("%02d:%02d:%02d", h, m, s)
    }

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        if (torchOn) setTorch(false)
        wakeLock?.release()
        wakeLock = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}