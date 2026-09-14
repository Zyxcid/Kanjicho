/**
 * reminderPlan.js — PERENCANAAN MURNI pengingat review (local notification).
 *
 * Modul ini sengaja TIDAK menyentuh Capacitor / DOM / IndexedDB supaya bisa
 * diuji di Node (scripts/test_reminders.mjs) dan dipakai ulang di platform
 * mana pun. Glue Capacitor hidup di notifications.js.
 *
 * MODEL (t94 — dua mode pilihan user; menggantikan slot tetap 08/12/17/20
 * era t86 yang ternyata tidak pas buat semua orang):
 *
 * 1. MODE "time" — "ingatkan jam sekian":
 *    - Satu nudge per hari pada JAM PILIHAN user (HH:MM, default 08.00),
 *      hanya pada hari ketika ada unit yang sudah/belum-tiba-tapi-sudah
 *      jatuh tempo pada jam itu. Tidak ada yang due → tidak ada nudge.
 *    - Unit yang jatuh tempo SETELAH jam pilihan hari itu menunggu nudge
 *      jam yang sama BESOK (kumulatif: nudge menghitung semua unit yang
 *      sudah due saat jam itu tiba).
 *
 * 2. MODE "due" — "ingatkan setiap ada yang due":
 *    - Nudge menyala PADA SAAT sebuah unit jatuh tempo (jam persisnya,
 *      bukan slot tetap). Dua penenang supaya tetap sopan:
 *      (a) MERGE: due yang jatuh dalam jendela 30 menit yang sama
 *          digabung jadi SATU notifikasi di momen due TERAKHIR gugusnya
 *          (jumlah kumulatif) — lima unit selesai dikuis bersamaan akan
 *          menyatu, bukan lima dering;
 *      (b) JAM MALAM: due yang jatuh di rentang 22.00–07.00 digeser ke
 *          07.00 pagi (semua due malam bertemu di satu kabar pagi).
 *
 * KEWAJIBAN SEMUA MODE:
 * - Notifikasi tidak pernah menyala di masa lampau: patokan `now`.
 * - Reviu yang SUDAH due saat sinkronisasi (app ditutup dengan pekerjaan
 *   menunggu) tidak menagih seketika — tenggang REMINDER_GRACE_MS (2 jam)
 *   berlalu dulu; yang jatuh DI MALAM HARinya tetap digeser pagi (mode
 *   "due") / ke jam pilihan berikutnya (mode "time").
 * - Maksimum REMINDER_BATCH_MAX notifikasi terjadwal sekaligus; setiap
 *   kali app dibuka / jadwal berubah, seluruh batch dibatalkan dan
 *   dihitung ulang dari data terkini.
 */

// (t89) t() dari i18n untuk teks body — i18n aman dimuat di Node (semua
// akses DOM/localStorage dijaga), jadi sifat "murni, bisa diuji di Node"
// modul ini tetap utuh; di Node bahasa jatuh ke default "en".
import { t } from "./i18n.js";

// (t94) Mode pengingat pilihan user. Default "due" — paling langsung
// menjawab "kapan ada kerjaan?"; mode "time" untuk yang mau kabar tenang
// sekali sehari. (Nilai lain di storage divalidasi di notifications.js.)
export const REMINDER_MODES = ["time", "due"];
export const DEFAULT_REMINDER_MODE = "due";

// Mode "time" — jam default saat user belum pernah memilih (09.00 pagi:
// kabar pertama sebelum aktivitas hari dimulai).
export const DEFAULT_REMINDER_TIME = "09:00";

// Mode "due" — jam malam: nudge tidak pernah menyala dalam rentang ini.
// Batas kiri inklusif (22.00 tepat = malam), batas kanan eksklusif
// (07.00 tepat = pagi, boleh menyala).
export const REMINDER_QUIET_START = 22;
export const REMINDER_QUIET_END = 7;

// Mode "due" — dua due yang jatuh tempo dalam jarak selebar ini dianggap
// "bersamaan" dan digabung jadi satu notifikasi.
export const REMINDER_MERGE_MS = 30 * 60 * 1000;

// ID notifikasi milik Kanjichō — rentang tetap, dipakai pembatalan
// selektif supaya notifikasi milik fitur lain (kelak) tidak tersapu.
export const REMINDER_IDS = [10001, 10002, 10003];

// Berapa notifikasi terjadwal sekaligus.
export const REMINDER_BATCH_MAX = 3;

// Tenggang sebelum nudge "sudah due saat app ditutup" boleh menyala.
export const REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Parse "HH:MM" → {h, m}; null kalau format/spek salah.
 * Menerima "8:05" (tanpa nol depan); jam 0–23, menit 0–59.
 */
