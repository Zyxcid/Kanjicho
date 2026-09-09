import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  // raw/ (unduhan sumber pipeline: KanjiVG = 11.661 file SVG, kanjidic2,
  // JMdict…) TIDAK boleh di-watch dev server: menghabiskan limit inotify
  // sistem (ENOSPC, server mati) dan tidak pernah di-serve oleh Vite.
  server: {
    watch: { ignored: ["**/raw/**"] },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // service worker otomatis update tanpa perlu user hapus-install ulang
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        // Aplikasi belum dipublikasikan — versi dipatok 1.0.0 (bukan
        // auto-bump per iterasi fitur; naikkan hanya saat rilis publik).
        version: "1.0.0",
        version_name: "1.0.0",
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
        // Font woff2 SENGAJA tidak di-precache (16,2 MB / 854 subset) —
        // unicode-range membuat browser hanya memuat subset yang benar-benar
        // dipakai; sisanya tidak pernah diunduh.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],
        // Font kini self-hosted (public/fonts/, origin sama). Strategi
        // CacheFirst: subset yang pernah dipakai tersedia offline, isi file
        // immutable (regenerasi selalu menghasilkan nama hash-urutan baru
        // bila daftar subset berubah). PENTING: sebelumnya pola ini
        // men-target fonts.googleapis.com (pihak ketiga) — dihapus supaya
        // TIDAK ada request font ke luar origin (Play Data Safety: no data
        // collected/shared).
        runtimeCaching: [
          {
            urlPattern: /\/fonts\/[^/]+\.(woff2)$/i,
            handler: "CacheFirst",
            options: { cacheName: "app-fonts-cache" },
          },
        ],
      },
    }),
  ],
});
