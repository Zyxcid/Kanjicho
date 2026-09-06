/**
 * srs_oracle.mjs — SALINAN BEKU engine FSRS-6 manual (pra-swap ts-fsrs).
 * Peran: ORACLE differential test (scripts/differential_tsfsrs.mjs) —
 * pembuktian bahwa core matematis facade ts-fsrs identik & jadwal tidak
 * melompat saat migrasi. JANGAN dipakai oleh app (src/) — app memakai
 * src/lib/srs.js (facade ts-fsrs). File ini tidak diubah lagi.
 */

/**
 * srs.js — penjadwalan spaced repetition dengan algoritma FSRS-6
 * (Free Spaced Repetition Scheduler), diterapkan pada tingkat UNIT
 * pembelajaran: satu unit diperlakukan sebagai SATU item memori (15 kanji
 * dijadwalkan bersama; hasil kuis = bukti kondisi memorinya).
 *
 * Sumber persamaan & 21 parameter default FSRS-6:
 *   - Ye, J. (2022). A Stochastic Shortest Path Algorithm for Optimizing
 *     Spaced Repetition Scheduling. KDD '22. (akar FSRS)
 *   - Open Spaced Repetition. (2025). The Algorithm, wiki awesome-fsrs.
 *     https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
 *   - CORE MATEMATIS diverifikasi silang rumus-per-rumus terhadap
 *     implementasi resmi ts-fsrs (packages/fsrs/src/algorithm.ts &
 *     constant.ts): bobot default, kurva lupa terlatih, update D
 *     linear-damping, aturan review hari-yang-sama, dan cap post-lapse
 *     S/e^(w17·w18). Yang terverifikasi adalah intinya — engine ini BUKAN
 *     port ts-fsrs end-to-end: penilaian skor kuis (adapter) dan batas
 *     interval jadwal adalah komponen Kanjichō (lihat di bawah).
 *
 * Memori unit = dua variabel:
 *   - Stability S : hari sampai retensi prediksi turun ke 90%. Di FSRS-6
 *     bentuk kurva lupa DILATIH dari data (bukan lagi konstanta FSRS-4.5):
 *     R(t,S) = (1 + FACTOR·t/S)^DECAY dengan DECAY = −w20 dan
 *     FACTOR = 0.9^(1/DECAY) − 1, dipilih supaya R(S,S) = 0.9 tetap
 *     terjaga — interval jadwal pada target 90% nilainya tetap persis S.
 *   - Difficulty D : 1-10; update FSRS-5/6 memakai linear damping
 *     (perubahan D menyusut saat D mendekati batas) + mean reversion.
 *
 * Dua adaptasi Kanjichō (bagian yang BUKAN FSRS murni — keputusan desain,
 * didokumentasikan supaya batas kontribusi jelas):
 *   1. Adapter rating. FSRS menerima tombol manual Again/Hard/Good/Easy;
 *      Kanjichō memetakan SKOR KUIS (proporsi benar) → rating. Adapter
 *      default "binomial" menilai skor relatif terhadap ekspektasi retensi
 *      model saat kuis dikerjakan (lihat gradeQuizScore) — kuis 15 soal
 *      diperlakukan sebagai 15 percobaan Bernoulli atas memor unit.
 *   2. Review di hari yang sama (kalender lokal) memakai aturan
 *      short-term FSRS-6: S' = S·e^(w17·(G−3+w18))·S^−w19 dengan
 *      SInc ≥ 1 untuk G ≥ 2 — menggantikan heuristik dampening buatan.
 *      Unit terjadwal tidak bisa masuk kuis SRS lagi hari itu (mode kuis
 *      diderivasi dari status unit di App.jsx — hanya "new"/"due" yang
 *      menulis SRS), sehingga aturan ini hanya hidup untuk unit yang
 *      memang due lagi di hari yang sama (unit lemah pasca-Again).
 *
 * Modul murni: tidak menyentuh storage/tanggal sistem/UI — mudah dites.
 */

// ---- Konstanta yang bisa disetel ----

// Target retensi 0.9 (standar FSRS): unit dijadwalkan ulang saat retensi
// prediksi diperkirakan turun ke 90%. Pada kurva FSRS-6, interval di
// target ini nilainya sama dengan S.
const DEFAULT_TARGET_RETENTION = 0.9;

