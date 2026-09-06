/**
 * srs.js — FACADE penjadwalan spaced repetition Kanjichō di atas engine
 * resmi ts-fsrs (npm "ts-fsrs", versi DIPIN EXACT 5.4.2 = generasi FSRS-6,
 * 21 parameter, zero-dependency). Satu unit pembelajaran (15 kanji)
 * diperlakukan sebagai SATU item memori: hasil kuis unit = bukti kondisi
 * memorinya (arsitektur Unit-SRS — keputusan desain Kanjichō).
 *
 * PEMBAGIAN TANGGUNG JAWAB ( framing skripsi ):
 *   ENGINE FSRS-6 ........ implementasi resmi ts-fsrs 5.4.2, bobot default
 *                          FSRS-6 dipin eksplisit (lihat FSRS6_WEIGHTS) —
 *                          kurva lupa terlatih, update S/D, aturan
 *                          short-term, cap post-lapse.
 *   KANJICHŌ (novelty) ... (1) adapter skor kuis → rating (gradeQuizScore,
 *                          4 mode — variabel eksperimen utama skripsi);
 *                          (2) pemetaan state unit ↔ Card ts-fsrs;
 *                          (3) kebijakan scheduler: MAX_INTERVAL 365 hari,
 *                          learning_steps kosong + relearning 6 jam
 *                          (penjelasan di bawah).
 *
 * Bukti keseimbangan engine lama (manual) ↔ ts-fsrs: differential test
 * scripts/differential_tsfsrs.mjs membandingkan facade ini terhadap
 * scripts/srs_oracle.mjs (salinan beku engine manual) — core matematis
 * identik, jadwal migrasi tidak melompat.
 *
 * Kebijakan Kanjichō atas parameter engine (bukan bagian FSRS):
 *   - request_retention 0.9 (standar FSRS): interval jadwal pada target ini
 *     nilainya = S (definisi stability).
 *   - maximum_interval 365: unit sangat kuat tetap dikunjung maksimal setahun
 *     sekali supaya kalender review tetap hidup (cermin MAX_INTERVAL lama).
 *   - enable_fuzz false: jadwal deterministik (QA & eksperimen reproducible).
 *   - enable_short_term true: aturan review hari-yang-sama FSRS-6 aktif
 *     (SInc ≥ 1 untuk Hard/Good/Easy) + loop relearning.
 *   - learning_steps KOSONG: kuis unit Kanjichō = 15 soal, bukan flip
 *     kartu Anki — kuis pertama langsung lulus ke jadwal hari.
 *   - relearning_steps "6h": unit AKTIF yang lapse (rating Again lintas
 *     hari) masuk Relearning dan due lagi ±6 jam kemudian — loop remedial
 *     hari-yang-sama dengan ritme yang cocok untuk kuis unit (default
 *     "10m" ts-fsrs dirancang untuk flip kartu; 6 jam meneruskan ritme
 *     ±5 jam engine lama). Lulus kuis relearn (rating Good/Easy) →
 *     kembali ke jadwal hari normal.
 *
 * Semantik engine resmi yang diterima apa adanya (didokumentasikan karena
 * berbeda dari engine manual lama — lihat laporan differential test):
 *   - Interval jadwal = hari BULAT (Math.round), minimum 1 hari (bukan
 *     hari pecahan seperti engine lama; interval sub-hari kini hanya ada
 *     di loop relearning ber-jam).
 *   - Selisih waktu dihitung dalam HARI KALENDER UTC (dateDiffInDays),
 *     sedangkan engine lama memakai hari kalender LOKAL + selisih pecahan.
 *     Di zona waktu app (UTC+5..UTC+10) dengan jam belajar 07:00-22:00,
 *     tanggal UTC = tanggal lokal sehingga tidak ada perbedaan.
 *   - Catatan: modul ts-fsrs menambah beberapa method ke Date.prototype
 *     (scheduler/diff/format/dueFormat) saat import — efek samping library
 *     yang tidak dipakai kode Kanjichō dan tidak menimpa API bawaan.
 *
 * Modul facade tetap murni: tidak menyentuh storage/tanggal sistem/UI —
 * mudah dites. State unit (skema Dexie) bertambah 2 field opsional:
 *   - fsrsState    : State ts-fsrs (0 New / 1 Learning / 2 Review /
 *                    3 Relearning). State lama tanpa field ini (pra-swap)
 *                    dianggap Review — jangkar kontinuitas.
 *   - learningSteps: indeks langkah relearning (0 = belum dalam loop).
 */

