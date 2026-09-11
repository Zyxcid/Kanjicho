#!/usr/bin/env python3
"""Perbaiki tabel maxp (maxZones=0) pada woff2 @fontsource (Shippori Mincho).

Latar (t80): Firefox mencetak peringatan konsol beruntun saat memuat subset
Shippori Mincho:

    downloadable font: maxp: Bad maxZones: 0
    (font-family: "Shippori Mincho" ... shippori-mincho-800-369.woff2)

MaxZones sah untuk font TrueType-glyph adalah 1 (tanpa twilight zone)
atau 2 (dengan); subsetter Google kadang menuliskan 0 (nilai sah hanya
untuk skema CFF) — font tetap dirender, tapi tiap subset memicu satu
peringatan.

(t81) Font kini dikelola lewat npm @fontsource/* (OFL 1.1, dibundel
build, tanpa request pihak ketiga). File fontsource Shippori Mincho
mewarisi subset Google yang sama → maxZones=0 juga (Zen Kaku Gothic New
dan DM Mono sehat). Skrip ini dipasang sebagai hook "postinstall" di
package.json: setelah tiap npm install, file woff2 Shippori di
node_modules/@fontsource/shippori-mincho/files/ dipatch in-place
(idempoten — file yang sudah sah tidak disentuh).

Gagal lembut: bila python3/fontTools/brotli tidak tersedia di mesin
build, skrip kelihatan mencetak pesan skip dan exit 0 supaya npm
install TIDAK pernah gagal karenanya (font tetap jalan; hanya Firefox
menampilkan warning di console dev).

Pemakaian: python3 scripts/fix_font_maxp.py [--check]
  --check : hanya laporkan, tanpa menulis ulang.
"""

import glob
import os
import sys

try:
    from fontTools.ttLib import TTFont
except Exception as e:  # python/fontTools tidak terpasang — bukan error build
    print(
        "fix_font_maxp: SKIP (fontTools tidak tersedia: %s).\n"
        "  Font tetap berfungsi; untuk mematikan warning Firefox "
        "'maxp: Bad maxZones' install python3 + fonttools + brotli."
        % e
    )
    sys.exit(0)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Semua family @fontsource yang dipakai app (Zen Kaku Gothic New & DM Mono
# sehat — diperiksa t81_font_check.py — tapi tidak ada salahnya memeriksa
# semuanya: patcher idempoten).
FAMILY_DIRS = [
    os.path.join(ROOT, "node_modules", "@fontsource", "shippori-mincho", "files"),
    os.path.join(ROOT, "node_modules", "@fontsource", "zen-kaku-gothic-new", "files"),
    os.path.join(ROOT, "node_modules", "@fontsource", "dm-mono", "files"),
]

CHECK_ONLY = "--check" in sys.argv


def fix_file(path):
    """Kembalikan True bila file perlu (dan akan) ditulis ulang."""
    font = TTFont(path)
    maxp = font["maxp"]
    # Nilai sah menurut spesifikasi OpenType (font glyf): 1 tanpa twilight
    # zone, 2 dengan. maxZones=0 hanya untuk skema CFF.
    wanted = 2 if maxp.maxTwilightPoints > 0 else 1
    if maxp.maxZones == wanted:
        font.close()
        return False
    maxp.maxZones = wanted
    if not CHECK_ONLY:
        font.flavor = "woff2"
        font.save(path)
    font.close()
    return True


def main():
    files = []
    for d in FAMILY_DIRS:
        files += sorted(glob.glob(os.path.join(d, "*.woff2")))
    if not files:
        print(
            "fix_font_maxp: SKIP (belum ada woff2 @fontsource — jalankan "
            "npm install dulu)."
        )
        return 0
    patched = 0
    for path in files:
        try:
            if fix_file(path):
                patched += 1
                if CHECK_ONLY:
                    print(f"  would patch {os.path.basename(path)}")
        except Exception as e:  # jangan gagal total untuk satu file rusak
            print(f"  ERROR {os.path.basename(path)}: {e}", file=sys.stderr)
    mode = "need patching" if CHECK_ONLY else "patched"
    print(f"fix_font_maxp: {patched}/{len(files)} file {mode}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
