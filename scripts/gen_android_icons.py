#!/usr/bin/env python3
"""
gen_android_icons.py — (t86) ikon Android shell Capacitor dari ikon PWA
public/icons/icon-512.png (satu-satunya sumber brand ikon app — tetap
sinkron antara PWA & Play Store).

(t105→t106) Desain v4 "kanji di atas kertas bergaris": ikon 512 =
kertas --paper #F5F1E8 + GRID genkōyōshi #DDD5C3 (4 sel, garis
interior) + 字 indigo 45% (.kd-brand). TETAP tanpa border/kartu →
mask launcher bentuk apa pun hanya memotong kertas bergaris.

Menghasilkan di android/app/src/main/res/:
1. mipmap-*/ic_launcher(.png/_round.png) — launcher LEGACY (pre-8.0 &
   beberapa shortcut): resize langsung ikon 512 (grid + glyph utuh;
   radius tinta terukur 127px << r lingkaran 256px).
2. mipmap-*/ic_launcher_foreground.png — layer FOREGROUND ikon
   adaptif (8.0+): sumber scripts/icon-512-foreground.png (kanvas
   TRANSPARAN + 字 radius tinta ≤ 150/512) → resize 1:1.
   mipmap-*/ic_launcher_background.png — layer BACKGROUND adaptif
   (t106): kertas + grid genkōyōshi full-bleed dari
   scripts/icon-512-background.png — grid = tekstur background yang
   memang boleh dipotong mask (filosofi resmi ikon adaptif);
   sebelumnya warna solid via values XML (t105) / indigo (t104).
3. mipmap-anydpi-v26/*.xml — ditulis ulang script ini: background
   kini @mipmap/ic_launcher_background (PNG grid) + foreground &
   monochrome = glyph transparan. values/ic_launcher_background.xml
   (era warna solid) DIHAPUS — sudah tidak direferensikan.
4. drawable-*/ic_stat_kanjicho.png — ikon KECIL status bar
   (alpha-only putih): siluet 字 dari channel alpha foreground.
   Disetel lewat plugins.LocalNotifications.smallIcon di
   capacitor.config.json (iconColor memberi warna indigo di shade).

Jalankan ulang kapan pun ikon berubah:
  python3 scripts/gen_app_icon.py && python3 scripts/gen_android_icons.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "icons", "icon-512.png")
SRC_FG = os.path.join(ROOT, "scripts", "icon-512-foreground.png")
SRC_BG = os.path.join(ROOT, "scripts", "icon-512-background.png")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

# Kepadatan layar → px untuk basis 48dp (launcher legacy).
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
# Kanvas foreground adaptif (basis 108dp).
FG_CANVAS = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
# Ikon status bar (basis 24dp).
STATUS = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}

# Ikon adaptif: sumber foreground sudah menjaga radius tinta di dalam
# lingkaran dijamin (33/108 kanvas) — lihat gen_app_icon.py. Tidak ada
# inset zona aman di sini; resize 1:1 mempertahankan geometri. Layer
# background juga resize 1:1 dari sumber 512 (grid full-bleed).

ADAPTIVE_XML = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    "    <background android:drawable=\"@mipmap/ic_launcher_background\"/>\n"
    "    <foreground android:drawable=\"@mipmap/ic_launcher_foreground\"/>\n"
    "    <!-- (t105/t106) Themed icons Android 13+: siluet diambil dari\n"
    "         alpha layer foreground — 字 ikut diwarnai wallpaper user.\n"
    "         Aman di API 26-32 (elemen tak dikenal diabaikan saat\n"
    "         inflate). -->\n"
    "    <monochrome android:drawable=\"@mipmap/ic_launcher_foreground\"/>\n"
    "</adaptive-icon>\n"
)


def load_source():
    im = Image.open(SRC).convert("RGBA")
    # Sumber PWA ternyata RGB tanpa alpha — pastikan konsisten RGBA.
    return im


def make_round(im, px):
    """ic_launcher_round: mask lingkaran anti-alias (render 4x lalu turun)."""
    s = px * 4
    big = im.resize((s, s), Image.LANCZOS)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(big, (0, 0), mask)
    return out.resize((px, px), Image.LANCZOS)


def make_foreground(canvas_px):
    """Layer adaptif: kanvas transparan penuh; glyph 字 sudah berada
    relatif di zona aman (radius tinta ≤ 29,3% kanvas) — resize 1:1."""
    fg_src = Image.open(SRC_FG).convert("RGBA")
    return fg_src.resize((canvas_px, canvas_px), Image.LANCZOS)


def make_background(canvas_px):
    """Layer background adaptif: kertas + grid genkōyōshi full-bleed
    TANPA glyph (glyph = layer foreground). Full-bleed supaya mask
    launcher memotong grid persis seperti memotong background asli
    (filosofi resmi ikon adaptif: tekstur boleh terpotong, subjek
    harus selalu utuh di zona aman)."""
    bg_src = Image.open(SRC_BG).convert("RGBA")
    return bg_src.resize((canvas_px, canvas_px), Image.LANCZOS)


def glyph_silhouette():
    """Siluet putih glyph 字 (tanpa kertas) untuk ikon status bar.

    (t105) Sumber foreground adalah kanvas TRANSPARAN + glyph indigo —
    siluet = channel alpha itu sendiri (tidak perlu deteksi warna:
    klasifikasi luminans era kartu genkōyōshi dihapus). Alpha di-
    threshold biner (>127) dulu supaya setelah downscale LANCZOS ke
    24-96px tepinya dapat anti-alias segar, tidak blur bertumpuk.
    """
    fg = Image.open(SRC_FG).convert("RGBA")
    alpha = fg.split()[3].point(lambda a: 255 if a > 127 else 0)
    bb = alpha.getbbox()
    if not bb:
        raise SystemExit("glyph tidak terdeteksi — cek sumber foreground")
    glyph = alpha.crop(bb)

    # Mask persegi dengan margin ±10% (konvensi ikon notifikasi).
    side = max(glyph.size)
    margin = round(side * 0.10)
    total = side + 2 * margin
    m = Image.new("L", (total, total), 0)
    m.paste(glyph, (margin + (side - glyph.width) // 2,
                    margin + (side - glyph.height) // 2))
    return m


def main():
    src = load_source()

    for density, px in DENSITIES.items():
        out = os.path.join(RES, f"mipmap-{density}")
        os.makedirs(out, exist_ok=True)
        src.resize((px, px), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"))
        make_round(src, px).save(os.path.join(out, "ic_launcher_round.png"))
        canvas = FG_CANVAS[density]
        make_foreground(canvas).save(
            os.path.join(out, "ic_launcher_foreground.png"))
        make_background(canvas).save(
            os.path.join(out, "ic_launcher_background.png"))
        print(f"mipmap-{density}: launcher {px}px + round + fg/bg {canvas}px")

    # Ikon status bar — putih alpha-only (straight alpha: RGB konstan 255,
    # hanya channel A yang membentuk glyph — bila RGB ikut dikali alpha,
    # tepi akan terender gelap ganda di Android).
    mask = glyph_silhouette()
    for density, px in STATUS.items():
        out = os.path.join(RES, f"drawable-{density}")
        os.makedirs(out, exist_ok=True)
        m = mask.resize((px, px), Image.LANCZOS)
        white_rgb = Image.new("L", (px, px), 255)
        im = Image.merge("RGBA", (white_rgb, white_rgb.copy(), white_rgb.copy(), m))
        im.save(os.path.join(out, "ic_stat_kanjicho.png"))
        print(f"drawable-{density}: ic_stat_kanjicho {px}px")

    # XML ikon adaptif (anydpi-v26) — ditulis script agar regenerasi
    # ikon selalu lengkap tanpa edit manual: background = PNG grid
    # (@mipmap), foreground + monochrome = glyph transparan.
    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi, name), "w", encoding="utf-8") as f:
            f.write(ADAPTIVE_XML)
    print("mipmap-anydpi-v26: XML adaptif → bg @mipmap (grid) + monochrome")

    # (t106) values/ic_launcher_background.xml (warna solid era t105)
    # tidak direferensikan lagi — background kini PNG grid di mipmap-*/.
    old_bg = os.path.join(RES, "values", "ic_launcher_background.xml")
    if os.path.exists(old_bg):
        os.remove(old_bg)
        print("values/ic_launcher_background.xml dihapus (diganti mipmap PNG)")

    # (t106) Sisa template Capacitor yang TIDAK PERNAH direferensikan
    # (logo default Capacitor): drawable/ic_launcher_background.xml
    # (vector) + drawable-v24/ic_launcher_foreground.xml — semua ikon
    # kini PNG di mipmap-*/. Dihapus supaya res/ bersih dan tidak ada
    # kebingungan sumber ikon.
    for leftover in (
        os.path.join(RES, "drawable", "ic_launcher_background.xml"),
        os.path.join(RES, "drawable-v24", "ic_launcher_foreground.xml"),
    ):
        if os.path.exists(leftover):
            os.remove(leftover)
            print(f"dihapus (template Capacitor tak terpakai): "
                  f"{os.path.relpath(leftover, RES)}")


if __name__ == "__main__":
    main()
