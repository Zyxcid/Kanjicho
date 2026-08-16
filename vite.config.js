import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // service worker otomatis update tanpa perlu user hapus-install ulang
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Kanjichō — JLPT Kanji Practice",
        short_name: "Kanjichō",
        description: "Latihan kanji JLPT dengan spaced repetition, dari N5 sampai N1.",
        theme_color: "#1F3C5C", // --indigo, dipakai browser Android untuk warna status bar
        background_color: "#F5F1E8", // --paper, dipakai sebagai splash screen background
        display: "standalone", // bikin app terasa seperti native app (tanpa address bar) saat di-install
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache semua aset build (JS/CSS/HTML) + data kanji JSON supaya
        // app tetap jalan penuh offline setelah dibuka sekali pertama kali.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],
        // Font Google (Shippori Mincho dkk) di-cache terpisah dengan strategi
        // "cache lalu update di background" -- tetap kelihatan meski offline,
        // tapi cache diperbarui kalau ada koneksi.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-cache" },
          },
        ],
      },
    }),
  ],
});