import {
  FSRS,
  State,
  createEmptyCard,
  dateDiffInDays,
  generatorParameters,
} from "ts-fsrs";

// ---- Konstanta yang bisa disetel ----

// Target retensi 0.9 (standar FSRS): unit dijadwalkan ulang saat retensi
// prediksi diperkirakan turun ke 90%. Pada kurva FSRS-6, interval di
// target ini nilainya sama dengan S.
const DEFAULT_TARGET_RETENTION = 0.9;

// 21 bobot default FSRS-6 — DIPIN EKSPLISIT supaya (a) skripsi bisa
// menuliskan nilai persisnya, (b) upgrade library tidak bisa mengubah
// semantik scheduler secara diam-diam (versi package juga dipin exact
// "5.4.2" di package.json). Identik dengan default_w ts-fsrs 5.4.2 —
// diverifikasi saat load (lihat assertWeights di bawah).
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

// Batas atas INTERVAL JADWAL — kebijakan produk Kanjichō (parameter
// maximum_interval ts-fsrs), bukan kondisi memori: S boleh melewati 365;
// saat itu retensi prediksi saat due berada di atas target dan rumus
// update tetap bekerja normal (pertumbuhan menyusut otomatis karena R≈1).
const MAX_INTERVAL = 365; // hari

// Floor numerik stability state (bukan bagian engine ts-fsrs, yang memakai
// 1e-3): 0.2 sedikit di bawah S0(Again)=0.212 supaya rating terendah tidak
// terpotong — menjaga invariant engine lama (kontinuitas state & oracle).
const MIN_STABILITY = 0.2; // hari

const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Jumlah soal standar dalam kuis satu unit — dipakai adapter rating
// sebagai ukuran sampel binomial.
const DEFAULT_QUIZ_LENGTH = 15;

// ---- Rating FSRS (1-4) ----

const RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

// ---- Konstruksi engine (satu instans per target retensi) ----

const BASE_PARAMS = {
  w: FSRS6_WEIGHTS,
  request_retention: DEFAULT_TARGET_RETENTION,
  maximum_interval: MAX_INTERVAL,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: [], // keputusan Kanjichō — lihat header modul
  relearning_steps: ["6h"], // ritme remedial unit — lihat header modul
};

const engines = new Map();
function getEngine(targetRetention = DEFAULT_TARGET_RETENTION) {
  if (!engines.has(targetRetention)) {
    engines.set(
      targetRetention,
      new FSRS(
        generatorParameters(
          targetRetention === DEFAULT_TARGET_RETENTION
            ? BASE_PARAMS
            : { ...BASE_PARAMS, request_retention: targetRetention }
        )
      )
    );
  }
  return engines.get(targetRetention);
}
const ENGINE = getEngine(DEFAULT_TARGET_RETENTION);

// Guard bobot saat load: kalau library (atau clip internal ts-fsrs)
// mengubah bobot efektif, gagal keras — jangan biarkan scheduler diam-diam
// berubah semantik. (Lapis kedua setelah pin versi exact di package.json.)
(function assertWeights() {
  const effective = ENGINE.parameters.w;
  for (let i = 0; i < FSRS6_WEIGHTS.length; i++) {
    if (Math.abs(effective[i] - FSRS6_WEIGHTS[i]) > 1e-9) {
      throw new Error(
        `ts-fsrs mengubah bobot efektif w${i}: ${effective[i]} ≠ ${FSRS6_WEIGHTS[i]}`
      );
    }
  }
})();