// Parameter default FSRS-6 (21 bobot, hasil optimisasi dataset review
// berskala besar — dipakai tanpa optimisasi per pengguna):
const FSRS6_WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, // w0-w3  : S0(Again/Hard/Good/Easy)
  6.4133, 0.8334, // w4-w5 : D0(G) = w4 − e^(w5·(G−1)) + 1
  3.0194, 0.001, // w6-w7 : delta difficulty (linear damping) & mean reversion
  1.8722, 0.1666, 0.796, // w8-w10: stabilitas setelah recall sukses
  1.4835, 0.0614, 0.2629, 1.6483, // w11-w14: stabilitas setelah lapse
  0.6014, 1.8729, // w15-w16: hard penalty & easy bonus
  0.5425, 0.0912, 0.0658, // w17-w19: stabilitas review hari-yang-sama
  0.1542, // w20: decay kurva lupa (DECAY = −w20, dilatih dari data)
];

// Bentuk kurva lupa FSRS-6: DECAY dilatih (−0.1542 — lebih landai dari
// −0.5 FSRS-4.5), FACTOR diturunkan agar R(S,S) = 0.9 tetap exact.
const DECAY = -FSRS6_WEIGHTS[20];
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

// Floor numerik stability: tidak pernah 0 (pembagian nol / state macet).
// Nilai 0.2 sedikit di bawah S0(Again)=0.212 supaya rating terendah tidak
// terpotong. S TIDAK dibatasi ke atas — stability adalah KONDISI MEMORI,
// bukan kebijakan penjadwalan (lihat MAX_INTERVAL di bawah).
const MIN_STABILITY = 0.2; // hari

// Batas atas INTERVAL JADWAL — keputusan produk Kanjichō, bukan bagian
// spesifikasi FSRS: unit yang sangat kuat tetap dikunjung maksimal setahun
// sekali supaya kalender review tetap hidup. S boleh melewati 365 — saat
// itu retensi prediksi saat due berada di atas target dan rumus update
// FSRS tetap bekerja normal (pertumbuhan menyusut otomatis karena R≈1).
// (Semantik ini mengikuti parameter maximum_interval pada ts-fsrs.)
const MAX_INTERVAL = 365; // hari

const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Jumlah soal standar dalam kuis satu unit (kanji per unit) — dipakai
// adapter rating sebagai ukuran sampel binomial.
const DEFAULT_QUIZ_LENGTH = 15;

// ---- Rating FSRS (1-4) ----

const RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

/**
 * Mode adapter skor → rating (KEPUTUSAN DESAIN Kanjichō, bukan bagian
 * spesifikasi FSRS — variabel eksperimen utama skripsi). Empat kondisi:
 *
 *   "binomial" (default) — skor dinilai RELATIF terhadap ekspektasi
 *     retensi model R saat kuis dikerjakan: μ = n·R, σ = √(n·R·(1−R)),
 *     z = (skorBenar − μ)/σ. Rating = seberapa "mengejutkan" hasilnya.
 *     Bookend absolut hanya dua: skor sempurna → Easy (satu-satunya bukti
 *     maksimal instrumen kuis) dan skor katastrofik ≤30% → Again (jaring
 *     pengaman state degenerate; nyaris tak tersentuh pada operasi normal
 *     karena jalur z sudah menghasilkan Again lebih dulu). Floor absolut
 *     60% pada versi awal DIHAPUS: 9/15 setelah lama tak direview (R≈0.3)
 *     adalah bukti pemangkalan yang LUAR BIASA, bukan lapse — dinilai
 *     sesuai ekspektasi (Good), bukan dipaksa Again oleh persentase mentah.
 *
 *   "continuous" — grade KONTINU 1..4 dari z (g = 3 + z/3, dijepit ke
 *     [1,4] lalu dibulatkan ke rating FSRS terdekat): respons halus tanpa
 *     tepian pita. Sekitar: Again z < −4.5, Hard z < −1.5, Easy z ≥ +1.5.
 *
 *   "absolute" — lookup tetap berbasis skor, di-jangkar ke ekspektasi
 *     scheduler sehat (target R=0.9 → rata-rata skor 13.5/15):
 *     ≤60% Again, ≤80% Hard, <100% Good, 100% Easy.
 *
 *   "naive" — tabel ambang persentase mentah (0.5/0.7/0.9) — dipertahankan
 *     sebagai BASELINE pembanding eksperimen: di bawah scheduler yang
 *     terkalibrasi, ~55% review jatuh di bin Easy dan bin Again (<50%)
 *     praktis tidak pernah menyala sebelum retensi benar-benar runtuh.
 */
