/**
 * srs.js — mesin spaced repetition berbasis kurva lupa (forgetting curve).
 *
 * Model: retention(t) = target_retention ^ (t / stability)
 *
 * "stability" = jumlah hari sampai retensi diperkirakan turun tepat ke
 * target (default 85%) — jadi nilainya langsung terbaca sebagai "interval
 * review berikutnya dalam hari". Tiap kuis selesai, stability diperbarui
 * dari skor (0-1) dan seberapa meluruh retensi sejak review terakhir;
 * nextReviewAt = lastReviewedAt + stability.
 *
 * Modul murni: tidak menyentuh storage/tanggal sistem/UI — mudah dites.
 */

// ---- Konstanta yang bisa disetel ----

// Target retensi 0.85: kurva dirancang supaya di hari ke-N (N = stability)
// retensi diperkirakan sudah turun ke 85% — itulah ambang review.
const DEFAULT_TARGET_RETENTION = 0.85;

// Stability awal (hari) berdasarkan skor kuis pertama unit.
const INITIAL_STABILITY_TABLE = [
  { minScore: 0.9, stability: 3 },
  { minScore: 0.7, stability: 2 },
  { minScore: 0.5, stability: 1 },
  { minScore: 0, stability: 0.5 },
];

// Batas bawah & atas stability: tidak pernah 0 (macet) / meledak.
const MIN_STABILITY = 0.5; // hari
const MAX_STABILITY = 365; // hari

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ---- Util internal ----

function daysBetween(fromDate, toDate) {
  return Math.max(0, (toDate.getTime() - fromDate.getTime()) / MS_PER_DAY);
}

function clampStability(value) {
  return Math.min(MAX_STABILITY, Math.max(MIN_STABILITY, value));
}

function lookupInitialStability(score) {
  const row = INITIAL_STABILITY_TABLE.find((r) => score >= r.minScore);
  return row.stability;
}

/**
 * Interval (hari) sampai review berikutnya. Dengan definisi stability di
 * modul ini, interval = stability itu sendiri.
 */
function intervalForTargetRetention(stability, _targetRetention) {
  return stability;
}

// ---- API utama ----

/** State awal untuk unit yang belum pernah dipelajari. */
function createInitialUnitState() {
  return {
    stability: null, // null = belum ada riwayat
    lastReviewedAt: null,
    nextReviewAt: null,
    reviewCount: 0,
    lastScore: null,
  };
}

/**
 * Retensi unit saat ini (0-1) menurut state & tanggal sekarang — untuk
 * ditampilkan di dashboard.
 */
function currentRetention(state, now = new Date(), targetRetention = DEFAULT_TARGET_RETENTION) {
  if (!state.stability || !state.lastReviewedAt) return null; // belum dipelajari
  const t = daysBetween(new Date(state.lastReviewedAt), now);
  // retention(t) = target ^ (t / stability)
  return Math.pow(targetRetention, t / state.stability);
}

/**
 * Proses hasil kuis satu unit → state SRS baru.
 *
 * @param {object} state - state unit saat ini (createInitialUnitState / hasil reviewUnit sebelumnya)
 * @param {number} score - proporsi benar 0..1; "tidak tahu" dihitung salah
 * @param {Date} reviewDate - tanggal kuis dikerjakan
 * @param {number} targetRetention - target retensi jadwal berikutnya
 */
function reviewUnit(state, score, reviewDate = new Date(), targetRetention = DEFAULT_TARGET_RETENTION) {
  if (score < 0 || score > 1) {
    throw new Error("score harus di antara 0 dan 1");
  }

  let newStability;

  if (state.stability === null) {
    // Pertama kali unit ini dipelajari
    newStability = lookupInitialStability(score);
  } else {
    // Unit sudah pernah dipelajari — sesuaikan stability
    const elapsedDays = daysBetween(new Date(state.lastReviewedAt), reviewDate);
    const predictedRetention = Math.pow(targetRetention, elapsedDays / state.stability);

    // Growth factor: makin bagus skor makin panjang interval berikutnya.
    // Review telat dari jadwal (retensi sudah di bawah target) tapi skor
    // tetap bagus → sinyal kuat melekat, diberi bonus ekstra. Skor buruk
    // → stability dipangkas ("lapse").
    let growthFactor;
    if (score >= 0.9) {
      growthFactor = 2.2 + Math.max(0, targetRetention - predictedRetention) * 3;
    } else if (score >= 0.7) {
      growthFactor = 1.6 + Math.max(0, targetRetention - predictedRetention) * 1.5;
    } else if (score >= 0.5) {
      growthFactor = 1.1; // performa pas-pasan, sedikit naik
    } else {
      growthFactor = 0.5; // lapse: reset sebagian besar stability
    }

    // ── Dampening review terlalu dini ──
    // Mengulang unit berkali-kali dalam waktu singkat tidak boleh bisa
    // "mengular sampai master": review JAUH sebelum jadwal hampir pasti
    // benar hanya karena baru dilihat, jadi bonus pertumbuhan diskalakan
    // turun proporsional kecepatannya. Review tepat waktu (elapsed >= 50%
    // interval) dapat bonus penuh; review seketika hampir tidak menambah.
    // Penalti (growthFactor <= 1) tidak didampen — skor buruk harus selalu
    // menurunkan stability kapan pun dilakukan.
    if (growthFactor > 1) {
      const readiness = Math.min(1, elapsedDays / (state.stability * 0.5));
      growthFactor = 1 + (growthFactor - 1) * readiness;
    }

    newStability = state.stability * growthFactor;
  }

  newStability = clampStability(newStability);
  const interval = intervalForTargetRetention(newStability, targetRetention);
  const nextReviewAt = new Date(reviewDate.getTime() + interval * MS_PER_DAY);

  return {
    stability: newStability,
    lastReviewedAt: reviewDate.toISOString(),
    nextReviewAt: nextReviewAt.toISOString(),
    reviewCount: state.reviewCount + 1,
    lastScore: score,
  };
}

/**
 * Filter daftar unit (dengan state SRS-nya) menjadi yang "due" sekarang.
 */
function getDueUnits(unitsWithState, now = new Date()) {
  return unitsWithState.filter(({ state }) => {
    if (!state.nextReviewAt) return false; // belum dimulai → bukan "due"
    return new Date(state.nextReviewAt) <= now;
  });
}

/** Unit yang belum pernah dipelajari sama sekali. */
function getNotStartedUnits(unitsWithState) {
  return unitsWithState.filter(({ state }) => state.stability === null);
}

/**
 * Apakah unit ini dikuis sebelum jadwalnya (< 50% interval)? Dipakai layar
 * Result menjelaskan kenapa interval berikutnya tidak memanjang penuh.
 */
function wasReviewedEarly(state, now = new Date()) {
  if (!state || !state.stability || !state.lastReviewedAt) return false;
  const elapsedDays = daysBetween(new Date(state.lastReviewedAt), now);
  return elapsedDays < state.stability * 0.5;
}

export {
  createInitialUnitState,
  reviewUnit,
  currentRetention,
  getDueUnits,
  getNotStartedUnits,
  wasReviewedEarly,
  intervalForTargetRetention,
  DEFAULT_TARGET_RETENTION,
};
