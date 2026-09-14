// Loader data urutan goresan (KanjiVG) per level JLPT.
//
// File data (src/data/strokes_n*.json) berisi { kanji: [pathD, ...] } —
// dihasilkan scripts/build_strokes.py dari SVG KanjiVG (CC BY-SA 3.0).
// Loader memakai dynamic import() supaya tiap level di-code-split oleh
// Vite menjadi chunk terpisah: data level hanya diunduh saat level itu
// benar-benar dipakai. Chunk hasil build ikut di-precache service
// worker, jadi animasi tetap jalan offline.
//
// (t96) Level besar dipecah — strokes_n1.json (1,2 MB) kini menjadi
// strokes_n1_idx.json ({_p, kanji→part}) + strokes_n1_p0..p3.json
// (masing-masing ~300-400 kB; scripts/split_strokes.mjs). API loader
// kini PER KANJI (loadStrokePaths): membuka satu kanji hanya mengunduh
// SATU sub-chunk, bukan seluruh level — warning build "chunk larger
// than 500 kB" hilang tanpa menaikkan chunkSizeWarningLimit, dan puluhan
// ribu goresan N1 tidak lagi jadi satu unduhan raksasa saat Browse
// (default "All", t96) membuka satu kartu N1 pertama.

// Level satu-file: { kanji: [d, ...] }
const FULL = {
  N5: () => import("../data/strokes_n5.json"),
  N4: () => import("../data/strokes_n4.json"),
  N3: () => import("../data/strokes_n3.json"),
  N2: () => import("../data/strokes_n2.json"),
};

// Level terpecah: index kecil (kanji → nomor part) + parts eksplisit
// (Vite butuh specifier statis agar tiap file jadi chunk sendiri).
const SPLIT = {
  N1: {
    idx: () => import("../data/strokes_n1_idx.json"),
    parts: [
      () => import("../data/strokes_n1_p0.json"),
      () => import("../data/strokes_n1_p1.json"),
      () => import("../data/strokes_n1_p2.json"),
      () => import("../data/strokes_n1_p3.json"),
    ],
  },
};

// Cache promise — pemanggilan kedua untuk kanji/level yang sama resolve
// instan tanpa unduhan ulang (chunk sudah ada di memori browser).
const fullCache = new Map(); // level → Promise<map>
const idxCache = new Map(); // level → Promise<idx>
const partCache = new Map(); // "level:part" → Promise<map>
const pathCache = new Map(); // "level\u0000kanji" → Promise<string[]>

function loadFull(level) {
  if (!fullCache.has(level)) {
    fullCache.set(level, FULL[level]().then((m) => m.default));
  }
  return fullCache.get(level);
}

function loadIdx(level) {
  if (!idxCache.has(level)) {
    idxCache.set(level, SPLIT[level].idx().then((m) => m.default));
  }
  return idxCache.get(level);
}

function loadPart(level, no) {
  const key = `${level}:${no}`;
  if (!partCache.has(key)) {
    partCache.set(key, SPLIT[level].parts[no]().then((m) => m.default));
  }
  return partCache.get(key);
}

/**
 * Muat urutan goresan SATU kanji.
 * @param {string} level id level ("N5".."N1")
 * @param {string} kanji karakter kanji
 * @returns {Promise<string[]>} daftar path-d goresan; [] bila level tak
 *   dikenal atau kanji tanpa data KanjiVG (fallback glyph di UI).
 */
export function loadStrokePaths(level, kanji) {
  const key = `${level}\u0000${kanji}`;
  if (pathCache.has(key)) return pathCache.get(key);
  const p = (async () => {
    if (FULL[level]) {
      const map = await loadFull(level);
      return map[kanji] || [];
    }
    const split = SPLIT[level];
    if (!split) return [];
    const idx = await loadIdx(level);
    const no = idx[kanji];
    if (typeof no !== "number" || !split.parts[no]) return [];
    const map = await loadPart(level, no);
    return map[kanji] || [];
  })();
  pathCache.set(key, p);
  return p;
}
