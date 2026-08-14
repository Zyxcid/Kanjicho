# Kanji Drill — JLPT Kanji Practice PWA

Aplikasi belajar kanji JLPT (N5–N1) dengan spaced repetition berbasis kurva lupa,
mirip KanjiQuizzer tapi dengan penjadwalan review otomatis.

## Menjalankan project

```bash
npm install
npm run dev       # development server, buka http://localhost:5173
npm run build     # build production ke folder dist/
npm run preview   # coba hasil build production secara lokal
```

## Struktur project

```
src/
  main.jsx              entry point
  App.jsx                state utama + routing antar layar
  lib/
    srs.js                engine spaced repetition (pure function, Tahap 2)
    quizGenerator.js       generate soal pilihan ganda (Tahap 3)
    storage.js              wrapper IndexedDB via Dexie (Tahap 4)
    dataLoader.js            load & gabungkan data kanji + contoh kata
  components/
    Home.jsx, UnitSelect.jsx, Quiz.jsx, Result.jsx, Toast.jsx
  data/
    n5.json ... n1.json           data kanji per level (Tahap 1)
    n5_examples.json ... n1_examples.json   contoh kata per kanji (JMdict + BCCWJ)
  styles/
    global.css              design system genkouyoushi

public/
  icons/                  app icon (192px, 512px, maskable)

vite.config.js            konfigurasi PWA (manifest + service worker via vite-plugin-pwa)
```

## Regenerasi data (opsional)

Kalau ingin regenerasi data kanji atau contoh kata (misal ganti ukuran unit,
tambah override bacaan baru, dsb), script pipeline ada di luar folder project
ini (`convert_kanji.py`, `build_examples.py`) -- jalankan lalu salin ulang
hasil JSON-nya ke `src/data/`.

## Progressive Web App

App ini sudah dikonfigurasi sebagai PWA lewat `vite-plugin-pwa`:
- Bisa di-install ke homescreen (Android/iOS/desktop)
- Jalan offline setelah dibuka sekali (semua data kanji + progress tersimpan lokal)
- Auto-update service worker saat ada versi baru di-deploy

Untuk test PWA-nya (install prompt, offline mode), jalankan `npm run build && npm run preview`
lalu buka di browser -- fitur PWA biasanya tidak aktif penuh di mode `npm run dev`.

## Progress belajar

Tersimpan di IndexedDB browser (lewat Dexie.js, lihat `src/lib/storage.js`).
Data ini lokal per-device -- belum ada sync antar device (perlu backend kalau
mau ditambahkan nanti).
