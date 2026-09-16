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

// ---------- (t111) Audit peta m (arti kanji) ----------
// Pelajaran t111: tiga region m bergeser (England..accomplish +1,
// jurisdiction..leave with +5/+6, fret..future +40) tak pernah
// tertangkap karena auditor lama hanya memeriksa w. Heuristik di
// bawah menandai kunci m yang mencurigakan:
//   A. ARTIKEL — kunci tidak diawali "a "/"an " tapi nilai diawali
//      "sebuah/seorang/suatu " (cerminan artikel EN dari kunci
//      lain), ATAU sebaliknya.
//   B. NILAI = KUNCI LAIN — nilai verbatim sama dengan kunci m
//      yang berbeda (mis. Spain → "Thailand").
//   C. DUPLIKAT BERJARAK — dua kunci TIDAK berkerabat (prefiks
//      bersama < 4 huruf) berbagi nilai sama pada jarak 2..120.
const mKeys = Object.keys(g.m).sort();
const mSet = new Set(mKeys);
const mFlag = [];
const pref = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
for (let i = 0; i < mKeys.length; i++) {
  const k = mKeys[i], v = String(g.m[k] || "");
  const kArt = /^a[ .]|^an /.test(k.toLowerCase() + " ");
  const vArt = /^(sebuah|seorang|suatu|sesuatu) /.test(v.toLowerCase());
  // "thing/one/person/man/woman" di kunci memang lazim diterjemahkan
  // "sesuatu/seorang" — bukan tanda geser (pengecualian t111).
  const kThingy = /\b(thing|things|one|person|man|woman)\b/.test(k.toLowerCase());
  if (!kArt && vArt && !kThingy) mFlag.push(["A", k, v]);
  if (/^[A-Z][a-z]+(\.|$)/.test(k) && !/\s/.test(k) && mSet.has(v) && v !== k) mFlag.push(["B", k, v]);
  for (let dist = 2; dist <= 120 && i + dist < mKeys.length; dist++) {
    const b = mKeys[i + dist];
    if (g.m[b] !== g.m[k] || !g.m[k]) continue;
    if (pref(k, b) >= Math.min(4, Math.min(k.length, b.length))) continue;
    mFlag.push(["C" + dist, k, b + " = " + v]);
  }
}
const hard = mFlag.filter(([w]) => w === "A" || w === "B");
const soft = mFlag.filter(([w]) => w.startsWith("C"));
console.log(`\npeta m — TERSANGKA KERAS (artikel/kunci-tertukar): ${hard.length}`);
for (const [why, k, v] of hard) console.log(`  [${why}] ${k} -> ${v.slice(0, 50)}`);
console.log(`peta m — sinonim berjauhan (informasional, wajar): ${soft.length}`);
if (hard.length) { console.log(">>> PERIKSA MANUAL TERSANGKA KERAS DI ATAS <<<"); process.exitCode = 1; }
