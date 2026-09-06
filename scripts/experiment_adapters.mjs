#!/usr/bin/env node
/**
 * experiment_adapters.mjs — Eksperimen kondisi adapter skor → rating
 * (masalah #1 Kanjichō; FSRS-6 core dibekukan, hanya adapter yang divariasikan).
 *
 * Pertanyaan: adapter mana yang membuat scheduler menghasilkan perilaku
 * review paling masuk akal — bukan mana yang "paling keren secara teori"?
 *
 * Desain:
 *   - Scheduler = srs.js (FSRS-6, beku) men-jalankan 4 kondisi adapter:
 *       A "naive"      : tabel persentase mentah (0.5/0.7/0.9)      [baseline]
 *       B "absolute"   : lookup skor terkalibrasi (≤60/≤80/<100/100)
 *       C "binomial"   : z-score vs ekspektasi R + 2 bookend absolut
 *       D "continuous" : grade kontinu g = 3 + z/3, dibulatkan
 *   - Ground truth simulator = model memori PER-KANJI yang SENGAJA bukan
 *     FSRS (supaya FSRS tidak "mengerjakan ujian sendiri"), dengan tiga
 *     pelanggaran asumsi Bernoulli-iid yang dikhawatirkan audit:
 *       1. Heterogenitas antar-kanji (kanji sulit vs mudah);
 *       2. Korelasi antar-soal dalam satu kuis ("day shock" × semua p_j);
 *       3. Reset pemangkasan saat lupa (kesalahan mengulang di review berikutnya).
 *   - Dua KONDISI TRUTH (laju lupa) supaya ranking adapter bukan artefak
 *     satu bentuk kurva: "cepat" (p=0.85^(t/s), memihak adapter ketat)
 *     vs "lambat" (p=0.95^(t/s), memihak adapter lunak). Kalau satu adapter
 *     menang di KEDUA arah bias, kesimpulannya kokoh.
 *   - 4 skenario pengguna × 2 truth × 4 adapter × 600 seed = 19.200 riwayat
 *     unit 180 hari. Seed identik lintas adapter → unit & kuis pertama sama.
 *   - Tambahan: SENSITIVITAS SLOPE mode continuous (0.25/0.33/0.5/1.0) via
 *     adapter-fungsi — memastikan posisi D bukan sekadar pilihan slope.
 *   - Review tidak pernah lebih awal dari jadwal (aturan app); skenario
 *     menentukan distribusi keterlambatan.
 *
 * Metrik per sel (truth × skenario × adapter):
 *   mae        : rata-rata |R_model − skor aktual| (kalibrasi keyakinan model)
 *   retention  : rata-rata skor aktual saat review (target scheduler 0.9)
 *   reviews    : jumlah review per 180 hari (beban belajar)
 *   heavyLapse : porsi review dengan skor ≤ 60% (pengalaman gagal berat)
 *   nearPerf   : porsi review dengan skor ≥ 14/15 (review "basi-basi")
 *   ratingDist : distribusi Again/Hard/Good/Easy (kesehatan UX)
 *   sFinal     : median S akhir (pertumbuhan jadwal)
 *
 * Jalankan: node scripts/experiment_adapters.mjs
 * Output  : tabel konsol + download/adapter-experiment-results.json
 */
import {
  reviewUnit,
  createInitialUnitState,
  forgettingCurve,
  gradeQuizScore,
  RATING,
} from "../src/lib/srs.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_JSON = resolve(HERE, "../../download/adapter-experiment-results.json");

const MS_DAY = 1000 * 60 * 60 * 24;
const EPOCH = new Date(2026, 0, 1, 9, 0, 0); // basis kalender simulasi
const N_QUIZ = 15;
const HORIZON = 180; // hari
const SEEDS = 600;
const MAX_REVIEWS = 400; // guard loop