const SCORE_RATING_ADAPTER = "binomial";

/**
 * Skor kuis (0-1, proporsi benar) → rating FSRS.
 *
 * Kuis PERTAMA (retrievability null) selalu memakai jangkar absolut —
 * belum ada ekspektasi model yang bisa dibandingkan. Pada mode relatif
 * (binomial/continuous), dua bookend absolut tetap: skor sempurna → Easy,
 * skor katastrofik (≤30%) → Again.
 *
 * @param {number} score - proporsi jawaban benar 0..1
 * @param {number|null} retrievability - retensi prediksi R saat kuis
 *   dikerjakan (dari kurva lupa & selisih waktu); null = kuis pertama /
 *   tanpa state → pakai jangkar absolut.
 * @param {number} questionCount - jumlah soal kuis (n percobaan Bernoulli)
 * @param {string} adapter - mode adapter (default SCORE_RATING_ADAPTER);
 *   parameter ini kondisi eksperimen, bukan kebutuhan UI.
 */
function gradeQuizScore(
  score,
  retrievability = null,
  questionCount = DEFAULT_QUIZ_LENGTH,
  adapter = SCORE_RATING_ADAPTER
) {
  const n = Math.max(1, questionCount);
  const correct = Math.round(score * n);

  if (adapter === "naive") {
    if (score < 0.5) return RATING.AGAIN;
    if (score < 0.7) return RATING.HARD;
    if (score < 0.9) return RATING.GOOD;
    return RATING.EASY;
  }

  if (adapter === "absolute" || retrievability === null || retrievability === undefined) {
    // Jangkar absolut: ≤60% = unit gagal; ≤80% = lolos tapi lemah;
    // <100% = good; 100% = easy (satu-satunya bukti maksimal instrumen ini).
    if (correct <= Math.floor(0.6 * n)) return RATING.AGAIN;
    if (correct <= Math.floor(0.8 * n)) return RATING.HARD;
    if (correct < n) return RATING.GOOD;
    return RATING.EASY;
  }

  // Bookend bersama untuk mode relatif: bukti maksimal instrumen vs
  // kegagalan total (jaring pengaman — pada operasi normal jalur z sudah
  // lebih dulu menghasilkan Again sebelum batas 30% ini tersentuh).
  if (correct >= n) return RATING.EASY;
  if (correct <= Math.floor(0.3 * n)) return RATING.AGAIN;

  // Kejutan statistik vs prediksi model (z-score binomial).
  const mu = n * retrievability;
  // σ berfloor 0.5: saat R≈1 (review dini / hari yang sama) σ binomial
  // mengecil ke 0 dan z meledak — floor menjaga penilaian tetap waras.
  const sigma = Math.max(Math.sqrt(n * retrievability * (1 - retrievability)), 0.5);
  const z = (correct - mu) / sigma;

  if (adapter === "continuous") {
    // Grade kontinu 1..4 (halus, tanpa tepian pita) → rating FSRS.
    const grade = Math.min(RATING.EASY, Math.max(RATING.AGAIN, 3 + z / 3));
    return Math.round(grade);
  }

  // --- Adapter binomial (default): pita z diskret ---
  if (z <= -2 && correct <= Math.floor(0.8 * n)) return RATING.AGAIN; // jauh di bawah ekspektasi
  if (z >= 2.5 && correct >= Math.ceil((13 / 15) * n)) return RATING.EASY; // jauh di atas ekspektasi
  if (z < -0.5) return RATING.HARD;
  return RATING.GOOD;
}

/** Wrapper kompatibilitas: penilaian tanpa ekspektasi (kuis pertama). */
function ratingFromScore(score, questionCount = DEFAULT_QUIZ_LENGTH) {
  return gradeQuizScore(score, null, questionCount);
}

/**
 * resolveRating — adapter bisa NAMA mode ("binomial" dst.) atau FUNGSI
 * (score, retrievability, questionCount) => rating 1-4. Dukungan fungsi
 * dipakai eksperimen adapter (scripts/experiment_adapters.mjs) supaya
 * kondisi uji bisa dibangun di luar modul tanpa menyentuh core FSRS-6.
 */
