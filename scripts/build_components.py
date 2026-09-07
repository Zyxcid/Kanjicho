#!/usr/bin/env python3
"""build_components.py — Ekstrak dekomposisi komponen kanji dari SVG KanjiVG
menjadi JSON ringkas per level JLPT untuk Kanjichō.

Baca:
  - raw/kanjivg-master/kanji/*.svg  (KanjiVG master, CC BY-SA 3.0 —
                                     struktur grup kvg:element memuat
                                     dekomposisi hierarkis komponen)
  - output/n5.json .. n1.json         (daftar kanji per level + arti —
                                        untuk label arti komponen yang
                                        juga merupakan kanji di DB app)

Tulis:
  - output/components_n5.json ... components_n1.json
    Format: { "<kanji>": [ { "e": <char>, "m": <arti>, "lv": <level>,
                             "r": [<awal>, <akhir>], "rad": 1?, "ph": 1?,
                             "p": [<char>, ...]? }, ... ], ... }

  e  — karakter komponen UNTUK TAMPILAN. Elemen varian (kvg:variant)
       diganti bentuk aslinya (kvg:original, mis. ⻏ → 邑) supaya bisa
       dirender font. Komponen CDP-* (bentuk tanpa kode Unicode di
       data KanjiVG, hanya 3 kemunculan: 原, 2× 武) → placeholder "□".
  m  — arti komponen bila komponen itu adalah kanji di DB app
       (2 arti pertama, digabung ", "); dihilangkan kalau tidak ada.
  lv — level JLPT komponen (dipakai Browse untuk navigasi klik chip
       → modal detail komponen itu).
  r  — rentang nomor goresan komponen DI DALAM kanji induknya
       (1-based, inklusif) — dipakai highlight chip yang goresannya
       sedang digambar animasi.
  rad — komponen radikal semantik (kvg:radical="general") — bagian
       pembawa ARTI (ditandai titik indigo di UI).
  ph  — komponen fonetik (kvg:phon) — bagian pembawa BACAAN.
  p  — sub-komponen level berikutnya (turun melewati grup penata tanpa
       kvg:element), karakter saja; CDP-* difilter.

Kualitas (kanji dibuang dari output, UI menyembunyikan section-nya):
  - goresan 1..N harus terpartisi utuh oleh rentang komponen level-1
    (tiap goresan milik tepat satu komponen);
  - rentang tidak boleh saling tumpang tindih;
  - komponen tanpa goresan → data aneh → buang.

Diverifikasi terhadap stroke_count data app saat --data-dir diberikan
(default: src/data/ sekaligus target promosi manual — lihat README).

Pemakaian:
    python scripts/build_components.py [--kanjivg-dir DIR] [--out-dir DIR]
                                       [--data-dir DIR]
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

KVG_NS = "{http://kanjivg.tagaini.net}"  # xmlns:kvg pada <svg>
LEVELS = ["n5", "n4", "n3", "n2", "n1"]
CDP_PLACEHOLDER = "□"  # komponen tanpa Unicode (CDP-*) di KanjiVG


def kv_filename(kanji):
    # KanjiVG memakai hex codepoint 5 digit dengan leading nol.
    return format(ord(kanji), "05x") + ".svg"


def attr(node, name):
    return node.get(KVG_NS + name)


def child_groups(node):
    return [c for c in node if c.tag.endswith("}g")]


def descend_element_groups(node):
    """Grup anak ber-kvg:element, turun melewati grup penata posisi
    (grup <g> TANPA kvg:element — mis. pembungkus left/right)."""
    out = []
    for g in child_groups(node):
        if attr(g, "element"):
            out.append(g)
        else:
            out.extend(descend_element_groups(g))
    return out


def stroke_numbers(node):
    """Nomor goresan (atribut id "...-s<N>") semua path di bawah node,
    urut dokumen — nomor goresan KanjiVG = urutan penulisan."""
    nums = []
    for p in node.iter():
        if p.tag.endswith("}path"):
            pid = p.get("id", "")
            if pid.startswith("kvg:") and "-s" in pid:
                try:
                    nums.append(int(pid.rsplit("-s", 1)[1]))
                except ValueError:
                    pass
    return nums


def display_char(g):
    """Karakter tampilan: bentuk asli untuk varian (⻏ → 邑), placeholder
    untuk bentuk CDP tanpa Unicode, sisanya kvg:element apa adanya."""
    el = attr(g, "element") or ""
    if el.startswith("CDP"):
        return CDP_PLACEHOLDER
    orig = attr(g, "original")
    if orig and not orig.startswith("CDP"):
        return orig
    return el


def parse_components(kanji, kanjivg_dir):
    """Dekomposisi level-1 + sub-parts. None = tidak ada SVG (jangan
    terjadi — build_strokes sudah menjamin coverage); [] = kanji tanpa
    dekomposisi di data KanjiVG (UI menyembunyikan section)."""
    f = kanjivg_dir / kv_filename(kanji)
    if not f.exists():
        return None
    root = None
    want = "kvg:" + format(ord(kanji), "05x")
    for g in ET.parse(f).iter():
        if g.get("id", "") == want:
            root = g
            break
    if root is None:
        return None
    total = stroke_numbers(root)
    if not total:
        return None

    tops = descend_element_groups(root)
    # Tanpa sub-komponen, atau komponen tunggal = dirinya sendiri
    # (bukan bentuk partial) → tidak ada dekomposisi yang bisa ditunjuk.
    if not tops:
        return []
    if len(tops) == 1 and display_char(tops[0]) == kanji and not attr(tops[0], "partial"):
        return []

    comps = []
    covered = []
    for g in tops:
        nums = stroke_numbers(g)
        if not nums:
            return []  # komponen tanpa goresan — data aneh
        covered.extend(nums)
        entry = {"e": display_char(g), "r": [min(nums), max(nums)]}
        if attr(g, "radical"):
            entry["rad"] = 1
        if attr(g, "phon"):
            entry["ph"] = 1
        parts = [display_char(sub) for sub in descend_element_groups(g)]
        parts = [p for p in parts if p]  # buang string kosong
        if parts:
            entry["p"] = parts
        comps.append(entry)

    # Partisi utuh: tiap goresan milik tepat satu komponen level-1.
    if sorted(covered) != sorted(total):
        return []
    # Rentang tidak boleh saling tumpang tindih.
    ranges = sorted(c["r"] for c in comps)
    for a, b in zip(ranges, ranges[1:]):
        if a[1] >= b[0]:
            return []
    return comps


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kanjivg-dir", default="raw/kanjivg-master/kanji", type=Path)
    ap.add_argument("--out-dir", default="output", type=Path)
    ap.add_argument("--data-dir", default="src/data", type=Path, help="untuk verifikasi stroke_count")
    args = ap.parse_args()

    # DB app: kanji → (arti, level) untuk label arti + navigasi chip.
    db = {}
    for lv in LEVELS:
        for entry in json.load(open(args.out_dir / f"{lv}.json")):
            db[entry["kanji"]] = (entry.get("meanings") or [], lv.upper())

    stroke_counts = {}
    try:
        for lv in LEVELS:
            data = json.load(open(args.data_dir / f"{lv}.json"))
            for entry in data:
                stroke_counts[entry["kanji"]] = entry["stroke_count"]
    except FileNotFoundError:
        print("note: data-dir tidak ada — verifikasi stroke_count dilewati")

    stats = []
    n_written = 0
    for lv in LEVELS:
        entries = json.load(open(args.out_dir / f"{lv}.json"))
        out = {}
        n_decomp = 0
        for entry in entries:
            comps = parse_components(entry["kanji"], args.kanjivg_dir)
            if not comps:
                continue  # None / [] → kanji tanpa section komponen
            # Verifikasi rentang vs stroke_count app.
            sc = stroke_counts.get(entry["kanji"])
            if sc is not None and comps[-1]["r"][1] > sc:
                print(f"WARN {entry['kanji']}: rentang melebihi stroke_count ({comps[-1]['r'][1]} > {sc}) — dibuang", file=sys.stderr)
                continue
            # Perkaya label arti + level navigasi.
            for c in comps:
                if c["e"] in db:
                    meanings = db[c["e"]][0][:2]
                    if meanings:
                        c["m"] = ", ".join(meanings)
                    c["lv"] = db[c["e"]][1]
                # urutan kunci rapi: e m lv r rad ph p
                ordered = {"e": c["e"]}
                if "m" in c:
                    ordered["m"] = c["m"]
                if "lv" in c:
                    ordered["lv"] = c["lv"]
                ordered["r"] = c["r"]
                for k in ("rad", "ph", "p"):
                    if k in c:
                        ordered[k] = c[k]
                c.clear()
                c.update(ordered)
            out[entry["kanji"]] = comps
            n_decomp += 1
        path = args.out_dir / f"components_{lv}.json"
        json.dump(out, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
        n_written += 1
        stats.append((lv.upper(), len(entries), n_decomp, path.stat().st_size))

    for lv, tot, nd, sz in stats:
        print(f"{lv}: {nd}/{tot} kanji ({nd / tot * 100:.0f}%) — {sz / 1024:.1f} KB")
    total_all = sum(nd for _, _, nd, _ in stats)
    total_kanji = sum(tot for _, tot, _, _ in stats)
    print(f"TOTAL: {total_all}/{total_kanji} kanji ({total_all / total_kanji * 100:.0f}%), {n_written} file ditulis ke {args.out_dir}/")


if __name__ == "__main__":
    main()
