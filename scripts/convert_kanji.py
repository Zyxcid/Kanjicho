#!/usr/bin/env python3
"""
convert_kanji.py — Langkah 1 pipeline: susun JSON kanji per level dari
sumber mentah.

Baca:
  - raw/kanjidic2.xml.gz    (XML KANJIDIC2 — kanji, bacaan, arti, jumlah goresan, freq)
  - raw/JLPT_kanji_ALL.json (level N1-N5 modern dari Bluskyo/JLPT_Vocabulary)

Konvensi pipeline: semua sumber mentah pihak ketiga dikumpulkan di raw/
di root aplikasi (lihat build_examples.py / README).

Tulis:
  - output/n5.json ... n1.json (data kanji per level)
  - output/all_kanji.json (gabungan)

Hanya kanji yang ada di JLPT_kanji_ALL.json yang disimpan — tag <jlpt>
milik KANJIDIC2 memakai sistem lama pra-2010 (4 level, tanpa N5) yang
tidak bisa dipetakan 1:1 ke level modern.

Pemakaian:
    python scripts/convert_kanji.py [raw/kanjidic2.xml.gz] [output_dir] [raw/JLPT_kanji_ALL.json]
"""

import gzip
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# ============================================================
# Konverter kana → romaji (Hepburn)
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


def build_romaji_list(on_readings, kun_readings):
    romaji = []
    for r in on_readings + kun_readings:
        rj = kana_to_romaji(r)
        if rj and rj not in romaji:
            romaji.append(rj)
    return romaji


# ============================================================
# Parsing XML KANJIDIC2
# ============================================================

JLPT_MAP = {5: "N5", 4: "N4", 3: "N3", 2: "N2", 1: "N1"}
UNIT_SIZE = 15


def parse_kanjidic2(xml_path, jlpt_override):
    """Parse kanjidic2.xml.gz, hanya simpan kanji yang ada di jlpt_override
    (level N1-N5 modern). Return list of entry kanji."""
    print(f"Parsing KANJIDIC2 from {xml_path} ...")

    if str(xml_path).endswith(".gz"):
        f = gzip.open(xml_path, "rt", encoding="utf-8")
    else:
        f = open(xml_path, encoding="utf-8")

    kanji_list = []
    skipped = 0
    context = ET.iterparse(f, events=("end",))
    for _event, char in context:
        if char.tag != "character":
            continue

        literal_el = char.find("literal")
        if literal_el is None:
            char.clear()
            continue
        kanji_char = literal_el.text

        # Hanya simpan kanji level-JLPT modern (Bluskyo) — alasan lihat
        # docstring modul.
        if kanji_char not in jlpt_override:
            skipped += 1
            char.clear()
            continue

        # Bacaan (reading)
        on_readings = []
        kun_readings = []
        rm = char.find("reading_meaning")
        if rm is not None:
            rmg = rm.find("rmgroup")
            if rmg is not None:
                for r in rmg.findall("reading"):
                    rt = r.get("r_type")
                    if rt == "ja_on":
                        on_readings.append(r.text)
                    elif rt == "ja_kun":
                        kun_readings.append(r.text)

        # Arti bahasa Inggris (lewati yang ber-atribut m_lang non-Inggris)
        meanings = []
        if rm is not None:
            rmg = rm.find("rmgroup")
            if rmg is not None:
                for m in rmg.findall("meaning"):
                    if m.get("m_lang") is None and m.text:
                        meanings.append(m.text)

        # Misc: jumlah goresan & frekuensi koran
        misc = char.find("misc")
        stroke_count = None
        freq = None
        if misc is not None:
            sc = misc.find("stroke_count")
            if sc is not None and sc.text:
                stroke_count = int(sc.text)
            fr = misc.find("freq")
            if fr is not None and fr.text:
                freq = int(fr.text)

        if not meanings or (not on_readings and not kun_readings):
            char.clear()
            continue

        kanji_list.append({
            "kanji": kanji_char,
            "on_readings": on_readings,
            "kun_readings": kun_readings,
            "meanings": meanings,
            "stroke_count": stroke_count,
            "jlpt_num": jlpt_override[kanji_char],
            "freq": freq,
        })
        char.clear()

    f.close()
    print(f"  Parsed {len(kanji_list)} kanji (skipped {skipped} non-JLPT)")
    return kanji_list


