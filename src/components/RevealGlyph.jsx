import React, { useEffect, useState } from "react";
import { loadStrokePaths } from "../lib/strokes.js";

// Durasi dasar satu goresan — sama dengan default StrokePlayer (speed 1x),
// supaya rasa animasinya identik di punggung kartu kuis dan di modal Browse.
const BASE_STROKE_MS = 620;

/**
 * RevealGlyph — tombol glyph KanjiVG KECIL di kepala reading sheet
 * (sisi BELAKANG kartu kuis), menempati pojok kiri-atas persis di bekas
 * tempat kanji font, dengan teks arti mengalir DI SAMPINGNYA (bukan
 * didorong ke tepi kanan). Ukurannya jelas lebih kecil dari kotak genkō
 * glyph di sisi depan (72px vs 168/260px — lihat .kd-reveal-glyph di
 * global.css).
 *
 * (t83) Animasi urutan goresan PINDAH ke sini: sisi depan kartu kini
 * glyph font Shippori Mincho biasa (tanpa animasi). Punggung kartu baru
 * dirender SETELAH menjawab, jadi animasi tidak pernah membocorkan
 * bentuk "sedang digambar" sebelum user berkomitmen pada jawaban — dan
 * secara pedagogis lebih pas: menonton cara menulis kanji saat membaca
 * lembar jawabannya.
 *
 * Glyph SELALU dirender sebagai SVG KanjiVG dalam keadaan SELESAI (semua
 * goresan sudah tergambar) sejak punggung muncul — bukan glyph teks
 * font — supaya bentuknya konsisten sebelum dan sesudah animasi. Data
 * goresan level soal sudah DIPANASKAN sejak soal muncul (Quiz.jsx ikut
 * memanggil loadStrokePaths bersama chunk komponen), jadi chunk biasanya
 * sudah di cache saat kartu terbalik; kalau belum, kanji font tampil
 * sesaat sebagai placeholder (kepala tidak pernah kosong).
 *
 * DIKLIK KIRI → animasi diputar LANGSUNG di kotak kecil ini: mulai dari
 * kosong, satu goresan per BASE_STROKE_MS, selesai berhenti di glyph
 * penuh. Klik lagi = putar ulang. Tanpa kontrol kecepatan (default 1x —
 * kontrol lengkap ada di modal Browse).
 *
 * DIKLIK KANAN → animasi LANGSUNG DISELESAIKAN: mesin play dihentikan
 * dan semua goresan muncul seketika (skip, tanpa memutar sisanya satu
 * per satu). Menu konteks browser dicegah supaya klik kanan selalu
 * berarti "selesaikan sekarang" pada kotak ini.
 *
 * Kalau data KanjiVG tidak tersedia (fallback; saat ini 0 kanji — build
 * memverifikasi coverage), kanji font tetap tampil dan klik tidak
 * melakukan apa-apa. Soal berganti → seluruh sisi belakang ikut
 * di-remount (kartu key=qIndex); reset render di bawah adalah jaring
 * pengaman kalau komponen dipakai tanpa key.
 */
export default function RevealGlyph({ kanji, level }) {
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

  // Muat data goresan sejak punggung muncul, lalu tampilkan dalam
  // keadaan selesai (revealed = semua goresan) — klik baru memutar.
  // (t96) loadStrokePaths per-kanji: level terpecah hanya mengunduh satu
  // sub-chunk.
  useEffect(() => {
    let cancelled = false;
    loadStrokePaths(level, kanji).then((p) => {
      if (cancelled) return;
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
    // glyph penuh seketika — untuk user yang tidak ingin menunggu
    // animasi selesai (mis. goresan ke-12 dari 13 sedang berjalan).
    e.preventDefault();
    if (!Array.isArray(paths) || paths.length === 0) return;
    setPlaying(false);
    setRevealed(paths.length);
  }

  const animatable = Array.isArray(paths) && paths.length > 0;

  return (
    <button
      type="button"
      className="kd-reveal-glyph"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      aria-label={`Play stroke-order animation for ${kanji}`}
    >
      {animatable ? (
        <svg viewBox="0 0 109 109" aria-hidden="true">
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
