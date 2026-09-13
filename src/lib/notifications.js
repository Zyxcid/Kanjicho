/**
 * notifications.js — glue Capacitor Local Notifications untuk pengingat
 * review Kanjichō (t86). Semua perhitungan murni ada di reminderPlan.js;
 * modul ini hanya bicara dengan Capacitor dan localStorage.
 *
 * Prinsip: WEB/PWA TIDAK TERPENGARUH. Setiap fungsi dicek isNativeApp()
 * lebih dulu — di browser semua panggilan Capacitor dilewati (plugin web
 * memang tidak berfungsi untuk local notification). Tidak ada request
 * izin, tidak ada jadwal, UI toggle di Help pun disembunyikan di web.
 * Azas "zero network / zero accounts / zero analytics" tetap utuh:
 * notifikasi lokal murni perangkat, tidak ada yang meninggalkan HP.
 *
 * Pemakaian (dipanggil App.jsx):
 * - syncReviewReminders(records) — sinkron batch ke jadwal terkini.
 *   Dipanggil: saat app dibuka / kembali ke latar depan / saat app
 *   berpindah ke latar belakang / setelah jadwal SRS berubah.
 * - afterScheduleChanged(records) — sehabis kuis SRS selesai: minta izin
 *   SEKALI (momen alami: user baru melihat jadwalnya terbentuk), lalu
 *   sinkron.
 * - toggleReminders(next) dari App mengelola izin + sinkron saat user
 *   mengubah sakelar di Help.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { computeReminderBatch, reminderBody, REMINDER_IDS } from "./reminderPlan.js";
import { t } from "./i18n.js";

// localStorage keys — konvensi sama dengan toggle app lain ("1"/"0",
// absen = default ON seperti auto-flip; reminder bisa dimatikan user).
export const REMINDERS_KEY = "kanji-reminders";
export const REMINDERS_ASKED_KEY = "kanji-reminders-asked";

const CHANNEL_ID = "reminders";

/** True hanya di dalam shell native (Capacitor Android). */
export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

/** Sakelar user — default ON; di web nilainya tidak berefek apa pun. */
export function getRemindersEnabled() {
  try {
    return localStorage.getItem(REMINDERS_KEY) !== "0";
  } catch {
    return true; // mode privat — anggap default
  }
}

export function setRemindersEnabled(v) {
  try {
    localStorage.setItem(REMINDERS_KEY, v ? "1" : "0");
  } catch {
    /* abaikan */
  }
}

// Kanal Android (O+): nama yang user lihat di pengaturan sistem. Sekali
// dibuat tidak bisa diubah deskripsinya — guard flag per sesi supaya tidak
// menagih bridge berulang kali. (t89) nama kanal SENGAJA tetap Inggris di
// semua bahasa: Android tidak bisa mengganti nama kanal pasca-pembuatan,
// dan campur bahasa di daftar kanal pengaturan sistem justru membingungkan.
let channelReady = false;
async function ensureChannel() {
  if (channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Review reminders",
      description: "Quiet nudges when kanji reviews are due",
      importance: 3, // Importance.DEFAULT: ada suara, tanpa heads-up
      visibility: 1, // tampil di layar kunci
      lights: false,
      vibration: false,
    });
  } catch {
    /* kanal gagal → plugin memakai kanal default; bukan fatal */
  }
  channelReady = true;
}

/** "granted" | "denied" | "prompt" | "unsupported". */
export async function checkReminderPermission() {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display;
  } catch {
    return "unsupported";
  }
}

/**
 * Minta izin notifikasi (Android 13+: dialog POST_NOTIFICATIONS runtime).
 * Hanya memunculkan dialog bila status masih "prompt"; penolakan permanen
 * mengembalikan false tanpa dialog ulang. Selalu menandai "sudah pernah
 * diminta" supaya app tidak menagih izin dua kali.
 *
 * @returns {Promise<boolean>} granted?
 */
export async function requestReminderPermission() {
  try {
    let { display } = await LocalNotifications.checkPermissions();
    if (display === "prompt") {
      ({ display } = await LocalNotifications.requestPermissions());
    }
    try {
      localStorage.setItem(REMINDERS_ASKED_KEY, "1");
    } catch {
      /* abaikan */
    }
    return display === "granted";
  } catch {
    return false;
  }
}

/** Batalkan seluruh notifikasi pengingat milik Kanjichō. */
export async function cancelReviewReminders() {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.cancel({
      notifications: REMINDER_IDS.map((id) => ({ id })),
    });
  } catch {
    /* abaikan */
  }
}

/**
 * Sinkronkan batch notifikasi dengan jadwal review TERKINI:
 * batalkan batch lama → jadwalkan ulang dari `records`. Idempoten —
 * aman dipanggil berulang (tiap app dibuka / foreground / kuis selesai).
 *
 * @param {Array<{nextReviewAt?: string}>} records - record unitProgress
 *   (bisa mentah dari storage.getAllProgress()).
 * @param {Date} [now]
 */
export async function syncReviewReminders(records, now = new Date()) {
  if (!isNativeApp() || !getRemindersEnabled()) {
    await cancelReviewReminders();
    return;
  }
  const perm = await checkReminderPermission();
  if (perm !== "granted") {
    // Di Android 13+ tanpa izin, jadwal tidak akan tampil sama sekali —
    // bersihkan saja supaya tidak menumpuk nudge tak terlihat. Di bawah
    // Android 13 checkPermissions selalu "granted" (tanpa runtime izin).
    await cancelReviewReminders();
    return;
  }
  await ensureChannel();
  const batch = computeReminderBatch(records, now);
  await cancelReviewReminders();
  if (batch.length === 0) return;
  try {
    await LocalNotifications.schedule({
      notifications: batch.map((n) => ({
        id: n.id,
        // (t89) Judul/body mengikuti bahasa aktif saat penjadwalan —
        // sinkron ulang tiap app dibuka menjaga bahasa notifikasi tetap
        // segar setelah user mengganti bahasa.
        title: t("notif.title"),
        body: reminderBody(n.count),
        schedule: { at: n.at, allowWhileIdle: true },
        channelId: CHANNEL_ID,
      })),
    });
  } catch {
    /* jadwal gagal (mis. mode battery saver ketat) — coba lagi di sync berikutnya */
  }
}

/**
 * Hook sehabis kuis SRS selesai / jadwal berubah: minta izin SEKALI di
 * seumur app (flag REMINDERS_ASKED_KEY), lalu sinkronkan batch. Fire-and-
 * forget dari App — tidak boleh menahan navigasi layar hasil.
 */
export async function afterScheduleChanged(records) {
  if (!isNativeApp()) return;
  if (getRemindersEnabled()) {
    let asked = null;
    try {
      asked = localStorage.getItem(REMINDERS_ASKED_KEY);
    } catch {
      asked = null;
    }
    if (!asked) await requestReminderPermission();
  }
  await syncReviewReminders(records);
}
