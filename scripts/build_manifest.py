#!/usr/bin/env python3
"""
build_manifest.py — Build src/data/manifest.json, a small summary of every
JLPT level (total kanji count + ordered unit ids) WITHOUT the full kanji
data (readings, meanings, examples).

Why this exists: the app's Home screen needs unit ids (to compute due /
studied / mastered counts against locally-stored progress) and kanji counts
for every level, on first paint. It does NOT need the full kanji data for
levels the user hasn't opened yet. Splitting this out lets dataLoader.js
import the manifest eagerly (a few KB) while lazy-loading each level's full
n*.json (tens to hundreds of KB) only when that level is actually opened.

Usage:
    python scripts/build_manifest.py [path/to/output/dir]

Reads n5.json ... n1.json from the given directory (default: src/data
relative to the project root) and writes manifest.json alongside them.
"""
import json
import sys
from pathlib import Path

LEVEL_IDS = ["N5", "N4", "N3", "N2", "N1"]


def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parent.parent / "src" / "data"

    manifest = {}
    for level in LEVEL_IDS:
        path = data_dir / f"{level.lower()}.json"
        if not path.exists():
            print(f"[skip] {path} not found")
            continue
        with open(path, encoding="utf-8") as f:
            kanji_list = json.load(f)

        # Preserve unit order as they appear in the file (already ordered by
        # frequency from convert_kanji.py) — dedupe while keeping order.
        units = list(dict.fromkeys(k["unit"] for k in kanji_list))

        manifest[level] = {"total": len(kanji_list), "units": units}
        print(f"{level}: {len(kanji_list)} kanji, {len(units)} units")

    out_path = data_dir / "manifest.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
