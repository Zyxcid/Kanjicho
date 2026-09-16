#!/usr/bin/env node
/**
 * seed_sentences_cache.mjs — bangun cache terjemahan kalimat DARI file
 * level yang sudah berisi `id` (t108). Dipakai saat memindahkan hasil
 * terjemahan LLM yang sudah ada ke scripts/id_translation/
 * sentences_cache.jsonl, supaya `build_sentences.py` +
 * `translate_sentences.mjs` bisa dijalankan ulang TANPA memanggil LLM
 * (semua batch cache-hit; hash dibangun dengan formula identik).
 *
 * Pemakaian:
 *   node scripts/id_translation/seed_sentences_cache.mjs --ref <folder>
 *
 * <folder> = lokasi n*_sentences.json yang sudah final (berisi `id`),
 * mis. backup atau salinan repo sebelum rebuild. Script membaca file
 * AKTIF di src/data (entri TANPA id = todo, urutan & batching persis
 * translate_sentences.mjs), lalu mengambil terjemahannya dari <folder>
 * per kata. Baris cache yang hash-nya sudah ada tidak ditulis ulang.
 *
 * Catatan: terjemahan tetap valid lintas perubahan varian EN sepanjang
 * kalimat JP tidak berubah — sumber utama terjemahan adalah JP (lihat
 * prompt translate_sentences.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(HERE, "sentences_cache.jsonl");
const LEVELS = ["n5", "n4", "n3", "n2", "n1"];
const BATCH = 25;
const PROMPT_VERSION = "s1";
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

// argumen --ref <folder> atau --ref=<folder>
const argv = process.argv.slice(2);
const refIdx = argv.indexOf("--ref");
const refEq = argv.find((a) => a.startsWith("--ref="));
const refDir = refEq ? refEq.slice(5).trim()
  : refIdx >= 0 && argv[refIdx + 1] ? argv[refIdx + 1]
  : path.join(ROOT, "src", "data");
if (refDir === path.join(ROOT, "src", "data")) {
  console.log("(--ref tidak diberikan — memakai src/data aktif sebagai referensi;)");
  console.log("(berguna hanya bila file aktif sudah berisi id.)");
}

// ---------- 1. todo dari file aktif (entri tanpa id) ----------
const todo = []; // { word, jp, en }
let withId = 0;
for (const lv of LEVELS) {
  const obj = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data", `${lv}_sentences.json`), "utf8"));
  for (const [word, e] of Object.entries(obj)) {
    if (e.id && e.id.trim()) withId++;
    else todo.push({ word, jp: e.jp, en: e.en || "" });
  }
}
console.log(`Aktif: ${todo.length} entri tanpa id, ${withId} dengan id.`);
if (todo.length === 0) {
  console.log("Tidak ada todo — cache tidak perlu di-seed.");
  process.exit(0);
}

// ---------- 2. referensi id per kata ----------
const refId = new Map();
for (const lv of LEVELS) {
  const p = path.join(refDir, `${lv}_sentences.json`);
  if (!fs.existsSync(p)) continue;
  const obj = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [word, e] of Object.entries(obj)) {
    if (e.id && e.id.trim()) refId.set(word, e.id.trim());
  }
}
console.log(`Referensi: ${refId.size} terjemahan dari ${refDir}`);

// ---------- 3. bangun batch (identik translate_sentences.mjs) ----------
const batches = [];
for (let i = 0; i < todo.length; i += BATCH) {
  const slice = todo.slice(i, i + BATCH);
  batches.push(slice.map((e, j) => ({ i: String(j), w: e.word, jp: e.jp, en: e.en })));
}

// ---------- 4. tulis cache ----------
const existing = new Set();
if (fs.existsSync(CACHE_FILE)) {
  for (const line of fs.readFileSync(CACHE_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { existing.add(JSON.parse(line).hash); } catch { /* abaikan */ }
  }
}
let written = 0, missing = 0;
const stream = fs.createWriteStream(CACHE_FILE, { flags: "a" });
for (const b of batches) {
  const hash = md5(JSON.stringify([PROMPT_VERSION, b]));
  if (existing.has(hash)) continue;
  const map = {};
  let ok = true;
  for (const e of b) {
    const id = refId.get(e.w);
    if (!id) { ok = false; missing++; continue; }
    map[e.i] = id;
  }
  if (!ok) {
    console.error(`  [lewat] batch dengan entri tanpa referensi id (hash ${hash.slice(0, 8)}) —`);
    console.error(`          jalankan translate_sentences.mjs untuk melengkapinya via LLM.`);
    continue;
  }
  stream.write(JSON.stringify({ hash, map }) + "\n");
  written++;
}
stream.end();
console.log(`Cache: ${written} batch ditulis, ${existing.size} sudah ada, ${missing} entri tanpa referensi.`);
