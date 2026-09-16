#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
audit_sentence_readings.py — QA bacaan kata target pada kalimat contoh
(t109). Menjawab kelas bug: kalimat Tatoeba dipilih lewat kecocokan
TULISAN kata, tapi di kalimat itu kata dibaca dengan bacaan/arti LAIN
(contoh: 中［ちゅう］"medium (size)" digandengkan ke トムは車の中にいるよ。
— di situ 中 dibaca なか).

Cara pakai (QA satu kali / sesudah pipeline jalan):
  python3 scripts/audit_sentence_readings.py [--level N5]

Untuk TIAP entri n*_sentences.json, verifikasi via scripts/reading_check.py
(fugashi/unidic + pykakasi, dua pendapat + toleransi fonologis — lihat
header modul itu) terhadap bacaan `reading` kata di n*_examples.json
level yang sama (kata dengan entri on+kun → SET bacaan).

  4. Laporan tambahan "sense_review": kata KANJI TUNGGAL yang lolos
     bacaan tapi terjemahan EN-nya tidak memuat kata kunci arti
     (mis. 中 ちゅう "medium" di kalimat "9 out of 10 people") —
     polisemi bacaan-sama-arti-beda; butuh pertimbangan manusia,
     TIDAK di-gate otomatis.

Output: scripts/sentences_audit.json + ringkasan konsol.
Hasil adjudikasi manual atas mismatch/disagree/unverified/sense_review
dicatat ke scripts/reading_overrides.json (dipakai gate
build_sentences.py supaya rebuild tetap deterministik).
Dependensi: python3 + fugashi + unidic-lite + pykakasi.
"""
import argparse
import json
import os
import re
from collections import defaultdict

from reading_check import ReadingVerifier, KANJI_RE, norm_reading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = ["N5", "N4", "N3", "N2", "N1"]

# kata kunci arti yang terlalu generik utk cek EN (sense_review)
STOPWORDS = {
    "of", "the", "a", "an", "to", "in", "on", "and", "or", "for", "with",
    "size", "etc", "one", "thing", "things",
}


def meaning_keywords(meaning):
    return {
        w for w in re.findall(r"[a-zA-Z]{3,}", meaning or "")
        if w.lower() not in STOPWORDS
    }


def main():
    ap = argparse.ArgumentParser(description="audit bacaan kata target di kalimat contoh")
    ap.add_argument("--level", choices=LEVELS, default=None, help="audit satu level saja")
    args = ap.parse_args()

    ver = ReadingVerifier()
    levels = [args.level] if args.level else LEVELS

    # ---- bacaan yang diharapkan (per level, per kata) ----
    level_word_readings = {}   # lv -> word -> set(bacaan)
    level_word_meanings = {}   # lv -> word -> "meaning (level pertama)"
    word_levels = defaultdict(list)  # word -> [lv, ...]
    for lv in levels:
        ex = json.load(open(f"{ROOT}/src/data/{lv.lower()}_examples.json", encoding="utf-8"))
        rmap, mmap = defaultdict(set), {}
        for _k, lst in ex.items():
            for e in lst:
                r = norm_reading(e.get("reading", ""))
                if r:
                    rmap[e["word"]].add(r)
                mmap.setdefault(e["word"], e.get("meaning", ""))
        level_word_readings[lv] = rmap
        level_word_meanings[lv] = mmap
        for w in rmap:
            word_levels[w].append(lv)

    # konflik lintas-level: irisannya kosong → tidak ada kalimat yang benar
    # untuk semua level sekaligus
    conflicts = {}
    for w, lvs in word_levels.items():
        if len(lvs) < 2:
            continue
        inter = set.intersection(*(level_word_readings[l][w] for l in lvs))
        if not inter:
            conflicts[w] = {l: sorted(level_word_readings[l][w]) for l in lvs}

    report = {"levels": {}, "conflicts": conflicts, "mismatch": [], "disagree": [], "single_tool": [],
              "unverified": [], "sense_review": []}
    counts = {"ok": 0, "mismatch": 0, "disagree": 0, "unverified": 0}
    total = 0

    for lv in levels:
        sents = json.load(open(f"{ROOT}/src/data/{lv.lower()}_sentences.json", encoding="utf-8"))
        rmap = level_word_readings[lv]
        mmap = level_word_meanings[lv]
        lv_counts = {"ok": 0, "mismatch": 0, "disagree": 0, "unverified": 0}
        for word, e in sents.items():
            total += 1
            jp = e.get("jp", "")
            expected = rmap.get(word)
            if not expected:
                continue
            v = ver.verdict(jp, e.get("pos", []), len(word), expected, surface=word)
            counts[v] += 1
            lv_counts[v] += 1
            if v != "ok":
                row = {
                    "level": lv, "word": word,
                    "expected": sorted(expected),
                    "jp": jp, "en": e.get("en", ""),
                    "meaning": mmap.get(word, ""),
                    "pos": e.get("pos", []),
                }
                report[v].append(row)
            else:
                bd = ver.ok_breakdown(jp, e.get("pos", []), len(word), expected, surface=word)
                if bd["unidic_ok"] != bd["pika_ok"]:
                    # verdict ok tapi hanya SATU alat yang memverifikasi —
                    # rawan false-accept (mis. pykakasi memilih bacaan
                    # default kamusnya utk konteks yang beda) → review manual
                    report["single_tool"].append({
                        "level": lv, "word": word,
                        "expected": sorted(expected),
                        "jp": jp, "en": e.get("en", ""),
                        "meaning": mmap.get(word, ""),
                        "tool": "pika" if bd["pika_ok"] else "unidic",
                        "unidic": bd["unidic"], "pika": bd["pika"],
                    })
                # polisemi bacaan-sama: kata kanji tunggal yang EN-nya tak
                # memuat kata kunci arti → perlu pertimbangan manual
                if len(word) == 1 and KANJI_RE.match(word):
                    kws = meaning_keywords(mmap.get(word, ""))
                    en = (e.get("en") or "").lower()
                    if kws and not any(k.lower() in en for k in kws):
                        report["sense_review"].append({
                            "level": lv, "word": word,
                            "expected": sorted(expected),
                            "jp": jp, "en": e.get("en", ""),
                            "meaning": mmap.get(word, ""),
                        })
        report["levels"][lv] = lv_counts
        print(f"[{lv}] " + " | ".join(f"{k} {lv_counts[k]}" for k in ("ok", "mismatch", "disagree", "unverified")))

    print(f"[total] {total} entri | " + " | ".join(f"{k} {counts[k]}" for k in counts))
    print(f"[konflik] {len(conflicts)} kata punya set bacaan saling-lepas antar level")
    print(f"[sense_review] {len(report['sense_review'])} kata kanji tunggal lolos-bacaan "
          f"tapi EN tanpa kata kunci arti — perlu dilihat manual")

    out = os.path.join(ROOT, "scripts", "sentences_audit.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print(f"[laporan] {out}")


if __name__ == "__main__":
    main()
