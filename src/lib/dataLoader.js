import n5 from "../data/n5.json";
import n4 from "../data/n4.json";
import n3 from "../data/n3.json";
import n2 from "../data/n2.json";
import n1 from "../data/n1.json";
import n5Examples from "../data/n5_examples.json";
import n4Examples from "../data/n4_examples.json";
import n3Examples from "../data/n3_examples.json";
import n2Examples from "../data/n2_examples.json";
import n1Examples from "../data/n1_examples.json";

const RAW_LEVELS = { N5: n5, N4: n4, N3: n3, N2: n2, N1: n1 };
const EXAMPLES = { N5: n5Examples, N4: n4Examples, N3: n3Examples, N2: n2Examples, N1: n1Examples };

// Merge each kanji entry with its example words (built by build_examples.py
// from JMdict + BCCWJ). Done once here so other modules don't need to know
// the data comes from two separate files.
//
// NOTE: `primary_romaji` is trusted as-is from the JSON. It was corrected
// in-place by `scripts/fix_primary_romaji.py` to ensure each kanji has both
// the most common on'yomi AND the most common kun'yomi (when both exist),
// ranked by BCCWJ corpus frequency. No runtime override needed.
const LEVELS = Object.fromEntries(
  Object.entries(RAW_LEVELS).map(([level, kanjiList]) => [
    level,
    kanjiList.map((k) => ({ ...k, examples: EXAMPLES[level]?.[k.kanji] || [] })),
  ])
);

export const LEVEL_IDS = ["N5", "N4", "N3", "N2", "N1"];

export function getKanjiForLevel(level) {
  return LEVELS[level] || [];
}

export function getUnitsForLevel(level) {
  return [...new Set(getKanjiForLevel(level).map((k) => k.unit))];
}

export function getKanjiForUnit(level, unitId) {
  return getKanjiForLevel(level).filter((k) => k.unit === unitId);
}

export function getLevelMeta(level) {
  const kanjiList = getKanjiForLevel(level);
  return { total: kanjiList.length, units: getUnitsForLevel(level).length };
}
