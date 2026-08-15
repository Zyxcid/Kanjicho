#!/usr/bin/env python3
"""
fix_primary_romaji.py — Surgically correct the `primary_romaji` field in the
kanji JSON files in place.

The original `primary_romaji` was derived by `convert_kanji.py` using BCCWJ
corpus frequency to find the most common readings. This was mostly correct,
BUT it had a structural flaw: for some kanji (e.g. 言), the corpus only found
on'yomi as standalone words (gen, gon) and returned BOTH of those — missing
the common kun'yomi (iu, which only appears in the verb 言う). So the quiz
could never accept iu as a correct answer for 言, even though it's the most
common reading.

This script does a SURGICAL fix (not a full re-derivation):
  - For kanji whose primary_romaji already has at least one on AND one kun →
    keep as-is (the BCCWJ ranking is correct).
  - For kanji whose primary_romaji has 2+ entries but ALL are on (missing
    kun) → keep the most common on, replace the 2nd with kun[0].
  - For kanji whose primary_romaji has 2+ entries but ALL are kun (missing
    on) → keep the most common kun, replace the 2nd with on[0].
  - For kanji with a single primary_romaji entry where the other reading
    type EXISTS → add the first missing-type reading.
  - For kanji that genuinely have only one reading type (no kun or no on) →
    leave as-is.

This preserves the BCCWJ corpus frequency data (which correctly identifies
WHICH on/kun is most common) while fixing the structural flaw (missing one
reading type). No external raw sources needed — the raw `readings.on` /
`readings.kun` are already in the JSON.

Usage:
    python scripts/fix_primary_romaji.py [path/to/src/data]
"""

import json
import sys
from pathlib import Path

# ============================================================
# Kana → Romaji converter (Hepburn)
# ============================================================

KATA_TO_HIRA_SMALL = {
    "ァ": "ぁ", "ィ": "ぃ", "ゥ": "ぅ", "ェ": "ぇ", "ォ": "ぉ",
    "ャ": "ゃ", "ュ": "ゅ", "ョ": "ょ", "ッ": "っ",
}

KANA_TO_ROMAJI = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "を": "wo", "ん": "n",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
    "ゃ": "ya", "ゅ": "yu", "ょ": "yo", "っ": "",
}

PALATAL = {
    "ki": {"ya": "kya", "yu": "kyu", "yo": "kyo"},
    "gi": {"ya": "gya", "yu": "gyu", "yo": "gyo"},
    "shi": {"ya": "sha", "yu": "shu", "yo": "sho"},
    "ji": {"ya": "ja", "yu": "ju", "yo": "jo"},
    "chi": {"ya": "cha", "yu": "chu", "yo": "cho"},
    "ni": {"ya": "nya", "yu": "nyu", "yo": "nyo"},
    "hi": {"ya": "hya", "yu": "hyu", "yo": "hyo"},
    "bi": {"ya": "bya", "yu": "byu", "yo": "byo"},
    "pi": {"ya": "pya", "yu": "pyu", "yo": "pyo"},
    "mi": {"ya": "mya", "yu": "myu", "yo": "myo"},
    "ri": {"ya": "rya", "yu": "ryu", "yo": "ryo"},
}

LONG_VOWEL = {
    "a": "a", "i": "i", "u": "u", "e": "e", "o": "o",
    "sha": "a", "shu": "u", "sho": "o",
    "cha": "a", "chu": "u", "cho": "o",
    "ja": "a", "ju": "u", "jo": "o",
}


def kana_to_romaji(kana_str):
    """Convert a kana string (with possible '.' / '-' okurigana markers)
    to Hepburn romaji."""
    s = []
    for ch in kana_str:
        if "\u30a1" <= ch <= "\u30f6":
            s.append(chr(ord(ch) - 0x60))
        elif ch in KATA_TO_HIRA_SMALL:
            s.append(KATA_TO_HIRA_SMALL[ch])
        elif ch in (".", "-"):
            continue
        else:
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


# ============================================================
# Surgical fix logic
# ============================================================

def build_romaji_set(readings_list):
    """Convert a list of kana readings to a set of romaji strings."""
    out = set()
    for kana in readings_list:
        r = kana_to_romaji(kana)
        if r:
            out.add(r)
    return out


def fix_primary_romaji(entry):
    """Surgically fix primary_romaji to ensure one on + one kun (when both
    reading types exist). Returns (new_primary, changed: bool)."""
    on_readings = entry.get("readings", {}).get("on", []) or []
    kun_readings = entry.get("readings", {}).get("kun", []) or []
    on_romaji = build_romaji_set(on_readings)
    kun_romaji = build_romaji_set(kun_readings)

    pr = entry.get("primary_romaji", [])
    if not pr:
        return pr, False

    # Classify current primary_romaji entries
    pr_on = [r for r in pr if r in on_romaji]
    pr_kun = [r for r in pr if r in kun_romaji]
    has_on = len(pr_on) > 0
    has_kun = len(pr_kun) > 0

    # Already has both → correct, leave as-is
    if has_on and has_kun:
        return pr, False

    # Has only on, but the kanji has kun readings → add kun[0]
    if has_on and not has_kun and kun_readings:
        kun0_romaji = kana_to_romaji(kun_readings[0])
        if kun0_romaji and kun0_romaji not in pr:
            # Keep the first (most common) on, replace the rest with kun[0]
            new_pr = [pr[0], kun0_romaji]
            return new_pr, True

    # Has only kun, but the kanji has on readings → add on[0]
    if has_kun and not has_on and on_readings:
        on0_romaji = kana_to_romaji(on_readings[0])
        if on0_romaji and on0_romaji not in pr:
            new_pr = [pr[0], on0_romaji]
            return new_pr, True

    # Kanji genuinely has only one reading type → leave as-is
    return pr, False


def fix_file(path):
    with open(path, encoding="utf-8") as f:
        kanji_list = json.load(f)

    changed = 0
    for entry in kanji_list:
        new_pr, did_change = fix_primary_romaji(entry)
        if did_change:
            entry["primary_romaji"] = new_pr
            changed += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(kanji_list, f, ensure_ascii=False, indent=2)

    return len(kanji_list), changed


def main():
    if len(sys.argv) > 1:
        data_dir = Path(sys.argv[1])
    else:
        data_dir = Path(__file__).resolve().parent.parent / "src" / "data"

    if not data_dir.exists():
        print(f"Error: data directory not found: {data_dir}", file=sys.stderr)
        sys.exit(1)

    files = sorted(data_dir.glob("n[1-5].json"))
    if not files:
        print(f"Error: no n1-n5.json files in {data_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Fixing primary_romaji in {len(files)} files under {data_dir}...\n")
    total_all = 0
    changed_all = 0
    for f in files:
        total, changed = fix_file(f)
        total_all += total
        changed_all += changed
        print(f"  {f.name}: {changed}/{total} entries updated")

    print(f"\nDone. {changed_all}/{total_all} kanji had their primary_romaji corrected.")
    print("(Only kanji missing one reading type were changed; the rest keep")
    print(" their BCCWJ-corpus-ranked most common readings.)")

    # Spot-check 言 if present
    for f in files:
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        for k in data:
            if k["kanji"] == "言":
                print(f"\nSpot-check 言 ({f.name}):")
                print(f"  on:  {k['readings']['on']}")
                print(f"  kun: {k['readings']['kun']}")
                print(f"  primary_romaji: {k['primary_romaji']}  (should be ['gen','iu'])")
                return


if __name__ == "__main__":
    main()
