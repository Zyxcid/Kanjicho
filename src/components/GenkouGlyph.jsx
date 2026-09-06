import React, { useEffect, useState } from "react";
import { loadStrokes } from "../lib/strokes.js";

// Durasi dasar satu goresan — sama dengan default StrokePlayer (speed 1x),
// supaya rasa animasinya identik di kotak genkō dan di modal Browse.
const BASE_STROKE_MS = 620;

/**
 * GenkouGlyph — tombol glyph kanji di kotak genkō-yōshi layar kuis.
 *
 * Glyph SELALU dirender sebagai SVG KanjiVG dalam keadaan SELESAI (semua
 * goresan sudah tergambar) sejak soal muncul — bukan glyph teks font —
 * supaya bentuknya konsisten sebelum dan sesudah animasi (tidak ada
 * "ganti font" saat diklik). Data goresan untuk level soal dimuat
 * otomatis (lazy, cache per level di lib/strokes.js).
 *
 * DIKLIK KIRI → animasi urutan goresan diputar LANGSUNG di dalam kotak
 * ini (bukan overlay): mulai dari kosong, satu goresan per
 * BASE_STROKE_MS, selesai berhenti di glyph penuh. Klik lagi = putar
 * ulang. Tanpa kontrol kecepatan (default 1x).
 *
 * DIKLIK KANAN → animasi LANGSUNG DISELESAIKAN: mesin play dihentikan
 * dan semua goresan muncul seketika (skip, tanpa memutar sisanya satu
 * per satu). Menu konteks browser sengaja dicegah supaya klik kanan
 * selalu berarti "selesaikan sekarang" di kotak ini.
 *
 * Saat pertama kali masuk sebuah level, chunk data diunduh sesaat —
 * glyph teks font tampil sebagai placeholder sampai data tiba, lalu
 * diganti SVG selesai (kotak tidak pernah kosong). Kalau data goresan
 * tidak tersedia (fallback; saat ini 0 kanji — build memverifikasi
 * coverage), glyph teks tetap tampil dan klik tidak melakukan apa-apa.
 *
 * Soal berganti → Quiz.jsx memberi key={kanji} sehingga komponen ini
 * di-remount per soal; reset render di bawah adalah jaring pengaman
 * kalau komponen dipakai tanpa key.
 */
export default function GenkouGlyph({ kanji, level }) {
  // undefined = chunk belum selesai (placeholder teks), null = sedang
  // dimuat, [] = tidak ada data KanjiVG, array = siap dirender.
  const [paths, setPaths] = useState(undefined);
  const [revealed, setRevealed] = useState(0); // jumlah goresan tergambar
  const [playing, setPlaying] = useState(false);

  // Jaring pengaman tanpa key: prop kanji berganti → reset saat render.
  const [mountedKanji, setMountedKanji] = useState(kanji);
  if (kanji !== mountedKanji) {
    setMountedKanji(kanji);
    setPaths(undefined);
    setRevealed(0);
    setPlaying(false);
  }

  // Muat data goresan SEJAK SOAL MUNCUL, lalu tampilkan dalam keadaan
  // selesai (revealed = semua goresan) — klik baru memutar animasi.
  useEffect(() => {
    let cancelled = false;
    loadStrokes(level).then((map) => {
      if (cancelled) return;
      const p = map[kanji] || [];
      setPaths(p);
      setRevealed(p.length);
    });
    return () => {
      cancelled = true;
    };
  }, [level, kanji]);

  // Mesin play — identik dengan StrokePlayer.jsx, speed tetap default.
  useEffect(() => {
    if (!playing || !Array.isArray(paths) || revealed >= paths.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), BASE_STROKE_MS);
    return () => clearTimeout(t);
  }, [playing, revealed, paths]);

  function handleClick() {
    // Selama loading atau tanpa data: tidak ada yang bisa dianimasikan.
    if (!Array.isArray(paths) || paths.length === 0) return;
    // Putar ulang dari goresan pertama (termasuk saat animasi masih
    // berjalan / sudah selesai).
    setRevealed(0);
    setPlaying(true);
  }

  function handleContextMenu(e) {
    // Klik kanan = langsung selesai: hentikan mesin play dan tampilkan
    // glyph penuh seketika — untuk user yang tidak ingin menunggu animasi
    // selesai (mis. goresan ke-12 dari 13 sedang berjalan).
    e.preventDefault();
    if (!Array.isArray(paths) || paths.length === 0) return;
    setPlaying(false);
    setRevealed(paths.length);
  }

  const animatable = Array.isArray(paths) && paths.length > 0;

  return (
    <button
      type="button"
      className="kd-genkou-glyph"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      aria-label={`Play stroke-order animation for ${kanji}`}
    >
      {animatable ? (
        <svg className="kd-genkou-svg" viewBox="0 0 109 109" aria-hidden="true">
          {/* Dua lapis render sama dengan StrokePlayer: guide (kanji
              samar seperti kertas latihan) + ink yang tergambar urut. */}
          <g className="kd-stroke-guide">
            {paths.map((d, i) => (
              <path key={`g${i}`} d={d} />
            ))}
          </g>
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
      ) : (
        kanji
      )}
    </button>
  );
}