// ---- RNG deterministik (reproducible untuk skripsi) ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---- Kondisi truth: laju lupa per-kanji (BUKAN model FSRS) ----
const TRUTHS = {
  cepat: {
    label: "Truth A — lupa CEPAT  p=0.85^(t/s)  (model cenderung terlalu percaya diri)",
    p: (dt, s) => Math.pow(0.85, dt / s),
  },
  lambat: {
    label: "Truth B — lupa LAMBAT  p=0.95^(t/s)  (model cenderung terlalu konservatif)",
    p: (dt, s) => Math.pow(0.95, dt / s),
  },
};

// ---- Skenario pengguna (keterlambatan review + heterogenitas + shock) ----
export const SCENARIOS = {
  ideal: {
    label: "S1 Ideal (tepat waktu, kanji homogen)",
    hardFrac: 0.0,
    dayShockSigma: 0.05,
    lateness: () => 1.0, // review saat due
    breakChance: 0,
  },
  heterogen: {
    label: "S2 Kanji heterogen (35% sulit, mood naik-turun)",
    hardFrac: 0.35,
    dayShockSigma: 0.35,
    lateness: () => 1.0,
    breakChance: 0,
  },
  bolong: {
    label: "S3 Bolong-bolong (sering telat berhari-hari)",
    hardFrac: 0.15,
    dayShockSigma: 0.2,
    // Median telat ~1.6x interval, ekor lognormal panjang.
    lateness: (rng) => Math.max(1.0, Math.exp(0.4 + 0.9 * gauss(rng))),
    breakChance: 0,
  },
  realistis: {
    label: "S4 Realistis (heterogen + telat ringan + kadang libur panjang)",
    hardFrac: 0.3,
    dayShockSigma: 0.3,
    lateness: (rng) => Math.max(1.0, Math.exp(0.15 + 0.45 * gauss(rng))),
    breakChance: 0.04, // per review: +10..45 hari libur
  },
};

export const ADAPTERS = ["naive", "absolute", "binomial", "continuous"];

// ---- Ground truth per-kanji ----
function makeUnit(rng, sc) {
  return Array.from({ length: N_QUIZ }, () => {
    const hard = rng() < sc.hardFrac;
    return {
      s: hard ? 0.35 + rng() * 0.4 : 0.9 + rng() * 0.9, // hari
      growth: hard ? 1.2 + rng() * 0.2 : 2.0 + rng() * 0.8, // faktor per recall
    };
  });
}
function takeQuiz(unit, dt, shock, truthP, rng) {
  let correct = 0;
  const recalled = new Array(unit.length);
  for (let i = 0; i < unit.length; i++) {
    const p = Math.min(1, truthP(dt, unit[i].s) * shock);
    recalled[i] = rng() < p;
    if (recalled[i]) correct++;
  }
  return { correct, recalled };
}
function updateTruth(unit, recalled, rng) {
  for (let i = 0; i < unit.length; i++) {
    if (recalled[i]) {
      unit[i].s *= unit[i].growth * Math.exp(0.12 * gauss(rng)); // noise konsolidasi
    } else {
      unit[i].s = 0.15; // lupa → pemangkasan parah (kejadian ulang berkorelasi)
    }
  }
}

