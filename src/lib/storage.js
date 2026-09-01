/**
 * storage.js — persistensi progress belajar ke IndexedDB (via Dexie).
 *
 * Satu-satunya modul yang boleh menyentuh storage; modul lain (srs.js,
 * quizGenerator.js) murni stateless — storage.js menjembatani hasil kuis
 * dan state SRS ke penyimpanan browser.
 *
 * Tiga tabel:
 *   - unitProgress : state SRS per unit (lihat srs.js)
 *   - quizAttempts : log tiap kuis selesai (untuk streak/statistik, bukan SRS)
 *   - kanjiStats   : performa per KANJI — sumber daftar "missed" untuk pill
 *                    di kartu unit. Kanji dianggap "missed" kalau pernah
 *                    salah/"tidak tahu" dan belum ditebus 1x benar
 *                    berturut-turut sejak salah terakhir.
 */

import Dexie from "dexie";

const DB_NAME = "KanjiLearningApp";
const DB_VERSION = 2;

// Berapa kali benar berturut-turut yang menebus (menghapus) satu kanji dari
// daftar "missed" setelah terakhir dijawab salah. 1 = satu benar cukup.
const WEAK_REDEEM_CORRECT_STREAK = 1;

class KanjiDB extends Dexie {
  constructor() {
    super(DB_NAME);
    // v2 menambah tabel kanjiStats; skema lama tidak berubah supaya data
    // user yang sudah ada tetap utuh saat upgrade.
    this.version(DB_VERSION).stores({
      // unitId primary key ("N5-U1"); jlptLevel & nextReviewAt di-index
      // karena sering dipakai query.
      unitProgress: "unitId, jlptLevel, nextReviewAt",
      // ++id auto-increment; unitId & timestamp di-index untuk query histori.
      quizAttempts: "++id, unitId, timestamp",
      // kanji primary key; level & lastWrongAt di-index (filter pill &
      // prioritas review).
      kanjiStats: "kanji, level, lastWrongAt",
    });
  }
}

let dbInstance = null;

function getDB() {
  if (!dbInstance) dbInstance = new KanjiDB();
  return dbInstance;
}

// ---- Unit progress (state SRS) ----

/** Progress satu unit, null kalau belum pernah dipelajari. */
async function getUnitProgress(unitId) {
  const db = getDB();
  const record = await db.unitProgress.get(unitId);
  return record || null;
}

/**
 * Simpan state SRS satu unit.
 * @param {string} unitId
 * @param {string} jlptLevel - mis. "N5", untuk query per level
 * @param {object} srsState - hasil reviewUnit() di srs.js
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

/** Semua progress, opsional difilter per level. */
async function getAllProgress(jlptLevel = null) {
  const db = getDB();
  if (jlptLevel) {
    return db.unitProgress.where("jlptLevel").equals(jlptLevel).toArray();
  }
  return db.unitProgress.toArray();
}

/** Unit yang sudah waktunya direview (nextReviewAt <= now). */
async function getDueUnits(now = new Date()) {
  const db = getDB();
  const all = await db.unitProgress.toArray();
  return all.filter((u) => u.nextReviewAt && new Date(u.nextReviewAt) <= now);
}

/** Dari daftar semua unitId aplikasi, kembalikan yang belum pernah dipelajari. */
async function getNotStartedUnitIds(allUnitIds) {
  const db = getDB();
  const started = await db.unitProgress.toArray();
  const startedIds = new Set(started.map((u) => u.unitId));
  return allUnitIds.filter((id) => !startedIds.has(id));
}

// ---- Riwayat kuis ----

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
 * Semua riwayat kuis lintas unit — dipakai hitung streak harian di Home
 * (perlu tanggal-tanggal aktif user, bukan per-unit).
 */
async function getAllQuizAttempts() {
  const db = getDB();
  return db.quizAttempts.toArray();
}

// ---- Performa per-kanji (untuk "weak kanji review") ----

/**
 * Update statistik per-kanji dari hasil satu sesi kuis.
 *
 * @param {Array<{kanji: string, level?: string, isCorrect: boolean}>} details
 *   Satu entri per soal — format `details` dari scoreQuiz()
 *   (quizGenerator.js). level dipakai saat menyusun kuis weak review.
 *
 * Dipanggil untuk kuis SRS dan weak review; practice mode tidak boleh
 * mengubah apa pun (lihat App.jsx).
 */
