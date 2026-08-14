/**
 * srs.js — Spaced Repetition Engine (decay-based / forgetting-curve model)
 *
 * Model dasar:
 *   retention(t) = target_retention ^ (t / stability)
 *
 * "stability" adalah JUMLAH HARI sampai retensi diperkirakan turun tepat
 * ke target_retention — jadi bisa langsung dibaca sebagai "interval
 * review berikutnya, dalam hari". Ini beda dari model exponential murni
 * (e^(-t/stability)) yang membuat stability tidak bisa dibaca langsung
 * sebagai interval (butuh dikonversi lagi, dan hasilnya jadi jauh lebih
 * pendek dari yang diharapkan).
 *
 * Setiap kali user menyelesaikan kuis untuk suatu unit, stability
 * diperbarui berdasarkan skor (persentase benar) dan seberapa besar
 * retensi sudah meluruh sejak review terakhir (apakah user review lebih
 * awal/telat dari jadwal). next_review_at = lastReviewedAt + stability hari.
 *
 * Modul ini murni (pure functions): tidak menyentuh storage, tanggal
 * sistem, atau UI. Semua fungsi menerima state + input, mengembalikan
 * state baru. Ini membuatnya mudah dites dan dipindah ke lingkungan lain.
 */

// ---- Konstanta yang bisa disetel ----

// Target retensi: level "masih ingat" yang dianggap ambang batas review.
// 0.85 artinya: kurva dirancang supaya di hari ke-N (N = stability),
// retensi diperkirakan sudah turun ke 85%.
const DEFAULT_TARGET_RETENTION = 0.85;

// Stability awal (hari) berdasarkan skor pertama kali unit dipelajari.
// Nilai ini langsung berarti "review lagi setelah sekian hari".
const INITIAL_STABILITY_TABLE = [
  { minScore: 0.9, stability: 3 },
  { minScore: 0.7, stability: 2 },
  { minScore: 0.5, stability: 1 },
  { minScore: 0, stability: 0.5 },
];

// Batas bawah & atas stability supaya tidak pernah 0 (macet) atau
// meledak tak terkendali.
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
 * Interval (hari) sampai review berikutnya. Dengan definisi stability yang
 * dipakai di modul ini, interval = stability itu sendiri (by design: lihat
 * penjelasan formula retention di atas file).
 */
function intervalForTargetRetention(stability, _targetRetention) {
  return stability;
}

// ---- API utama ----

/**
 * State awal untuk unit yang belum pernah dipelajari.
 */
function createInitialUnitState() {
  return {
    stability: null, // belum ada riwayat
    lastReviewedAt: null,
    nextReviewAt: null,
    reviewCount: 0,
    lastScore: null,
  };
}

/**
 * Hitung retensi unit saat ini (0-1), berdasarkan state & tanggal sekarang.
 * Berguna untuk ditampilkan di dashboard ("unit ini diperkirakan tersisa 62%").
 */
function currentRetention(state, now = new Date(), targetRetention = DEFAULT_TARGET_RETENTION) {
  if (!state.stability || !state.lastReviewedAt) return null; // belum pernah dipelajari
  const t = daysBetween(new Date(state.lastReviewedAt), now);
  // retention(t) = target ^ (t / stability)
  return Math.pow(targetRetention, t / state.stability);
}

/**
 * Proses hasil kuis untuk satu unit, kembalikan state baru.
 *
 * @param {object} state - state unit saat ini (dari createInitialUnitState atau hasil reviewUnit sebelumnya)
 * @param {number} score - persentase benar, 0 s/d 1 (mis. 0.8 = 80% benar). "Tidak tahu" dihitung salah.
 * @param {Date} reviewDate - tanggal kuis ini dikerjakan (default sekarang)
 * @param {number} targetRetention - target retensi untuk jadwal berikutnya (default 0.85)
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
    // Sudah pernah dipelajari sebelumnya — sesuaikan stability
    const elapsedDays = daysBetween(new Date(state.lastReviewedAt), reviewDate);
    const predictedRetention = Math.pow(targetRetention, elapsedDays / state.stability);

    // Growth factor: makin bagus skor, makin besar penguatan stability-nya
    // (interval berikutnya makin panjang). Kalau user review telat dari
    // jadwal (predictedRetention di bawah target) tapi skornya tetap
    // bagus, itu sinyal kuat unit ini sudah benar-benar melekat -> bonus
    // ekstra. Skor buruk -> stability dikurangi drastis ("lapse").
    let growthFactor;
    if (score >= 0.9) {
      growthFactor = 2.2 + Math.max(0, targetRetention - predictedRetention) * 3;
    } else if (score >= 0.7) {
      growthFactor = 1.6 + Math.max(0, targetRetention - predictedRetention) * 1.5;
    } else if (score >= 0.5) {
      growthFactor = 1.1; // sedikit naik, performa pas-pasan
    } else {
      // Lapse: skor jelek, reset sebagian besar stability
      growthFactor = 0.5;
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
 * Filter daftar unit (dengan state SRS-nya masing-masing) menjadi yang
 * "due" untuk direview saat ini.
 *
 * @param {Array<{unitId: string, state: object}>} unitsWithState
 * @param {Date} now
 */
function getDueUnits(unitsWithState, now = new Date()) {
  return unitsWithState.filter(({ state }) => {
    if (!state.nextReviewAt) return false; // belum pernah dipelajari -> bukan "due", tapi "belum dimulai"
    return new Date(state.nextReviewAt) <= now;
  });
}

/**
 * Unit yang belum pernah dipelajari sama sekali (state masih initial).
 */
function getNotStartedUnits(unitsWithState) {
  return unitsWithState.filter(({ state }) => state.stability === null);
}

export {
  createInitialUnitState,
  reviewUnit,
  currentRetention,
  getDueUnits,
  getNotStartedUnits,
  intervalForTargetRetention,
  DEFAULT_TARGET_RETENTION,
};
