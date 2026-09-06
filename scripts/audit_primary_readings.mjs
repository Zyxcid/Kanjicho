/**
 * audit_primary_readings.mjs — VERIFIKATOR invariant `primary_readings`
 * tiap kanji terhadap contoh kata yang BENAR-BENAR ditampilkan app
 * (src/data/n*_examples.json).
 *
 * PERAN (sejak aturan ketat masuk ke pipeline): build_examples.py
 * menjalankan aturan backing ketat yang sama di tahap kedua
 * (strict_primary_pass) — audit ini bukan lagi "mekanik perbaikan"
 * melainkan TES: setelah rebuild + promosi, laporan harus GANTI (0).
 * Flag --fix tetap tersedia untuk data legacy pra-strictness.
 *
 * LATAR (temuan user, kasus 助):
 *   primary_readings 助 = [ジョ/on, すけ/kun], padahal contoh kun yang
 *   ditampilkan = 助ける (たすける). Reading すけ lolos pipeline lama lewat
 *   pencocokan SUBSTRING longgar ("すけ" ⊂ "たすける") — padahal segmen kata
 *   yang dibaca kanji 助 di 助ける adalah "たす" (dari たす.ける), bukan すけ.
 *   Hasilnya di UI: kun yang di-bold (primary) tidak nyambung dengan contoh
 *   katanya sendiri — "janggal". Aturan ketat di bawah adalah port yang
 *   sama dengan strict_primary_pass di build_examples.py (Python).
 *
 * ATURAN BACKING KETAT (cermin cara app memasangkan bacaan ↔ contoh):
 *   ON  : contoh bertipe "on" memuat kanji, dan bentuk hiragana bacaan on
 *         muncul sebagai substring dari reading contoh ATAU pola geminasi
 *         (学 がく → がっこう: "が"+"っ" prefix).
 *   KUN : strip dash dulu ("-で" suffix, "うぶ-"/"いく-" prefix — dash
 *         adalah penanda posisi, bukan kana). Contoh bertipe "kun" memuat
 *         kanji di POSISI AWAL kata, dan reading contoh diawali stem
 *         (bagian sebelum "."). Diskriminasi okurigana: sisa reading setelah
 *         stem harus diawali okurigana kata (助ける → たす.ける skor penuh,
 *         たす.かる hanya stem). Kata majemuk (時々/産毛) diterima di level
 *         stem. Kanji yang tidak di posisi awal (mis. 靴下, 一人) hanya skor
 *         longgar 1 — TETAP VALID (下 した memang dibaca した di 靴下),
 *         tidak dipakai untuk mengganti primary skor tinggi.
 *
 * MODE:
 *   node scripts/audit_primary_readings.mjs          → laporan (harusnya GANTI (0))
 *   node scripts/audit_primary_readings.mjs --fix    → tulis perbaikan ke
 *   src/data/n*.json (backup .bak dibuat sekali per file) — hanya untuk
 *   data legacy pra-strictness.
 *
 * Kebijakan perbaikan (REPLACE-ONLY, konservatif, anti-churn):
 *   - primary dengan skor < 2 DAN ada kandidat sejenis skor ≥ 2 → GANTI
 *     ke kandidat (kandidat skor tertinggi, urutan data sebagai tiebreak).
 *   - skor 2 (compound/prefix-dash) dan 3 (okurigana persis) = dua-duanya
 *     backing ketat → DIPERTAHANKAN, tidak saling diganti (anti-churn).
 *   - TIDAK ADA penghapusan: primary skor 1 yang dibacking longgar
 *     (人 ひと via 一人 ひとり) adalah data yang BENAR — hanya karena kanji
 *     tidak di posisi awal kata aturan ketat tak bisa membuktikannya.
 *   - kana baru → romaji via kanaToRomaji app (invariant test_logic.mjs).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kanaToRomaji } from "../src/lib/kana.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, "src", "data");
const LEVELS = ["n5", "n4", "n3", "n2", "n1"];
const FIX = process.argv.includes("--fix");

// ---- util kana ----

function kataToHira(s) {
  let out = "";
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    if (ch >= "ァ" && ch <= "ヿ") {
      // Katakana blok (termasuk small) → hiragana offset -0x60
      out += String.fromCodePoint(code - 0x60);
    } else {
      out += ch;
    }
  }
  return out;
}

function isKanjiChar(ch) {
  return /[\u2E80-\u2FDF\u3005\u3007\u303B\u3400-\u4DBF\u4E00-\u9FFF]/.test(ch);
}

function isKanaChar(ch) {
  return /[\u3041-\u309F\u30A1-\u30FA]/.test(ch) && ch !== "・";
}

// ---- aturan backing ----

/**
 * Skor backing ON: 2 = substring langsung ATAU pola geminasi, 0 = tidak.
 * Geminasi = bukti KETAT (Fix-8, cermin build_examples.py + mesin
 * atribusi DP audit v3): がっ membuktikan がく seperti が membuktikan ガ.
 * Skor 1 lama membuat primary geminasi-backed (列 レツ via 列車 れっしゃ)
 * bisa digulingkan kandidat substring pendek (レ ⊂ れっしゃ) —
 * kebetulan-pola, bukan segmen: れっ milik レツ, bukan レ.
 */
