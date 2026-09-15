#!/usr/bin/env node
/**
 * translate_kanji_data.mjs — terjemahkan data kanji Kanjicho ke Bahasa
 * Indonesia (t96): arti kanji (KANJIDIC2 EN) + gloss contoh kata
 * (JMdict EN) → src/data/id_gloss.json dengan dua peta:
 *   m : { "<arti EN>"  : "<arti ID>" }   — 5.205 string unik
 *   w : { "<kata JP>"  : "<gloss ID>" }  — 3.960 kata contoh unik
 *
 * Pemakaian:
 *   node /home/z/my-project/scripts/translate_kanji_data.mjs [--pilot]
 *
 * --pilot : terjemahkan 1 batch arti + 1 batch contoh lalu cetak contoh
 *           hasilnya untuk pemeriksaan mutu (tidak menulis output final).
 *
 * Sumber dibaca dari src/data/ (hasil promosi pipeline). Output ditulis
 * ke src/data/id_gloss.json (kunci terurut supaya diff stabil).
 * Cache per-batch di translate_cache.jsonl (JSONL) — jalur ulang melanjut-
 * kan batch yang belum selesai; hash input invalidasi cache otomatis.
 *
 * Alat: CLI global `z-ai chat` (glm-4-plus). Konkurensi 4, retry 3x
 * per batch dengan backoff; batch yang tetap gagal dibiarkan kosong →
 * runtime app jatuh kembali ke teks Inggris (id_gloss bersifat overlay).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "../..");
const LEVELS = ["n5", "n4", "n3", "n2", "n1"];
const HERE = import.meta.dirname;
const CACHE_FILE = path.join(HERE, "translate_cache.jsonl");
const OUT_FILE = path.join(ROOT, "src/data/id_gloss.json");
const CONCURRENCY = 2;
const MEANING_BATCH = 150;
const WORD_BATCH = 70;
const PILOT = process.argv.includes("--pilot");
// Versi prompt — masuk ke hash cache: ganti angka ini bila prompt
// berubah supaya batch lama tidak dipakai ulang.
const PROMPT_VERSION = "v2";

// ---------- 1. Kumpulkan string unik dari data final ----------
const meanings = new Set();          // arti EN unik
const words = new Map();             // kata JP -> gloss EN (0 kolisi, terverifikasi)
for (const lv of LEVELS) {
  const kanji = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data", `${lv}.json`), "utf8"));
  for (const k of kanji) for (const m of k.meanings || []) meanings.add(m);
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data", `${lv}_examples.json`), "utf8"));
  for (const arr of Object.values(ex)) {
    for (const e of arr) {
      const prev = words.get(e.word);
      if (prev === undefined) words.set(e.word, e.meaning);
      else if (prev !== e.meaning) {
        throw new Error(`Kolisi gloss untuk kata ${e.word}: "${prev}" vs "${e.meaning}" — kunci per kata tidak aman.`);
      }
    }
  }
}
const meaningList = [...meanings].sort();
const wordList = [...words.keys()].sort();
console.log(`Sumber: ${meaningList.length} arti unik, ${wordList.length} kata contoh unik.`);

// ---------- 2. Cache ----------
const cache = new Map(); // hash -> map hasil
if (fs.existsSync(CACHE_FILE)) {
  for (const line of fs.readFileSync(CACHE_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      cache.set(o.hash, o.map);
    } catch { /* baris cache korup diabaikan */ }
  }
}
console.log(`Cache: ${cache.size} batch tervalidasi.`);
const cacheStream = fs.createWriteStream(CACHE_FILE, { flags: "a" });

function md5(s) { return crypto.createHash("md5").update(s).digest("hex"); }