# ============================================================
# Main
# ============================================================

def main():
    kanjidic_path = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parent.parent / "raw" / "kanjidic2.xml.gz"
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else \
        Path(__file__).resolve().parent.parent / "output"
    jlpt_path = Path(sys.argv[3]) if len(sys.argv) > 3 else \
        Path(__file__).resolve().parent.parent / "raw" / "JLPT_kanji_ALL.json"

    if not kanjidic_path.exists():
        print(f"Error: KANJIDIC2 file not found: {kanjidic_path}", file=sys.stderr)
        sys.exit(1)
    if not jlpt_path.exists():
        print(f"Error: JLPT_kanji_ALL.json not found: {jlpt_path}", file=sys.stderr)
        sys.exit(1)

    with open(jlpt_path, encoding="utf-8") as f:
        jlpt_override = json.load(f)
    print(f"Loaded {len(jlpt_override)} modern JLPT levels from {jlpt_path.name}")

    output_dir.mkdir(exist_ok=True)
    all_kanji = parse_kanjidic2(kanjidic_path, jlpt_override)

    # Kelompokkan per level JLPT
    by_level = {"N5": [], "N4": [], "N3": [], "N2": [], "N1": []}
    for k in all_kanji:
        level = JLPT_MAP.get(k["jlpt_num"])
        if level:
            by_level[level].append(k)

    # Urutkan tiap level berdasarkan frekuensi koran (kanji umum dulu)
    for level in by_level:
        by_level[level].sort(key=lambda k: (k["freq"] or 999999, k["stroke_count"] or 0, k["kanji"]))

    all_output = []
    for level, kanji_list in by_level.items():
        level_output = []
        for idx, item in enumerate(kanji_list):
            unit_number = idx // UNIT_SIZE + 1
            romaji_readings = build_romaji_list(item["on_readings"], item["kun_readings"])
            primary = []
            if item["on_readings"]:
                r = kana_to_romaji(item["on_readings"][0])
                if r:
                    primary.append(r)
            if item["kun_readings"]:
                r = kana_to_romaji(item["kun_readings"][0])
                if r and r not in primary:
                    primary.append(r)

            level_output.append({
                "kanji": item["kanji"],
                "jlpt_level": level,
                "unit": f"{level}-U{unit_number}",
                "order_index": idx,
                "readings": {
                    "on": item["on_readings"],
                    "kun": item["kun_readings"],
                },
                "romaji_readings": romaji_readings,
                "primary_romaji": primary,
                "meanings": item["meanings"],
                "stroke_count": item["stroke_count"],
            })

        out_path = output_dir / f"{level.lower()}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(level_output, f, ensure_ascii=False, indent=2)
        all_output.extend(level_output)
        n_units = (len(level_output) - 1) // UNIT_SIZE + 1 if level_output else 0
        print(f"  {level}: {len(level_output)} kanji, {n_units} units → {out_path.name}")

    with open(output_dir / "all_kanji.json", "w", encoding="utf-8") as f:
        json.dump(all_output, f, ensure_ascii=False, indent=2)

    print(f"\nTotal: {len(all_output)} kanji across all levels")
    print("\nNOTE: primary_romaji masih placeholder (on[0]+kun[0]).")
    print("Lanjutkan dengan rerank_readings.py untuk rank berdasarkan frekuensi")
    print("kata (sinyal hybrid jiten + pri). Field ini hanya kerja-kerja internal pipeline —")
    print("build_examples.py menggantinya dengan primary_readings di file")
    print("final.")


if __name__ == "__main__":
    main()
