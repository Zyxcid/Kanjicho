#!/usr/bin/env python3
"""
rerank_readings.py — Re-rank each kanji's `primary_romaji` using REAL
multi-character word frequency from the BCCWJ Balanced Corpus.

For each kanji, looks at all BCCWJ corpus WORDS containing that kanji (e.g.
時代, 代わり, 世代 for 代), matches each word's reading back to one of the
kanji's on/kun readings, and sums the word frequencies per reading. The
most-frequent on'yomi becomes primary_romaji[0]; the most-frequent kun'yomi
becomes primary_romaji[1].

Inputs:
  - output/n*.json or src/data/n*.json  (existing kanji data)
  - BCCWJ_frequencylist_luw2_ver1_0.tsv  (raw BCCWJ frequency list)

Output:
  - updates the JSON files in place (only `primary_romaji` is re-graded)

Usage:
    python scripts/rerank_readings.py <bccwj.tsv> [path/to/data]
"""

import json
import sys
from pathlib import Path

# ============================================================
# Kana utilities (same as convert_kanji.py)
# ============================================================

KATA_TO_HIRA_SMALL = {
    "ァ": "ぁ", "ィ": "ぃ", "ゥ": "ぅ", "ェ": "ぇ", "ォ": "ぉ",
    "ャ": "ゃ", "ュ": "ゅ", "ョ": "ょ", "ッ": "っ",
}

