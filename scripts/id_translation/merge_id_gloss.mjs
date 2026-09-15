#!/usr/bin/env node
/**
 * merge_id_gloss.mjs — gabungkan hasil cache terjemahan (translate_cache.
 * jsonl) + patch manual (patch_m_*.json + patch_w.json) menjadi
 * src/data/id_gloss.json final (t96).
 *
 * Dipakai setelah translate_kanji_data.mjs berhenti pada cakupan parsial
 * (batas kuota API): sisa string yang belum terjemahkan dilengkapi dari
 * patch manual lalu diverifikasi 100%.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "../..");
const HERE = import.meta.dirname;
const LEVELS = ["n5", "n4", "n3", "n2", "n1"];
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const PV = "v2";

// 1. Sumber kebenaran: string yang harus ada
const meanings = new Set();
const words = new Map();
for (const lv of LEVELS) {
  const kanji = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data", `${lv}.json`), "utf8"));
  for (const k of kanji) for (const m of k.meanings || []) meanings.add(m);
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data", `${lv}_examples.json`), "utf8"));
  for (const arr of Object.values(ex)) for (const e of arr) if (!words.has(e.word)) words.set(e.word, e.meaning);
}
const meaningList = [...meanings].sort();
const wordList = [...words.keys()].sort();
console.log(`harus ada: ${meaningList.length} arti, ${wordList.length} kata contoh`);

// 2. Cache batch
const cache = new Map();
for (const line of fs.readFileSync(path.join(HERE, "translate_cache.jsonl"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  try { const o = JSON.parse(line); cache.set(o.hash, o.map); } catch { /* skip */ }
}

function applyBatches(kind, list, batchSize) {
  const out = {};
  for (let i = 0; i < list.length; i += batchSize) {
    const slice = list.slice(i, i + batchSize);
    const input = kind === "m"
      ? Object.fromEntries(slice.map((m, j) => [String(j), m]))
      : slice.map((w, j) => ({ i: String(j), w, r: null, g: words.get(w) }));
    const res = cache.get(md5(JSON.stringify([PV, kind, input])));
    if (!res) continue;
    for (const k of Object.keys(res)) {
      const orig = kind === "m" ? input[k] : slice[Number(k)];
      out[orig] = res[k];
    }
  }
  return out;
}

const m = applyBatches("m", meaningList, 150);
const w = applyBatches("w", wordList, 70);
console.log(`dari cache: ${Object.keys(m).length} arti, ${Object.keys(w).length} kata`);

// 3. Patch manual
for (const f of fs.readdirSync(HERE).filter((x) => /^patch_m_\d+\.json$/.test(x)).sort()) {
  const patch = JSON.parse(fs.readFileSync(path.join(HERE, f), "utf8"));
  for (const [k, v] of Object.entries(patch)) m[k] = v;
}
const wPatchFile = path.join(HERE, "patch_w.json");
if (fs.existsSync(wPatchFile)) {
  const wp = JSON.parse(fs.readFileSync(wPatchFile, "utf8"));
  for (const [k, v] of Object.entries(wp)) w[k] = v;
}

// 4. Verifikasi cakupan
const missM = meaningList.filter((x) => !(x in m));
const missW = wordList.filter((x) => !(x in w));
console.log(`setelah patch: arti ${meaningList.length - missM.length}/${meaningList.length}, kata ${wordList.length - missW.length}/${wordList.length}`);
if (missM.length || missW.length) {
  console.log("MASIH HILANG arti:", JSON.stringify(missM.slice(0, 20)));
  console.log("MASIH HILANG kata:", JSON.stringify(missW.slice(0, 20)));
  process.exit(1);
}

// 5. Tulis output (kunci terurut)
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const out = { m: sortObj(m), w: sortObj(w) };
fs.writeFileSync(path.join(ROOT, "src/data/id_gloss.json"), JSON.stringify(out) + "\n", "utf8");
const size = (fs.statSync(path.join(ROOT, "src/data/id_gloss.json")).size / 1024).toFixed(1);
console.log(`tertulis src/data/id_gloss.json (${size} kB) — cakupan 100%`);