async function updateKanjiStats(details) {
  const db = getDB();
  const now = new Date().toISOString();

  for (const d of details) {
    if (!d || !d.kanji) continue;
    const rec = await db.kanjiStats.get(d.kanji);
    if (!rec) {
      await db.kanjiStats.put({
        kanji: d.kanji,
        level: d.level || null,
        wrongCount: d.isCorrect ? 0 : 1,
        correctCount: d.isCorrect ? 1 : 0,
        correctSinceWrong: d.isCorrect ? 1 : 0,
        lastWrongAt: d.isCorrect ? null : now,
        lastSeenAt: now,
        updatedAt: now,
      });
    } else {
      await db.kanjiStats.put({
        ...rec,
        level: d.level || rec.level,
        wrongCount: rec.wrongCount + (d.isCorrect ? 0 : 1),
        correctCount: rec.correctCount + (d.isCorrect ? 1 : 0),
        correctSinceWrong: d.isCorrect ? rec.correctSinceWrong + 1 : 0,
        lastWrongAt: d.isCorrect ? rec.lastWrongAt : now,
        lastSeenAt: now,
        updatedAt: now,
      });
    }
  }
}

/**
 * Record kanjiStats untuk beberapa kanji sekaligus, sebagai map
 * kanji → record (undefined kalau belum ada).
 */
async function getKanjiStats(kanjiChars) {
  const db = getDB();
  const out = {};
  for (const ch of kanjiChars || []) {
    out[ch] = await db.kanjiStats.get(ch);
  }
  return out;
}

/**
 * Semua kanji yang sedang "missed": pernah salah/"tidak tahu" dan belum
 * ditebus benar N-kali berturut-turut (N = WEAK_REDEEM_CORRECT_STREAK).
 * Urut: paling sering salah dulu, lalu paling baru disalahkan.
 */
async function getWeakKanji() {
  const db = getDB();
  const all = await db.kanjiStats.toArray();
  return all
    .filter((r) => r.wrongCount > 0 && r.correctSinceWrong < WEAK_REDEEM_CORRECT_STREAK)
    .sort(
      (a, b) =>
        b.wrongCount - a.wrongCount ||
        new Date(b.lastWrongAt || 0) - new Date(a.lastWrongAt || 0)
    );
}

// ---- Utilitas ----

/**
 * Hapus seluruh progress satu level — dipakai tombol "Reset progress"
 * di UnitSelect (mis. membersihkan jejak setelah coba-coba level di atas
 * kemampuan). Tiga store dibersihkan dalam SATU transaksi supaya atomik:
 *   - unitProgress : state SRS semua unit level ini (jadwal & mastery hilang)
 *   - quizAttempts : log kuis unit-unit level ini (kontribusi streak-nya
 *                    ikut hilang — streak dihitung ulang pemanggil)
 *   - kanjiStats   : statistik per-kanji level ini (pill "✕ N" & weak review)
 * Log kuis weak review (unitId "weak-review") tidak memuat info level,
 * jadi tidak bisa dihapus selektif — hanya menyisakan jejak tanggal
 * aktivitas, bukan jadwal. Level lain tidak tersentuh.
 */
async function deleteLevelProgress(jlptLevel) {
  const db = getDB();
  await db.transaction("rw", db.unitProgress, db.quizAttempts, db.kanjiStats, async () => {
    // Kumpulkan unitId level ini dulu — dipakai menghapus log kuisnya.
    const units = await db.unitProgress.where("jlptLevel").equals(jlptLevel).toArray();
    const unitIds = units.map((u) => u.unitId);
    await db.unitProgress.bulkDelete(unitIds);
    if (unitIds.length > 0) {
      await db.quizAttempts.where("unitId").anyOf(unitIds).delete();
    }
    await db.kanjiStats.where("level").equals(jlptLevel).delete();
  });
}

/** Hapus semua data progress & histori (fitur reset / testing). */
async function clearAllData() {
  const db = getDB();
  await db.unitProgress.clear();
  await db.quizAttempts.clear();
  await db.kanjiStats.clear();
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
  updateKanjiStats,
  getKanjiStats,
  getWeakKanji,
  deleteLevelProgress,
  clearAllData,
  WEAK_REDEEM_CORRECT_STREAK,
};
