import React from "react";
import { Copy } from "lucide-react";
import { useCopy } from "../lib/useCopy.js";
import { t } from "../lib/i18n.js";

// CopyKanji — tombol transparan yang menutupi SELURUH kotak goresan
// (.kd-stroke-box) di modal Browse: klik di mana pun pada kotak =
// salin karakter kanji ke clipboard. Dipakai StrokePlayer (kotak
// animasi) dan branch loading/fallback Browse — jadi perilaku kotak
// konsisten di semua state.
//
// Kenapa tombol overlay, bukan menjadikan kotak sendiri <button>:
// SVG animasi di dalamnya sudah punya semantik role="img" (label
// "Stroke order animation, N strokes") yang harus utuh; tombol
// transparan di atasnya memberi interaksi klik + focus + Enter/Space
// gratis dari elemen <button> native tanpa mengubah makna SVG.
//
// Feedback: pil kecil "Copied <kanji>" muncul sekejap di sudut
// kiri-atas kotak (role="status" → dibacakan screen reader). Toast
// global sengaja tidak dipakai — konfirmasi tepat di kotak yang
// diklik lebih jelas daripada pesan di dasar layar. Ikon Copy di
// sudut kanan-atas jadi petunjuk afordansi: redup saat idle,
// jelas saat hover/fokus kotak.
export default function CopyKanji({ kanji }) {
  const { copied, copy } = useCopy();

  return (
    <>
      <button
        type="button"
        className="kd-stroke-copy"
        onClick={() => copy(kanji)}
        aria-label={t("copy.aria", { kanji })}
        title={t("copy.title", { kanji })}
      >
        <Copy className="kd-copy-icon" size={13} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {copied && (
        <span className="kd-copy-note" role="status" aria-live="polite">
          {t("copy.done", { kanji })}
        </span>
      )}
    </>
  );
}
