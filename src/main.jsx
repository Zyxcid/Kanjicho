import React from "react";
import ReactDOM from "react-dom/client";
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
