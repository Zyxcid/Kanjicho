/**
 * storage.js — Persistensi progress belajar user, pakai IndexedDB (via Dexie.js).
 *
 * Ini SATU-SATUNYA modul di aplikasi yang boleh menyentuh storage secara
 * langsung. Modul lain (srs.js, quiz-generator.js) tetap pure function —
 * storage.js yang menjembatani state SRS/hasil kuis ke penyimpanan
 * persisten di browser.
 *
 * Dua tabel:
 *   - unitProgress : satu baris per unit (state SRS terkini, lihat srs.js)
 *   - quizAttempts : log riwayat setiap kali user selesai kuis (untuk
 *                    statistik/histori, bukan untuk logic SRS itu sendiri)
 *
 * Di browser: cukup `import Dexie from "dexie"` seperti biasa, IndexedDB
 * sudah tersedia secara native. Untuk testing di Node (lihat test-storage.js),
 * kita pasang polyfill fake-indexeddb sebelum modul ini di-require.
 */

import Dexie from "dexie";

const DB_NAME = "KanjiLearningApp";
const DB_VERSION = 1;

class KanjiDB extends Dexie {
  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      // unitId sebagai primary key (mis. "N5-U1"). Index tambahan di
      // jlptLevel & nextReviewAt karena keduanya sering dipakai untuk query.
      unitProgress: "unitId, jlptLevel, nextReviewAt",
      // ++id = auto-increment. Index di unitId & timestamp untuk query histori.
      quizAttempts: "++id, unitId, timestamp",
    });
  }
}

let dbInstance = null;

function getDB() {
  if (!dbInstance) dbInstance = new KanjiDB();
  return dbInstance;
}

// ---- Unit progress (state SRS) ----

/**
 * Ambil progress satu unit. Return null kalau unit belum pernah dipelajari
 * sama sekali (belum ada record).
 */
async function getUnitProgress(unitId) {
  const db = getDB();
  const record = await db.unitProgress.get(unitId);
  return record || null;
}

/**
 * Simpan/update state SRS untuk satu unit.
 * @param {string} unitId
 * @param {string} jlptLevel - mis. "N5", dipakai untuk query per level
 * @param {object} srsState - hasil dari reviewUnit() di srs.js
 */
async function saveUnitProgress(unitId, jlptLevel, srsState) {
  const db = getDB();
  await db.unitProgress.put({
    unitId,
    jlptLevel,
    ...srsState,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Ambil semua progress, opsional difilter per level.
 */
async function getAllProgress(jlptLevel = null) {
  const db = getDB();
  if (jlptLevel) {
    return db.unitProgress.where("jlptLevel").equals(jlptLevel).toArray();
  }
  return db.unitProgress.toArray();
}

/**
 * Unit-unit yang sudah waktunya direview (nextReviewAt <= now).
 */
async function getDueUnits(now = new Date()) {
  const db = getDB();
  const all = await db.unitProgress.toArray();
  return all.filter((u) => u.nextReviewAt && new Date(u.nextReviewAt) <= now);
}

/**
 * Dari daftar semua unitId yang ada di aplikasi (mis. dari n5.json dkk),
 * kembalikan yang mana yang BELUM pernah dipelajari sama sekali.
 */
async function getNotStartedUnitIds(allUnitIds) {
  const db = getDB();
  const started = await db.unitProgress.toArray();
  const startedIds = new Set(started.map((u) => u.unitId));
  return allUnitIds.filter((id) => !startedIds.has(id));
}

// ---- Riwayat kuis (opsional, untuk statistik) ----

async function logQuizAttempt(unitId, quizResult) {
  const db = getDB();
  await db.quizAttempts.add({
    unitId,
    timestamp: new Date().toISOString(),
    score: quizResult.score,
    correctCount: quizResult.correctCount,
    dontKnowCount: quizResult.dontKnowCount,
    wrongCount: quizResult.wrongCount,
    total: quizResult.total,
  });
}

async function getQuizHistory(unitId) {
  const db = getDB();
  return db.quizAttempts.where("unitId").equals(unitId).toArray();
}

/**
 * Ambil SEMUA riwayat kuis lintas unit (dipakai untuk hitung streak harian
 * di Home -- perlu tahu tanggal-tanggal user aktif, bukan per-unit).
 */
async function getAllQuizAttempts() {
  const db = getDB();
  return db.quizAttempts.toArray();
}

// ---- Utilitas ----

/**
 * Hapus SEMUA data progress & histori. Dipakai untuk fitur "reset progress"
 * di UI, atau untuk keperluan testing.
 */
async function clearAllData() {
  const db = getDB();
  await db.unitProgress.clear();
  await db.quizAttempts.clear();
}

export {
  getDB,
  getUnitProgress,
  saveUnitProgress,
  getAllProgress,
  getDueUnits,
  getNotStartedUnitIds,
  logQuizAttempt,
  getQuizHistory,
  getAllQuizAttempts,
  clearAllData,
};