// ---- Adapter rating (KEPUTUSAN DESAIN Kanjichō — TIDAK disentuh swap) ----

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
 *   dikerjakan (kepercayaan engine: kurva lupa & selisih hari kalender);
 *   null = kuis pertama / tanpa state → pakai jangkar absolut.
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

function clampStability(value) {
  // Floor numerik Kanjichō (0.2) — S (kondisi memori) tidak dibatasi ke
  // atas. Engine ts-fsrs memakai floor 1e-3 di dalamnya; floor yang lebih
  // ketat ini hanya menjaga invariant state engine lama (kontinuitas).
  return Math.max(MIN_STABILITY, value);
}

function clampDifficulty(value) {
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, value));
}

/** D0(G) = w4 − e^(w5·(G−1)) + 1 (formula eksponensial FSRS-5/6). */
function rawInitialDifficulty(rating) {
  return FSRS6_WEIGHTS[4] - Math.exp(FSRS6_WEIGHTS[5] * (rating - 1)) + 1;
}

function initialDifficulty(rating) {
  return clampDifficulty(rawInitialDifficulty(rating));
}

// ---- Pemetaan state unit ↔ Card ts-fsrs ----

/**
 * State unit (skema Dexie) → Card ts-fsrs.
 *
 * State pra-swap (tanpa fsrsState/learningSteps) dipetakan ke Review/0:
 * S/D definisinya identik (differential test membuktikan), jadwal
 * berjalan dipakai apa adanya — JANGKAR KONTINUITAS, bukan konversi
 * matematis exact untuk model pra-FSRS (S lama mengukur interval pada
 * retensi 85% — sedikit lebih longgar dari target 90% engine sekarang).
 */
function stateToCard(state, reviewDate, score) {
  if (state.stability === null || state.stability === undefined) {
    // Belum pernah dipelajari → kartu baru (State.New).
    return createEmptyCard(reviewDate);
  }
  return {
    due: state.nextReviewAt ? new Date(state.nextReviewAt) : reviewDate,
    stability: state.stability,
    difficulty:
      state.difficulty ??
      initialDifficulty(ratingFromScore(state.lastScore ?? score)),
    elapsed_days: 0, // dihitung ulang scheduler dari last_review
    scheduled_days: 0,
    reps: state.reviewCount ?? 0,
    lapses: state.lapses ?? 0,
    learning_steps: state.learningSteps ?? 0,
    state: state.fsrsState ?? State.Review,
    last_review: state.lastReviewedAt ? new Date(state.lastReviewedAt) : undefined,
  };
}

// ---- Kurva lupa & jadwal (fungsi murni — cermin publik engine) ----

/** Retensi prediksi R(t,S) setelah t hari sejak review terakhir. */
function forgettingCurve(elapsedDays, stability) {
  return ENGINE.forgetting_curve(elapsedDays, stability);
}

/**
 * Interval (hari) sampai retensi prediksi turun ke `targetRetention`.
 * Di target 0.9 nilainya persis S (definisi stability FSRS). Invers murni
 * kurva lupa — dipakai penjelasan/diagnostik; jadwal aktual memakai
 * interval BULAT engine (lihat laporan differential test).
 */
function intervalForTargetRetention(stability, targetRetention) {
  const decay = -FSRS6_WEIGHTS[20];
  const factor = Math.pow(0.9, 1 / decay) - 1;
  return (stability / factor) * (Math.pow(targetRetention, 1 / decay) - 1);
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
    fsrsState: null, // State ts-fsrs (null = New; 2 Review, 3 Relearning)
    learningSteps: 0, // indeks langkah relearning (0 = tidak dalam loop)
    algorithm: "fsrs6", // penanda state versi algoritma (migrasi)
  };
}

