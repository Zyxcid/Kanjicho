#!/usr/bin/env node
/**
 * experiment_slope_full.mjs — Robustness check lanjutan eksperimen adapter:
 * sweep slope mode "continuous" di SEMUA skenario (sensitivitas di
 * experiment_adapters.mjs hanya memakai skenario realistis), dibandingkan
 * langsung dengan "binomial" pada seed yang sama.
 *
 * Motivasi: pada engine final ts-fsrs, varian continuous(slope=1.0)
 * unggul TIPIS atas binomial di skenario realistis (ΔMAE ≈ 0.007). Pertanyaan
 * sweep ini: apakah keunggulan itu general lintas skenario, atau khusus
 * realistis — dan seberapa besar dibanding noise seed?
 *
 * Metode tambahan: block-SEM (600 seed dibagi 6 blok × 100; SEM = std
 * rata-rata antar blok) — supaya selisih kecil tidak dibaca sebagai
 * kemenangan tanpa ukuran ketidakpastiannya.
 *
 * Jalankan: node scripts/experiment_slope_full.mjs
 * Output  : tabel konsol + download/slope-sweep-results.json
 */
import {
  simulate,
  metricsFor,
  SCENARIOS,
  continuousVariant,
} from "./experiment_adapters.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_JSON = resolve(HERE, "../../download/slope-sweep-results.json");

const TRUTH_KEYS = ["cepat", "lambat"];
const SLOPES = [1 / 3, 0.5, 1.0]; // 1/3 = slope default mode continuous
const SEEDS = 600;
const BLOCKS = 6; // block-SEM

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function blockSEM(xs, nBlocks = BLOCKS) {
  // SEM rata-rata keseluruhan = std(rata-rata blok)/√nBlocks.
  // (std blok dihitung dengan pembagi nBlocks−1: varB·nBlocks/(nBlocks−1);)
  // sebelumnya rumus ini salah membagi √nBlocks dua kali → SEM terlalu
  // kecil faktor √6 — dikoreksi supaya selisih kecil tidak dibaca
  // sebagai kemenangan yang lebih pasti dari kenyataannya.
  const per = Math.floor(xs.length / nBlocks);
  if (per < 2) return 0;
  const blockMeans = [];
  for (let b = 0; b < nBlocks; b++) {
    blockMeans.push(mean(xs.slice(b * per, (b + 1) * per)));
  }
  const m = mean(blockMeans);
  const varB = mean(blockMeans.map((v) => (v - m) * (v - m)));
  const stdBlocks = Math.sqrt((varB * nBlocks) / (nBlocks - 1));
  return stdBlocks / Math.sqrt(nBlocks);
}

function runCell(adapterFn, scKey, sc, truthKey) {
  // Kembalikan metrik per-seed (untuk SEM) + agregat sel.
  const per = { mae: [], retention: [], heavyLapse: [], reviews: [], nearPerf: [] };
  for (let seed = 0; seed < SEEDS; seed++) {
    const m = metricsFor(simulate(adapterFn, scKey, sc, seed, truthKey));
    per.mae.push(m.mae);
    per.retention.push(m.retention);
    per.heavyLapse.push(m.heavyLapse);
    per.reviews.push(m.reviews);
    per.nearPerf.push(m.nearPerf);
  }
  return {
    mae: mean(per.mae),
    maeSEM: blockSEM(per.mae),
    retention: mean(per.retention),
    retentionSEM: blockSEM(per.retention),
    heavyLapse: mean(per.heavyLapse),
    reviews: mean(per.reviews),
    reviewsSEM: blockSEM(per.reviews),
    nearPerf: mean(per.nearPerf),
  };
}

function main() {
  const t0 = Date.now();
  const rows = [];
  for (const truthKey of TRUTH_KEYS) {
    for (const [scKey, sc] of Object.entries(SCENARIOS)) {
      // Referensi binomial (seed sama).
      const bin = runCell("binomial", scKey, sc, truthKey);
      rows.push({ truth: truthKey, scenario: scKey, adapter: "binomial", ...bin });
      for (const slope of SLOPES) {
        const fn = continuousVariant(slope);
        const c = runCell(fn, scKey, sc, truthKey);
        rows.push({
          truth: truthKey,
          scenario: scKey,
          adapter: `continuous(slope=${slope.toFixed(2)})`,
          ...c,
        });
      }
    }
  }

  const pct = (x) => (100 * x).toFixed(1).padStart(5) + "%";
  const num = (x, d = 3) => x.toFixed(d);
  console.log("Sweep slope continuous vs binomial — semua skenario (± block-SEM)");
  for (const truthKey of TRUTH_KEYS) {
    console.log(`\n===== truth: ${truthKey} =====`);
    for (const scKey of Object.keys(SCENARIOS)) {
      console.log(`\n■ ${SCENARIOS[scKey].label}`);
      console.log("  adapter                     MAE ±SEM      retensi ±SEM    lapse≤60%  review  ≥14/15");
      for (const r of rows.filter((r) => r.truth === truthKey && r.scenario === scKey)) {
        console.log(
          `  ${r.adapter.padEnd(27)} ${num(r.mae)} ±${num(r.maeSEM)}   ${pct(r.retention)} ±${pct(r.retentionSEM)}  ${pct(r.heavyLapse)}  ${num(r.reviews, 1).padStart(6)}  ${pct(r.nearPerf)}`
        );
      }
    }
  }

  // Ringkasan: rata-rata lintas skenario per truth.
  console.log("\n===== Rata-rata lintas skenario =====");
  const summary = [];
  for (const truthKey of TRUTH_KEYS) {
    for (const adapter of ["binomial", ...SLOPES.map((s) => `continuous(slope=${s.toFixed(2)})`)]) {
      const rs = rows.filter((r) => r.truth === truthKey && r.adapter === adapter);
      summary.push({
        truth: truthKey,
        adapter,
        mae: mean(rs.map((r) => r.mae)),
        maeSEM: mean(rs.map((r) => r.maeSEM)),
        retention: mean(rs.map((r) => r.retention)),
        heavyLapse: mean(rs.map((r) => r.heavyLapse)),
        reviews: mean(rs.map((r) => r.reviews)),
        nearPerf: mean(rs.map((r) => r.nearPerf)),
      });
    }
  }
  for (const s of summary) {
    console.log(
      `  ${s.truth.padEnd(7)} ${s.adapter.padEnd(27)} MAE ${num(s.mae)} ±${num(s.maeSEM)}  retensi ${pct(s.retention)}  lapse ${pct(s.heavyLapse)}  review ${num(s.reviews, 1)}  ≥14/15 ${pct(s.nearPerf)}`
    );
  }

  const payload = {
    meta: {
      timestamp: new Date().toISOString(),
      seedsPerCell: SEEDS,
      slopes: SLOPES,
      truths: TRUTH_KEYS,
      sem: "block-SEM: 6 blok × 100 seed; SEM = std(rata-rata blok, pembagi 5) / √6 (rumus dikoreksi — versi awal salah membagi √6 dua kali)",
      scheduler:
        "FSRS-6 via engine resmi ts-fsrs 5.4.2 (facade src/lib/srs.js) — sama dengan adapter-experiment-results.json",
      motivation:
        "continuous(slope=1.0) unggul tipis di skenario realistis pada run utama; sweep ini menguji generalisasi lintas skenario + ketidakpastian seed.",
    },
    rows,
    summary,
  };
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nJSON tersimpan: ${OUT_JSON} (${elapsed}s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
