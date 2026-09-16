import manifest from "../data/manifest.json";

export const LEVEL_IDS = ["N5", "N4", "N3", "N2", "N1"];

// Loader per level. Vite memecah tiap import() jadi chunk terpisah saat
// build, jadi file JSON besar (mis. n1.json, 1.232 kanji) hanya dimuat
// kalau levelnya benar-benar dibuka.
// (t107) n*_sentences.json ikut dimuat bersama contoh kata: peta
// { kata: {jp, en, id?, pos[]} } — kalimat contoh Tatoeba (display-only,
// tidak menyentuh kuis/jadwal). Ukurannya kecil relatif thd n*.json.
const LOADERS = {
  N5: () => Promise.all([import("../data/n5.json"), import("../data/n5_examples.json"), import("../data/n5_sentences.json")]),
  N4: () => Promise.all([import("../data/n4.json"), import("../data/n4_examples.json"), import("../data/n4_sentences.json")]),
  N3: () => Promise.all([import("../data/n3.json"), import("../data/n3_examples.json"), import("../data/n3_sentences.json")]),
  N2: () => Promise.all([import("../data/n2.json"), import("../data/n2_examples.json"), import("../data/n2_sentences.json")]),
  N1: () => Promise.all([import("../data/n1.json"), import("../data/n1_examples.json"), import("../data/n1_sentences.json")]),
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
    const promise = LOADERS[level]().then(([kanjiMod, examplesMod, sentencesMod]) => {
      const kanjiList = kanjiMod.default;
      const examples = examplesMod.default;
      // (t107) tempel kalimat contoh (bila ada) ke entri contoh kata —
      // `sent: {jp, en, id?, pos[]}`; kata tanpa kalimat tetap seperti
      // semula (overlay best-effort, konvensi id_gloss).
      const sentences = sentencesMod.default || {};
      return kanjiList.map((k) => ({
        ...k,
        examples: (examples[k.kanji] || []).map((e) =>
          sentences[e.word] ? { ...e, sent: sentences[e.word] } : e
        ),
      }));
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