/**
 * Migrasi state → FSRS-6 (kini: no-op numerik untuk fsrs6, karena engine
 * resmi ts-fsrs memakai definisi S/D yang sama):
 *   - fsrs6 → fsrs6 : S, D, jadwal, lapses DIPERTAHANKAN persis — engine
 *     ts-fsrs hanya menggantikan implementasi rumus yang identik (bukti:
 *     differential test). Field kartu baru (fsrsState/learningSteps)
 *     di-default saat review berikutnya (stateToCard).
 *   - fsrs45 → fsrs6 : definisi S (hari pada R=90%) dan D (1-10) sama
 *     antar versi → dipertahankan.
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
    return state; // identitas: engine baru = definisi state yang sama
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

/**
 * Retensi unit saat ini (0-1) menurut state & waktu sekarang — untuk
 * DISPLAY/diagnostik (selisih waktu pecahan); kepercayaan yang dipakai
 * jadwal saat review memakai hari kalender engine (lihat reviewUnit).
 */
function currentRetention(state, now = new Date()) {
  if (!state.stability || !state.lastReviewedAt) return null; // belum dipelajari
  const t = daysBetween(new Date(state.lastReviewedAt), now);
  return forgettingCurve(t, state.stability);
}

/**
 * Proses hasil kuis satu unit → state SRS baru, lewat ENGINE RESMI
 * ts-fsrs (f.next). Urutan internal mengikuti engine: rating dari
 * adapter Kanjichō, lalu engine menghitung S'/D'/jadwal dari Card.
 *
 * Alur: state → Card → R (kepercayaan engine, hari kalender UTC) →
 * adapter (skor vs R → rating 1-4) → ts-fsrs next → state kembali.
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
  const engine = getEngine(targetRetention);
  const card = stateToCard(state, reviewDate, score);

  // Kepercayaan engine saat kuis dikerjakan = sinyal adapter (satu sumber
  // kebenaran: kurva lupa ts-fsrs atas selisih hari kalender yang sama
  // dengan yang dipakai rumus update). Kuis pertama → null (jangkar
  // absolut). Catatan: state model lama (difficulty null) di-infer di
  // stateToCard dari skor TERAKHIR, bukan skor kini — persis perilaku
  // engine lama (jangkar kontinuitas).
  let retrievability = null;
  if (card.state !== State.New && card.last_review) {
    const t = Math.max(0, dateDiffInDays(card.last_review, reviewDate));
    retrievability = engine.forgetting_curve(t, card.stability);
  }

  const rating = resolveRating(score, retrievability, questionCount, adapter);
  const { card: next } = engine.next(card, reviewDate, rating);

  return {
    stability: clampStability(next.stability),
    difficulty: next.difficulty,
    lastReviewedAt: (next.last_review ?? reviewDate).toISOString(),
    nextReviewAt: next.due.toISOString(),
    reviewCount: next.reps,
    lapses: next.lapses,
    lastScore: score,
    lastRating: rating,
    fsrsState: next.state,
    learningSteps: next.learning_steps,
    algorithm: "fsrs6",
  };
}

/**
 * Filter daftar unit (dengan state SRS-nya) menjadi yang "due" sekarang.
 * Menerima due menit-level (loop relearning) maupun hari-level.
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
 * Apakah unit ini dikuis sebelum jadwalnya (< 50% interval)? Layar Result
 * memakai ini untuk MENJELASKAN kenapa interval tidak memanjang penuh.
 */
function wasReviewedEarly(state, now = new Date()) {
  if (!state || !state.stability || !state.lastReviewedAt) return false;
  const elapsedDays = daysBetween(new Date(state.lastReviewedAt), now);
  return elapsedDays < state.stability * 0.5;
}

// ---- Fungsi introspeksi engine (delegasi ke API publik ts-fsrs) ----

/**
 * S' untuk review di HARI YANG SAMA — aturan short-term FSRS-6:
 * SInc = e^(w17·(G−3+w18)) · S^−w19, SInc ≥ 1 untuk G ≥ 2. Delegasi
 * langsung ke ENGINE.next_short_term_stability (dipakai test).
 */
function shortTermStability(s, rating) {
  return ENGINE.next_short_term_stability(s, rating);
}

/**
 * D baru setelah review (linear damping + mean reversion ke D0(Easy)
 * tanpa clamp antara — persis engine resmi). Delegasi ke ENGINE.
 */
function nextDifficulty(d, rating) {
  return ENGINE.next_difficulty(d, rating);
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
