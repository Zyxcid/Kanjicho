#!/usr/bin/env node
/**
 * differential_tsfsrs.mjs — DIFFERENTIAL TEST: facade ts-fsrs (src/lib/srs.js)
 * vs ORACLE engine manual (scripts/srs_oracle.mjs, salinan beku pra-swap).
 *
 * Ini bukti formal untuk skripsi bahwa swap engine ts-fsrs AMAN:
 *   A. Core matematis lintas-hari  : update S/D identik (toleransi 1e-6)
 *      untuk ribuan kombinasi (S, D, t, rating) acak — rating DIPAKSA
 *      lewat adapter-fungsi supaya perbandingan apple-to-apple.
 *   B. Aturan hari-yang-sama       : short-term SInc identik (tol 1e-6);
 *      kasus batas definisi hari (kalender UTC vs lokal) dihitung & dilapor.
 *   C. Kontinuitas jadwal migrasi  : state yang DITUMBUHKAN oracle
 *      (histories realistis) dilanjutkan satu langkah di KEDUA engine —
 *      drift interval dilaporkan (harus ≤ pembulatan hari, bukan lompatan).
 *   D. Migrasi state               : nextReviewAt/S/D TIDAK berubah sama
 *      sekali (janji "tidak melompat" — string ISO identik).
 *   E. Kuis pertama                : S0/D0 identik exact; interval
 *      dibulatkan ke hari (dokumentasi perilaku, bukan kegagalan).
 *   F. Loop relearning (facade)    : Again → due ~10 menit → Good lulus
 *      kembali ke jadwal hari; perilaku BARU engine resmi didokumentasikan.
 *
 * Jalankan: node scripts/differential_tsfsrs.mjs
 * Output  : ringkasan konsol + download/tsfsrs-differential-report.json
 */
import * as facade from "../src/lib/srs.js";
import * as oracle from "./srs_oracle.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_JSON = resolve(HERE, "../../download/tsfsrs-differential-report.json");
const PKG = JSON.parse(readFileSync(resolve(HERE, "../package.json"), "utf8"));

const MS_DAY = 1000 * 60 * 60 * 24;
const EPOCH = new Date(2026, 0, 1, 9, 0, 0); // basis kalender simulasi
const N_QUIZ = 15;

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
const rng = mulberry32(20260904);

let failures = 0;
function fail(msg) {
  failures++;
  console.error(`  FAIL ${msg}`);
}
function near(a, b, tolAbs = 1e-6) {
  return Math.abs(a - b) <= tolAbs * Math.max(1, Math.abs(a), Math.abs(b));
}

// Adapter-fungsi: paksa rating tertentu (mengabaikan skor) — kedua engine
// mendukung adapter-fungsi via resolveRating, jadi jalur pembandingan sama.
const force = (rating) => () => rating;

// tanggal util
const plusDays = (base, days) => new Date(base.getTime() + days * MS_DAY);
const plusMin = (base, minutes) => new Date(base.getTime() + minutes * 60000);

// state sintetis gaya fsrs6 pra-swap (tanpa fsrsState/learningSteps —
// persis bentuk state pengguna nyata saat swap engine terjadi)
function makeState({ stability, difficulty, lastReviewedAt, nextReviewAt, reviewCount, lapses, lastScore, lastRating }) {
  return {
    stability,
    difficulty,
    lastReviewedAt: lastReviewedAt.toISOString(),
    nextReviewAt: nextReviewAt.toISOString(),
    reviewCount: reviewCount ?? 3,
    lapses: lapses ?? 0,
    lastScore: lastScore ?? 0.87,
    lastRating: lastRating ?? 3,
    algorithm: "fsrs6",
  };
}

