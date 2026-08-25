#!/usr/bin/env python3
"""
build_examples.py — Build example-word lists for each kanji from raw sources.

Reads:
  - JMdict_e.gz          (JMdict English XML — Japanese→English dictionary)
  - BCCWJ_frequencylist_luw2_ver1_0.tsv  (BCCWJ word frequency list)
  - output/n5.json ... n1.json  (the kanji data from convert_kanji.py)

Writes:
  - output/n5_examples.json ... n1_examples.json
    Format: { "kanji_char": [{word, reading, meaning, type}, ...] }

For each kanji, finds 2 common example words: one using the on'yomi and one
using the kun'yomi. Words are ranked by BCCWJ corpus frequency so the most
common real-world examples are chosen.

Usage:
    python scripts/build_examples.py <jmdict_e.gz> <bccwj.tsv> [input_dir] [output_dir]
"""

import gzip
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

MAX_EXAMPLES_PER_KANJI = 2
MIN_WORD_LEN = 1
MAX_WORD_LEN = 4


def is_cjk(ch):
    return "\u4e00" <= ch <= "\u9fff"


def katakana_to_hiragana(text):
    return "".join(
        chr(ord(ch) - 0x60) if "\u30a1" <= ch <= "\u30f6" else ch
        for ch in text
    )


def clean_kun(text):
    return text.replace(".", "").strip("-")


# ============================================================
# JMdict parsing
# ============================================================

def parse_jmdict(jmdict_path):
    print(f"Parsing JMdict from {jmdict_path} ...")

    if str(jmdict_path).endswith(".gz"):
        f = gzip.open(jmdict_path, "rt", encoding="utf-8")
    else:
        f = open(jmdict_path, encoding="utf-8")

    terms = {}
    context = ET.iterparse(f, events=("end",))
    for _event, entry in context:
        if entry.tag != "entry":
            continue

        keb = entry.find(".//k_ele/keb")
        if keb is None or not keb.text:
            entry.clear()
            continue
        term = keb.text

        if not (MIN_WORD_LEN <= len(term) <= MAX_WORD_LEN):
            entry.clear()
            continue

        reb = entry.find(".//r_ele/reb")
        if reb is None or not reb.text:
            entry.clear()
            continue
        reading = reb.text

        glosses = [g.text for g in entry.findall(".//sense/gloss") if g.text]
        if not glosses:
            entry.clear()
            continue

        terms.setdefault(term, []).append((reading, glosses))
        entry.clear()

    f.close()
    print(f"  Loaded {len(terms)} JMdict terms with kanji (len {MIN_WORD_LEN}-{MAX_WORD_LEN})")
    return terms


# ============================================================
# BCCWJ frequency loading
# ============================================================

def load_bccwj_freq(tsv_path):
    """Load BCCWJ frequency: { term: (frequency, reading) }.
    Also builds a reading-based index: { reading_hira: (frequency, term) }
    so we can find frequency by reading when the written form differs
    (e.g. JMdict has 現れる but BCCWJ has 現われる — same reading あらわれる).

    The BCCWJ TSV column 6 is the frequency COUNT (higher = more common).
    When a term appears multiple times (different POS), keep the entry with
    the HIGHEST frequency (most common usage).
    """
    print(f"Loading BCCWJ from {tsv_path} ...")
    import csv
    freq = {}
    freq_by_reading = {}  # reading_hira -> (frequency, term)
    with open(tsv_path, encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)  # header
        for row in reader:
            if len(row) < 7:
                continue
            lemma = row[2]
            lform = row[1]
            try:
                f_val = int(row[6])  # frequency COUNT (higher = more common)
            except (ValueError, IndexError):
                continue
            reading_hira = katakana_to_hiragana(lform)
            # Keep the HIGHEST frequency for each term (most common usage).
            if lemma not in freq or f_val > freq[lemma][0]:
                freq[lemma] = (f_val, reading_hira)
            # Also index by reading (for spelling-variant lookups)
            if reading_hira not in freq_by_reading or f_val > freq_by_reading[reading_hira][0]:
                freq_by_reading[reading_hira] = (f_val, lemma)
    print(f"  Loaded {len(freq)} BCCWJ frequency entries ({len(freq_by_reading)} by reading)")
    return freq, freq_by_reading


