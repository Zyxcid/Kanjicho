// Loader data dekomposisi komponen kanji (struktur kvg:element KanjiVG)
// per level JLPT.
//
// File data (src/data/components_n*.json) berisi
// { kanji: [ { e, m?, lv?, r, rad?, ph?, p? }, ... ] } — dihasilkan
// scripts/build_components.py dari SVG KanjiVG (CC BY-SA 3.0):
//   e  = karakter komponen (varian diganti bentuk asli, mis. ⻏ → 邑)
//   m  = arti komponen bila komponen itu kanji di DB app
//   lv = level JLPT komponen (navigasi klik chip di modal Browse)
//   r  = rentang goresan komponen di dalam kanji induknya [awal, akhir]
//   rad = penanda radikal semantik (pembawa arti)
//   ph  = penanda komponen fonetik (pembawa bacaan)
//   p  = sub-komponen level berikutnya (karakter saja)
// Loader memakai dynamic import() supaya tiap level di-code-split oleh
// Vite menjadi chunk terpisah — N1 (paling besar, ~146 KB) hanya diunduh
// saat level itu dipakai. Chunk ikut di-precache service worker, jadi
// data tetap tersedia offline (parit yang sama dengan strokes_n*.json).

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
 * @returns {Promise<Object<string, Object[]>>} map kanji -> daftar
 *   komponen; kanji tanpa dekomposisi tidak ada di peta.
 */
export function loadComponents(level) {
  const loader = LOADERS[level];
  if (!loader) return Promise.resolve({});
  if (!cache.has(level)) {
    cache.set(level, loader().then((m) => m.default));
  }
  return cache.get(level);
}
