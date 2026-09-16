#!/usr/bin/env node
/**
 * test_sentences.mjs — integritas data kalimat contoh (t107; furi t108).
 *
 * Memeriksa src/data/n*_sentences.json terhadap n*_examples.json:
 *   1. Setiap kunci file kalimat adalah kata contoh level itu.
 *   2. `pos` valid: slice jp di posisi itu == kata, dan karakter
 *      SEBELUM/SESUDAH bukan kanji (batas bersih — jaminan highlight
 *      tidak salah ke dalam compound, port aturan build_sentences.py).
 *   3. Panjang kalimat wajar (≤ 45), en/id non-kosong, pos ≥ 1 & naik urut.
 *   4. `furi` valid (t108): [start, len, kana] — naik urut, tak
 *      tumpang-tindih, dalam rentang, slice ber-kanji, kana hiragana+ー
 *      bersih (hasil konversi build_furigana.py — tanpa katakana/latin).
 *   5. Statistik coverage per level (kata terlayani vs total).
 *
 * Jalankan: node scripts/test_sentences.mjs  (dipanggil `npm test`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEVELS = ["n5", "n4", "n3", "n2", "n1"];

// Karakter kanji (sama dengan select_sentences.py; ditulis eksplisit
// tanpa regex literal \uXXXX agar mudah dibaca).
const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〆]/;
const isKanji = (ch) => KANJI_RE.test(ch);
// Kana ruby hasil build_furigana.py: hiragana + chōonpu (katakana sudah
// dikonversi; katakana murni / latin / simbol = data kotor).
const HIRA_OK_RE = /^[ぁ-ゖー]+$/;

let failures = 0;
const fail = (msg) => { failures++; console.error("  [GAGAL] " + msg); };

for (const lv of LEVELS) {
  const sentences = JSON.parse(readFileSync(join(ROOT, "src/data", `${lv}_sentences.json`), "utf8"));
  const examples = JSON.parse(readFileSync(join(ROOT, "src/data", `${lv}_examples.json`), "utf8"));
  const words = new Set();
  for (const arr of Object.values(examples)) for (const e of arr) words.add(e.word);

  let served = 0, withId = 0, withFuri = 0, furiRuns = 0;
  for (const [word, e] of Object.entries(sentences)) {
    // 1. kata harus milik contoh level ini
    if (!words.has(word)) fail(`${lv}: kunci "${word}" bukan kata contoh level ini`);
    if (typeof e.jp !== "string" || e.jp.length < 4) fail(`${lv}/${word}: jp hilang/terlalu pendek`);
    if (e.jp.length > 45) fail(`${lv}/${word}: jp ${e.jp.length} char (> 45)`);
    if (typeof e.en !== "string" || !e.en.trim()) fail(`${lv}/${word}: en kosong`);
    if (e.id && !e.id.trim()) fail(`${lv}/${word}: id kosong (hapus field-nya bila tak ada)`);
    if (e.id) withId++;
    if (!Array.isArray(e.pos) || e.pos.length === 0) {
      fail(`${lv}/${word}: pos kosong`);
      continue;
    }
    let prev = -1;
    for (const p of e.pos) {
      if (!Number.isInteger(p) || p < 0 || p + word.length > e.jp.length) {
        fail(`${lv}/${word}: pos ${p} di luar rentang`);
        continue;
      }
      if (p <= prev) fail(`${lv}/${word}: pos tidak naik/duplikat (${p} setelah ${prev})`);
      prev = p;
      if (e.jp.slice(p, p + word.length) !== word) {
        fail(`${lv}/${word}: slice di pos ${p} ≠ kata`);
      }
      const before = p > 0 ? e.jp[p - 1] : null;
      const after = p + word.length < e.jp.length ? e.jp[p + word.length] : null;
      if ((before !== null && isKanji(before)) || (after !== null && isKanji(after))) {
        fail(`${lv}/${word}: kemunculan di pos ${p} menempel kanji (batas tidak bersih)`);
      }
    }
    // 4. furigana (t108) — struktur & kebersihan; port validator
    // build_furigana.py (naik urut, tak tumpang-tindih, kanji dalam slice,
    // kana hiragana+ー). Kalimat TANPA kanji boleh tanpa furi.
    if (Array.isArray(e.furi)) {
      let prevEnd = -1;
      for (const r of e.furi) {
        if (!Array.isArray(r) || r.length !== 3) {
          fail(`${lv}/${word}: furi run bukan [start, len, kana]`);
          continue;
        }
        const [s, len, kana] = r;
        if (!Number.isInteger(s) || !Number.isInteger(len) || s < 0 || len <= 0 || s + len > e.jp.length) {
          fail(`${lv}/${word}: furi run [${s},${len}] di luar rentang`);
          continue;
        }
        if (s < prevEnd) fail(`${lv}/${word}: furi run start ${s} < akhir run sebelumnya ${prevEnd} (tumpang-tindih/urutan)`);
        prevEnd = s + len;
        const slice = e.jp.slice(s, s + len);
        if (![...slice].some(isKanji)) fail(`${lv}/${word}: furi run "${slice}" tanpa kanji`);
        if (typeof kana !== "string" || !HIRA_OK_RE.test(kana)) {
          fail(`${lv}/${word}: kana ruby "${kana}" bukan hiragana+ー bersih`);
        }
        furiRuns++;
      }
      withFuri++;
    } else if ([...e.jp].some(isKanji)) {
      fail(`${lv}/${word}: kalimat ber-kanji tanpa field furi`);
    }
    served++;
  }
  const pct = (100 * served / words.size).toFixed(1);
  console.log(`${lv.toUpperCase()}: ${served}/${words.size} kata (${pct}%) — ${withId} terjemahan ID — ${withFuri} furigana (${furiRuns} run)`);
}

if (failures > 0) {
  console.error(`\n${failures} pelanggaran — data kalimat TIDAK lolos.`);
  process.exit(1);
}
console.log("\nSemua data kalimat lolos validasi.");
