import React from "react";
import { kanaToRomaji } from "../lib/kana.js";
// (t96) Arti & gloss contoh mengikuti bahasa UI (overlay id_gloss);
// (t107) kalimat contoh juga — id native/LLM bila ada, fallback EN.
// (t108) furigana: field `furi` [[start, len, kana], …] diprakompute
// scripts/build_furigana.py (MeCab/unidic build-time); UI hanya render
// <ruby> — tanpa tokenisasi runtime, aplikasi tetap offline-ringan.
import { useIdData, localizedGloss } from "../lib/idData.jsx";

/**
 * ExampleList — daftar contoh kata satu kanji (t107), dipakai bersama oleh
 * panel reveal Quiz, modal Browse, dan KanjiDetailSheet (markup duplikat
 * tiga tempat sebelumnya kini satu komponen).
 *
 * Tiap baris: tag On/Kun + kata + bacaan (ikut skrip toggle) + arti
 * (overlay ID). Bila entri membawa `sent` (kalimat contoh Tatoeba dari
 * n*_sentences.json via dataLoader), kalimat dirender di bawah baris kata
 * dengan kata target DI-HIGHLIGHT (posisi dipracompute pipeline — `pos`
 * array indeks kemunculan batas-bersih; UI tinggal slice, tanpa logika
 * batas kanji di JS) + terjemahan mengikuti bahasa UI (id bila ada,
 * fallback en — konvensi overlay).
 *
 * (t108) `furigana` (default true): gerbang global App (tombol topbar ふ)
 * menyembunyikan ruby tanpa mengubah data. SentenceLine memotong kalimat
 * jadi ATOM di perpotongan batas kata target (pos) dan run furigana
 * (furi) — tiap atom: teks + hl + ruby opsional; run berurutan se-hl
 * digabung dalam SATU <mark> agar warna highlight menyambung rapi.
 */
function SentenceLine({ word, sent, furigana = true }) {
  const idData = useIdData();
  if (!sent || !sent.jp || !Array.isArray(sent.pos) || sent.pos.length === 0) {
    return null;
  }
  const jp = sent.jp;
  // Validasi ringan run furi (bentuk & rentang) — data pipeline sudah
  // diuji scripts/test_sentences.mjs; gerbang ini cuma anti-bentuk-lain.
  const runs = [];
  if (furigana && Array.isArray(sent.furi)) {
    for (const r of sent.furi) {
      if (
        Array.isArray(r) && r.length === 3 &&
        Number.isInteger(r[0]) && Number.isInteger(r[1]) &&
        r[0] >= 0 && r[1] > 0 && r[0] + r[1] <= jp.length &&
        typeof r[2] === "string" && r[2]
      ) {
        runs.push({ s: r[0], e: r[0] + r[1], kana: r[2] });
      }
    }
  }
  // Titik potong: tepi kalimat + batas kata target + batas run ruby.
  const cuts = new Set([0, jp.length]);
  for (const p of sent.pos) {
    cuts.add(p);
    cuts.add(p + word.length);
  }
  for (const r of runs) {
    cuts.add(r.s);
    cuts.add(r.e);
  }
  const points = [...cuts].sort((a, b) => a - b);
  // Atom = potongan terkecil; atom tak pernah melintasi batas kata/run
  // karena tepinya semua jadi titik potong.
  const atoms = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const s = points[i];
    const e = points[i + 1];
    if (e <= s) continue;
    const hl = sent.pos.some((p) => s >= p && e <= p + word.length);
    const run = runs.find((r) => s >= r.s && e <= r.e) || null;
    atoms.push({ text: jp.slice(s, e), hl, ruby: run ? run.kana : null });
  }
  // Render: kelompokkan atom berurutan se-hl dalam satu <mark>; di
  // dalamnya atom ber-ruby jadi <ruby>…<rt>…</rt></ruby>.
  const parts = [];
  let i = 0;
  while (i < atoms.length) {
    const hl = atoms[i].hl;
    let j = i;
    while (j < atoms.length && atoms[j].hl === hl) j++;
    const inner = atoms.slice(i, j).map((a, k) =>
      a.ruby
        ? <ruby key={k}>{a.text}<rt>{a.ruby}</rt></ruby>
        : <React.Fragment key={k}>{a.text}</React.Fragment>
    );
    parts.push(
      hl
        ? <mark key={i} className="kd-sent-hl">{inner}</mark>
        : <React.Fragment key={i}>{inner}</React.Fragment>
    );
    i = j;
  }
  // Terjemahan: ID bila bahasa UI id DAN tersedia; selain itu EN.
  const tr = idData && sent.id ? sent.id : sent.en;
  return (
    <div className="kd-example-sent">
      <span className={runs.length ? "kd-sent-jp has-furi" : "kd-sent-jp"}>
        {parts}
      </span>
      {tr ? <span className="kd-sent-tr">{tr}</span> : null}
    </div>
  );
}

export default function ExampleList({ examples, script, furigana = true }) {
  // Hook di level komponen (bukan dalam map) — Rules of Hooks.
  const idData = useIdData();
  if (!examples || examples.length === 0) return null;
  return (
    <div className="kd-examples">
      {examples.map((ex) => (
        <div key={ex.word} className="kd-example-item">
          <span className={`kd-yomi-tag ${ex.type} small`}>{ex.type === "on" ? "On" : "Kun"}</span>
          <span className="kd-example-word">{ex.word}</span>
          <span className="kd-example-reading">
            {script === "romaji" ? kanaToRomaji(ex.reading) : ex.reading}
          </span>
          <span className="kd-example-meaning">{localizedGloss(ex, idData)}</span>
          <SentenceLine word={ex.word} sent={ex.sent} furigana={furigana} />
        </div>
      ))}
    </div>
  );
}