// ---- Satu riwayat unit 180 hari ----
export function simulate(adapter, scKey, sc, seed, truthKey) {
  // Seed TIDAK bergantung adapter: unit & kuis pertama identik lintas
  // kondisi — setelah rating pertama berbeda, trajektori dibiarkan bercabang
  // (perbandingan Monte-Carlo, bukan paired-exact).
  const rng = mulberry32(hashSeed(`${scKey}:${truthKey}:${seed}`));
  const truthP = TRUTHS[truthKey].p;
  const unit = makeUnit(rng, sc);
  let srs = createInitialUnitState();
  let t = 0.05; // kuis pertama sesaat setelah belajar
  let lastT = 0;
  const reviews = [];
  let guard = 0;

  while (t < HORIZON && guard++ < MAX_REVIEWS) {
    const dt = t - lastT;
    const shock = Math.exp(gauss(rng) * sc.dayShockSigma);
    const { correct, recalled } = takeQuiz(unit, dt, shock, truthP, rng);
    const R = srs.stability !== null ? forgettingCurve(dt, srs.stability) : null;
    const date = new Date(EPOCH.getTime() + t * MS_DAY);
    const next = reviewUnit(srs, correct / N_QUIZ, date, N_QUIZ, 0.9, adapter);
    const interval = (new Date(next.nextReviewAt) - date) / MS_DAY;
    reviews.push({
      t,
      score: correct / N_QUIZ,
      R,
      rating: next.lastRating,
      interval,
      S: next.stability,
    });
    updateTruth(unit, recalled, rng);
    srs = next;
    lastT = t;

    // Review berikutnya: paling cepat saat due (tidak bisa lebih awal),
    // ditambah keterlambatan sesuai skenario.
    const sched = Math.max(interval, 0.05);
    const lateness = sc.lateness(rng);
    let nextT = t + sched * lateness;
    if (rng() < sc.breakChance) nextT += 10 + rng() * 35;
    if (nextT <= t) nextT = t + 0.05; // guard numerik
    t = nextT;
  }
  return { reviews, finalS: srs.stability };
}

// ---- Adapter-fungsi: varian slope untuk mode continuous ----
export function continuousVariant(slope) {
  // Cermin cabang "continuous" di gradeQuizScore, hanya slope-nya berbeda —
  // bookend (100% → Easy, ≤30% → Again) dan jangkar kuis pertama sama.
  return (score, retrievability, questionCount = N_QUIZ) => {
    if (retrievability === null || retrievability === undefined) {
      return gradeQuizScore(score, null, questionCount, "absolute");
    }
    const n = Math.max(1, questionCount);
    const correct = Math.round(score * n);
    if (correct >= n) return RATING.EASY;
    if (correct <= Math.floor(0.3 * n)) return RATING.AGAIN;
    const mu = n * retrievability;
    const sigma = Math.max(Math.sqrt(n * retrievability * (1 - retrievability)), 0.5);
    const z = (correct - mu) / sigma;
    const grade = Math.min(RATING.EASY, Math.max(RATING.AGAIN, 3 + slope * z));
    return Math.round(grade);
  };
}

// ---- Agregasi metrik ----
function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
export function metricsFor({ reviews, finalS }) {
  const nonFirst = reviews.filter((r) => r.R !== null);
  const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of reviews) ratingDist[r.rating]++;
  const tot = reviews.length || 1;
  return {
    mae: mean(nonFirst.map((r) => Math.abs(r.R - r.score))),
    retention: mean(nonFirst.map((r) => r.score)),
    reviews: reviews.length,
    heavyLapse: mean(nonFirst.map((r) => (r.score <= 0.6 ? 1 : 0))),
    nearPerf: mean(nonFirst.map((r) => (r.score >= 14 / 15 ? 1 : 0))),
    ratingDist: { again: ratingDist[1] / tot, hard: ratingDist[2] / tot, good: ratingDist[3] / tot, easy: ratingDist[4] / tot },
    sFinal: finalS,
  };
}

// ---- Grid utama ----
function runGrid() {
  const cells = [];
  for (const [truthKey, truth] of Object.entries(TRUTHS)) {
    for (const [scKey, sc] of Object.entries(SCENARIOS)) {
      for (const adapter of ADAPTERS) {
        const ms = [];
        for (let seed = 0; seed < SEEDS; seed++) {
          ms.push(metricsFor(simulate(adapter, scKey, sc, seed, truthKey)));
        }
        cells.push({
          truth: truthKey,
          scenario: scKey,
          adapter,
          mae: mean(ms.map((m) => m.mae)),
          retention: mean(ms.map((m) => m.retention)),
          reviews: mean(ms.map((m) => m.reviews)),
          heavyLapse: mean(ms.map((m) => m.heavyLapse)),
          nearPerf: mean(ms.map((m) => m.nearPerf)),
          ratingDist: {
            again: mean(ms.map((m) => m.ratingDist.again)),
            hard: mean(ms.map((m) => m.ratingDist.hard)),
            good: mean(ms.map((m) => m.ratingDist.good)),
            easy: mean(ms.map((m) => m.ratingDist.easy)),
          },
          sFinalMedian: median(ms.map((m) => m.sFinal)),
        });
      }
    }
  }
  return cells;
}