# ============================================================
# Example building
# ============================================================

PLACE_NAME_GLOSS_HINTS = ("prefecture", "city in", "capital of", "district in")


def is_likely_proper_noun(term, gloss):
    gloss_lower = gloss.lower()
    if any(hint in gloss_lower for hint in PLACE_NAME_GLOSS_HINTS):
        return True
    return False


def build_reading_sets(entry):
    on_hira = {katakana_to_hiragana(r) for r in entry["readings"]["on"]}
    kun_roots = set()
    for r in entry["readings"]["kun"]:
        cleaned = clean_kun(r)
        if cleaned:
            kun_roots.add(katakana_to_hiragana(cleaned))
        if "." in r:
            stem = r.split(".")[0].strip("-")
            if stem:
                kun_roots.add(katakana_to_hiragana(stem))
    return on_hira, kun_roots


def classify_word_shape(term):
    if all(is_cjk(ch) for ch in term):
        return "on"
    return "kun"


# --- Minimal kana→romaji for matching primary_romaji against kana readings ---
# (Only needs to be "good enough" to identify which reading a romaji string
# came from — not a full converter.)
_KANA_TO_ROMAJI_MIN = {
    "あ":"a","い":"i","う":"u","え":"e","お":"o",
    "か":"ka","き":"ki","く":"ku","け":"ke","こ":"ko",
    "さ":"sa","し":"shi","す":"su","せ":"se","そ":"so",
    "た":"ta","ち":"chi","つ":"tsu","て":"te","と":"to",
    "な":"na","に":"ni","ぬ":"nu","ね":"ne","の":"no",
    "は":"ha","ひ":"hi","ふ":"fu","へ":"he","ほ":"ho",
    "ま":"ma","み":"mi","む":"mu","め":"me","も":"mo",
    "や":"ya","ゆ":"yu","よ":"yo",
    "ら":"ra","り":"ri","る":"ru","れ":"re","ろ":"ro",
    "わ":"wa","を":"wo","ん":"n",
    "が":"ga","ぎ":"gi","ぐ":"gu","げ":"ge","ご":"go",
    "ざ":"za","じ":"ji","ず":"zu","ぜ":"ze","ぞ":"zo",
    "だ":"da","ぢ":"ji","づ":"zu","で":"de","ど":"do",
    "ば":"ba","び":"bi","ぶ":"bu","べ":"be","ぼ":"bo",
    "ぱ":"pa","ぴ":"pi","ぷ":"pu","ぺ":"pe","ぽ":"po",
    "ぁ":"a","ぃ":"i","ぅ":"u","ぇ":"e","ぉ":"o",
    "ゃ":"ya","ゅ":"yu","ょ":"yo","っ":"",
}
_PALATAL_MIN = {
    "ki":{"ya":"kya","yu":"kyu","yo":"kyo"},
    "gi":{"ya":"gya","yu":"gyu","yo":"gyo"},
    "shi":{"ya":"sha","yu":"shu","yo":"sho"},
    "ji":{"ya":"ja","yu":"ju","yo":"jo"},
    "chi":{"ya":"cha","yu":"chu","yo":"cho"},
    "ni":{"ya":"nya","yu":"nyu","yo":"nyo"},
    "hi":{"ya":"hya","yu":"hyu","yo":"hyo"},
    "bi":{"ya":"bya","yu":"byu","yo":"byo"},
    "pi":{"ya":"pya","yu":"pyu","yo":"pyo"},
    "mi":{"ya":"mya","yu":"myu","yo":"myo"},
    "ri":{"ya":"rya","yu":"ryu","yo":"ryo"},
}


def _kana_to_romaji_minimal(kana):
    """Minimal kana→romaji for reading-matching. Handles the common cases."""
    s = katakana_to_hiragana(kana).replace(".", "").strip("-")
    out = ""
    i = 0
    while i < len(s):
        ch = s[i]
        nxt = s[i+1] if i+1 < len(s) else ""
        if ch == "ー":
            if out and out[-1] in "aeiou":
                out += out[-1]
            i += 1
            continue
        base = _KANA_TO_ROMAJI_MIN.get(ch, ch)
        if nxt in ("ゃ","ゅ","ょ"):
            y = _KANA_TO_ROMAJI_MIN.get(nxt, "")
            if base in _PALATAL_MIN and y in _PALATAL_MIN[base]:
                out += _PALATAL_MIN[base][y]
                i += 2
                continue
        out += base
        i += 1
    return out