function resolveRating(score, retrievability, questionCount, adapter) {
  if (typeof adapter === "function") {
    return adapter(score, retrievability, questionCount);
  }
  return gradeQuizScore(score, retrievability, questionCount, adapter);
}

// ---- Util internal ----

function daysBetween(fromDate, toDate) {
  return Math.max(0, (toDate.getTime() - fromDate.getTime()) / MS_PER_DAY);
}

/** Apakah dua waktu jatuh di hari kalender LOKAL yang sama? */
function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function clampStability(value) {
  // Hanya floor numerik — S (kondisi memori) tidak dibatasi ke atas.
  return Math.max(MIN_STABILITY, value);
}

/** Batas kebijakan scheduler: interval jadwal maksimum MAX_INTERVAL hari. */
function clampInterval(days) {
  return Math.min(MAX_INTERVAL, days);
}

function clampDifficulty(value) {
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, value));
}

// ---- Kurva lupa & jadwal ----

/** Retensi prediksi R(t,S) setelah t hari sejak review terakhir. */
function forgettingCurve(elapsedDays, stability) {
  return Math.pow(1 + FACTOR * (elapsedDays / stability), DECAY);
}

/**
 * Interval (hari) sampai retensi prediksi turun ke `targetRetention`.
 * Di target 0.9 nilainya persis S (definisi stability FSRS).
 */
function intervalForTargetRetention(stability, targetRetention) {
  return (stability / FACTOR) * (Math.pow(targetRetention, 1 / DECAY) - 1);
}

// ---- API utama ----

/** State awal untuk unit yang belum pernah dipelajari. */
function createInitialUnitState() {
  return {
    stability: null, // S (hari) — null = belum ada riwayat
    difficulty: null, // D (1-10)
    lastReviewedAt: null,
    nextReviewAt: null,
    reviewCount: 0,
    lapses: 0, // jumlah review dengan rating Again setelah unit aktif
    lastScore: null,
    lastRating: null, // rating hasil adapter — bekal optimisasi per-user
    algorithm: "fsrs6", // penanda state versi algoritma (migrasi)
  };
}

/**
 * Migrasi state ke FSRS-6:
 *   - fsrs45 → fsrs6 : definisi S (hari pada R=90%) dan D (skala 1-10)
 *     sama antar versi, jadi S, D, dan jadwal yang sedang berjalan
 *     DIPERTAHANKAN — hanya kurva lupa & rumus update yang berubah
 *     (interval di target 0.9 tetap = S, tidak ada lompatan jadwal).
 *   - model pra-FSRS (tanpa difficulty/algorithm) : S lama dipakai apa
 *     adanya sebagai JANGKAR KONTINUITAS produk — jadwal yang sedang
 *     berjalan tidak melompat saat migrasi. Ini bukan konversi matematis
 *     exact: S lama mengukur interval pada retensi 85% (kurva lama), S
 *     FSRS mengukur interval pada retensi 90%, sehingga jadwal hasil
 *     migrasi sedikit lebih longgar dari target — kalibrasi menyesuaikan
 *     diri lewat review-review berikutnya. D di-infer dari skor terakhir
 *     lewat jangkar absolut adapter.
 */
function migrateUnitState(state) {
  if (!state || state.stability === null) {
    return state || createInitialUnitState();
  }
  if (state.algorithm === "fsrs6") {
    return state;
  }
  return {
    ...state,
    stability: clampStability(state.stability),
    difficulty: clampDifficulty(
      state.difficulty ?? initialDifficulty(ratingFromScore(state.lastScore ?? 0))
    ),
    lapses: state.lapses ?? 0,
    algorithm: "fsrs6",
  };
}

/** S awal setelah kuis pertama unit (tabel w0-w3 per rating). */
function initialStability(rating) {
  return Math.max(FSRS6_WEIGHTS[rating - 1], 0.1);
}

/** D0(G) = w4 − e^(w5·(G−1)) + 1 (formula eksponensial FSRS-5/6). */
function rawInitialDifficulty(rating) {
  return FSRS6_WEIGHTS[4] - Math.exp(FSRS6_WEIGHTS[5] * (rating - 1)) + 1;
}

function initialDifficulty(rating) {
  return clampDifficulty(rawInitialDifficulty(rating));
}