// ---- Sensitivitas slope continuous (skenario realistis) ----
function runSensitivity() {
  const slopes = [0.25, 1 / 3, 0.5, 1.0];
  const sc = SCENARIOS.realistis;
  const rows = [];
  for (const [truthKey] of Object.entries(TRUTHS)) {
    for (const slope of slopes) {
      const fn = continuousVariant(slope);
      const ms = [];
      for (let seed = 0; seed < SEEDS; seed++) {
        ms.push(metricsFor(simulate(fn, "realistis", sc, seed, truthKey)));
      }
      rows.push({
        truth: truthKey,
        scenario: "realistis",
        adapter: `continuous(slope=${slope.toFixed(2)})`,
        mae: mean(ms.map((m) => m.mae)),
        retention: mean(ms.map((m) => m.retention)),
        reviews: mean(ms.map((m) => m.reviews)),
        heavyLapse: mean(ms.map((m) => m.heavyLapse)),
      });
    }
  }
  return rows;
}

// ---- Cetak & simpan ----
const pct = (x) => (100 * x).toFixed(1).padStart(5) + "%";
const num = (x, d = 3) => x.toFixed(d).padStart(d + 3);

function printCells(cells) {
  for (const [truthKey, truth] of Object.entries(TRUTHS)) {
    console.log(`\n===== ${truth.label} =====`);
    for (const [scKey, sc] of Object.entries(SCENARIOS)) {
      console.log(`\n■ ${sc.label}`);
      console.log(
        "  adapter      MAE     retensi  review/180d  lapse≤60%  ≥14/15  Again  Hard   Good   Easy   S-akhir"
      );
      for (const c of cells.filter((c) => c.scenario === scKey && c.truth === truthKey)) {
        console.log(
          `  ${c.adapter.padEnd(11)} ${num(c.mae)}  ${pct(c.retention)}  ${num(c.reviews, 1).padStart(9)}   ${pct(c.heavyLapse)}  ${pct(c.nearPerf)}  ${pct(c.ratingDist.again)} ${pct(c.ratingDist.hard)} ${pct(c.ratingDist.good)} ${pct(c.ratingDist.easy)}  ${num(c.sFinalMedian, 1)}`
        );
      }
    }
  }
}

