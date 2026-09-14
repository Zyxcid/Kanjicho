/**
 * idData.js — overlay Bahasa Indonesia untuk DATA kanji (t96): arti kanji
 * (KANJIDIC2 EN) dan gloss contoh kata (JMdict EN).
 *
 * Sumber: src/data/id_gloss.json — dua peta hasil terjemahan massal
 * (scripts pipeline, lihat BACA-DULU-PERBAIKAN.txt):
 *   m : { "<arti EN>" : "<arti ID>" }  — kunci STRING EN supaya konsisten
 *   w : { "<kata JP>" : "<gloss ID>" } — kunci kata (kolisi=0 diverifikasi)
 *
 * Desain:
 *  - OVERLAY, bukan pengganti: teks tanpa terjemahan tetap tampil dalam
 *    Inggris (id_gloss best-effort; batch gagal → fallback natural).
 *  - DIMUAT ON-DEMAND via dynamic import: user berbahasa Inggris tidak
 *    pernah mengunduh chunk ini (puluhan ratus kB) — selaras kebijakan
 *    chunk ramping t96 (strokes & data besar tidak boleh membebani
 *    bundle utama).
 *  - Context (bukan props): Browse / Quiz / KanjiDetailSheet memakai
 *    hook useIdData() tanpa menembus props berlapis dari App.
 *  - Berganti bahasa me-render ulang seluruh pohon (konvensi t89), jadi
 *    nilai context cukup dibaca sekali per render.
 */
import React from "react";

const IdDataContext = React.createContext(null);

/** Provider: muat peta gloss saat bahasa UI = id; null selain itu. */
export function IdDataProvider({ lang, children }) {
  const [map, setMap] = React.useState(null);

  React.useEffect(() => {
    if (lang !== "id") {
      setMap(null);
      return undefined;
    }
    let cancelled = false;
    // Chunk terpisah — hanya diunduh saat Bahasa Indonesia aktif.
    import("../data/id_gloss.json")
      .then((mod) => {
        if (!cancelled && mod.default) setMap(mod.default);
      })
      .catch(() => {
        // File hilang/korup → semua UI kembali ke Inggris secara alami.
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return (
    <IdDataContext.Provider value={map}>{children}</IdDataContext.Provider>
  );
}

/** Peta aktif ({m, w}) atau null bila bahasa bukan id / belum termuat. */
export function useIdData() {
  return React.useContext(IdDataContext);
}

/** Arti kanji terlokalisasi (array sejajar meanings EN). */
export function localizedMeanings(entry, idData) {
  const ms = entry?.meanings || [];
  if (!idData) return ms;
  return ms.map((m) => idData.m[m] || m);
}

/** Gloss contoh kata terlokalisasi (kunci kata Jepang). */
export function localizedGloss(example, idData) {
  if (!idData) return example?.meaning ?? "";
  return idData.w[example?.word] || example?.meaning || "";
}
