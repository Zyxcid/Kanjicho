import React, { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, StepBack, StepForward } from "lucide-react";
import CopyKanji from "./CopyKanji.jsx";

/**
 * StrokePlayer — animasi urutan goresan satu kanji dari data path KanjiVG.
 *
 * Rendering dua lapis (viewBox KanjiVG 0 0 109 109):
 *  - lapis "guide": semua goresan samar (kertas latihan menulis).
 *  - lapis "ink": goresan yang sudah "ditulis" — tiap path diberi
 *    pathLength={1} lalu stroke-dasharray:1 dan dashoffset 1→0, jadi
 *    goresan TERGAMBAR dari ujung ke ujung lewat transisi CSS (efek pena),
 *    bukan sekadar muncul.
 *
 * Kontrol: play/pause, replay, maju/mundur satu goresan, dan kecepatan
 * (0.5x / 1x / 2x). Label "n / N strokes" di bawah kontrol adalah
 * penghitung live — angka mengikuti animasi (goresan keberapa yang
 * sedang/baru saja tergambar); label ini dipakai bersama modal Browse
 * (lihat .kd-detail-strokes di global.css). Tanpa library animasi —
 * timer + transisi CSS saja.
 *
 * Kotak goresan (kd-stroke-box) bisa DIKLIK untuk menyalin karakter
 * kanji ke clipboard (CopyKanji — tombol transparan menutupi kotak,
 * konfirmasi pil "Copied <kanji>"; prop `kanji` wajib untuk itu).
 */

// Durasi dasar satu goresan sebelum goresan berikutnya mulai. Dirasa
// "kecepatan menulis santai" pada speed 1x.
const BASE_STROKE_MS = 620;

const SPEEDS = [0.5, 1, 2];

export default function StrokePlayer({ paths, kanji, onStrokeChange }) {
  const [revealed, setRevealed] = useState(0); // jumlah goresan yang sudah tergambar
  const [playing, setPlaying] = useState(true); // auto-play saat pertama kali dibuka
  const [speed, setSpeed] = useState(1);

  // Ganti data kanji (komponen dipakai ulang) → animasi mulai dari awal.
  useEffect(() => {
    setRevealed(0);
    setPlaying(true);
  }, [paths]);

  // Mesin play: maju satu goresan tiap (durasi dasar / speed). Selesai
  // semua goresan → berhenti (tombol Play berubah jadi Replay).
  useEffect(() => {
    if (!playing || revealed >= paths.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), BASE_STROKE_MS / speed);
    return () => clearTimeout(t);
  }, [playing, revealed, speed, paths]);

  // Lapor progres goresan (jumlah goresan selesai) ke pemanggil — dipakai
  // Browse.jsx untuk men-highlight chip komponen yang goresannya sedang
  // digambar (ComponentBreakdown di bawah player ini). Ref supaya identitas
  // callback yang berubah tiap render tidak memicu ulang efek.
  const strokeCbRef = useRef(onStrokeChange);
  strokeCbRef.current = onStrokeChange;
  useEffect(() => {
    strokeCbRef.current?.(revealed);
  }, [revealed]);

  const done = revealed >= paths.length;

  function replay() {
    setRevealed(0);
    setPlaying(true);
  }

  function togglePlay() {
    if (done) {
      replay();
      return;
    }
    setPlaying((p) => !p);
  }

  function step(delta) {
    setPlaying(false);
    setRevealed((r) => Math.min(paths.length, Math.max(0, r + delta)));
  }

  return (
    <div className="kd-stroke-player">
      <div className="kd-stroke-box">
        <svg
          className="kd-stroke-svg"
          viewBox="0 0 109 109"
          role="img"
          aria-label={`Stroke order animation, ${paths.length} strokes`}
        >
          {/* Lapis guide: kerangka samar seluruh kanji. */}
          <g className="kd-stroke-guide" aria-hidden="true">
            {paths.map((d, i) => (
              <path key={`g${i}`} d={d} />
            ))}
          </g>
          {/* Lapis ink: goresan yang sudah ditulis, tergambar urut. */}
          {paths.map((d, i) => (
            <path
              key={i}
              d={d}
              pathLength={1}
              className="kd-stroke-ink"
              style={{ strokeDasharray: 1, strokeDashoffset: i < revealed ? 0 : 1 }}
            />
          ))}
        </svg>
        {/* Klik kotak = salin kanji (tombol transparan + pil konfirmasi —
            lihat CopyKanji.jsx). SVG animasi di bawahnya tetap non-interaktif
            dan semantiknya utuh. */}
        {kanji && <CopyKanji kanji={kanji} />}
      </div>

      <div className="kd-stroke-controls">
        <button className="kd-stroke-ctrl-btn" onClick={replay} aria-label="Replay stroke animation" title="Replay">
          <RotateCcw size={14} strokeWidth={2.25} />
        </button>
        <button
          className="kd-stroke-ctrl-btn"
          onClick={togglePlay}
          aria-label={done ? "Replay" : playing ? "Pause" : "Play"}
          title={done ? "Replay" : playing ? "Pause" : "Play"}
        >
          {done || !playing ? <Play size={14} strokeWidth={2.25} /> : <Pause size={14} strokeWidth={2.25} />}
        </button>
        <button className="kd-stroke-ctrl-btn" onClick={() => step(-1)} disabled={revealed === 0} aria-label="Previous stroke" title="Previous stroke">
          <StepBack size={14} strokeWidth={2.25} />
        </button>
        <button
          className="kd-stroke-ctrl-btn"
          onClick={() => step(1)}
          disabled={done}
          aria-label="Next stroke"
          title="Next stroke"
        >
          <StepForward size={14} strokeWidth={2.25} />
        </button>
        <button
          className="kd-stroke-ctrl-btn kd-stroke-speed"
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
          aria-label={`Animation speed ${speed}x`}
          title="Animation speed"
        >
          {speed}x
        </button>
      </div>

      {/* Penghitung goresan (dulu .kd-stroke-counter di baris kontrol)
          digabung ke label .kd-detail-strokes: "2 / 4 strokes" hidup
          mengikuti animasi, memberi tahu goresan keberapa sekarang. */}
      <div className="kd-detail-strokes">
        {revealed} / {paths.length} {paths.length === 1 ? "stroke" : "strokes"}
      </div>
    </div>
  );
}
