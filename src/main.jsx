import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
// (t86) Registrasi SW kini EKSPLISIT dari modul virtual vite-plugin-pwa
// (injectRegister "auto" mendeteksi import ini → script registerSW.js tidak
// lagi disuntikkan ke index.html). Alasan: di shell Android (Capacitor),
// service worker cache justru BISA MENYAJIKAN BUILD LAMA setelah app
// di-update dari Play Store (bundle baru dibundel di APK, tapi SW lama
// masih menyimpan index.html versi lama) — Capacitor menyarankan SW
// dimatikan di native. Web/PWA: perilaku sama seperti sebelumnya
// (autoUpdate, register saat window load).
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
// (t81) Font via npm @fontsource/* (SIL OFL 1.1 — boleh dibundel &
// di-upload ke Play Store; dibundel build Vite menjadi aset origin
// sama dengan nama hash, TANPA request ke pihak ketiga). Hanya weight
// yang benar-benar dipakai CSS yang diimpor — unicode-range bawaan
// fontsource membuat browser hanya mengunduh subset yang dirender.
// Urutan impor tetap sebelum global.css. Patch maxp Shippori (agar
// Firefox bersih dari warning "maxp: Bad maxZones") dijalan hook
// postinstall scripts/fix_font_maxp.py — lihat package.json.
import "@fontsource/zen-kaku-gothic-new/400.css";
import "@fontsource/zen-kaku-gothic-new/500.css";
import "@fontsource/zen-kaku-gothic-new/700.css";
import "@fontsource/shippori-mincho/400.css";
import "@fontsource/shippori-mincho/600.css";
import "@fontsource/shippori-mincho/700.css";
import "@fontsource/shippori-mincho/800.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./styles/global.css";

// (t86) SW hanya untuk web/PWA — dilewati di shell native Capacitor
// (bundle APK sudah offline penuh; SW malah bisa menyajikan build basi
// setelah update dari Play Store).
if (!Capacitor.isNativePlatform()) {
  registerSW();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
