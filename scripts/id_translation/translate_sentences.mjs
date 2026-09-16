#!/usr/bin/env node
/**
 * translate_sentences.mjs — terjemahan Bahasa Indonesia untuk kalimat
 * contoh Kanjichō (t107; dijadikan script proyek t108). Sumber: pasangan
 * Tatoeba yang dipilih scripts/build_sentences.py
 * (src/data/n*_sentences.json).
 *
 * Strategi:
 *   - Kalimat dengan pasangan JP-ID native Tatoeba SUDAH berfield `id`
 *     (diisikan build_sentences.py) — tidak disentuh di sini.
 *   - Sisanya diterjemahkan LLM (CLI `z-ai chat`) DARI KALIMAT JEPANG
 *     dengan terjemahan Inggris Tatoeba sebagai referensi (hindari galat
 *     pivot EN→ID ganda).
 *
 * Pemakaian:
 *   node scripts/id_translation/translate_sentences.mjs [--pilot]
 *
 * Cache per-batch di scripts/id_translation/sentences_cache.jsonl
 * (JSONL, resume-safe, hash input + versi prompt). Cache hasil run
 * sebelumnya DI-SHIP bersama repo — rebuild tanpa perubahan kalimat
 * tidak memanggil LLM sama sekali (semua batch cache-hit). Batch gagal →
 * entri tetap tanpa `id` → UI runtime jatuh kembali ke teks EN (overlay
 * best-effort, konvensi id_gloss t96).
 *
 * Cache bisa dibangun ulang dari terjemahan yang sudah ada di file level:
 *   node scripts/id_translation/seed_sentences_cache.mjs --ref <folder>
 * (lihat header script itu — dipakai saat memindahkan hasil terjemahan
 * ke cache agar pipeline reproducible.)
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEVELS = ["n5", "n4", "n3", "n2", "n1"];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(HERE, "sentences_cache.jsonl");
const CONCURRENCY = 2;
const BATCH = 25;
const PILOT = process.argv.includes("--pilot");
const PROMPT_VERSION = "s1";

// ---------- 1. kumpulkan entri tanpa `id` ----------
const files = {}; // lv -> objek sentences
const todo = [];  // { lv, word, jp, en }
for (const lv of LEVELS) {
  const p = path.join(ROOT, "src/data", `${lv}_sentences.json`);
  const obj = JSON.parse(fs.readFileSync(p, "utf8"));
  files[lv] = obj;
  for (const [word, e] of Object.entries(obj)) {
    if (!e.id || !e.id.trim()) todo.push({ lv, word, jp: e.jp, en: e.en || "" });
  }
}
console.log(`Sumber: ${todo.length} kalimat perlu terjemahan ID (native: ${Object.values(files).flatMap(o => Object.values(o)).filter(e => e.id).length}).`);
if (todo.length === 0) {
  console.log("Tidak ada yang perlu diterjemahkan — selesai (no-op).");
  process.exit(0);
}

// ---------- 2. cache ----------
const cache = new Map();
if (fs.existsSync(CACHE_FILE)) {
  for (const line of fs.readFileSync(CACHE_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      cache.set(o.hash, o.map);
    } catch { /* baris korup diabaikan */ }
  }
}
console.log(`Cache: ${cache.size} batch tervalidasi.`);
const cacheStream = fs.createWriteStream(CACHE_FILE, { flags: "a" });
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");

// ---------- 3. prompt ----------
const SYSTEM = [
  "Kamu penerjemah kalimat untuk aplikasi belajar kanji Jepang.",
  "Terjemahkan kalimat JEPANG ke Bahasa Indonesia yang natural.",
  "ATURAN:",
  "- Bahasa Indonesia sehari-hari yang natural dan ringkas; kalimat pendek tetap pendek.",
  "- Field `en` adalah terjemahan Inggris dari Tatoeba — pakai sebagai REFERENSI makna, tapi utamakan kalimat Jepang (`jp`).",
  "- Pertahankan tanda baca akhir kalimat (。 → ., ！ → !, ？ → ?).",
  "- Jangan menambahkan penjelasan, keterangan, atau catatan yang tidak ada di sumber.",
  "- Nama orang/tempat Jepang biarkan apa adanya atau pakai bentuk baku Indonesia yang lazim ('Tokyo', 'Osaka').",
  "- Kata serapan lazim (samurai, sushi, kimono, tsunami) biarkan.",
  "- Hasil TANPA tanda kutip pembungkus.",
  "- Balas HANYA JSON valid, tanpa teks lain, tanpa blok kode.",
].join("\n");

function extractJson(text) {
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  if (start < 0) throw new Error("tanpa '{' dalam jawaban");
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error("kurung kurawal tidak seimbang");
  const body = s.slice(start, end + 1);
  try { return JSON.parse(body); }
  catch {
    const repaired = body
      .replace(/([{,]\s*)(\d+)(\s*:)/g, '$1"$2"$3')
      .replace(/,(\s*[\]}])/g, "$1");
    return JSON.parse(repaired);
  }
}