function onScore(onKana, examples, kanji) {
  const h = kataToHira(onKana);
  let best = 0;
  for (const ex of examples) {
    if (ex.type !== "on" || !ex.word.includes(kanji)) continue;
    const r = kataToHira(ex.reading);
    if (h && r.includes(h)) best = Math.max(best, 2);
    else if (h.length > 1 && r.startsWith(h.slice(0, -1) + "っ")) best = Math.max(best, 2);
  }
  return best;
}

/**
 * Skor backing KUN (dash di-strip dulu — penanda posisi, bukan kana):
 *   3 = stem + okurigana persis (たす.ける ↔ 助ける たすける)
 *   2 = kata majemuk / kanji tunggal, reading diawali stem (時 とき ↔ 時々;
 *       産 うぶ- ↔ 産毛 うぶげ)
 *   1 = longgar: stem cocok tapi okurigana beda, ATAU kanji bukan di awal
 *       (下 した ↔ 靴下 — VALID, cuma tak terbukti ketat)
 *   0 = tidak dibacking
 */
function kunScore(kunKana, examples, kanji) {
  const full = kataToHira(kunKana).replace(/^-+|-+$/g, "");
  const [stemRaw, okuri] = full.includes(".")
    ? [full.split(".")[0], full.split(".").slice(1).join(".")]
    : [full, null];
  const stem = stemRaw;
  if (!stem) return 0;
  let best = 0;
  for (const ex of examples) {
    if (ex.type !== "kun" || !ex.word.includes(kanji)) continue;
    const r = kataToHira(ex.reading);
    if (!ex.word.startsWith(kanji)) {
      // Kanji bukan di awal (mis. お+金): hanya longgar.
      if (stem && r.includes(stem)) best = Math.max(best, 1);
      continue;
    }
    if (!r.startsWith(stem)) continue;
    const rest = ex.word.slice(1); // okurigana kata / kanji majemuk / kosong
    if (rest === "" || !isKanaChar(rest[0])) {
      // kata majemuk (時々, 山手) atau kata satu kanji
      best = Math.max(best, 2);
      continue;
    }
    const rRest = r.slice(stem.length);
    if (okuri) {
      if (rRest.startsWith(okuri)) best = Math.max(best, 3);
      else best = Math.max(best, 1);
    } else {
      // kun standalone (すけ): reading selepas stem harus kosong —
      // kalau berlanjut ke okurigana, reading ini milik varian bertitik.
      if (rRest === "") best = Math.max(best, 3);
      else if (isKanaChar(rRest[0])) best = Math.max(best, 1);
    }
  }
  return best;
}

/** Kandidat pengganti sejenis: skor tertinggi dulu, lalu urutan data. */
function bestCandidate(readings, type, scorer, examples, kanji) {
  let best = null;
  readings.forEach((kana, idx) => {
    const score = scorer(kana, examples, kanji);
    if (score < 2) return; // pengganti harus backing ketat
    if (!best || score > best.score) best = { kana, idx, score };
  });
  return best;
}

// ---- audit ----

const report = [];
let fixedTotal = 0;

