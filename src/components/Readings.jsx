import React from "react";
import { kanaToRomaji } from "../lib/kana.js";

/**
 * ReadingList — render daftar bacaan On'yomi / Kun'yomi, dengan bacaan
 * PRIMARY (sumber soal kuis, lihat `primary_readings` dari
 * build_examples.py) di-bold.
 *
 * Prop `script` mengikuti toggle あ/Aa di layar kuis:
 *  - "kana" (default): kana apa adanya (dipakai modal Browse & mode kana).
 *  - "romaji": bacaan primary memakai `p.romaji` LANGSUNG dari data — string
 *    yang sama persis dengan label jawaban kuis; sisanya dikonversi runtime
 *    via kanaToRomaji().
 *
 * SELURUH output dibungkus satu <span class="kd-yomi-value">: baris induknya
 * (.kd-yomi-row) adalah kontainer FLEX — kalau bacaan dirender sebagai
 * fragment lepas, tiap bacaan + separator jadi item flex SENDIRI yang
 * menyusut ke lebar 1 karakter kana saat baris sempit (kana tampil tumpuk
 * vertikal). Satu span = satu item flex, teks mengalir & wrap normal.
 */
export function ReadingList({ readings, primaryReadings, type, script = "kana" }) {
  // Kana primary bertipe `type` saja — supaya bacaan on tidak ikut di-bold
  // di baris kun (dan sebaliknya).
  const primaries = (primaryReadings || []).filter((p) => p.type === type);
  const primaryKana = new Set(primaries.map((p) => p.kana));
  // kana → romaji (string pipeline) supaya bold romaji == romaji pilihan kuis.
  const primaryRomaji = new Map(primaries.map((p) => [p.kana, p.romaji]));

  const showRomaji = script === "romaji";
  const separator = showRomaji ? ", " : "、";

  return (
    <span className="kd-yomi-value">
      {readings.map((r, i) => {
        const isPrimary = primaryKana.has(r);
        const text = showRomaji
          ? isPrimary
            ? primaryRomaji.get(r) ?? kanaToRomaji(r)
            : kanaToRomaji(r)
          : r;
        return (
          <React.Fragment key={r}>
            {i > 0 && separator}
            {isPrimary ? <b className="kd-yomi-primary">{text}</b> : text}
          </React.Fragment>
        );
      })}
    </span>
  );
}
