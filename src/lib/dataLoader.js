import manifest from "../data/manifest.json";

export const LEVEL_IDS = ["N5", "N4", "N3", "N2", "N1"];

// Loader per level. Vite memecah tiap import() jadi chunk terpisah saat
// build, jadi file JSON besar (mis. n1.json, 1.232 kanji) hanya dimuat
// kalau levelnya benar-benar dibuka.
const LOADERS = {
  N5: () => Promise.all([import("../data/n5.json"), import("../data/n5_examples.json")]),
  N4: () => Promise.all([import("../data/n4.json"), import("../data/n4_examples.json")]),
  N3: () => Promise.all([import("../data/n3.json"), import("../data/n3_examples.json")]),
  N2: () => Promise.all([import("../data/n2.json"), import("../data/n2_examples.json")]),
  N1: () => Promise.all([import("../data/n1.json"), import("../data/n1_examples.json")]),
};

// Cache Promise per level: membuka ulang level yang sudah pernah dibuka
// tidak mengulang proses merge kanji + contoh kata.
const levelCache = new Map(); // level -> Promise<kanji[]>

/**
 * Muat data kanji satu level (bacaan, arti, contoh kata), sudah di-merge
 * jadi objek tunggal per kanji. Async — panggil saat level dibuka, bukan
 * saat app start.
 */
export function loadLevelKanji(level) {
  if (!levelCache.has(level)) {
    const promise = LOADERS[level]().then(([kanjiMod, examplesMod]) => {
      const kanjiList = kanjiMod.default;
      const examples = examplesMod.default;
      return kanjiList.map((k) => ({ ...k, examples: examples[k.kanji] || [] }));
    });
    levelCache.set(level, promise);
  }
  return levelCache.get(level);
}

export async function getKanjiForUnit(level, unitId) {
  const kanjiList = await loadLevelKanji(level);
  return kanjiList.filter((k) => k.unit === unitId);
}

/** Muat semua level sekaligus — dipakai filter "All" di Browse.jsx. */
export function loadAllKanji() {
  return Promise.all(LEVEL_IDS.map(loadLevelKanji)).then((lists) => lists.flat());
}

// --- Data ringan dari manifest.json (sinkron, tanpa memuat JSON level) ---
// Statistik Home cuma butuh daftar unit + jumlah, jadi tetap sinkron.

export function getUnitsForLevel(level) {
  return manifest[level]?.units || [];
}

export function getLevelMeta(level) {
  const m = manifest[level];
  return m ? { total: m.total, units: m.units.length } : { total: 0, units: 0 };
}
