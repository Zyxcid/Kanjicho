import manifest from "../data/manifest.json";

export const LEVEL_IDS = ["N5", "N4", "N3", "N2", "N1"];

// Per-level dynamic loader. Vite code-splits each import() into its own
// chunk at build time, so e.g. n1.json (1,232 kanji, the biggest level)
// never ends up in the initial bundle unless the user actually opens N1.
const LOADERS = {
  N5: () => Promise.all([import("../data/n5.json"), import("../data/n5_examples.json")]),
  N4: () => Promise.all([import("../data/n4.json"), import("../data/n4_examples.json")]),
  N3: () => Promise.all([import("../data/n3.json"), import("../data/n3_examples.json")]),
  N2: () => Promise.all([import("../data/n2.json"), import("../data/n2_examples.json")]),
  N1: () => Promise.all([import("../data/n1.json"), import("../data/n1_examples.json")]),
};

// Caches the in-flight/resolved Promise per level, so re-opening a level
// already visited this session doesn't redo the merge-with-examples work
// (the browser already caches the underlying dynamic import() itself, this
// cache is just for the merged result).
const levelCache = new Map(); // level -> Promise<kanji[]>

/**
 * Load one level's full kanji data (readings, meanings, example words),
 * merged into single objects. Async — call this when the user actually
 * opens a level, not eagerly on app start.
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

/** Load every level at once — used by Browse.jsx's "All" filter. */
export function loadAllKanji() {
  return Promise.all(LEVEL_IDS.map(loadLevelKanji)).then((lists) => lists.flat());
}

// --- Lightweight data (from manifest.json, available synchronously) ---
// Home's stats/level cards only need unit ids + counts, not full kanji
// data, so these stay sync and don't trigger any level's heavy JSON to load.

export function getUnitsForLevel(level) {
  return manifest[level]?.units || [];
}

export function getLevelMeta(level) {
  const m = manifest[level];
  return m ? { total: m.total, units: m.units.length } : { total: 0, units: 0 };
}
