import React from "react";
import { t } from "../lib/i18n.js";

/**
 * FuriganaToggle (t108) — toggle tampil/sembunyi furigana kalimat contoh,
 * di topbar BERSAMA toggle skrip (あ/Aa) dan tema — mengikuti pola
 * ScriptToggle: lingkaran ikon 36px, label "ふ" konstan (kana pertama
 * ふりがな — bahasanya Jepang di kedua bahasa UI karena istilah
 * belajar-kanji), status diumumkan lewat aria-pressed + title, TANPA
 * indikator on/off berwarna. Satu gerbang global App (state
 * localStorage "kanji-sent-furigana", default NYALA) — berlaku untuk
 * panel reveal Quiz, modal Browse, dan KanjiDetailSheet sekaligus.
 *
 * Data ruby tidak pernah dibuang: menyembunyikan hanya berhenti
 * merender <rt> — field `furi` tetap di n*_sentences.json.
 */
export default function FuriganaToggle({ furigana, onToggleFurigana }) {
  return (
    <button
      type="button"
      className="kd-script-toggle"
      onClick={onToggleFurigana}
      title={furigana ? t("furigana.off.title") : t("furigana.on.title")}
      aria-label={furigana ? t("furigana.off.aria") : t("furigana.on.aria")}
      aria-pressed={furigana}
    >
      ふ
    </button>
  );
}
