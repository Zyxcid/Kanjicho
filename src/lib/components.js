// Loader data dekomposisi komponen kanji (KanjiVG stroke-group) per
// level JLPT.
//
// File data (src/data/components_n*.json) berisi
// { kanji: { t: totalGoresan, p: [ { e: glyph, s: goresan, lv: level,
// k: kanjiLink?, o: bentukAsli?, r: 1?, ph: 1?, m: artiFormRadikal? },
// { u: goresanTanpaGrup } ] } } — dihasilkan scripts/build_components.py
// dari struktur stroke-group SVG KanjiVG (CC BY-SA 3.0). Loader memakai
// dynamic import() supaya tiap level di-code-split oleh Vite menjadi
// chunk terpisah (pola yang sama dengan lib/strokes.js); chunk ikut
// di-precache service worker sehingga tetap tersedia offline.

const LOADERS = {
  N5: () => import("../data/components_n5.json"),
  N4: () => import("../data/components_n4.json"),
  N3: () => import("../data/components_n3.json"),
  N2: () => import("../data/components_n2.json"),
  N1: () => import("../data/components_n1.json"),
};

// Cache promise per level — pemanggilan kedua untuk level yang sama
// resolve instan tanpa network (chunk sudah ada di memori browser).
const cache = new Map();

/**
 * Muat peta komponen untuk satu level.
 * @param {string} level id level ("N5".."N1")
 * @returns {Promise<Object<string, {t: number, p: Array}>>} map kanji ->
 *   dekomposisi ({ t: total goresan, p: daftar bagian }). Kanji tanpa
 *   dekomposisi (komponen primitif, mis. 雨) tidak ada di map — pemanggil
 *   cukup cek map[kanji] untuk memutuskan menampilkan seksi atau tidak.
 */
export function loadComponents(level) {
  const loader = LOADERS[level];
  if (!loader) return Promise.resolve({});
  if (!cache.has(level)) {
    cache.set(level, loader().then((m) => m.default));
  }
  return cache.get(level);
}
