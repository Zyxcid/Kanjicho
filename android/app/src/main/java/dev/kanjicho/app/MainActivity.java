package dev.kanjicho.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — satu-satunya activity app.
 *
 * TOMBOL BACK HARDWARE (t89):
 * Capacitor 8 TIDAK menangani tombol Back hardware — BridgeActivity tidak
 * meng-override onBackPressed / tidak mendaftarkan OnBackPressedCallback,
 * jadi default Android yang berjalan: app LANGSUNG KELUAR walau pengguna
 * hanya ingin mundur satu layar.
 *
 * Router JS (src/lib/useRouter.js) sudah menyiapkan semua perpadanan
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
 * Catatan teknis: `bridge` (field protected BridgeActivity) terisi di
 * ujung onCreate lewat load(); callback hanya berjalan jauh setelah itu,
 * tapi tetap dicek null secara defensif.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
}
