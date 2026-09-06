#!/usr/bin/env python3
"""
build_manifest.py — Langkah 4 pipeline: susun src/data/manifest.json,
ringkasan kecil tiap level JLPT (jumlah kanji + daftar id unit berurut)
TANPA data kanji lengkap (bacaan, arti, contoh kata).

Kenapa perlu: layar Home butuh id unit (menghitung due/studied/mastered
terhadap progress lokal) dan jumlah kanji tiap level saat paint pertama —
tapi tidak butuh data lengkap level yang belum dibuka. Dengan manifest
yang kecil (beberapa KB), dataLoader.js bisa memuatnya eager sambil
me-load n*.json tiap level (puluhan-ratusan KB) secara lazy saat level
itu benar-benar dibuka.

Pemakaian:
    python scripts/build_manifest.py [path/to/data/dir]

Baca n5.json ... n1.json dari direktori yang diberikan (default:
output/ — workspace pipeline, konsisten dengan langkah 1–3 dan 5;
src/data/ adalah hasil promosi, jangan dijadikan default input) dan
menulis manifest.json di sebelahnya (di-promosi ke src/data/ lewat
satu cp, lihat README).
"""
import json
import sys
from pathlib import Path

LEVEL_IDS = ["N5", "N4", "N3", "N2", "N1"]


def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parent.parent / "output"

    if not data_dir.is_dir():
        # Fail-fast: tanpa ini script hanya print "[skip]" per level lalu
        # menulis manifest KOSONG diam-diam — jebakan saat src/data/ lama
        # (default sebelumnya) dihapus untuk rebuild.
        sys.exit(f"Data dir not found: {data_dir}")

    manifest = {}
    for level in LEVEL_IDS:
        path = data_dir / f"{level.lower()}.json"
        if not path.exists():
            print(f"[skip] {path} not found")
            continue
        with open(path, encoding="utf-8") as f:
            kanji_list = json.load(f)

        # Pertahankan urutan unit seperti di file (sudah urut frekuensi
        # dari convert_kanji.py) — dedupe tanpa mengubah urutan.
        units = list(dict.fromkeys(k["unit"] for k in kanji_list))

        manifest[level] = {"total": len(kanji_list), "units": units}
        print(f"{level}: {len(kanji_list)} kanji, {len(units)} units")

    out_path = data_dir / "manifest.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
