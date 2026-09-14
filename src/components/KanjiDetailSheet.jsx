import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { loadStrokePaths } from "../lib/strokes.js";
import { ReadingList } from "./Readings.jsx";
import StrokePlayer from "./StrokePlayer.jsx";
import { kanaToRomaji } from "../lib/kana.js";
// (t96) Arti & gloss contoh mengikuti bahasa UI (overlay id_gloss).
import { useIdData, localizedMeanings, localizedGloss } from "../lib/idData.jsx";

/**
 * KanjiDetailSheet — modal detail satu kanji: animasi urutan goresan
 * (data KanjiVG) dengan kontrol lengkap, arti, bacaan On/Kun (primary
 * di-bold), dan contoh kata.
 *
 * Dibuka lewat ikon pena kecil di pojok kotak genkō-yōshi layar kuis
 * (sejak t83 animasi goresan di layar kuis diputar di glyph kecil
 * punggung kartu — lihat RevealGlyph.jsx; modal Browse memuat versi
 * detailnya sendiri, komponen ini dipertahankan sebagai cadangan).
 * Pakai class modal yang sama dengan modal lain (.kd-modal-overlay) —
 * otomatis ikut "mengunci" shortcut keyboard layar kuis selama terbuka
 * (Quiz.jsx dan App.jsx keduanya mengecek keberadaan overlay).
 *
 * `script` mengikuti toggle あ/Aa global — bacaan dan reading contoh kata
 * berganti live seperti di layar kuis.
 */
export default function KanjiDetailSheet({ entry, script = "romaji", onClose }) {
  // (t96) Peta gloss Indonesia aktif — null bila bahasa UI bukan id.
  const idData = useIdData();
  // Data goresan: null = sedang dimuat, [] = tidak ada (fallback glyph),
  // array = render StrokePlayer. Cache loader membuat pembukaan kedua
  // untuk level yang sama instan.
  const [paths, setPaths] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPaths(null);
    // (t96) Per-kanji: level terpecah (N1) hanya mengunduh satu sub-chunk.
    loadStrokePaths(entry.level, entry.kanji).then((p) => {
      if (!cancelled) setPaths(p);
    });
    return () => {
      cancelled = true;
    };
  }, [entry.kanji, entry.level]);

  // Escape menutup sheet (backdrop dan tombol X juga).
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const strokeCount = paths && paths.length ? paths.length : entry.stroke_count;

  return (
    <div className="kd-modal-overlay" onClick={onClose}>
      <div className="kd-modal kd-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="kd-modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="kd-detail-grid">
          {/* Kolom animasi — estetika kotak genkō-yōshi, seperti glyph kuis. */}
          <div className="kd-detail-stroke">
            {paths === null ? (
              <div className="kd-stroke-box">
                <div className="kd-stroke-loading">…</div>
              </div>
            ) : paths.length > 0 ? (
              <StrokePlayer paths={paths} />
            ) : (
              <div className="kd-stroke-box">
                <div className="kd-stroke-fallback">{entry.kanji}</div>
              </div>
            )}
            {strokeCount != null && (
              <div className="kd-detail-strokes">
                {strokeCount} {strokeCount === 1 ? "stroke" : "strokes"}
              </div>
            )}
          </div>

          {/* Kolom informasi — komponen yang sama dengan panel reveal kuis.
              Head cukup MEANING saja: kanjinya sudah tampil besar (dan
              dianimasikan) di kolom kiri — tampilkan lagi di head hanya
              duplikat. */}
          <div className="kd-detail-info">
            <div className="kd-detail-head">
              <span className="kd-detail-meaning">{localizedMeanings(entry, idData).join(", ")}</span>
            </div>
            <div className="kd-reveal-yomi">
              {entry.readings.on.length > 0 && (
                <div className="kd-yomi-row">
                  <span className="kd-yomi-tag on">On&apos;yomi</span>
                  <ReadingList readings={entry.readings.on} primaryReadings={entry.primary_readings} type="on" script={script} />
                </div>
              )}
              {entry.readings.kun.length > 0 && (
                <div className="kd-yomi-row">
                  <span className="kd-yomi-tag kun">Kun&apos;yomi</span>
                  <ReadingList readings={entry.readings.kun} primaryReadings={entry.primary_readings} type="kun" script={script} />
                </div>
              )}
            </div>
            <div className="kd-browse-modal-meta">
              <span className="kd-yomi-tag kd-yomi-tag-indigo">{entry.level}</span>
              <span>{entry.unit}</span>
            </div>
            {entry.examples.length > 0 && (
              <div className="kd-examples">
                {entry.examples.map((ex) => (
                  <div key={ex.word} className="kd-example-item">
                    <span className={`kd-yomi-tag ${ex.type} small`}>{ex.type === "on" ? "On" : "Kun"}</span>
                    <span className="kd-example-word">{ex.word}</span>
                    <span className="kd-example-reading">
                      {script === "romaji" ? kanaToRomaji(ex.reading) : ex.reading}
                    </span>
                    <span className="kd-example-meaning">{localizedGloss(ex, idData)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* KanjiVG wajib diatribusikan (CC BY-SA 3.0) — ditampilkan di
            setiap sheet, bukan cuma di halaman About/Help. */}
        <div className="kd-stroke-attribution">
          Stroke order data ©{" "}
          <a href="http://kanjivg.tagaini.net/" target="_blank" rel="noreferrer">
            KanjiVG
          </a>{" "}
          · CC BY-SA 3.0
        </div>
      </div>
    </div>
  );
}
