package com.example.flashcountdown

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private var pendingSeconds: Int? = null

    private val requestCameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val seconds = pendingSeconds
            pendingSeconds = null
            if (granted && seconds != null) {
                startServiceCountdown(seconds)
            } else if (!granted) {
                Toast.makeText(this, "Permissão de câmera negada", Toast.LENGTH_SHORT).show()
            }
        }

    private val requestNotificationsPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestNotificationsPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        val hoursInput = findViewById<EditText>(R.id.hoursInput)
        val minutesInput = findViewById<EditText>(R.id.minutesInput)
        val startButton = findViewById<Button>(R.id.startButton)
        val countdownText = findViewById<TextView>(R.id.countdownText)

        startButton.setOnClickListener {
            val hours = hoursInput.text.toString().trim().toIntOrNull() ?: 0
            val minutes = minutesInput.text.toString().trim().toIntOrNull() ?: 0

            if (minutes > 59) {
                Toast.makeText(this, "Minutos deve ser 0-59", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val totalSeconds = hours * 3600 + minutes * 60
            if (totalSeconds <= 0) {
                Toast.makeText(this, "Informe um tempo > 0", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            countdownText.text = formatHms(totalSeconds)

            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                pendingSeconds = totalSeconds
                requestCameraPermission.launch(Manifest.permission.CAMERA)
                return@setOnClickListener
            }

            startServiceCountdown(totalSeconds)
        }
    }

    private fun startServiceCountdown(totalSeconds: Int) {
        val intent = Intent(this, CountdownService::class.java).apply {
            action = CountdownService.ACTION_START
            putExtra(CountdownService.EXTRA_TOTAL_SECONDS, totalSeconds)
        }
        ContextCompat.startForegroundService(this, intent)
        Toast.makeText(this, "Flash ligado: ${formatHms(totalSeconds)}", Toast.LENGTH_SHORT).show()
    }

    private fun formatHms(totalSeconds: Int): String {
        val h = totalSeconds / 3600
        val m = (totalSeconds % 3600) / 60
        val s = totalSeconds % 60
        return String.format("%02d:%02d:%02d", h, m, s)
    }
}