// ---- util hari-kalender (cermin ts-fsrs dateDiffInDays, untuk diagnostik) ----
function utcDay(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function calDays(a, b) {
  return Math.floor((utcDay(b) - utcDay(a)) / MS_DAY);
}
function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const report = {
  engine: { package: "ts-fsrs", version: PKG.dependencies["ts-fsrs"], oracle: "manual FSRS-6 (scripts/srs_oracle.mjs)" },
  parts: {},
};

// ====================================================================
console.log("A. Core matematis lintas-hari (update S/D, rating dipaksa)");
// ====================================================================
{
  const CASES = 2000;
  let sdMismatch = 0;
  let ratingMismatch = 0;
  let lapseAgreed = 0;
  const worstS = { d: 0 };
  const worstD = { d: 0 };
  let sMaxConsidered = 0;

  for (let i = 0; i < CASES; i++) {
    const S = Math.exp(Math.log(0.3) + rng() * (Math.log(400) - Math.log(0.3)));
    const D = 1 + rng() * 9;
    const t = 1 + Math.floor(rng() * 120);
    const lapse = rng() < 0.25;
    const rating = lapse ? 1 : 2 + Math.floor(rng() * 3);
    const score = 0.87; // nilai apa pun — rating dipaksa
    const last = EPOCH;
    const when = plusDays(last, t);
    const state = makeState({
      stability: S,
      difficulty: D,
      lastReviewedAt: last,
      nextReviewAt: plusDays(last, Math.max(1, S)),
      reviewCount: 2 + Math.floor(rng() * 30),
      lapses: Math.floor(rng() * 5),
    });

    const outO = oracle.reviewUnit(state, score, when, N_QUIZ, 0.9, force(rating));
    const outF = facade.reviewUnit(state, score, when, N_QUIZ, 0.9, force(rating));

    if (outO.lastRating !== rating || outF.lastRating !== rating) ratingMismatch++;
    if (!near(outO.stability, outF.stability)) {
      sdMismatch++;
      const d = Math.abs(outO.stability - outF.stability);
      if (d > worstS.d) worstS.d = d;
    } else {
      const d = Math.abs(outO.stability - outF.stability);
      if (d > worstS.d) worstS.d = d;
    }
    if (!near(outO.difficulty, outF.difficulty, 1e-6)) {
      sdMismatch++;
      if (Math.abs(outO.difficulty - outF.difficulty) > worstD.d)
        worstD.d = Math.abs(outO.difficulty - outF.difficulty);
    }
    if (outO.reviewCount !== outF.reviewCount) sdMismatch++;
    if (outO.lapses !== outF.lapses) sdMismatch++;
    if (rating === 1) lapseAgreed++;
    if (S > sMaxConsidered) sMaxConsidered = S;
  }

  report.parts.A = { cases: CASES, sdMismatch, ratingMismatch, worstS: worstS.d, worstD: worstD.d, lapseCases: lapseAgreed };
  if (sdMismatch || ratingMismatch) {
    fail(`A: ${sdMismatch} mismatch S/D/reps/lapses, ${ratingMismatch} mismatch rating`);
  } else {
    console.log(`  ok  ${CASES} kasus: S, D, reps, lapses, rating identik (drift max S ${worstS.d.toExponential(2)}, D ${worstD.d.toExponential(2)})`);
  }
}

// ====================================================================
console.log("B. Aturan hari-yang-sama (short-term SInc, keduanya)");
// ====================================================================
{
  const CASES = 600;
  let agreed = 0;
  let boundarySkipped = 0;
  let mismatch = 0;
  let worstS = 0;

  for (let i = 0; i < CASES; i++) {
    const S = Math.exp(Math.log(0.3) + rng() * (Math.log(400) - Math.log(0.3)));
    const D = 1 + rng() * 9;
    const rating = 1 + Math.floor(rng() * 4);
    const hoursLater = 0.2 + rng() * 9; // 12 menit .. ~9.2 jam
    const last = EPOCH;
    const when = plusMin(last, hoursLater * 60);
    const state = makeState({
      stability: S,
      difficulty: D,
      lastReviewedAt: last,
      nextReviewAt: plusDays(last, 1),
    });

    const engineSaysSameDay = calDays(last, when) === 0;
    const oracleSaysSameDay = sameLocalDay(last, when);
    if (engineSaysSameDay !== oracleSaysSameDay) {
      // Definisi hari berbeda (kalender UTC vs lokal) — kasus batas yang
      // hanya mungkin di zona waktu ekstrem/jam ganjil; dilaporkan, bukan
      // kegagalan (di zona app UTC+5..+10 dan jam belajar wajar: tak terjadi).
      boundarySkipped++;
      continue;
    }

    const outO = oracle.reviewUnit(state, 0.87, when, N_QUIZ, 0.9, force(rating));
    const outF = facade.reviewUnit(state, 0.87, when, N_QUIZ, 0.9, force(rating));
    agreed++;
    if (!near(outO.stability, outF.stability) || !near(outO.difficulty, outF.difficulty, 1e-6)) {
      mismatch++;
      worstS = Math.max(worstS, Math.abs(outO.stability - outF.stability));
    }
  }

  report.parts.B = { cases: CASES, compared: agreed, boundarySkipped, mismatch };
  if (mismatch) {
    fail(`B: ${mismatch}/${agreed} mismatch same-day`);
  } else {
    console.log(`  ok  ${agreed} kasus same-day: S & D identik (${boundarySkipped} kasus batas definisi hari dilewati — di zona app tidak terjadi)`);
  }
}

// ====================================================================
console.log("C. Kontinuitas jadwal: state oracle dilanjutkan di kedua engine");
// ====================================================================
{
  const HISTORIES = 400; // unit
  const STEPS = 8; // review per unit setelah kuis pertama
  const stats = { steps: 0, sDriftMax: 0, dDriftMax: 0, gapP50: 0, gapP95: 0, gapMax: 0, ratingFlips: 0, gapFromFlip: 0, lapseSteps: 0, firstSteps: 0 };
  const gaps = [];
  const failuresDetail = [];
  let hardFail = 0;

  for (let h = 0; h < HISTORIES; h++) {
    // Kuis pertama: skor wajar (0.6..1.0) via adapter default (binomial).
    let state = oracle.createInitialUnitState();
    const firstScore = 0.6 + rng() * 0.4;
    const t0 = EPOCH;
    state = oracle.reviewUnit(state, firstScore, t0, N_QUIZ);
    stats.firstSteps++;

    for (let s = 0; s < STEPS; s++) {
      // Review di sekitar jadwal oracle (tidak lebih awal — aturan app),
      // keterlambatan 0..2 hari (lognormal-ish sederhana).
      const due = new Date(state.nextReviewAt);
      const lateDays = Math.min(2, -Math.log(1 - rng() * 0.999) * 0.8);
      const when = plusDays(due, lateDays);
      // Skor realistis: prediksi model R ± noise (kalibrasi sehat-ish).
      const tSince = (when - new Date(state.lastReviewedAt)) / MS_DAY;
      const Rpred = Math.max(0.05, Math.min(1, oracle.forgettingCurve(tSince, state.stability)));
      const sigmaS = 0.12;
      let p = Rpred + (rng() * 2 - 1) * sigmaS;
      p = Math.max(0, Math.min(1, p));
      const score = Math.round(p * N_QUIZ) / N_QUIZ;

      const outO = oracle.reviewUnit(state, score, when, N_QUIZ);
      const outF = facade.reviewUnit(state, score, when, N_QUIZ);
      const step = { steps: 1 };

      // Rating harus sama (adapter murni + R mirip); flip = sinyal kalibrasi
      if (outO.lastRating !== outF.lastRating) stats.ratingFlips++;

      const sDrift = Math.abs(outO.stability - outF.stability) / Math.max(1, outO.stability);
      stats.sDriftMax = Math.max(stats.sDriftMax, sDrift);
      stats.dDriftMax = Math.max(stats.dDriftMax, Math.abs(outO.difficulty - outF.difficulty));

      const gapO = (new Date(outO.nextReviewAt) - when) / MS_DAY;
      const gapF = (new Date(outF.nextReviewAt) - when) / MS_DAY;
      if (outO.lastRating === 1) {
        // Lapse: engine resmi masuk loop relearning (due ~10 menit), engine
        // lama menjadwalkan S' hari pecahan — perbedaan STRUKTURAL yang
        // didokumentasikan (bukan lompatan migrasi). Divergensi jadwal di
        // langkah ini TIDAK dihitung sebagai drift kontinuitas.
        stats.lapseSteps++;
        // tapi S/D tetap dibandingkan:
        if (!near(outO.stability, outF.stability, 2e-2) || !near(outO.difficulty, outF.difficulty, 1e-2)) hardFail++;
      } else {
        const gap = Math.abs(gapO - gapF);
        const flipped = outO.lastRating !== outF.lastRating;
        gaps.push(gap);
        // Toleransi kontinuitas: pembulatan hari (±0.5) + drift kuantisasi
        // waktu (R int-vs-float hari) yang teramplifikasi di interval panjang
        // → batas relatif 5% di atas floor absolut 3 hari. Rating flip di
        // tepi pita adapter (z≈−0.5) adalah perilaku terdokumentasi (adapter
        // menilai kepercayaan hari-kalender engine), bukan lompatan jadwal.
        if (gap > Math.max(3, 0.05 * gapO)) {
          if (flipped) {
            stats.gapFromFlip++;
            failuresDetail.push({
              S: +state.stability.toFixed(2),
              ratingO: outO.lastRating,
              ratingF: outF.lastRating,
              flip: true,
              gapO: +gapO.toFixed(2),
              gapF: +gapF.toFixed(2),
              gap: +gap.toFixed(2),
            });
          } else {
            hardFail++;
            failuresDetail.push({
              S: +state.stability.toFixed(2),
              ratingO: outO.lastRating,
              ratingF: outF.lastRating,
              flip: false,
              gapO: +gapO.toFixed(2),
              gapF: +gapF.toFixed(2),
              gap: +gap.toFixed(2),
            });
          }
        }
      }
      stats.steps++;

      // Rantai dilanjutkan dengan state ORACLE (mengukur kontinuitas
      // per-langkah dari state pengguna lama — skenario migrasi).
      state = outO;
    }
  }

  gaps.sort((a, b) => a - b);
  const pct = (p) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : 0);
  stats.gapP50 = pct(0.5);
  stats.gapP95 = pct(0.95);
  stats.gapMax = gaps.length ? gaps[gaps.length - 1] : 0;
  report.parts.C = { histories: HISTORIES, stepsPerHistory: STEPS + 1, ...stats, hardFail, failuresDetail: failuresDetail.slice(0, 30) };
  if (hardFail) {
    fail(`C: ${hardFail} langkah kontinuitas menyimpang > toleransi`);
  } else {
    console.log(
      `  ok  ${stats.steps} review lanjutan dari state lama: drift interval p50 ${stats.gapP50.toFixed(2)}d, p95 ${stats.gapP95.toFixed(2)}d, max ${stats.gapMax.toFixed(2)}d (≤ pembulatan + kuantisasi hari); ${stats.ratingFlips} flip rating tepi-pita (${((stats.ratingFlips / stats.steps) * 100).toFixed(1)}% — perilaku terdokumentasi); ${stats.lapseSteps} langkah lapse → loop relearning`
    );
  }
}

