#!/usr/bin/env node
/**
 * split_strokes.mjs — pecah file data goresan yang terlalu besar menjadi
 * beberapa part + satu file index (t96).
 *
 * Latar: build Vite mem-bundle tiap src/data/strokes_n*.json sebagai SATU
 * chunk (loader memakai dynamic import per level). strokes_n1.json = 1,2 MB
 * → warning Rollup "chunk larger than 500 kB". Level kecil (N5–N2) aman;
 * N1 dipecah supaya membuka SATU kanji hanya mengunduh satu sub-chunk
 * (~300 kB), bukan seluruh level.
 *
 * Output per level yang dipecah (di src/data/):
 *   strokes_<lv>_idx.json  : { "_p": <jumlah part>, "<kanji>": <no part> }
 *   strokes_<lv>_p<i>.json : { "<kanji>": [pathD, ...] }
 * File asli strokes_<lv>.json DIHAPUS setelah parts tertulis (regenerasi
 * dari KanjiVG: build_strokes.py, lalu jalankan skrip ini lagi).
 *
 * Ambang: file > SPLIT_THRESHOLD (600 kB) dipecah ke part target
 * TARGET_PART (400 kB, maks 400 kanji/part) — urutan kanji mengikuti
 * urutan kunci file asli (stabil, deterministik).
 *
 * Pemakaian:
 *   node scripts/split_strokes.mjs            (proses src/data/*.json)
 *   node scripts/split_strokes.mjs --dry      (laporan saja, tanpa menulis)
 */
import fs from "node:fs";
import path from "node:path";

const DATA = path.resolve(import.meta.dirname, "../src/data");
const SPLIT_THRESHOLD = 600_000;
const TARGET_PART = 400_000;
const MAX_KANJI_PER_PART = 400;
const DRY = process.argv.includes("--dry");

function entryBytes(kanji, paths) {
  // perkiraan ukuran ter-serialisasi: kunci (UTF-8 hingga 3B/karakter) + nilai
  return kanji.length * 3 + JSON.stringify(paths).length + 6;
}

const files = fs.readdirSync(DATA).filter((f) => /^strokes_n[1-5]\.json$/.test(f)).sort();
let changed = 0;
for (const file of files) {
  const full = path.join(DATA, file);
  const lv = file.match(/n[1-5]/)[0];
  const raw = fs.statSync(full).size;
  if (raw <= SPLIT_THRESHOLD) {
    console.log(`${file}: ${raw.toLocaleString("id")} B — satu file, tidak dipecah`);
    continue;
  }
  const map = JSON.parse(fs.readFileSync(full, "utf8"));
  const keys = Object.keys(map);
  // partisi: akumulasikan kanji sampai anggaran bytes/jumlah kanji tercapai
  const parts = [];
  let cur = {}, curBytes = 0;
  for (const k of keys) {
    const b = entryBytes(k, map[k]);
    if (curBytes + b > TARGET_PART || Object.keys(cur).length >= MAX_KANJI_PER_PART) {
      if (Object.keys(cur).length) parts.push(cur);
      cur = {}; curBytes = 0;
    }
    cur[k] = map[k];
    curBytes += b;
  }
  if (Object.keys(cur).length) parts.push(cur);

  console.log(`${file}: ${raw.toLocaleString("id")} B → ${parts.length} part ` +
    `(${parts.map((p) => Object.keys(p).length + " kanji").join(", ")})`);
  if (DRY) continue;

  const idx = { _p: parts.length };
  parts.forEach((p, i) => {
    for (const k of Object.keys(p)) idx[k] = i;
    fs.writeFileSync(path.join(DATA, `strokes_${lv}_p${i}.json`), JSON.stringify(p));
  });
  fs.writeFileSync(path.join(DATA, `strokes_${lv}_idx.json`), JSON.stringify(idx));
  fs.unlinkSync(full);
  changed++;
}

if (!DRY && changed) {
  console.log(`\n${changed} file dipecah. Loader (src/lib/strokes.js) membaca idx + part otomatis.`);
}
if (DRY) console.log("\n(mode --dry: tidak ada file yang ditulis)");
