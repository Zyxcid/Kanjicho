import React from "react";
import { t } from "../lib/i18n.js";

/**
 * ScriptToggle (t80) — toggle kana ↔ romaji, kini di TOPBAR sehingga
 * berlaku UNIVERSAL: label pilihan kuis, reading sheet di belakang kartu,
 * modal Browse, dan reading contoh kata semuanya mengikuti SATU gerbang
 * ini. Sebelumnya toggle hidup di dua tempat di dalam kartu kuis (pojok
 * kanan-atas sisi depan + baris kepala reading sheet) dan Browse punya
 * baris Romaji terpisah — pindah ke topbar menyatukan semua itu (baris
 * Romaji Browse pensiun; state tetap dikelola App: localStorage
 * "kanji-answer-script").
 * (t81) Posisi DI TENGAH antara tombol Help dan toggle tema (permintaan
 * user: "pindahkan toggle kana/romaji ke tengah help button dan theme").
 *
 * (t90) Penampilan: lingkaran ikon 36px — SATU keluarga bentuk dengan
 * tombol Help dan toggle tema di topbar (dulu pill persegi yang bentuk
 * dan lebarnya beda dari tetangganya), tetap sengaja TANPA indikator
 * on/off berwarna — labelnya sendiri (あ saat mode kana, Aa
 * saat romaji) adalah statusnya; mode aktif diumumkan lewat aria-pressed
 * untuk pembaca layar. Shortcut dev "r" (layar kuis) tetap men-toggle
 * state yang sama.
 */
export default function ScriptToggle({ answerScript, onToggleScript }) {
  const kana = answerScript === "kana";
  return (
    <button
      type="button"
      className="kd-script-toggle"
      onClick={onToggleScript}
      title={kana ? t("script.romaji.title") : t("script.kana.title")}
      aria-label={kana ? t("script.romaji.aria") : t("script.kana.aria")}
      aria-pressed={kana}
    >
      {kana ? "あ" : "Aa"}
    </button>
  );
}
