/**
 * i18n.js — ganti bahasa antarmuka (t89), tanpa library: satu modul kecil
 * + dua kamus (src/strings/{en,id}.js) + satu kunci localStorage.
 *
 * DESAIN (dipilih sengaja, lihat catatan di bawah):
 *  - `t()` FUNGSI MURNI yang membaca variabel modul `current` — BUKAN
 *    React context. Alasan: pohon render Kanjichō seluruhnya berakar di
 *    App; mengganti bahasa = setState `lang` di App → SELURUH pohon
 *    re-render (tidak ada React.memo di app ini) → semua pemanggilan t()
 *    dievaluasi ulang dengan bahasa baru dalam satu batch. Context akan
 *    menambah boilerplate tanpa menambah apa pun di sini.
 *  - Kunci yang hilang dari kamus aktif jatuh ke kamus en; kunci yang
 *    tidak dikenal sama sekali dikembalikan apa adanya (mudah di-spot
 *    saat debug, tidak pernah melempar).
 *  - `setLang()` juga menyinkronkan <html lang> (pembaca layar / font
 *    fallback hint) dan localStorage.
 *
 * Pemakaian:
 *   import { t, getLang, setLang, LANGS, LANG_KEY } from "../lib/i18n.js";
 *   t("quiz.question", { n: 3, m: 15 });  // "Soal 3 dari 15"
 *
 * Format tanggal: helper di dueFormat.js / ReviewCalendar.jsx membaca
 * getLang() untuk memilih locale ("en-US" / "id-ID") — label durasi juga
 * lewat t() (kunci "dur.*").
 *
 * Batas sengaja: teks NOTIFIKASI Android diterjemahkan (dibaca saat
 * jadwal disusun), tetapi NAMA KANAL notifikasi tetap Inggris — Android
 * tidak bisa mengubah nama kanal setelah dibuat (lihat notifications.js).
 * Seksi Data sources di Help tetap Inggris di kedua bahasa (teks
 * legal/kredit lisensi — konvensi umum aplikasi).
 *
 * LINGKUNGAN: modul ini juga dimuat di NODE (scripts/test_reminders.mjs
 * mengimpor reminderPlan.js yang memakai t()) — akses DOM/localStorage
 * semua berjaga typeof/try-catch supaya murni di Node tetap hidup
 * (bahasa jatuh ke default "en", persis ekspektasi test lama).
 */

import EN from "../strings/en.js";
import ID from "../strings/id.js";

export const LANG_KEY = "kanji-lang";

/** Daftar bahasa yang tersedia (label = nama asli, konvensi UI bahasa). */
export const LANGS = [
  { id: "en", label: "English" },
  {id: "id", label: "Bahasa Indonesia" },
];

const DICTS = { en: EN, id: ID };

/** Locale untuk toLocaleDateString dsb. */
export function localeOf(lang = undefined) {
  return (lang || current) === "id" ? "id-ID" : "en-US";
}

function readStoredLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "id" || v === "en" ? v : "en";
  } catch {
    return "en"; // mode privat — default Inggris
  }
}

// Bahasa aktif — state modul (dibaca live oleh t(), di-set App via setLang).
let current = readStoredLang();

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!DICTS[lang] || lang === current) return false;
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* abaikan — penyimpanan tak tersedia, pilihan hanya bertahan sesi ini */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
  return true;
}

// Sinkronkan <html lang> sejak awal (index.html memakai lang="en").
if (typeof document !== "undefined") {
  document.documentElement.lang = current;
}

/**
 * Ambil string terjemahan. `vars` menggantikan {placeholder} (String(v)).
 * Urutan fallback: kamus aktif → kamus en → kunci apa adanya.
 */
export function t(key, vars) {
  let s = DICTS[current][key];
  if (s === undefined) s = EN[key];
  if (s === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
