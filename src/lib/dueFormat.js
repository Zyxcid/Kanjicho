/**
 * dueFormat.js — label waktu jatuh tempo untuk seluruh UI.
 *
 * Kenapa modul khusus: engine ts-fsrs menghasilkan dua GRANULARITAS jadwal —
 * hari (Review, interval bulat) dan JAM-MENIT (loop Relearning "6h", due
 * beberapa jam setelah kuis). Label lama "N days" (dihitung dari stability)
 * menyesatkan untuk yang kedua: unit lapse yang due 6 jam lagi ditampilkan
 * "2.3 days" padahal jadwal sebenarnya 6 jam. Semua label kini dihitung dari
 * nextReviewAt (timestamp persis), bukan dari stability.
 *
 * Dua fungsi:
 *   intervalUntilLabel(time) → durasi manusiawi sampai due:
 *     "45 min" / "6 hours" / "1 day" / "3 days" / "now" (sudah lewat).
 *     < 1 jam menit-menaik, < 24 jam jam-menaik (pembulatan mulus ke "1 day"
 *     saat jam menymbung 24), ≥ 24 jam hari-menaik (konsisten dengan
 *     daysUntil lama: ceil).
 *   formatDueExact(time) → tanggal + jam tepat: "Sat, Sep 6 · 14:30"
 *     (en-US, jam lokal 24-jam — sama dengan formatHHMM panel kalender).
 *
 * `time` menerima ISO string, timestamp number, atau Date.
 * Fungsi murni — aman dipakai di render maupun test.
 */

import { formatHHMM } from "./studyStats.js";

const MS_PER_MIN = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function toDate(time) {
  return time instanceof Date ? time : new Date(time);
}

function plural(n, unit) {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Durasi sampai jatuh tempo, presisi jam (bukan hanya hari).
 * Dipakai: layar Result ("Next review in"), banner review, kartu unit
 * ("Scheduled · in 6 hours"). Kondisi "sudah due" mengembalikan "now"
 * supaya pemanggil bisa menampilkan CTA review, bukan angka negatif.
 */
export function intervalUntilLabel(time, now = new Date()) {
  const ms = toDate(time).getTime() - toDate(now).getTime();
  if (ms <= 0) return "now";
  if (ms < MS_PER_MIN) return "under a minute";
  const mins = Math.round(ms / MS_PER_MIN);
  // "min" singkatan — tanpa "s" jamak (45 min, bukan 45 mins).
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(ms / MS_PER_HOUR);
  if (hours < 24) return plural(hours, "hour");
  // ≥ 24 jam: hari menaik — "1 day" saat jam tepat menymbung 24, selaras
  // dengan semantik daysUntil (ceil) yang dipakai status unit.
  const days = Math.ceil(ms / MS_PER_DAY);
  return plural(days, "day");
}

/**
 * Waktu jatuh tempo PERSIS: "Sat, Sep 6 · 14:30" — tanggal pendek + jam
 * lokal. Melengkapi label durasi: user tahu bukan cuma "6 hours", tapi
 * pukul berapa tepatnya (bandingkan panel hari kalender review).
 */
export function formatDueExact(time) {
  const d = toDate(time);
  const date = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${date} · ${formatHHMM(d)}`;
}