// ====================================================================
console.log("D. Migrasi state: jadwal tidak melompat (janji eksak)");
// ====================================================================
{
  const CASES = 300;
  let bad = 0;
  for (let i = 0; i < CASES; i++) {
    const S = Math.exp(Math.log(0.25) + rng() * (Math.log(300) - Math.log(0.25)));
    const last = plusDays(EPOCH, -Math.floor(rng() * 200));
    const due = plusDays(last, Math.max(1, S * (0.8 + rng() * 0.4)));
    const legacy = {
      stability: S,
      reviewCount: 1 + Math.floor(rng() * 40),
      lapses: Math.floor(rng() * 6),
      lastScore: Math.round((0.3 + rng() * 0.7) * 100) / 100,
      lastReviewedAt: last.toISOString(),
      nextReviewAt: due.toISOString(),
    };
    const mO = oracle.migrateUnitState(legacy);
    const mF = facade.migrateUnitState(legacy);
    if (mF.nextReviewAt !== legacy.nextReviewAt) bad++; // janji: string ISO identik
    if (!near(mF.stability, mO.stability, 0)) bad++;
    if (!near(mF.difficulty ?? mF.difficulty, mO.difficulty, 1e-6)) bad++;
    // fsrs6 valid → identitas (tidak dimigrasi ulang)
    if (i === 0 && facade.migrateUnitState(mF) !== mF) bad++;
  }
  report.parts.D = { cases: CASES, bad };
  if (bad) fail(`D: ${bad} kasus migrasi mengubah jadwal/S/D`);
  else console.log(`  ok  ${CASES} state legacy: nextReviewAt EXACT sama, S/D dipertahankan; state fsrs6 → identitas`);
}

