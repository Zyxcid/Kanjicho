#!/usr/bin/env python3
"""Diagnostik rerank utk satu kanji (default 十): cetak kredit per bacaan
+ kata-kata yang mengkredit, supaya terlihat MENGAPA sebuah bacaan menang.
Pemakaian: python3 scripts/diag_kanji.py [kanji]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rerank_readings import (  # noqa: E402
    clean_reading, katakana_to_hiragana, load_pri_words,
    build_kanji_word_index, kana_to_romaji,
)
from build_examples import (  # noqa: E402
    attribute_example_reading, kun_stem, load_kanjidic2_readings,
    build_cand_table,
)

KANJI = sys.argv[1] if len(sys.argv) > 1 else "十"
root = Path(__file__).resolve().parent.parent

# Cari entry kanji di output/
entry = None
for f in sorted((root / "output").glob("n[1-5].json")):
    for k in json.loads(f.read_text(encoding="utf-8")):
        if k["kanji"] == KANJI:
            entry = k
            print(f"kanji {KANJI} ditemukan di {f.name}")
            break
    if entry:
        break
assert entry, f"{KANJI} tidak ditemukan di output/"

on_readings = entry.get("readings", {}).get("on", []) or []
kun_readings = entry.get("readings", {}).get("kun", []) or []
print("on :", on_readings)
print("kun:", kun_readings)
print("primary_romaji (seed convert):", entry.get("primary_romaji"))

pri_words = load_pri_words(root / "raw" / "JMdict_e.gz")
idx = build_kanji_word_index(pri_words)
words_for = idx.get(KANJI, [])
print(f"\n{len(words_for)} kata hybrid memuat {KANJI}")

cand_table = build_cand_table(load_kanjidic2_readings(str(root / "raw" / "kanjidic2.xml.gz")))

on_clean = {clean_reading(r): r for r in on_readings if clean_reading(r)}
kun_clean = {clean_reading(r): r for r in kun_readings if clean_reading(r)}

detail = {}
for lemma, reading, freq, pos, strong in words_for:
    attr = attribute_example_reading(KANJI, lemma, reading, on_readings, kun_readings, cand_table)
    t = attr["type"]
    matched = attr["matched_reading"]
    key = None
    if t == "on" and matched in on_clean:
        key = on_clean[matched]
    elif t == "kun" and matched:
        stem = matched
        group = [r for r in kun_readings if kun_stem(r) == stem]
        if group:
            key = group[0]
    if key:
        d = detail.setdefault(key, [])
        d.append((freq, lemma, reading, t, "KUAT" if strong else "pri"))
    else:
        d = detail.setdefault(f"? ({t}:{matched})", [])
        d.append((freq, lemma, reading, t, "KUAT" if strong else "pri"))

print("\n=== kredit per bacaan (MAX kata; tier ditandai KUAT/pri) ===")
for key in sorted(detail, key=lambda k: -max(x[0] for x in detail[k])):
    items = sorted(detail[key], reverse=True)
    mx = items[0][0]
    print(f"\n{key}  (romaji {kana_to_romaji(key) if not key.startswith('?') else '-'})  MAX={mx}")
    for freq, lemma, reading, t, tier in items[:8]:
        print(f"    {freq:>8}  {tier:<4} {lemma} 【{reading}】 {t}")