def romaji_matches_reading(romaji, kana_reading):
    """Check if a romaji string (e.g. 'too') corresponds to a kana reading
    (e.g. 'とお'). Used to find which on/kun reading the primary_romaji
    came from, so we can prefer example words using that reading."""
    converted = _kana_to_romaji_minimal(kana_reading)
    return romaji == converted


def build_examples_for_kanji(kanji, jmdict_terms, freq_index, on_hira, kun_roots,
                              primary_on_hira=None, primary_kun_hira=None,
                              freq_by_reading=None):
    """Build example words for one kanji.

    If primary_on_hira / primary_kun_hira are provided (the readings that
    rerank_readings.py determined are most common), example words whose
    reading CONTAINS that primary reading are strongly preferred — so the
    quiz answer and the shown example always use the same reading.

    freq_by_reading allows looking up BCCWJ frequency by reading (not just
    by written form), so spelling variants are found (e.g. JMdict 現れる
    matches BCCWJ 現われる, both read あらわれる).
    """
    on_candidates = []
    kun_candidates = []

    for term, entries in jmdict_terms.items():
        if kanji not in term:
            continue

        # Look up BCCWJ frequency. Try by written form first, then by
        # each JMdict reading (handles spelling variants like 現れる/現われる).
        # CRITICAL: when looking up by reading, verify the BCCWJ lemma ALSO
        # contains this kanji — otherwise we'd match unrelated words that
        # happen to share a reading (e.g. 正割 reading せいかつ would match
        # BCCWJ's 生活 せいかつ, a completely different word).
        freq_val = None
        bccwj_reading = None
        if term in freq_index:
            freq_val, bccwj_reading = freq_index[term]
        elif freq_by_reading:
            for reading, _glosses in entries:
                reading_hira = katakana_to_hiragana(reading)
                if reading_hira in freq_by_reading:
                    f_val, lemma = freq_by_reading[reading_hira]
                    # Verify the BCCWJ word actually contains THIS kanji.
                    # This prevents false matches like 正割(せいかつ) → 生活(せいかつ).
                    if kanji in lemma:
                        freq_val = f_val
                        bccwj_reading = reading
                        break

        if freq_val is None:
            continue

        # Find the JMdict entry whose reading matches the BCCWJ reading
        matching_entry = next((e for e in entries if e[0] == bccwj_reading), None)
        if matching_entry is None:
            # If no exact reading match, use the first entry
            matching_entry = entries[0]

        reading, glosses = matching_entry
        gloss = glosses[0]
        if is_likely_proper_noun(term, gloss):
            continue

        reading_hira = katakana_to_hiragana(reading)
        has_on = any(h in reading_hira for h in on_hira if h)
        has_kun = any(k in reading_hira for k in kun_roots if k)

        if has_on and has_kun:
            item_type = classify_word_shape(term)
        elif has_on:
            item_type = "on"
        elif has_kun:
            item_type = "kun"
        else:
            continue

        # Check if this word's reading contains the PRIMARY reading
        # (the one rerank_readings.py determined is most common). If so,
        # this word is a much better example — the quiz and reveal will
        # show the same reading.
        matches_primary = False
        if item_type == "on" and primary_on_hira and primary_on_hira in reading_hira:
            matches_primary = True
        if item_type == "kun" and primary_kun_hira and primary_kun_hira in reading_hira:
            matches_primary = True

        # Store: (matches_primary_flag, -freq, term, reading, gloss)
        # Sort key: prefer matches_primary=True (0 < 1), then multi-char,
        # then highest frequency.
        item = (0 if matches_primary else 1, -freq_val, term, reading, gloss)
        if item_type == "on":
            on_candidates.append(item)
        else:
            kun_candidates.append(item)

    # Sort: prefer primary-reading match, then multi-char, then frequency.
    on_candidates.sort(key=lambda x: (x[0], 0 if len(x[2]) > 1 else 1, x[1]))
    kun_candidates.sort(key=lambda x: (x[0], 0 if len(x[2]) > 1 else 1, x[1]))

    results = []
    if on_candidates:
        _p, _f, t, r, g = on_candidates[0]
        results.append({"word": t, "reading": r, "meaning": g, "type": "on"})
    if kun_candidates:
        _p, _f, t, r, g = kun_candidates[0]
        results.append({"word": t, "reading": r, "meaning": g, "type": "kun"})

    if len(results) < MAX_EXAMPLES_PER_KANJI:
        pool = on_candidates if kun_candidates and results and results[0]["type"] == "kun" else kun_candidates
        for _p, _f, t, r, g in pool:
            if t not in {res["word"] for res in results}:
                results.append({"word": t, "reading": r, "meaning": g, "type": classify_word_shape(t)})
                break

    return results[:MAX_EXAMPLES_PER_KANJI]