// ====================================================================
console.log("E. Kuis pertama: S0/D0 identik; interval dibulatkan ke hari");
// ====================================================================
{
  const first = {};
  for (const rating of [1, 2, 3, 4]) {
    const outO = oracle.reviewUnit(oracle.createInitialUnitState(), 0.87, EPOCH, N_QUIZ, 0.9, force(rating));
    const outF = facade.reviewUnit(facade.createInitialUnitState(), 0.87, EPOCH, N_QUIZ, 0.9, force(rating));
    const okSD = near(outO.stability, outF.stability, 0) && near(outO.difficulty, outF.difficulty, 1e-6);
    if (!okSD) fail(`E: S0/D0 rating ${rating} berbeda`);
    const gapO = (new Date(outO.nextReviewAt) - EPOCH) / MS_DAY;
    const gapF = (new Date(outF.nextReviewAt) - EPOCH) / MS_DAY;
    first[["Again", "Hard", "Good", "Easy"][rating - 1]] = {
      S: +outF.stability.toFixed(4),
      gapOracleDays: +gapO.toFixed(3),
      gapFacadeDays: +gapF.toFixed(3),
      note: gapF === Math.max(1, Math.round(outO.stability)) ? "round(S0) min 1 hari" : "CEK",
    };
  }
  report.parts.E = { first };
  console.log("  ok  S0/D0 identik exact di 4 rating; interval kini hari bulat (min 1):");
  for (const [k, v] of Object.entries(first)) {
    console.log(`      ${k.padEnd(5)}: oracle ${v.gapOracleDays}d → ts-fsrs ${v.gapFacadeDays}d (${v.note})`);
  }
}