export function parseReminderTime(str) {
  if (typeof str !== "string") return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(str.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

/** Normalisasi ke bentuk dua-digit "HH:MM" (input valid); null kalau gagal. */
export function normalizeReminderTime(str) {
  const p = parseReminderTime(str);
  if (!p) return null;
  return `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
}

/**
 * Kejadian BERIKUTNYA dari jam harian (h:m) PADA/SETELAH `at`.
 * `at` tepat di (h:m) → saat itu juga. Melewati (h:m) hari ini → besok.
 *
 * @param {Date|number} at
 * @param {number} h jam 0–23
 * @param {number} m menit 0–59
 * @returns {Date}
 */
export function nextDailyAt(at, h, m) {
  const d = at instanceof Date ? at : new Date(at);
  const slot = new Date(d);
  slot.setHours(h, m, 0, 0);
  if (slot.getTime() >= d.getTime()) return slot;
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  next.setHours(h, m, 0, 0);
  return next;
}

/**
 * Geser momen yang jatuh di JAM MALAM (22.00–07.00) ke 07.00 pagi.
 * Malam (>= 22.00) → 07.00 BESOK; dini hari (< 07.00) → 07.00 hari itu.
 * Di luar jam malam → dikembalikan apa adanya. Hanya bergeser MAJU.
 *
 * @param {Date|number} at
 * @returns {Date}
 */
export function applyQuietHours(at) {
  const d = at instanceof Date ? at : new Date(at);
  const h = d.getHours();
  if (h >= REMINDER_QUIET_START) {
    const r = new Date(d);
    r.setDate(r.getDate() + 1);
    r.setHours(REMINDER_QUIET_END, 0, 0, 0);
    return r;
  }
  if (h < REMINDER_QUIET_END) {
    const r = new Date(d);
    r.setHours(REMINDER_QUIET_END, 0, 0, 0);
    return r;
  }
  return d;
}

/**
 * Rencana notifikasi dari record unitProgress.
 *
 * @param {Array<{nextReviewAt?: string}>} records - record unitProgress
 *   (nextReviewAt ISO string; record tanpa/invalid diabaikan).
 * @param {Date} now - waktu acuan "sekarang".
 * @param {{mode?: "time"|"due", time?: string, max?: number,
 *          graceMs?: number, mergeMs?: number}} [opts]
 *   mode  - "time" (default DEFAULT_REMINDER_MODE) atau "due".
 *   time  - mode "time": "HH:MM" jam pilihan user.
 *   mergeMs - mode "due": lebar jendela penggabungan due berdekatan.
 * @returns {Array<{id: number, at: Date, count: number}>} batch terurut
 *   naik; kosong kalau tidak ada jadwal review sama sekali.
 */
export function computeReminderBatch(records, now = new Date(), opts = {}) {
  const mode = opts.mode === "time" || opts.mode === "due" ? opts.mode : DEFAULT_REMINDER_MODE;
  const max = opts.max ?? REMINDER_BATCH_MAX;
  const graceMs = opts.graceMs ?? REMINDER_GRACE_MS;
  const mergeMs = opts.mergeMs ?? REMINDER_MERGE_MS;
  const times = (records || [])
    .map((r) => (r && r.nextReviewAt ? new Date(r.nextReviewAt).getTime() : null))
    .filter((ts) => ts !== null && !Number.isNaN(ts));
  if (times.length === 0) return [];

  const nowMs = now.getTime();
  // Patokan nudge untuk due yang SUDAH LEWAT (pekerjaan menunggu saat app
  // ditutup): beri tenggang grace dulu — user mungkin akan buka app lagi.
  // Due yang masih MASA DEPAN tidak diberi tenggang: mode "due" harus
  // menyala PERSIS saat due tiba; mode "time" memetakan ke jam pilihan
  // berikutnya SETELAH due itu.
  const anchor = Math.max(nowMs + graceMs, 0);
  const base = (ts) => (ts >= nowMs ? ts : anchor);

  let moments;

  if (mode === "time") {
    // Satu slot harian di jam pilihan user. Setiap due dipetakan ke
    // kejadian (h:m) PERTAMA pada/setelah patokannya; due yang menempel
    // di slot sama menyatu otomatis (slot identik → dedupe).
    const parsed = parseReminderTime(opts.time) || parseReminderTime(DEFAULT_REMINDER_TIME);
    const { h, m } = parsed;
    moments = [...new Set(times.map((ts) => nextDailyAt(base(ts), h, m).getTime()))]
      .sort((a, b) => a - b)
      .slice(0, Math.max(1, max));
  } else {
    // Mode "due": nudge PADA momen due — dengan dua penenang: jam malam
    // digeser pagi, lalu gugus due berdekatan (rantai adjacency) menyatu
    // di momen TERAKHIR gugusnya. Patokan `base` memastikan due lampau
    // tidak menyala di masa lampau.
    const fires = times
      .map((ts) => applyQuietHours(base(ts)).getTime())
      .sort((a, b) => a - b);
    const clusters = [];
    for (const f of fires) {
      const last = clusters[clusters.length - 1];
      if (last && f - last.time <= mergeMs) last.time = f; // rantai memanjang
      else clusters.push({ time: f });
    }
    moments = clusters.slice(0, Math.max(1, max)).map((c) => c.time);
  }

  return moments.map((ms, i) => ({
    id: REMINDER_IDS[i],
    at: new Date(ms),
    // Jumlah unit yang SUDAH due saat nudge tiba (kumulatif, termasuk yang
    // jatuh tempo lebih awal tapi belum sempat direview user).
    count: times.filter((ts) => ts <= ms).length,
  }));
}

/** Teks body notifikasi — (t89) mengikuti bahasa antarmuka aktif
 *  (kunci notif.*; dibaca saat jadwal disusun, jadi notifikasi yang sudah
 *  terjadwal memakai bahasa saat penjadwalannya — sinkron ulang tiap
 *  buka app menjaga tetap segar). */
export function reminderBody(count) {
  return count === 1 ? t("notif.bodyOne") : t("notif.bodyMany", { n: count });
}
