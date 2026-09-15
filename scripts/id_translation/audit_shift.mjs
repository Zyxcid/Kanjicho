#!/usr/bin/env node
/**
 * audit_shift.mjs — deteksi batch terjemahan contoh kata yang TERGESER
 * (model melewatkan satu entri dalam jawabannya → semua terjemahan
 * setelahnya berpindah ke kata sebelumnya).
 *
 * Sinyal: token ASCII khas (nama diri, Latin ilmiah, angka) yang muncul
 * di terjemahan kata w[j] padahal berasal dari GLOSS kata w[j+1].
 * Batch dengan >= 3 bukti = tersangka → diverifikasi manual.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const LEVELS = ["n5", "n4", "n3", "n2", "n1"];
const g = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/id_gloss.json"), "utf8"));

const all = [];
for (const lv of LEVELS) {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data", `${lv}_examples.json`), "utf8"));
  for (const arr of Object.values(ex)) for (const e of arr) if (!all.find((x) => x.word === e.word)) all.push({ word: e.word, en: e.meaning });
}
all.sort((a, b) => (a.word < b.word ? -1 : 1));

// token khas: alfanumerik ASCII panjang >= 4 (nama diri/Latin), angka
function toks(s) {
  const out = new Set();
  for (const m of String(s).match(/[A-Za-z0-9]{4,}/g) || []) out.add(m.toLowerCase());
  return out;
}

const BATCH = 70;
const suspects = [];
for (let b = 0; b * BATCH < all.length; b++) {
  const lo = b * BATCH;
  const hi = Math.min(lo + BATCH, all.length);
  let evidence = 0;
  const rows = [];
  for (let i = lo; i < hi - 1; i++) {
    const cur = g.w[all[i].word] || "";
    const v = toks(cur);
    if (v.size === 0) continue;
    const self = [...toks(all[i].en)].filter((t) => v.has(t)).length;
    const next = [...toks(all[i + 1].en)].filter((t) => v.has(t)).length;
    if (next > self && next >= 1) {
      evidence++;
      rows.push(`${all[i].word} [ID: ${cur.slice(0, 30)}] cocok-dgn-BUKAN-glossnya, mirip gloss ${all[i + 1].word} [${all[i + 1].en.slice(0, 30)}]`);
    }
  }
  if (evidence >= 3) suspects.push({ batch: b, lo, hi: hi - 1, evidence, rows });
}

console.log(`batch tersangka: ${suspects.length}`);
for (const s of suspects) {
  console.log(`\n=== batch ${s.batch} (index ${s.lo}-${s.hi}), bukti ${s.evidence} ===`);
  for (const r of s.rows.slice(0, 8)) console.log("  " + r);
}

// Audit heuristik tambahan: nilai masih bahasa Inggris murni (kata umum
// EN yang bukan serapan ID) — flag utk review manual.
const ENGLISH_WORDS = new Set(["the", "and", "with", "from", "this", "that", "which", "there", "where", "when", "what", "have", "been", "will", "would", "could", "should", "about", "after", "before", "under", "over", "between", "through", "during", "against", "without", "within", "each", "other", "some", "such", "than", "then", "them", "they", "were", "does", "doing", "made", "make", "used", "using", "into", "onto", "upon", "also", "just", "only", "very", "much", "more", "most", "less", "least", "both", "either", "neither", "because", "while", "since", "though", "although", "however", "therefore", "thus", "hence", "among", "along", "across", "behind", "beyond", "toward", "towards", "inside", "outside", "upside"]);
let engSus = 0;
for (const [w, v] of Object.entries(g.w)) {
  const words = String(v).toLowerCase().match(/[a-z]+/g) || [];
  const hits = words.filter((x) => ENGLISH_WORDS.has(x));
  if (hits.length >= 2) { engSus++; if (engSus <= 15) console.log(`EN-suspect: ${w} -> ${v.slice(0, 60)}`); }
}
console.log(`\nnilai ber-sintaks Inggris (>= 2 kata fungsi EN): ${engSus}`);