# ============================================================
# Main
# ============================================================

def main():
    jmdict_path = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parent.parent / "JMdict_e.gz"
    bccwj_path = Path(sys.argv[2]) if len(sys.argv) > 2 else \
        Path(__file__).resolve().parent.parent / "BCCWJ_frequencylist_luw2_ver1_0.tsv"
    input_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else \
        Path(__file__).resolve().parent.parent / "output"
    output_dir = Path(sys.argv[4]) if len(sys.argv) > 4 else input_dir

    if not jmdict_path.exists():
        print(f"Error: JMdict file not found: {jmdict_path}", file=sys.stderr)
        sys.exit(1)
    if not bccwj_path.exists():
        print(f"Error: BCCWJ file not found: {bccwj_path}", file=sys.stderr)
        sys.exit(1)

    jmdict_terms = parse_jmdict(jmdict_path)
    freq_index, freq_by_reading = load_bccwj_freq(bccwj_path)

    # Check if primary_romaji has been set by rerank_readings.py yet.
    # If so, we'll prefer example words whose reading matches it.
    # (This is why build_examples.py runs AFTER rerank_readings.py in the pipeline.)
    has_primary = False
    first_file = input_dir / "n5.json"
    if first_file.exists():
        with open(first_file, encoding="utf-8") as f:
            sample = json.load(f)
        if sample and sample[0].get("primary_romaji"):
            has_primary = True
    if has_primary:
        print("  (primary_romaji detected — preferring examples that match the quiz reading)")
    else:
        print("  (primary_romaji not set yet — run rerank_readings.py first for best results)")

    for level_file in sorted(input_dir.glob("n[1-5].json")):
        with open(level_file, encoding="utf-8") as f:
            kanji_list = json.load(f)

        result = {}
        no_example = 0
        for entry in kanji_list:
            kanji = entry["kanji"]
            on_hira, kun_roots = build_reading_sets(entry)

            # Extract the primary readings (set by rerank_readings.py) as
            # hiragana, so we can prefer example words that use them.
            primary_on_hira = None
            primary_kun_hira = None
            pr = entry.get("primary_romaji", [])
            for romaji in pr:
                # Find which of the kanji's on/kun readings matches this romaji
                for r in entry.get("readings", {}).get("on", []):
                    if romaji_matches_reading(romaji, r):
                        primary_on_hira = katakana_to_hiragana(clean_kun(r))
                        break
                for r in entry.get("readings", {}).get("kun", []):
                    if romaji_matches_reading(romaji, r):
                        primary_kun_hira = katakana_to_hiragana(clean_kun(r))
                        break

            examples = build_examples_for_kanji(
                kanji, jmdict_terms, freq_index, on_hira, kun_roots,
                primary_on_hira, primary_kun_hira, freq_by_reading
            )
            result[kanji] = examples
            if not examples:
                no_example += 1

        out_path = output_dir / f"{level_file.stem}_examples.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        both_types = sum(1 for v in result.values() if len({e["type"] for e in v}) == 2)
        print(f"  {level_file.stem}: {len(result) - no_example}/{len(result)} kanji got examples "
              f"({both_types} with both on+kun) → {out_path.name}")


if __name__ == "__main__":
    main()