// ---------- 3. Prompt ----------
const SYSTEM = [
  "Kamu penerjemah kamus untuk aplikasi belajar kanji Jepang (KANJIDIC2 & JMdict).",
  "Terjemahkan arti berbahasa Inggris ke Bahasa Indonesia.",
  "ATURAN:",
  "- Gaya kamus: ringkas dan padat. Huruf kecil, kecuali nama diri/tempat.",
  "- TANPA titik di akhir nilai.",
  "- Jangan menambah keterangan yang tidak ada di sumber.",
  "- Arti berupa imbuhan Inggris (diawalan '-') terjemahkan maknanya: '-ship' -> '-an', '-proof' -> 'tahan', '-ization' -> '-isasi', '-fold' -> '-lipat'.",
  "- Jangan memindah-mindahkan isi tanda kurung: terjemahkan sebagai satu kesatuan ('(North) Korea' -> 'Korea Utara').",
  "- Nama negara/tempat/bahasa pakai bentuk baku Indonesia ('China' -> 'Cina').",
  "- Kata serapan Jepang yang lazim di Indonesia (samurai, sushi, tsunami, kimono, geisha) biarkan apa adanya.",
  "- Verba Inggris berawalan 'to ' terjemahkan sebagai kata kerja Indonesia: 'to eat' -> 'makan'.",
  "- Keterangan dalam tanda kurung tetap dipertahankan, diterjemahkan singkat.",
  "- Balas HANYA JSON valid, tanpa teks lain, tanpa blok kode.",
].join("\n");

function extractJson(text) {
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  if (start < 0) throw new Error("tanpa '{' dalam jawaban");
  let depth = 0, inStr = false, esc = false;
  let end = -1;
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
    else if (c === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error("kurung kurawal tidak seimbang");
  const body = s.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch (e) {
    // Perbaikan umum keluaran model: kunci numerik tanpa kutip dan
    // koma menggantung di akhir baris.
    const repaired = body
      .replace(/([{,]\s*)(\d+)(\s*:)/g, '$1"$2"$3')
      .replace(/,(\s*[\]}])/g, "$1");
    return JSON.parse(repaired);
  }
}

