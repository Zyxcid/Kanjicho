package dev.kanjicho.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

/**
 * MainActivity — satu-satunya activity app.
 *
 * ═══════════════════════════════════════════════════════════════════
 * TOMBOL BACK HARDWARE (t89)
 * ═══════════════════════════════════════════════════════════════════
 * Capacitor 8 TIDAK menangani tombol Back hardware — BridgeActivity tidak
 * meng-override onBackPressed / tidak mendaftarkan OnBackPressedCallback,
 * jadi default Android yang berjalan: app LANGSUNG KELUAR walau pengguna
 * hanya ingin mundur satu layar.
 *
 * Router JS (src/lib/useRouter.js) sudah menyiapkan semua perpaduan
 * history lewat pushState: tiap layar = satu entri, tiap overlay (modal
 * detail / help / kalender) = entri sendiri, kuis berprogres dipasangi
 * guard konfirmasi. Callback di bawah menjembatani tombol Back hardware
 * ke history WebView supaya semua mekanisme itu benar-benar terpakai:
 *
 *   - Ada entri history (pernah pindah layar / membuka overlay) →
 *     webView.goBack() → popstate → router mundur layar / menutup
 *     overlay / memunculkan dialog konfirmasi kuis.
 *   - Sudah di entri pertama (home, tidak ada lagi history app) →
 *     finish(): keluar dari app — sesuai ekspektasi pengguna ponsel.
 *
 * ═══════════════════════════════════════════════════════════════════
 * EDGE-TO-EDGE / BACKGROUND SAMPAI UJUNG LAYAR (t91)
 * ═══════════════════════════════════════════════════════════════════
 * Keluhan: background kertas berhenti PERSIS di batas status bar
 * (jam/baterai) dan navigation bar (tombol/gesture) — area bar milik
 * sistem menampilkan warna theme, bukan kertas app, sehingga app
 * terasa "web".
 *
 * Penyebab: plugin SystemBars bawaan Capacitor 8 (mode default "css")
 * memasang padding = inset system bar pada decor view SAAT versi
 * WebView < 140 — WebView tidak pernah menggambar di balik bar.
 * (Konfigurasi capacitor.config.json men-disable insets handling
 * plugin; penanganan inset diambil alih sepenuhnya di sini.)
 *
 * Solusi di sini:
 *   1. WindowCompat.setDecorFitsSystemWindows(false) → WebView menggambar
 *      sampai ke balik KEDUA bar, di semua versi Android (bukan cuma
 *      Android 15+ yang menerapkannya secara paksa). Background .kd-root
 *      (kertas genkouyoushi, min-height 100vh) ikut sampai ke ujung layar.
 *   2. Listener inset: TANPA padding system bar; satu-satunya padding
 *      adalah mengangkat WebView di atas keyboard saat IME terbuka.
 *   3. Nilai inset (px, dikonversi ke dp) di-inject ke web sebagai CSS
 *      variables --safe-area-inset-{top,right,bottom,left} — CSS app
 *      menambahkannya ke padding KONTEN (jam tidak menutupi topbar,
 *      tombol navigasi tidak menutupi konten bawah) tanpa memotong
 *      background. Nama variable sengaja sama dengan konvensi Capacitor.
 *   4. WebViewListener.onPageCommitVisible → requestApplyInsets:
 *      injeksi diulang tiap kali halaman selesai termuat (injeksi pertama
 *      bisa mendarat sebelum document siap) dan otomatis ulang saat
 *      rotate / keyboard karena listener dipanggil ulang oleh dispatch
 *      inset baru.
 *
 * Warna IKON status bar (jam/baterai gelap/terang) disinkronkan dari JS
 * (src/lib/useTheme.js memanggil SystemBars.setStyle mengikuti tema
 * in-app) — bukan tema sistem, karena dark mode app tersimpan di
 * localStorage.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installBackButton();
        installEdgeToEdge();
    }

    /** (t89) Jembatani tombol Back hardware ke history WebView/router. */
    private void installBackButton() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = (bridge != null) ? bridge.getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    // Entri pushState router masuk ke back/forward list
                    // WebView, jadi goBack() memicu popstate di JS.
                    webView.goBack();
                } else {
                    // Di entri pertama app — keluar seperti perilaku native.
                    finish();
                }
            }
        });
    }

    /** (t91) Background & WebView sampai ke ujung layar + inset → CSS. */
    private void installEdgeToEdge() {
        // Gambar di balik status bar & navigation bar di SEMUA versi
        // Android (di Android 15+ ini sudah dipaksa sistem — no-op).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            // TANPA padding system bar → background .kd-root sampai ke
            // ujung. Padding hanya mengangkat WebView saat keyboard terbuka.
            v.setPadding(0, 0, 0, keyboardVisible ? ime.bottom : 0);

            // Inset diumumkan ke web (dp). Bottom dinolkan saat keyboard
            // terbuka — WebView sudah diangkat oleh padding IME di atas,
            // CSS tidak boleh menghitung dua kali.
            injectSafeAreaVars(
                    bars.top,
                    bars.right,
                    keyboardVisible ? 0 : bars.bottom,
                    bars.left);

            return insets;
        });

        // Injeksi ulang setiap halaman termuat — injeksi pertama bisa
        // mendarat sebelum document siap (listener insets menyala saat
        // layout pertama, jauh sebelum web termuat).
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                ViewCompat.requestApplyInsets(getWindow().getDecorView());
            }
        });
    }

    /** (t91) Kirim nilai inset (px → dp) ke web sebagai CSS variables. */
    private void injectSafeAreaVars(int topPx, int rightPx, int bottomPx, int leftPx) {
        if (bridge == null || bridge.getWebView() == null) return;
        float density = getResources().getDisplayMetrics().density;
        String js = String.format(
                Locale.US,
                "try{"
                        + "document.documentElement.style.setProperty('--safe-area-inset-top','%dpx');"
                        + "document.documentElement.style.setProperty('--safe-area-inset-right','%dpx');"
                        + "document.documentElement.style.setProperty('--safe-area-inset-bottom','%dpx');"
                        + "document.documentElement.style.setProperty('--safe-area-inset-left','%dpx');"
                        + "}catch(e){}",
                Math.round(topPx / density),
                Math.round(rightPx / density),
                Math.round(bottomPx / density),
                Math.round(leftPx / density));
        bridge.getWebView().evaluateJavascript(js, null);
    }
}
