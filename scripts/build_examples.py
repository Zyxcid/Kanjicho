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

    The BCCWJ TSV column 6 is the frequency COUNT (higher = more common).
    When a term appears multiple times (different POS), keep the entry with
    the HIGHEST frequency (most common usage).
    """
    print(f"Loading BCCWJ from {tsv_path} ...")
    import csv
    freq = {}
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
            # Bug fix: was `<` (kept lowest = rarest), now `>` (keeps highest).
            if lemma not in freq or f_val > freq[lemma][0]:
                freq[lemma] = (f_val, reading_hira)
    print(f"  Loaded {len(freq)} BCCWJ frequency entries")
    return freq


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


def build_examples_for_kanji(kanji, jmdict_terms, freq_index, on_hira, kun_roots):
    on_candidates = []
    kun_candidates = []

    for term, entries in jmdict_terms.items():
        if kanji not in term:
            continue
        if term not in freq_index:
            continue
        freq_val, bccwj_reading = freq_index[term]

        matching_entry = next((e for e in entries if e[0] == bccwj_reading), None)
        if matching_entry is None:
            continue

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

        # Store frequency as NEGATIVE so ascending sort = highest frequency first.
        # Bug fix: was sorting ascending by frequency (lowest first = rarest),
        # now sorts ascending by -freq (highest first = most common).
        item = (-freq_val, term, reading, gloss)
        if item_type == "on":
            on_candidates.append(item)
        else:
            kun_candidates.append(item)

    # Sort: prefer multi-char words, then by frequency (highest first).
    # Using -freq_val so ascending sort gives highest frequency first.
    on_candidates.sort(key=lambda x: (0 if len(x[1]) > 1 else 1, x[0]))
    kun_candidates.sort(key=lambda x: (0 if len(x[1]) > 1 else 1, x[0]))

    results = []
    if on_candidates:
        _f, t, r, g = on_candidates[0]
        results.append({"word": t, "reading": r, "meaning": g, "type": "on"})
    if kun_candidates:
        _f, t, r, g = kun_candidates[0]
        results.append({"word": t, "reading": r, "meaning": g, "type": "kun"})

    if len(results) < MAX_EXAMPLES_PER_KANJI:
        pool = on_candidates if kun_candidates and results and results[0]["type"] == "kun" else kun_candidates
        for _f, t, r, g in pool:
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
    freq_index = load_bccwj_freq(bccwj_path)

    for level_file in sorted(input_dir.glob("n[1-5].json")):
        with open(level_file, encoding="utf-8") as f:
            kanji_list = json.load(f)

        result = {}
        no_example = 0
        for entry in kanji_list:
            kanji = entry["kanji"]
            on_hira, kun_roots = build_reading_sets(entry)
            examples = build_examples_for_kanji(kanji, jmdict_terms, freq_index, on_hira, kun_roots)
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
