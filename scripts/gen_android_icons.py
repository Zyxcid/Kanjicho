#!/usr/bin/env python3
"""
gen_android_icons.py — (t86) ikon Android shell Capacitor dari ikon PWA
public/icons/icon-512.png (satu-satunya sumber brand ikon app — tetap
sinkron antara PWA & Play Store).

Menghasilkan di android/app/src/main/res/:
1. mipmap-*/ic_launcher(.png/_round.png) — launcher LEGACY (pre-8.0 &
   beberapa shortcut): resize langsung ikon 512 (materi penuh, bingkai
   genkōyōshi utuh).
2. mipmap-*/ic_launcher_foreground.png — layer FOREGROUND ikon adaptif
   (8.0+): kanvas 108dp transparan, materi ikon diskalakan ke zona aman
   72dp (66,67%) di tengah. Layer background (warna solid indigo) dari
   values/ic_launcher_background.xml — diganti dari putih template ke
   #1F3C5C supaya mask launcher (circle/squircle) yang menampakkan tepi
   luar tetap satu warna dengan latar ikon.
3. drawable-*/ic_stat_kanjicho.png — ikon KECIL status bar (alpha-only
   putih): siluet glyph kanji TANPA bingkai (bingkai 512 tidak terbaca
   di 24dp). Disetel lewat plugins.LocalNotifications.smallIcon di
   capacitor.config.json (iconColor memberi warna indigo di shade).

Jalankan ulang kapan pun ikon 512 berubah: python3 scripts/gen_android_icons.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "icons", "icon-512.png")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

# Kepadatan layar → px untuk basis 48dp (launcher legacy).
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
# Kanvas foreground adaptif (basis 108dp).
FG_CANVAS = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
# Ikon status bar (basis 24dp).
STATUS = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}

BG_COLOR = (31, 60, 92, 255)  # --indigo #1F3C5C (latar ikon 512)

# Rasio zona aman ikon adaptif: konten tampil penuh dalam lingkaran
# tengah 72dp dari kanvas 108dp.
SAFE_RATIO = 72.0 / 108.0


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


def make_foreground(im, canvas_px):
    """Layer adaptif: kanvas transparan, materi penuh di zona aman tengah."""
    art_px = round(canvas_px * SAFE_RATIO)
    art = im.resize((art_px, art_px), Image.LANCZOS)
    fg = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    off = (canvas_px - art_px) // 2
    fg.paste(art, (off, off))
    return fg


def glyph_silhouette(im):
    """Siluet putih glyph KANJI (tanpa kertas) untuk ikon status bar.

    Anatomi ikon 512: latar indigo (31,60,92) → kotak KERTAS krem
    (245,241,232) inset ±30px → kanji digambar dengan WARNA INDIGO yang
    SAMA dengan latar (stroke gelap di atas kertas terang). Maka stroke
    tidak bisa dibedakan dari latar dengan warna semata — batasi pencarian
    ke DALAM bbox kertas, lalu stroke = piksel gelap di dalamnya.
    Mask 1x dibangun penuh, supersampling NEAREST (blok scale×scale solid),
    lalu downscale LANCZOS terakhir memberi tepi anti-alias. Hasil: L-mode.
    """
    w, h = im.size
    rgb = im.convert("RGB")
    px = rgb.load()

    def is_paper(x, y):
        r, g, b = px[x, y]
        return r + g + b > 300  # krem ≈ 718; indigo ≈ 183

    def is_ink(x, y):
        r, g, b = px[x, y]
        return abs(r - BG_COLOR[0]) + abs(g - BG_COLOR[1]) + abs(b - BG_COLOR[2]) <= 60

    # Bbox kertas.
    pxs, pys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if is_paper(x, y):
                pxs.append(x)
                pys.append(y)
    if not pxs:
        raise SystemExit("kertas tidak terdeteksi — cek ikon sumber")
    # Kertas membawa BINGKAI tipis (garis sel genkōyōshi, ±15px tinta di
    # keempat tepinya — diukur: pita tinta 30..45 & 466..482). Glyph kanji
    # hidup DI DALAM bingkai (±128..385). Inset 20px melewati bingkai+halo.
    x0, y0 = min(pxs) + 20, min(pys) + 20
    x1, y1 = max(pxs) - 20, max(pys) - 20

    # Stroke kanji = gelap DI DALAM kertas.
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if is_ink(x, y):
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit("glyph kanji tidak terdeteksi — cek ikon sumber")
    gx0, gy0, gx1, gy1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1

    # Mask 1x: jadikan persegi dengan margin ±10%.
    gw, gh = gx1 - gx0, gy1 - gy0
    side = max(gw, gh)
    margin = round(side * 0.10)
    total = side + 2 * margin
    off_x = margin + (side - gw) // 2
    off_y = margin + (side - gh) // 2
    m1 = Image.new("L", (total, total), 0)
    m1_px = m1.load()
    for y in range(gy0, gy1):
        for x in range(gx0, gx1):
            if is_ink(x, y):
                m1_px[off_x + (x - gx0), off_y + (y - gy0)] = 255

    # Supersampling solid 4x.
    scale = 4
    return m1.resize((total * scale, total * scale), Image.NEAREST), total * scale


def main():
    src = load_source()

    for density, px in DENSITIES.items():
        out = os.path.join(RES, f"mipmap-{density}")
        os.makedirs(out, exist_ok=True)
        src.resize((px, px), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"))
        make_round(src, px).save(os.path.join(out, "ic_launcher_round.png"))
        canvas = FG_CANVAS[density]
        make_foreground(src, canvas).save(os.path.join(out, "ic_launcher_foreground.png"))
        print(f"mipmap-{density}: launcher {px}px + round + foreground {canvas}px")

    # Ikon status bar — putih alpha-only (straight alpha: RGB konstan 255,
    # hanya channel A yang membentuk glyph — bila RGB ikut dikali alpha,
    # tepi akan terender gelap ganda di Android).
    mask, big_side = glyph_silhouette(src)
    for density, px in STATUS.items():
        out = os.path.join(RES, f"drawable-{density}")
        os.makedirs(out, exist_ok=True)
        m = mask.resize((px, px), Image.LANCZOS)
        white_rgb = Image.new("L", (px, px), 255)
        im = Image.merge("RGBA", (white_rgb, white_rgb.copy(), white_rgb.copy(), m))
        im.save(os.path.join(out, "ic_stat_kanjicho.png"))
        print(f"drawable-{density}: ic_stat_kanjicho {px}px")

    # Background adaptif: indigo (template Capacitor putih).
    bg_xml = os.path.join(RES, "values", "ic_launcher_background.xml")
    with open(bg_xml, "w", encoding="utf-8") as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<resources>\n"
            '    <color name="ic_launcher_background">#1F3C5C</color>\n'
            "</resources>\n"
        )
    print("values/ic_launcher_background.xml → #1F3C5C")


if __name__ == "__main__":
    main()