async function callZai(prompt, attempt = 1) {
  const tmp = path.join(os.tmpdir(), `zai-sent-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    await run("z-ai", ["chat", "--prompt", prompt, "--system", SYSTEM, "-o", tmp], { timeout: 180000 });
    const raw = JSON.parse(fs.readFileSync(tmp, "utf8"));
    const content = raw?.choices?.[0]?.message?.content;
    if (!content) throw new Error("jawaban kosong");
    return content;
  } catch (e) {
    const is429 = /429|too many/i.test(String(e?.message || e));
    const maxAttempt = is429 ? 6 : 3;
    if (attempt < maxAttempt) {
      const wait = is429 ? 8000 * attempt : 1500 * attempt;
      process.stdout.write(`(retry ${attempt}${is429 ? " 429" : ""} ${wait / 1000}s) `);
      await new Promise((r) => setTimeout(r, wait));
      return callZai(prompt, attempt + 1);
    }
    throw e;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* abaikan */ }
  }
}

// ---------- 4. batch ----------
function buildBatches() {
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    batches.push({
      input: slice.map((e, j) => ({ i: String(j), w: e.word, jp: e.jp, en: e.en })),
      meta: slice, // { lv, word } sejajar input
    });
  }
  return batches;
}

async function translateBatch(b, depth = 0) {
  const hash = md5(JSON.stringify([PROMPT_VERSION, b.input]));
  if (cache.has(hash)) return cache.get(hash);
  const prompt =
    `Terjemahkan kalimat Jepang (jp) tiap entri ke Bahasa Indonesia. w = kata target (konteks, JANGAN diterjemahkan), en = referensi terjemahan Inggris (bisa berupa string kosong). Balas JSON {"<i>": "<terjemahan ID>"} dengan i ANGKA DALAM TANDA KUTIP GANDA:\n` +
    JSON.stringify(b.input);
  try {
    const content = await callZai(prompt);
    const map = extractJson(content);
    const clean = {};
    let missing = 0;
    for (const e of b.input) {
      const v = map[e.i];
      if (typeof v === "string" && v.trim()) clean[e.i] = v.trim();
      else missing++;
    }
    if (missing > b.input.length / 2) {
      throw new Error(`batch: ${missing}/${b.input.length} kunci hilang`);
    }
    cache.set(hash, clean);
    cacheStream.write(JSON.stringify({ hash, map: clean }) + "\n");
    return clean;
  } catch (e) {
    if (depth < 2 && b.input.length >= 8) {
      const mid = Math.ceil(b.input.length / 2);
      const halves = [b.input.slice(0, mid), b.input.slice(mid)];
      const merged = {};
      for (const half of halves) {
        const sub = { input: half, meta: b.meta.slice(0, 0) }; // meta tak dipakai di sub
        const subRes = await translateBatch(sub, depth + 1);
        Object.assign(merged, subRes);
      }
      return merged;
    }
    throw e;
  }
}

async function main() {
  const batches = buildBatches();
  console.log(`${batches.length} batch (${CONCURRENCY} paralel).`);
  const selected = PILOT ? [batches[0]] : batches;
  const wordId = new Map(); // word -> terjemahan
  let done = 0, failed = 0;
  const queue = [...selected];
  async function worker(id) {
    while (queue.length) {
      const b = queue.shift();
      if (done > 0) await new Promise((r) => setTimeout(r, 1200));
      try {
        const res = await translateBatch(b);
        for (const e of b.input) {
          if (res[e.i] !== undefined) wordId.set(b.meta[Number(e.i)].word, res[e.i]);
        }
        if (PILOT) {
          console.log(`\n--- PILOT (worker ${id}) ---`);
          for (const e of b.input.slice(0, 12)) {
            const m = b.meta[Number(e.i)];
            console.log(`  ${e.jp}\n    EN: ${e.en}\n    ID: ${wordId.get(m.word) ?? "(gagal)"}`);
          }
        }
      } catch (e) {
        failed++;
        console.error(`  [gagal] batch #${done}: ${e.message}`);
      }
      done++;
      if (done % 10 === 0) console.log(`  progres ${done}/${selected.length} (gagal ${failed})`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  console.log(`\nSelesai: ${wordId.size}/${todo.length} kalimat diterjemahkan, batch gagal ${failed}.`);
  if (PILOT) {
    console.log("Mode pilot — output final TIDAK ditulis.");
    return;
  }
  if (wordId.size < todo.length * 0.95) {
    console.error("Cakupan < 95% — output tidak ditulis; jalankan ulang untuk melanjutkan dari cache.");
    process.exitCode = 1;
    return;
  }
  // merge `id` ke file level (kata sama di >1 level → file berisi jp/en yang
  // sama, jadi pemetaan per kata konsisten)
  for (const lv of LEVELS) {
    const obj = files[lv];
    let n = 0;
    for (const [word, e] of Object.entries(obj)) {
      if ((!e.id || !e.id.trim()) && wordId.has(word)) {
        e.id = wordId.get(word);
        n++;
      }
    }
    const p = path.join(ROOT, "src/data", `${lv}_sentences.json`);
    fs.writeFileSync(p, JSON.stringify(obj) + "\n", "utf8");
    console.log(`  ${lv}: +${n} terjemahan`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
