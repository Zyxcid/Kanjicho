// Loader data urutan goresan (KanjiVG) per level JLPT.
//
// File data (src/data/strokes_n*.json) berisi { kanji: [pathD, ...] } —
// dihasilkan scripts/build_strokes.py dari SVG KanjiVG (CC BY-SA 3.0).
// Loader memakai dynamic import() supaya tiap level di-code-split oleh
// Vite menjadi chunk terpisah: data N1 (paling besar, ~1,2 MB) hanya
// diunduh saat level itu benar-benar dipakai. Chunk hasil build ikut
// di-precache service worker, jadi animasi tetap jalan offline.

const LOADERS = {
  N5: () => import("../data/strokes_n5.json"),
  N4: () => import("../data/strokes_n4.json"),
  N3: () => import("../data/strokes_n3.json"),
  N2: () => import("../data/strokes_n2.json"),
  N1: () => import("../data/strokes_n1.json"),
};

// Cache promise per level — pemanggilan kedua untuk level yang sama
// resolve instan tanpa network (chunk sudah ada di memori browser).
const cache = new Map();

/**
 * Muat peta stroke untuk satu level.
 * @param {string} level id level ("N5".."N1")
 * @returns {Promise<Object<string, string[]>>} map kanji -> daftar path-d
 */
export function loadStrokes(level) {
  const loader = LOADERS[level];
  if (!loader) return Promise.resolve({});
  if (!cache.has(level)) {
    cache.set(level, loader().then((m) => m.default));
  }
  return cache.get(level);
}