function main() {
  const t0 = Date.now();
  const cells = runGrid();
  const sensitivity = runSensitivity();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const totalHistories =
    SEEDS * ADAPTERS.length * Object.keys(SCENARIOS).length * Object.keys(TRUTHS).length +
    sensitivity.length * SEEDS;
  console.log(
    `\nEksperimen adapter skor→rating — ${SEEDS} seed × ${ADAPTERS.length} adapter × ${Object.keys(SCENARIOS).length} skenario × ${Object.keys(TRUTHS).length} truth + sensitivitas slope = ${totalHistories} riwayat unit (${elapsed}s)`
  );
  printCells(cells);

  console.log("\n===== Rata-rata lintas skenario (per truth) =====");
  for (const [truthKey, truth] of Object.entries(TRUTHS)) {
    console.log(`\n■ ${truth.label}`);
    for (const adapter of ADAPTERS) {
      const cs = cells.filter((c) => c.adapter === adapter && c.truth === truthKey);
      const wins = Object.keys(SCENARIOS).filter((scKey) => {
        const cell = cells.find((c) => c.scenario === scKey && c.truth === truthKey && c.adapter === adapter);
        const best = Math.min(
          ...cells.filter((c) => c.scenario === scKey && c.truth === truthKey).map((c) => c.mae)
        );
        return cell.mae === best;
      }).length;
      console.log(
        `  ${adapter.padEnd(11)} MAE ${num(mean(cs.map((c) => c.mae)))}  retensi ${pct(mean(cs.map((c) => c.retention)))}  review/180d ${num(mean(cs.map((c) => c.reviews)), 1)}  lapse≤60% ${pct(mean(cs.map((c) => c.heavyLapse)))}  menang MAE di ${wins}/${Object.keys(SCENARIOS).length} skenario`
      );
    }
  }

  console.log("\n===== Sensitivitas slope continuous (skenario realistis) =====");
  for (const r of sensitivity) {
    console.log(
      `  ${r.truth.padEnd(7)} ${r.adapter.padEnd(24)} MAE ${num(r.mae)}  retensi ${pct(r.retention)}  review/180d ${num(r.reviews, 1)}  lapse≤60% ${pct(r.heavyLapse)}`
    );
  }

  const payload = {
    meta: {
      timestamp: new Date().toISOString(),
      horizonDays: HORIZON,
      seedsPerCell: SEEDS,
      totalHistories,
      quizLength: N_QUIZ,
      targetRetention: 0.9,
      scheduler:
        "FSRS-6 via engine resmi ts-fsrs 5.4.2 (versi & 21 bobot dipin; facade src/lib/srs.js) + kebijakan Kanjichō: MAX_INTERVAL 365, learning_steps kosong, relearning_steps 6h",
      schedulerNotes: [
        "Interval jadwal dalam HARI BULAT minimum 1 hari (semantik ts-fsrs) — first Again kini due besok, bukan ±5 jam.",
        "Lapse unit aktif masuk loop Relearning (due +6 jam); lulus dengan rating Good/Easy.",
      ],
      adapters: {
        naive: "tabel persentase mentah: <0.5 Again, <0.7 Hard, <0.9 Good, else Easy",
        absolute: "lookup skor terkalibrasi: ≤60% Again, ≤80% Hard, <100% Good, 100% Easy",
        binomial: "z=(benar−nR)/σ, σ≥0.5; 100%→Easy; ≤30%→Again; z≤−2&≤80%→Again; z≥2.5&≥13/15→Easy; z<−0.5→Hard; else Good",
        continuous: "z → grade kontinu g=3+z/3 dijepit [1,4], dibulatkan; bookend sama dengan binomial",
      },
      truthModel: {
        family: "per-kanji eksponensial p_j(t)=r^(t/s_j), dua laju: r=0.85 (cepat) & r=0.95 (lambat) — sengaja bukan keluarga kurva FSRS, dua arah bias",
        heterogeneity: "kanji sulit: s∈[0.35,0.75], growth 1.2–1.4; mudah: s∈[0.9,1.8], growth 2.0–2.8",
        correlation: "day-shock lognormal(0, σ) mengalikan semua p_j dalam satu kuis",
        forgetReset: "s_j ← 0.15 saat lupa; recall: s_j ← s_j·growth·lognoise(σ=0.12)",
        note: "pelanggaran asumsi Bernoulli-iid adapter dijadikan FITUR simulator, bukan bug",
      },
      scenarios: SCENARIOS,
      metrics: {
        mae: "rata-rata |R_model − skor aktual| per review (bukan kuis pertama)",
        retention: "rata-rata skor aktual saat review (target 0.9)",
        reviews: "jumlah review per riwayat 180 hari",
        heavyLapse: "porsi review skor ≤ 60%",
        nearPerf: "porsi review skor ≥ 14/15",
        sFinalMedian: "median S akhir",
      },
      caveat:
        "Simulator tidak memodelkan drill Weak Kanji (remedial per-kanji) — beban review absolut karenanya pesimistis untuk unit ber-kanji sulit; perbandingan ANTAR-adapter tetap adil karena semua kondisi memakai truth yang sama.",
    },
    cells,
    sensitivity,
  };
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  console.log(`\nJSON tersimpan: ${OUT_JSON}`);
}

// Jalankan hanya jika dieksekusi langsung (bukan diimpor skrip lain).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