/**
 * D baru setelah review (FSRS-5/6): pergeseran −w6·(G−3) dengan LINEAR
 * DAMPING (perubahan menyusut saat D mendekati 10: ΔD·(10−D)/9), lalu
 * mean-reversion ke D0(Easy) — memakai nilai TANPA clamp persis seperti
 * ts-fsrs. Dijepit [1,10].
 */
function nextDifficulty(d, rating) {
  const deltaD = -FSRS6_WEIGHTS[6] * (rating - 3);
  const nextD = d + (deltaD * (10 - d)) / 9;
  return clampDifficulty(
    FSRS6_WEIGHTS[7] * rawInitialDifficulty(RATING.EASY) +
      (1 - FSRS6_WEIGHTS[7]) * nextD
  );
}

/**
 * S setelah recall sukses (Hard/Good/Easy):
 *   S' = S·(1 + e^w8 · (11-D) · S^-w9 · (e^(w10·(1-R)) - 1) · hardPenalty · easyBonus)
 * Properti berguna: review saat retensi masih ~1 membuat suku pertumbuhan
 * ~0 → ulang dini nyaris tidak menambah S (anti-grinding bawaan FSRS).
 */
function successStability(d, s, retrievability, rating) {
  const hardPenalty = rating === RATING.HARD ? FSRS6_WEIGHTS[15] : 1;
  const easyBonus = rating === RATING.EASY ? FSRS6_WEIGHTS[16] : 1;
  const growth =
    Math.exp(FSRS6_WEIGHTS[8]) *
    (11 - d) *
    Math.pow(s, -FSRS6_WEIGHTS[9]) *
    (Math.exp(FSRS6_WEIGHTS[10] * (1 - retrievability)) - 1) *
    hardPenalty *
    easyBonus;
  return clampStability(s * (1 + growth));
}

/**
 * S setelah lapse (rating Again), review lintas hari:
 *   PLS = w11 · D^-w12 · ((S+1)^w13 - 1) · e^(w14·(1-R))
 * Cap ts-fsrs (enable_short_term): S' tidak boleh melebihi S/e^(w17·w18)
 * — lapse selalu memangkas stabilitas secara berarti.
 */
function lapseStability(d, s, retrievability) {
  const pls =
    FSRS6_WEIGHTS[11] *
    Math.pow(d, -FSRS6_WEIGHTS[12]) *
    (Math.pow(s + 1, FSRS6_WEIGHTS[13]) - 1) *
    Math.exp(FSRS6_WEIGHTS[14] * (1 - retrievability));
  const cap = s / Math.exp(FSRS6_WEIGHTS[17] * FSRS6_WEIGHTS[18]);
  return clampStability(Math.min(pls, cap));
}

/**
 * S setelah review di HARI YANG SAMA (aturan short-term FSRS-6):
 *   SInc = e^(w17·(G−3+w18)) · S^-w19
 *   S'   = S · SInc, dengan SInc dijamin ≥ 1 untuk G ≥ 2 (Hard/Good/Easy
 *   tidak pernah memangkas S); Again boleh menurunkan. Suku S^-w19 membuat
 *   pertumbuhan same-day menyusut saat S besar (konvergen) — menggantikan
 *   heuristik dampening model lama.
 */
function shortTermStability(s, rating) {
  const sinc =
    Math.exp(FSRS6_WEIGHTS[17] * (rating - 3 + FSRS6_WEIGHTS[18])) *
    Math.pow(s, -FSRS6_WEIGHTS[19]);
  const bounded = rating >= RATING.HARD ? Math.max(sinc, 1) : sinc;
  return clampStability(s * bounded);
}

/**
 * Retensi unit saat ini (0-1) menurut state & tanggal sekarang.
 */
function currentRetention(state, now = new Date()) {
  if (!state.stability || !state.lastReviewedAt) return null; // belum dipelajari
  const t = daysBetween(new Date(state.lastReviewedAt), now);
  return forgettingCurve(t, state.stability);
}

/**
 * Proses hasil kuis satu unit → state SRS baru (FSRS-6).
 *
 * Urutan update mengikuti implementasi resmi FSRS: stabilitas dihitung
 * memakai D LAMA, lalu D diperbarui.
 *
 * @param {object} state - state unit saat ini (createInitialUnitState / hasil reviewUnit sebelumnya)
 * @param {number} score - proporsi benar 0..1; "tidak tahu" dihitung salah
 * @param {Date} reviewDate - tanggal kuis dikerjakan
 * @param {number} questionCount - jumlah soal kuis (default 15)
 * @param {number} targetRetention - target retensi jadwal berikutnya
 * @param {string|function} adapter - mode adapter (nama, default
 *   SCORE_RATING_ADAPTER) ATAU fungsi (score, retrievability,
 *   questionCount) => rating 1-4 — untuk ablation/eksperimen skripsi
 *   tanpa menyentuh core FSRS-6.
 */