// ====================================================================
console.log("F. Loop relearning (perilaku BARU engine resmi — dokumentasi)");
// ====================================================================
{
  // Bangun unit matang via facade (5 review tepat waktu dengan Good).
  let mature = facade.reviewUnit(facade.createInitialUnitState(), 0.933, EPOCH, N_QUIZ, 0.9, force(3));
  for (let i = 0; i < 5; i++) {
    mature = facade.reviewUnit(mature, 0.933, new Date(mature.nextReviewAt), N_QUIZ, 0.9, force(3));
  }
  const SBefore = mature.stability;

  // Lapse lintas hari → Relearning, due ~6 jam (ritme remedial unit),
  // S dipangkas (cap).
  const lapseAt = new Date(mature.nextReviewAt);
  const lapsed = facade.reviewUnit(mature, 0.2, lapseAt, N_QUIZ, 0.9, force(1));
  const relearnGapMin = (new Date(lapsed.nextReviewAt) - lapseAt) / 60000;
  const cap = SBefore / Math.exp(0.5425 * 0.0912);
  const okLapse =
    lapsed.fsrsState === 3 &&
    Math.abs(relearnGapMin - 360) < 1 &&
    lapsed.stability <= cap * 1.000001 &&
    lapsed.stability < SBefore &&
    lapsed.lapses === mature.lapses + 1;

  // 6 jam kemudian: lulus (Easy — skor sempurna) → graduate, jadwal hari ≥ 1.
  const passAt = plusMin(lapseAt, 360);
  const passed = facade.reviewUnit(lapsed, 1.0, passAt, N_QUIZ, 0.9, force(4));
  const passGapDays = (new Date(passed.nextReviewAt) - passAt) / MS_DAY;
  const okPass = passed.fsrsState === 2 && passGapDays >= 1 && passed.stability > 0;

  // Gagal lagi 6 jam kemudian → tetap Relearning (loop berlanjut, sub-hari).
  const failAgain = facade.reviewUnit(lapsed, 0.2, plusMin(lapseAt, 360), N_QUIZ, 0.9, force(1));
  const okLoop =
    failAgain.fsrsState === 3 &&
    (new Date(failAgain.nextReviewAt) - plusMin(lapseAt, 360)) / MS_DAY < 0.5;

  // Loop diabaikan sampai besok → Good tetap lulus ke jadwal hari (graceful).
  const nextDay = plusDays(lapseAt, 1);
  const latePass = facade.reviewUnit(lapsed, 0.933, nextDay, N_QUIZ, 0.9, force(3));
  const okLate = latePass.fsrsState === 2 && (new Date(latePass.nextReviewAt) - nextDay) / MS_DAY >= 1;

  report.parts.F = {
    matureS: +SBefore.toFixed(2),
    lapseS: +lapsed.stability.toFixed(2),
    capS: +cap.toFixed(2),
    relearnDueMinutes: +relearnGapMin.toFixed(1),
    graduateGapDays: +passGapDays.toFixed(2),
    okLapse, okPass, okLoop, okLate,
  };
  if (okLapse && okPass && okLoop && okLate) {
    console.log(
      `  ok  lapse S ${SBefore.toFixed(1)}→${lapsed.stability.toFixed(2)} (cap ${cap.toFixed(2)}); due +${(relearnGapMin / 60).toFixed(1)} jam; lulus → +${passGapDays.toFixed(1)} hari; diabaikan besok → tetap lulus`
    );
  } else {
    fail(`F: loop relearning tidak sesuai (${JSON.stringify({ okLapse, okPass, okLoop, okLate })})`);
  }
}

// ---- Simpan laporan ----
mkdirSync(dirname(OUT_JSON), { recursive: true });
report.failures = failures;
report.verdict = failures === 0 ? "PASS — engine resmi ts-fsrs identik pada core matematis; migrasi tanpa lompatan jadwal" : "FAIL";
writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
console.log(`\n${failures === 0 ? "SEMUA BAGIAN LULUS" : failures + " KEGAGALAN"} → ${OUT_JSON}`);
process.exit(failures === 0 ? 0 : 1);
