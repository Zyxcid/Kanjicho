/**
 * backup.js — ekspor/impor seluruh progress belajar ke satu file JSON.
 *
 * Strategi: snapshot penuh + replace-all. Impor MENIMPA semua data lama
 * (dengan konfirmasi di UI), bukan digabung — menggabungkan dua progress
 * berbeda penuh ambiguitas, menimpa adalah satu-satunya perilaku yang
 * mudah diprediksi dan dijelaskan.
 *
 * File backup diberi nomor versi. Kalau format data berubah kelak, cukup
 * naikkan BACKUP_VERSION dan tambahkan satu fungsi kecil di MIGRATIONS —
 * file backup lama tetap bisa diimpor (lihat migrateBackup).
 *
 * Sumber data yang dibackup:
 *   1. Tiga tabel IndexedDB milik storage.js (Dexie) — INI progress yang
 *      sebenarnya: unitProgress (jadwal SRS), quizAttempts (log kuis,
 *      sumber streak harian), kanjiStats (tally benar/salah per kanji,
 *      sumber daftar missed).
 *   2. Tiga key localStorage pengaturan tampilan (tema, kana/romaji,
 *      visibilitas tombol reset progress). Bukan progress, tapi ikut
 *      dibackup supaya pindah perangkat/peramban terasa langsung
 *      "seperti sebelumnya".
 */

import { getDB } from "./storage";

// Pengaturan localStorage yang ikut di-backup. Daftar ini EKSPLISIT
// (bukan menyapu semua key) karena progress tidak pernah tersimpan di
// localStorage — hanya pengaturan. Daftar eksplisit juga berarti file
// hasil manipulasi tidak bisa menyuntik key sembarangan saat impor;
// key pengaturan baru tinggal ditambahkan ke daftar ini.
const SETTINGS_KEYS = ["kanji-theme", "kanji-answer-script", "kanji-show-reset"];

// Versi format backup saat ini. Naikkan (+1) setiap kali struktur data
// di IndexedDB/localStorage berubah, lalu tambahkan fungsi migrasi di
// MIGRATIONS. Jangan mengubah makna versi lama.
const BACKUP_VERSION = 1;

// Rantai migrasi: key = versi AWAL file, value = fungsi yang mengubah
// data dari versi itu ke versi berikutnya. Saat impor, file lama
// dinaikkan selangkah demi selangkah (1 → 2 → 3 → ...) sampai
// BACKUP_VERSION. Contoh kelak, saat format naik ke versi 2:
//   1: (data) => {
//     // ubah data lama menjadi bentuk versi 2 di sini
//     return data;
//   },
const MIGRATIONS = {};

// ---- Export ----

// Baca nilai pengaturan dari localStorage (key yang belum pernah
// disimpan user tidak ikut).
function readSettings() {
  const out = {};
  for (const key of SETTINGS_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

// Unduh "backup" sebagai file JSON bernama kanjicho-backup-YYYY-MM-DD.json.
function downloadBackup(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `kanjicho-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();

  // revoke ditunda sebentar agar unduhan sempat dimulai di semua browser.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Kumpulkan seluruh progress (3 tabel + pengaturan) dan unduh sebagai
 * satu file JSON. Setelah selesai, simpan file itu di tempat aman.
 */
export async function exportProgress() {
  const db = getDB();
  const backup = {
    app: "kanjicho", // penanda bahwa file ini backup Kanjicho
    version: BACKUP_VERSION, // versi format saat file dibuat
    exportedAt: new Date().toISOString(), // waktu ekspor (informasional)
    data: {
      unitProgress: await db.unitProgress.toArray(),
      quizAttempts: await db.quizAttempts.toArray(),
      kanjiStats: await db.kanjiStats.toArray(),
      settings: readSettings(),
    },
  };
  downloadBackup(backup);
}

// ---- Import ----

// Naikkan file backup lama ke versi terbaru lewat rantai MIGRATIONS.
function migrateBackup(backup) {
  while (backup.version < BACKUP_VERSION) {
    const step = MIGRATIONS[backup.version];
    if (!step) {
      throw new Error(`no migration from backup version ${backup.version}`);
    }
    backup.data = step(backup.data);
    backup.version += 1;
  }
}

// Struktur data minimal yang harus dimiliki file backup yang valid.
function isValidData(data) {
  return (
    data &&
    typeof data === "object" &&
    Array.isArray(data.unitProgress) &&
    Array.isArray(data.quizAttempts) &&
    Array.isArray(data.kanjiStats) &&
    data.settings &&
    typeof data.settings === "object"
  );
}

/**
 * Baca file backup dan validasi isinya. Belum menulis apa pun ke
 * IndexedDB/localStorage — pemanggil boleh batal kapan pun sebelum
 * applyBackup().
 */
export function readBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);

        if (
          backup.app !== "kanjicho" ||
          typeof backup.version !== "number" ||
          backup.version < 1 ||
          !isValidData(backup.data)
        ) {
          throw new Error("not a Kanjicho backup file");
        }
        if (backup.version > BACKUP_VERSION) {
          // File dari aplikasi lebih baru tidak bisa dimengerti versi ini.
          throw new Error("backup was made by a newer app version");
        }

        migrateBackup(backup);
        resolve(backup);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("could not read the file"));
    reader.readAsText(file);
  });
}

// Timpa pengaturan localStorage dengan isi backup (replace-all juga:
// key yang tidak ada di file dihapus).
function applySettings(settings) {
  for (const key of SETTINGS_KEYS) {
    if (typeof settings[key] === "string") {
      localStorage.setItem(key, settings[key]);
    } else {
      localStorage.removeItem(key);
    }
  }
}

/**
 * Terapkan backup: hapus ketiga tabel lalu tulis ulang isinya dari file,
 * timpa pengaturan, dan reload halaman. Seluruh penggantian tabel
 * dibungkus satu transaksi Dexie — kalau satu langkah gagal, semuanya
 * dibatalkan dan progress lama tetap utuh.
 */
export async function applyBackup(backup) {
  const db = getDB();

  await db.transaction(
    "rw",
    db.unitProgress,
    db.quizAttempts,
    db.kanjiStats,
    async () => {
      await db.unitProgress.clear();
      await db.quizAttempts.clear();
      await db.kanjiStats.clear();

      // bulkPut (bukan bulkAdd): quizAttempts menyimpan id asli dari file,
      // put menerima kunci eksplisit meskipun kolomnya auto-increment —
      // urutan histori tetap sama dengan saat file dibuat.
      await db.unitProgress.bulkPut(backup.data.unitProgress);
      await db.quizAttempts.bulkPut(backup.data.quizAttempts);
      await db.kanjiStats.bulkPut(backup.data.kanjiStats);
    }
  );

  applySettings(backup.data.settings);

  // Reload: React membaca IndexedDB saat aplikasi start, jadi state di
  // memori masih memegang progress lama. Reload membuat seluruh aplikasi
  // start ulang dan membaca progress yang baru.
  location.reload();
}