for (const lvl of LEVELS) {
  const kanjiPath = path.join(DATA, `${lvl}.json`);
  const exPath = path.join(DATA, `${lvl}_examples.json`);
  const kanjiList = JSON.parse(fs.readFileSync(kanjiPath, "utf8"));
  const examplesMap = JSON.parse(fs.readFileSync(exPath, "utf8"));

  let fixedInFile = 0;
  for (const entry of kanjiList) {
    const kanji = entry.kanji;
    const primaries = entry.primary_readings || [];
    if (primaries.length === 0) continue;
    const examples = examplesMap[kanji] || [];
    if (examples.length === 0) continue; // tanpa contoh → pipeline biarkan apa adanya

    const onList = entry.readings?.on || [];
    const kunList = entry.readings?.kun || [];

    let changed = false;
    const newPrimaries = [];

    for (const p of primaries) {
      const scorer = p.type === "on" ? onScore : kunScore;
      const readingList = p.type === "on" ? onList : kunList;
      const score = scorer(p.kana, examples, kanji);
      if (score >= 2) {
        newPrimaries.push(p); // backing ketat — pertahankan (2 & 3 setara)
        continue;
      }

      // Skor 0/1: ganti BILA ada kandidat ketat sejenis. Tanpa kandidat →
      // primary tetap (skor-1 longgar umumnya benar, lihat header). Tidak
      // ada jalur penghapusan.
      const candidate = bestCandidate(readingList, p.type, scorer, examples, kanji);
      if (!candidate) {
        newPrimaries.push(p);
        report.push({
          level: lvl.toUpperCase(),
          kanji,
          type: p.type,
          old: p.kana,
          oldScore: score,
          kept: true,
          examples: examples.map((e) => `${e.word}(${e.reading})`),
        });
        continue;
      }

      report.push({
        level: lvl.toUpperCase(),
        kanji,
        type: p.type,
        old: p.kana,
        oldScore: score,
        new: candidate.kana,
        newScore: candidate.score,
        examples: examples.map((e) => `${e.word}(${e.reading})`),
      });

      newPrimaries.push({
        kana: candidate.kana,
        romaji: kanaToRomaji(candidate.kana),
        type: p.type,
      });
      changed = true;
    }

    if (changed) {
      fixedInFile += 1;
      entry.primary_readings = newPrimaries;
    }
  }

  if (FIX && fixedInFile > 0) {
    const bak = `${kanjiPath}.bak`;
    if (!fs.existsSync(bak)) fs.copyFileSync(kanjiPath, bak);
    fs.writeFileSync(kanjiPath, JSON.stringify(kanjiList, null, 2) + "\n", "utf8");
  }
  fixedTotal += fixedInFile;
}

// ---- laporan ----

const replaced = report.filter((r) => r.new);
const keptLoose = report.filter((r) => r.kept);

console.log(`\n=== AUDIT PRIMARY READINGS (${FIX ? "FIX MODE" : "REPORT ONLY"}) ===`);
console.log(`Diperiksa: backing tiap primary terhadap contoh katanya.\n`);

console.log(`-- GANTI (${replaced.length}) — primary tak dibacking ketat, ada kandidat ketat --`);
for (const r of replaced) {
  console.log(
    `  ${r.kanji} [${r.level}] ${r.type}: ${r.old} (skor ${r.oldScore}) → ${r.new} (skor ${r.newScore})  contoh: ${r.examples.join(", ")}`
  );
}
console.log(`\n-- DIPERTAHANKAN, backing longgar (${keptLoose.length}) — valid tapi tak terbukti ketat (suffix/compound), TIDAK diubah --`);
for (const r of keptLoose.slice(0, 12)) {
  console.log(
    `  ${r.kanji} [${r.level}] ${r.type}: ${r.old} (skor ${r.oldScore})  contoh: ${r.examples.join(", ")}`
  );
}
if (keptLoose.length > 12) console.log(`  … dan ${keptLoose.length - 12} lainnya`);
console.log(`\nTotal kanji diubah: ${fixedTotal}${FIX ? " (ditulis ke src/data)" : " (mode laporan — jalankan --fix untuk menerapkan)"}`);
