#!/usr/bin/env python3
"""
gen_android_icons.py — (t86) ikon Android shell Capacitor dari ikon PWA
public/icons/icon-512.png (satu-satunya sumber brand ikon app — tetap
sinkron antara PWA & Play Store).

(t105) Desain v3 "kanji di atas kertas": ikon 512 = kertas --paper
#F5F1E8 penuh + 字 indigo (.kd-brand). TANPA kartu/bingkai → mask
launcher (circle/squircle/square/rounded) hanya memotong kertas.

Menghasilkan di android/app/src/main/res/:
1. mipmap-*/ic_launcher(.png/_round.png) — launcher LEGACY (pre-8.0 &
   beberapa shortcut): resize langsung ikon 512 (kertas penuh; radius
   tinta terukur 170px << r lingkaran 256px → aman di mask bundar).
2. mipmap-*/ic_launcher_foreground.png — layer FOREGROUND ikon adaptif
   (8.0+): sumber scripts/icon-512-foreground.png (kanvas TRANSPARAN +
   字 dengan radius tinta ≤ 150/512 = 31.6dp pada kanvas 108dp, di
   dalam lingkaran dijamin r=33dp) → cukup resize 1:1 ke kanvas — TANPA
   inset zona aman lagi (geometri zona aman sudah dibangkan di sumber).
   Layer background: values/ic_launcher_background.xml = #F5F1E8 kertas.
3. drawable-*/ic_stat_kanjicho.png — ikon KECIL status bar (alpha-only
   putih): siluet 字 dari CHANNEL ALPHA foreground (glyph sudah
   terisolasi di kanvas transparan — tidak perlu deteksi warna lagi).
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
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

# Kepadatan layar → px untuk basis 48dp (launcher legacy).
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
# Kanvas foreground adaptif (basis 108dp).
FG_CANVAS = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
# Ikon status bar (basis 24dp).
STATUS = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}

BG_COLOR = (245, 241, 232, 255)  # --paper #F5F1E8 (latar ikon 512, t105)

# Ikon adaptif: sumber foreground sudah menjaga radius tinta di dalam
# lingkaran dijamin (33/108 kanvas) — lihat gen_app_icon.py. Tidak ada
# inset zona aman di sini; resize 1:1 mempertahankan geometri.


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
        print(f"mipmap-{density}: launcher {px}px + round + foreground {canvas}px")

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

    # Background adaptif: kertas paper (dulu indigo; t105 — latar ikon
    # kini kertas supaya mask apa pun memotong warna yang sama dengan
    # tepi ikon 512).
    bg_xml = os.path.join(RES, "values", "ic_launcher_background.xml")
    with open(bg_xml, "w", encoding="utf-8") as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<resources>\n"
            '    <color name="ic_launcher_background">#F5F1E8</color>\n'
            "</resources>\n"
        )
    print("values/ic_launcher_background.xml → #F5F1E8 (paper)")


if __name__ == "__main__":
    main()
