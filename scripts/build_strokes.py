#!/usr/bin/env python3
"""build_strokes.py — Ekstrak data urutan goresan (stroke order) dari SVG
KanjiVG menjadi JSON ringkas per level JLPT untuk Kanjichō.

Baca:
  - raw/kanjivg-master/kanji/*.svg  (KanjiVG master, CC BY-SA 3.0 —
                                     checkout repo, satu-satunya rumah
                                     data mentah = raw/ di root aplikasi)
  - output/n5.json .. n1.json         (daftar kanji per level — workspace
                                        pipeline, sama dengan langkah 1–4)

Tulis:
  - output/strokes_n5.json ... strokes_n1.json
    Format: { "<kanji>": ["M...", "M...", ...], ... }
    satu array path-d per goresan, urut nomor goresan (s1, s2, ...).

Kontrak pipeline: SEMUA langkah baca/tulis di output/ (workspace);
src/data/ hanya menerima hasil lewat satu cp promosi setelah langkah 5
(lihat README). Dulu default di sini src/data/ — itu membuat langkah 5
bergantung pada hasil promosi: gagal (atau memverifikasi data STALE)
ketika src/data/ dihapus untuk rebuild. --data-dir src/data/ tetap bisa
dipakai untuk meng-audit salinan yang benar-benar dipakai app.

Hanya path di grup StrokePaths yang diambil; grup StrokeNumbers (label
angka) dilewati. Jumlah goresan diverifikasi terhadap field stroke_count
data app — build gagal (exit 1) kalau ada mismatch, supaya animasi dan
metadata tidak pernah bertentangan.

Pemakaian:
    python scripts/build_strokes.py [--kanjivg-dir DIR] [--data-dir DIR] [--out-dir DIR]
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Tag <path ...> dengan id "kvg:<hex>-s<N>" — atribut bisa berurutan apa pun.
PATH_RE = re.compile(r"<path\b[^>]*>")
ID_RE = re.compile(r'id="kvg:([0-9a-fA-F]+)-s(\d+)"')
# `d` harus didahului whitespace — tanpa itu, pola ini juga cocok di
# dalam atribut `id="..."` (i**d**=) dan menangkap id sebagai path.
D_RE = re.compile(r'\bd="([^"]+)"')

LEVELS = ["n5", "n4", "n3", "n2", "n1"]


def kv_filename(kanji):
    # KanjiVG memakai hex codepoint 5 digit dengan leading nol.
    return f"{ord(kanji):05x}"


def extract_strokes(svg_text):
    """Kembalikan list path-d urut goresan dari satu SVG KanjiVG."""
    strokes = {}
    for tag in PATH_RE.findall(svg_text):
        m = ID_RE.search(tag)
        if not m:
            continue
        d = D_RE.search(tag)
        if not d:
            continue
        strokes[int(m.group(2))] = d.group(1)
    if not strokes:
        return None
    nums = sorted(strokes)
    # Nomor goresan harus rapat mulai dari 1 — kalau ada lubang, data tidak
    # bisa dipercaya untuk animasi berurutan.
    if nums != list(range(1, len(nums) + 1)):
        return None
    return [strokes[n] for n in nums]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kanjivg-dir", default=Path(__file__).resolve().parent.parent / "raw" / "kanjivg-master" / "kanji")
    # Default = workspace pipeline (output/), konsisten dengan langkah
    # 1–4 — lihat kontrak di docstring. Bukan src/data/ (hasil promosi):
    # bergantung ke sana membuat script ini gagal/stale saat src/data
    # dihapus untuk rebuild.
    ap.add_argument("--data-dir", default=Path(__file__).resolve().parent.parent / "output")
    ap.add_argument("--out-dir", default=Path(__file__).resolve().parent.parent / "output")
    args = ap.parse_args()

    kv_dir = Path(args.kanjivg_dir)
    data_dir = Path(args.data_dir)
    out_dir = Path(args.out_dir)
    if not kv_dir.is_dir():
        sys.exit(f"KanjiVG dir not found: {kv_dir}")
    if not data_dir.is_dir():
        sys.exit(
            f"Data dir not found: {data_dir} (default = workspace pipeline output/). "
            "Jalankan langkah 1–3 dulu, atau pass --data-dir (mis. src/data "
            "untuk audit salinan terpasang)."
        )

    total_bytes = 0
    total_kanji = 0
    problems = []

    for lvl in LEVELS:
        src = data_dir / f"{lvl}.json"
        raw = json.loads(src.read_text(encoding="utf-8"))
        items = list(raw.values()) if isinstance(raw, dict) else raw
        out = {}
        for it in items:
            ch = it["kanji"]
            svg_path = kv_dir / f"{kv_filename(ch)}.svg"
            if not svg_path.exists():
                problems.append(f"{lvl} {ch}: KanjiVG SVG missing ({svg_path.name})")
                continue
            strokes = extract_strokes(svg_path.read_text(encoding="utf-8"))
            if strokes is None:
                problems.append(f"{lvl} {ch}: no stroke paths parsed")
                continue
            sc = it.get("stroke_count")
            if sc is not None and len(strokes) != sc:
                problems.append(f"{lvl} {ch}: stroke_count={sc} but KanjiVG has {len(strokes)} paths")
                continue
            out[ch] = strokes
        dst = out_dir / f"strokes_{lvl}.json"
        payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        dst.write_text(payload, encoding="utf-8")
        n = len(out)
        size = dst.stat().st_size
        total_kanji += n
        total_bytes += size
        print(f"{lvl.upper()}: {n} kanji -> {dst.name} ({size / 1024:.0f} KB)")

    print(f"TOTAL: {total_kanji} kanji, {total_bytes / 1024:.0f} KB")
    if problems:
        print(f"\nPROBLEMS ({len(problems)}):")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("All stroke counts verified against app stroke_count — 0 problems.")


if __name__ == "__main__":
    main()
