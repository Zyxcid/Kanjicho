/**
 * notifications.js — glue Capacitor Local Notifications untuk pengingat
 * review Kanjichō (t86). Semua perhitungan murni ada di reminderPlan.js;
 * modul ini hanya bicara dengan Capacitor dan localStorage.
 *
 * (t94) Pengingat kini punya DUA MODE pilihan user, disimpan di
 * localStorage dan dibaca ulang setiap sinkronisasi (notifikasi yang sudah
 * terjadwal ikut berganti perilaku saat mode diubah):
 * - "time" — satu kabar harian pada jam pilihan user (kanji-reminder-time);
 * - "due"  — kabar begitu unit jatuh tempo (default: kanji-reminder-mode).
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
 *   mengubah sakelar di Help; changeReminderMode/changeReminderTime
 *   dipanggil saat mode/jam pilihannya diganti.
 */

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  computeReminderBatch,
  reminderBody,
  REMINDER_IDS,
  DEFAULT_REMINDER_MODE,
  DEFAULT_REMINDER_TIME,
  normalizeReminderTime,
} from "./reminderPlan.js";
import { t } from "./i18n.js";

// localStorage keys — konvensi sama dengan toggle app lain ("1"/"0",
// absen = default ON seperti auto-flip; reminder bisa dimatikan user).
export const REMINDERS_KEY = "kanji-reminders";
export const REMINDERS_ASKED_KEY = "kanji-reminders-asked";
// (t94) Mode pengingat + jam pilihan (mode "time"). Nilai di sini
// DIVALIDASI saat dibaca — nilai rusak/legacy jatuh kembali ke default,
// bukan melempar exception ke UI.
export const REMINDERS_MODE_KEY = "kanji-reminder-mode";
export const REMINDERS_TIME_KEY = "kanji-reminder-time";

const CHANNEL_ID = "reminders";

/** Flag DEV-only: buka UI pengingat di browser demi uji tampilan
 *  (seksi ini aslinya tersembunyi di web — isNativeApp() false).
 *  import.meta.env.DEV hanya benar di dev server Vite; di build produksi
 *  nilainya false (dead-code) dan di Node optional-chaining menahannya.
 *  Aktifkan: localStorage.setItem("kanji-dev-native", "1") lalu reload. */
function devNativeFlag() {
  try {
    return Boolean(import.meta.env?.DEV) && localStorage.getItem("kanji-dev-native") === "1";
  } catch {
    return false;
  }
}

/** True hanya di dalam shell native (Capacitor Android). */
export function isNativeApp() {
  return Capacitor.isNativePlatform() || devNativeFlag();
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

/** Mode pengingat pilihan user — "time" | "due" (default saat absen /
 *  nilainya tidak dikenal: mode "due", paling langsung menjawab "kapan
 *  ada kerjaan?"). Default hanya berlaku SEKALI: begitu user memilih,
 *  pilihannya menetap di localStorage. */
export function getReminderMode() {
  try {
    const v = localStorage.getItem(REMINDERS_MODE_KEY);
    return v === "time" || v === "due" ? v : DEFAULT_REMINDER_MODE;
  } catch {
    return DEFAULT_REMINDER_MODE;
  }
}

export function setReminderMode(mode) {
  if (mode !== "time" && mode !== "due") return; // hanya nilai dikenal
  try {
    localStorage.setItem(REMINDERS_MODE_KEY, mode);
  } catch {
    /* abaikan */
  }
}

/** Jam pilihan mode "time" — "HH:MM" ternormalisasi (default 09:00
 *  saat absen/rusak). */
export function getReminderTime() {
  try {
    return normalizeReminderTime(localStorage.getItem(REMINDERS_TIME_KEY)) || DEFAULT_REMINDER_TIME;
  } catch {
    return DEFAULT_REMINDER_TIME;
  }
}

export function setReminderTime(time) {
  const norm = normalizeReminderTime(time);
  if (!norm) return; // input invalid (mis. "", "25:99") tidak ditimpa
  try {
    localStorage.setItem(REMINDERS_TIME_KEY, norm);
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
  // (t94) Mode + jam dibaca dari localStorage DI SINI (bukan parameter):
  // tiap sinkronisasi otomatis memakai preferensi terbaru tanpa perlu
  // melempar state React ke mana-mana.
  const batch = computeReminderBatch(records, now, {
    mode: getReminderMode(),
    time: getReminderTime(),
  });
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