async function callZai(prompt, attempt = 1) {
  const tmp = path.join(os.tmpdir(), `zai-tr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    await run("z-ai", ["chat", "--prompt", prompt, "--system", SYSTEM, "-o", tmp], { timeout: 180000 });
    const raw = JSON.parse(fs.readFileSync(tmp, "utf8"));
    const content = raw?.choices?.[0]?.message?.content;
    if (!content) throw new Error("jawaban kosong");
    return content;
  } catch (e) {
    // 429 = rate limit API — backoff panjang (m bertambah tiap percobaan)
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

// ---------- 4. Batch ----------
function buildBatches() {
  const batches = [];
  for (let i = 0; i < meaningList.length; i += MEANING_BATCH) {
    const slice = meaningList.slice(i, i + MEANING_BATCH);
    const input = {};
    slice.forEach((m, j) => { input[String(j)] = m; });
    batches.push({ kind: "m", input, keys: slice });
  }
  for (let i = 0; i < wordList.length; i += WORD_BATCH) {
    const slice = wordList.slice(i, i + WORD_BATCH);
    const input = slice.map((w, j) => ({ i: String(j), w, r: null, g: words.get(w) }));
    batches.push({ kind: "w", input, keys: slice });
  }
  return batches;
}

async function translateBatch(b, depth = 0) {
  const hash = md5(JSON.stringify([PROMPT_VERSION, b.kind, b.input]));
  if (cache.has(hash)) return cache.get(hash);
  const prompt = b.kind === "m"
    ? `Terjemahkan NILAI JSON berikut (arti kanji dari kamus KANJIDIC2). Balas JSON dengan kunci SAMA (ANGKA DALAM TANDA KUTIP GANDA, mis. "12") dan nilai terjemahannya:\n${JSON.stringify(b.input)}`
    : `Terjemahkan arti (g) tiap entri berikut; w = kata Jepang (konteks penerjemahan, JANGAN diterjemahkan), r akan diisi bacaan kana, g = arti Inggris. Balas JSON {"<i>": "<terjemahan g>"} dengan i ANGKA DALAM TANDA KUTIP GANDA:\n${JSON.stringify(b.input.map((e) => ({ i: e.i, w: e.w, r: e.r, g: e.g })))}`;
  try {
    const content = await callZai(prompt);
    const map = extractJson(content);
    // validasi: tiap kunci input harus ada di jawaban & bertipe string
    const expected = b.kind === "m" ? Object.keys(b.input) : b.input.map((e) => e.i);
    const clean = {};
    let missing = 0;
    for (const k of expected) {
      const v = map[k];
      if (typeof v === "string" && v.trim()) clean[k] = v.trim();
      else missing++;
    }
    if (missing > expected.length / 2) {
      throw new Error(`batch ${b.kind}: ${missing}/${expected.length} kunci hilang`);
    }
    cache.set(hash, clean);
    cacheStream.write(JSON.stringify({ hash, kind: b.kind, map: clean }) + "\n");
    return clean;
  } catch (e) {
    // Last resort: pecah batch jadi dua (output lebih pendek = lebih
    // sedikit peluang JSON rusak/terpotong; retry 429 juga dapat jeda).
    if (depth < 2 && b.keys.length >= 8) {
      const mid = Math.ceil(b.keys.length / 2);
      const halves = [b.keys.slice(0, mid), b.keys.slice(mid)];
      const merged = {};
      for (const half of halves) {
        const sub = b.kind === "m"
          ? { kind: "m", keys: half, input: Object.fromEntries(half.map((k, j) => [String(j), k])) }
          : { kind: "w", keys: half, input: half.map((k, j) => ({ i: String(j), w: k, r: null, g: words.get(k) })) };
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
  // Pilot: satu batch arti (awal abjad) + satu batch contoh kata.
  const selected = PILOT
    ? [batches.find((b) => b.kind === "m"), batches.find((b) => b.kind === "w")].filter(Boolean)
    : batches;
  const outMaps = { m: {}, w: {} };
  let done = 0, failed = 0;
  const queue = [...selected];
  async function worker(id) {
    while (queue.length) {
      const b = queue.shift();
      // pacing antar permintaan per worker (jaga batas rate API)
      if (done > 0) await new Promise((r) => setTimeout(r, 1200));
      try {
        const res = await translateBatch(b);
        if (PILOT) {
          console.log(`\n--- PILOT batch ${b.kind} (worker ${id}) ---`);
          const keys = b.kind === "m" ? Object.keys(b.input) : b.input.map((e) => e.i);
          for (const k of keys.slice(0, 12)) {
            const src = b.kind === "m" ? b.input[k] : b.input.find((e) => e.i === k)?.g;
            console.log(`  ${src}  ->  ${res[k] ?? "(gagal)"}`);
          }
        }
        const keys = b.kind === "m" ? Object.keys(b.input) : b.input.map((e) => e.i);
        for (const k of keys) {
          if (res[k] !== undefined) {
            const orig = b.kind === "m" ? b.input[k] : b.keys[Number(k)];
            outMaps[b.kind][orig] = res[k];
          }
        }
      } catch (e) {
        failed++;
        console.error(`  [gagal] batch ${b.kind} #${done}: ${e.message}`);
      }
      done++;
      if (done % 10 === 0) console.log(`  progres ${done}/${selected.length} (gagal ${failed})`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  const gotM = Object.keys(outMaps.m).length;
  const gotW = Object.keys(outMaps.w).length;
  console.log(`\nSelesai: arti ${gotM}/${meaningList.length}, contoh ${gotW}/${wordList.length}, batch gagal ${failed}.`);

  if (PILOT) {
    console.log("Mode pilot — output final TIDAK ditulis.");
    return;
  }
  if (gotM < meaningList.length * 0.95 || gotW < wordList.length * 0.95) {
    console.error("Cakupan < 95% — output tidak ditulis; jalankan ulang untuk melanjutkan dari cache.");
    process.exitCode = 1;
    return;
  }
  const out = {
    m: Object.fromEntries(Object.keys(outMaps.m).sort().map((k) => [k, outMaps.m[k]])),
    w: Object.fromEntries(Object.keys(outMaps.w).sort().map((k) => [k, outMaps.w[k]])),
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 0) + "\n", "utf8");
  const size = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`Tertulis: ${OUT_FILE} (${size} kB).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
