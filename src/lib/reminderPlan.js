/**
 * reminderPlan.js — PERENCANAAN MURNI pengingat review (local notification).
 *
 * Modul ini sengaja TIDAK menyentuh Capacitor / DOM / IndexedDB supaya bisa
 * diuji di Node (scripts/test_reminders.mjs) dan dipakai ulang di platform
 * mana pun. Glue Capacitor hidup di notifications.js.
 *
 * MODEL (t86):
 * - Notifikasi hanya menyala di "slot nudge" tetap harian: 08.00, 12.00,
 *   17.00, 20.00 (waktu lokal perangkat) — jauh lebih tenang daripada
 *   menagih di detik jatuh tempo (reviu bisa jatuh jam 03.00 dini hari).
 * - Setiap momen jatuh tempo D dipetakan ke slot >= D pertama; beberapa unit
 *   yang jatuh tempo di sela slot yang sama OTOMATIS MENYATU jadi satu
 *   notifikasi dengan jumlah kumulatif (berapa unit sudah due saat slot itu
 *   tiba).
 * - Reviu yang SUDAH due saat app ditutup tidak menagih seketika: tenggang
 *   REMINDER_GRACE_MS (2 jam) berlalu dulu, lalu slot berikutnya — siang
 *   yang sama kalau masih pagi, besok pagi kalau sudah larut.
 * - Maksimum REMINDER_BATCH_MAX notifikasi terjadwal sekaligus (rantai
 *   pengingat beberapa hari ke depan); setiap kali app dibuka / jadwal
 *   berubah, seluruh batch dibatalkan dan dihitung ulang dari data terkini.
 */

// Jam slot nudge harian (waktu lokal), menaik.
export const REMINDER_SLOTS = [8, 12, 17, 20];

// ID notifikasi milik Kanjichō — rentang tetap, dipakai pembatalan
// selektif supaya notifikasi milik fitur lain (kelak) tidak tersapu.
export const REMINDER_IDS = [10001, 10002, 10003];

// Berapa notifikasi terjadwal sekaligus.
export const REMINDER_BATCH_MAX = 3;

// Tenggang sebelum nudge "sudah due saat app ditutup" boleh menyala.
export const REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Slot nudge berikutnya PADA atau SETELAH `at`.
 * `at` tepat di jam slot → slot itu sendiri (due jam 12.00 tepat → nudge
 * 12.00). Lewat slot terakhir hari ini → slot pertama besok.
 *
 * @param {Date|number} at
 * @returns {Date}
 */
export function nextSlotAfter(at) {
  const d = at instanceof Date ? at : new Date(at);
  for (const h of REMINDER_SLOTS) {
    const slot = new Date(d);
    slot.setHours(h, 0, 0, 0);
    if (slot.getTime() >= d.getTime()) return slot;
  }
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  next.setHours(REMINDER_SLOTS[0], 0, 0, 0);
  return next;
}

/**
 * Rencana notifikasi dari record unitProgress.
 *
 * @param {Array<{nextReviewAt?: string}>} records - record unitProgress
 *   (nextReviewAt ISO string; record tanpa/invalid diabaikan).
 * @param {Date} now - waktu acuan "sekarang".
 * @param {{max?: number, graceMs?: number}} [opts]
 * @returns {Array<{id: number, at: Date, count: number}>} batch terurut
 *   naik; kosong kalau tidak ada jadwal review sama sekali.
 */
export function computeReminderBatch(records, now = new Date(), opts = {}) {
  const max = opts.max ?? REMINDER_BATCH_MAX;
  const graceMs = opts.graceMs ?? REMINDER_GRACE_MS;
  const times = (records || [])
    .map((r) => (r && r.nextReviewAt ? new Date(r.nextReviewAt).getTime() : null))
    .filter((t) => t !== null && !Number.isNaN(t));
  if (times.length === 0) return [];

  const nowMs = now.getTime();
  // Titik acuan nudge sebuah due moment D: D sendiri kalau masih masa depan;
  // "sekarang + tenggang" kalau D sudah lewat (app ditutup dengan pekerjaan
  // menunggu). Keduanya tak pernah lebih awal dari tenggang grace.
  const anchor = Math.max(nowMs + graceMs, 0);
  const slots = [...new Set(times.map((t) => nextSlotAfter(Math.max(t, anchor)).getTime()))]
    .sort((a, b) => a - b)
    .slice(0, Math.max(1, max));

  return slots.map((s, i) => ({
    id: REMINDER_IDS[i],
    at: new Date(s),
    // Jumlah unit yang SUDAH due saat slot tiba (kumulatif, termasuk yang
    // jatuh tempo lebih awal tapi belum sempat direview user).
    count: times.filter((t) => t <= s).length,
  }));
}

/** Teks body notifikasi (bahasa Inggris, konsisten dengan UI app). */
export function reminderBody(count) {
  return count === 1 ? "1 unit is due for review." : `${count} units are due for review.`;
}