KANA_TO_ROMAJI = {
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

PALATAL = {
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

LONG_VOWEL = {
    "a":"a","i":"i","u":"u","e":"e","o":"o",
    "sha":"a","shu":"u","sho":"o",
    "cha":"a","chu":"u","cho":"o",
    "ja":"a","ju":"u","jo":"o",
}


def katakana_to_hiragana(text):
    out = []
    for ch in text:
        if "\u30a1" <= ch <= "\u30f6":
            out.append(chr(ord(ch) - 0x60))
        elif ch in KATA_TO_HIRA_SMALL:
            out.append(KATA_TO_HIRA_SMALL[ch])
        else:
            out.append(ch)
    return "".join(out)


def kana_to_romaji(kana_str):
    s = []
    for ch in katakana_to_hiragana(kana_str):
        if ch in (".", "-"):
            continue
        s.append(ch)
    s = "".join(s)
    out = ""
    i = 0
    while i < len(s):
        ch = s[i]
        nxt = s[i + 1] if i + 1 < len(s) else ""
        if ch == "っ":
            next_romaji = KANA_TO_ROMAJI.get(nxt, "")
            if next_romaji:
                out += next_romaji[0]
                i += 1
                continue
            out += "tsu"
            i += 1
            continue
        if ch == "ー":
            m = None
            for c in reversed(out):
                if c in "aeiou":
                    m = c
                    break
            if m:
                out += LONG_VOWEL.get(m, m)
            i += 1
            continue
        base = KANA_TO_ROMAJI.get(ch)
        if nxt in ("ゃ", "ゅ", "ょ"):
            y_small = KANA_TO_ROMAJI.get(nxt, "")
            if base and base in PALATAL and y_small in PALATAL[base]:
                out += PALATAL[base][y_small]
                i += 2
                continue
        if base is not None:
            out += base
        i += 1
    return out


def clean_reading(kana):
    return katakana_to_hiragana(kana).replace(".", "").strip("-")


# ============================================================
# BCCWJ loading
# ============================================================

def load_bccwj(tsv_path):
    """Load BCCWJ TSV. Returns [(lemma, reading_hiragana, freq), ...].
    Only keeps lemmas containing at least one kanji."""
    print(f"Loading BCCWJ from {tsv_path} ...")
    import csv
    words = []
    with open(tsv_path, encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)
        for row in reader:
            if len(row) < 7:
                continue
            lemma = row[2]
            lform = row[1]
            try:
                freq = int(row[6])  # frequency COUNT (higher = more common)
            except (ValueError, IndexError):
                continue
            if not any("\u4e00" <= ch <= "\u9fff" for ch in lemma):
                continue
            reading_hira = katakana_to_hiragana(lform)
            words.append((lemma, reading_hira, freq))
    print(f"  Loaded {len(words)} kanji-containing BCCWJ lemmas")
    return words


def build_kanji_word_index(bccwj_words):
    """Build { kanji_char: [(lemma, reading, freq), ...] }."""
    print("Indexing BCCWJ words by kanji ...")
    index = {}
    for lemma, reading, freq in bccwj_words:
        seen_kanji = set()
        for ch in lemma:
            if "\u4e00" <= ch <= "\u9fff":
                seen_kanji.add(ch)
        for ch in seen_kanji:
            index.setdefault(ch, []).append((lemma, reading, freq))
    print(f"  {len(index)} unique kanji indexed")
    return index


# ============================================================
# Reading ranking
# ============================================================

def rank_readings(kanji, on_readings, kun_readings, bccwj_words):
    """Rank readings by total BCCWJ word frequency."""
    on_clean = {}
    kun_clean = {}
    for r in on_readings:
        c = clean_reading(r)
        if c:
            on_clean[c] = r
    for r in kun_readings:
        c = clean_reading(r)
        if c:
            kun_clean[c] = r

    on_freq = {}
    kun_freq = {}

    for lemma, word_reading, freq in bccwj_words:
        if kanji not in lemma:
            continue
        matched_on = None
        matched_kun = None
        for c in on_clean:
            if c and c in word_reading:
                matched_on = c
                break
        for c in kun_clean:
            if c and c in word_reading:
                matched_kun = c
                break

        if matched_on and matched_kun:
            if len(matched_kun) > len(matched_on):
                matched_on = None
            elif len(matched_on) > len(matched_kun):
                matched_kun = None

        if matched_on:
            on_freq[matched_on] = on_freq.get(matched_on, 0) + freq
        if matched_kun:
            kun_freq[matched_kun] = kun_freq.get(matched_kun, 0) + freq

    best_on = None
    if on_freq:
        best_on_clean = max(on_freq, key=on_freq.get)
        best_on = on_clean.get(best_on_clean)
    best_kun = None
    if kun_freq:
        best_kun_clean = max(kun_freq, key=kun_freq.get)
        best_kun = kun_clean.get(best_kun_clean)

    best_on_romaji = kana_to_romaji(best_on) if best_on else None
    best_kun_romaji = kana_to_romaji(best_kun) if best_kun else None

    return best_on_romaji, best_kun_romaji, on_freq, kun_freq


# ============================================================
# Main
# ============================================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/rerank_readings.py <bccwj.tsv> [path/to/data]")
        sys.exit(1)

    bccwj_path = Path(sys.argv[1])
    data_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else \
        Path(__file__).resolve().parent.parent / "src" / "data"

    if not bccwj_path.exists():
        print(f"Error: BCCWJ file not found: {bccwj_path}", file=sys.stderr)
        sys.exit(1)
    if not data_dir.exists():
        print(f"Error: data directory not found: {data_dir}", file=sys.stderr)
        sys.exit(1)

    bccwj_words = load_bccwj(bccwj_path)
    kanji_word_index = build_kanji_word_index(bccwj_words)

    files = sorted(data_dir.glob("n[1-5].json"))
    print(f"\nRe-ranking primary_romaji in {len(files)} files ...\n")
    total_all = 0
    changed_all = 0
    for f in files:
        with open(f, encoding="utf-8") as fh:
            kanji_list = json.load(fh)
        total_all += len(kanji_list)
        changed = 0
        for entry in kanji_list:
            kanji = entry["kanji"]
            on_readings = entry.get("readings", {}).get("on", []) or []
            kun_readings = entry.get("readings", {}).get("kun", []) or []

            old = entry.get("primary_romaji", [])
            bccwj_for_kanji = kanji_word_index.get(kanji, [])
            best_on, best_kun, on_freq, kun_freq = rank_readings(
                kanji, on_readings, kun_readings, bccwj_for_kanji
            )

            new_pr = []
            if best_on:
                new_pr.append(best_on)
            if best_kun and best_kun != best_on:
                new_pr.append(best_kun)

            if not new_pr:
                new_pr = old
            elif not best_on and not best_kun:
                new_pr = old

            if new_pr != old:
                entry["primary_romaji"] = new_pr
                changed += 1

        with open(f, "w", encoding="utf-8") as fh:
            json.dump(kanji_list, fh, ensure_ascii=False, indent=2)

        changed_all += changed
        print(f"  {f.name}: {changed}/{len(kanji_list)} entries re-ranked")

    print(f"\nDone. {changed_all}/{total_all} kanji had their primary_romaji updated")
    print("(Ranked by real BCCWJ multi-character word frequency.)")


if __name__ == "__main__":
    main()