function reviewUnit(
  state,
  score,
  reviewDate = new Date(),
  questionCount = DEFAULT_QUIZ_LENGTH,
  targetRetention = DEFAULT_TARGET_RETENTION,
  adapter = SCORE_RATING_ADAPTER
) {
  if (score < 0 || score > 1) {
    throw new Error("score harus di antara 0 dan 1");
  }
  // State model lama (tanpa penanda fsrs6) tetap aman diproses: S dipakai
  // apa adanya, D di-infer dari skor terakhir — lihat migrateUnitState.
  const prevS = state.stability;
  const prevD =
    state.difficulty ?? initialDifficulty(ratingFromScore(state.lastScore ?? score, questionCount));

  let newS;
  let newD;
  let rating;

  if (prevS === null) {
    // Pertama kali unit ini dipelajari: S0(G) & D0(G) langsung dari rating.
    rating = resolveRating(score, null, questionCount, adapter);
    newS = initialStability(rating);
    newD = initialDifficulty(rating);
  } else {
    // Unit sudah aktif: hitung dulu retensi saat kuis dikerjakan (bukti
    // waktu masuk lewat R di rumus update — adapter hanya membawa sinyal
    // "kejutan"), lalu perbarui S (pakai D lama) dan D.
    const last = new Date(state.lastReviewedAt);
    const elapsedDays = daysBetween(last, reviewDate);
    const retrievability = forgettingCurve(elapsedDays, prevS);
    rating = resolveRating(score, retrievability, questionCount, adapter);

    if (isSameLocalDay(last, reviewDate)) {
      // Review di hari yang sama → aturan short-term FSRS-6.
      newS = shortTermStability(prevS, rating);
    } else if (rating === RATING.AGAIN) {
      newS = lapseStability(prevD, prevS, retrievability);
    } else {
      newS = successStability(prevD, prevS, retrievability, rating);
    }
    newD = nextDifficulty(prevD, rating);
  }

  newS = clampStability(newS);
  // Kebijakan scheduler (bukan state memori): interval dijepit ke
  // MAX_INTERVAL — S boleh lebih besar, jadwal tidak.
  const interval = clampInterval(intervalForTargetRetention(newS, targetRetention));
  const nextReviewAt = new Date(reviewDate.getTime() + interval * MS_PER_DAY);

  return {
    stability: newS,
    difficulty: newD,
    lastReviewedAt: reviewDate.toISOString(),
    nextReviewAt: nextReviewAt.toISOString(),
    reviewCount: state.reviewCount + 1,
    lapses: (state.lapses || 0) + (prevS !== null && rating === RATING.AGAIN ? 1 : 0),
    lastScore: score,
    lastRating: rating,
    algorithm: "fsrs6",
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
 * Apakah unit ini dikuis sebelum jadwalnya (< 50% interval)? FSRS-6
 * menangani review dini secara alami (pertumbuhan S nyaris nol saat R
 * masih ~1; review same-day memakai aturan short-term), tapi layar Result
 * tetap memakai ini untuk MENJELASKAN kenapa interval tidak memanjang
 * penuh.
 */
function wasReviewedEarly(state, now = new Date()) {
  if (!state || !state.stability || !state.lastReviewedAt) return false;
  const elapsedDays = daysBetween(new Date(state.lastReviewedAt), now);
  return elapsedDays < state.stability * 0.5;
}

export {
  createInitialUnitState,
  migrateUnitState,
  reviewUnit,
  currentRetention,
  gradeQuizScore,
  ratingFromScore,
  forgettingCurve,
  intervalForTargetRetention,
  getDueUnits,
  getNotStartedUnits,
  wasReviewedEarly,
  shortTermStability,
  nextDifficulty,
  DEFAULT_TARGET_RETENTION,
  DEFAULT_QUIZ_LENGTH,
  SCORE_RATING_ADAPTER,
  MAX_INTERVAL,
  RATING,
  FSRS6_WEIGHTS,
};
