#!/usr/bin/env python3
"""
gen_app_icon.py — (t104 → t105 → t106) ikon brand Kanichō versi 4.

DESAIN — "kanji di atas kertas bergaris" (evolusi arahan pengguna):
  v3 (t105): kertas polos + 字 60% — pengguna menilai glyph TERLALU
  BESAR dan minta garis-garis background DIKEMBALIKAN (Ronde 12):
    1. glyph = 字 (kanji "huruf/aksara"), tinggi ink 45% kanvas
       (proporsi efektif v2 yang tidak pernah dikeluhkan).
    2. warna glyph = var(--indigo) #1F3C5C — persis class .kd-brand
       (Shippori Mincho 800, weight brand di topbar app).
    3. latar = --paper #F5F1E8 + GRID GENKŌYŌSHI #DDD5C3 — replika
       background app (.kd-root: SVG 34px crispEdges) — inilah
       "garis-garis" yang tampak di belakang tulisan 漢字帳 saat app
       dibuka. 4 sel per sisi (kerapatan app ±12 sel/layar diperbesar
       agar terbaca di launcher 48-192px); garis INTERIOR saja —
       garis tepi akan terbaca sebagai border (dihapus per Ronde 11).
    4. TETAP tanpa border/kartu → fleksibel untuk bentuk launcher
       APA PUN (square, round, squircle, teardrop).
  Setiap elemen = elemen nyata layar pembuka app; tidak ada dekorasi
  tanpa makna (lingkaran merah v1 sudah hilang sejak t104).

JAMINAN ZONA AMAN (dihitung dari TINTA AKTUAL, bukan tebakan):
  - icon-512 (legacy/PWA/Play):  tinggi ink glyph 45% kanvas
    (radius tinta ±127px; mask lingkaran legacy r=256px).
  - icon-512-maskable (PWA):      radius tinta maks ≤ 195px
    (lingkaran aman spec maskable r=40% = 204.8px + margin AA).
  - scripts/icon-512-foreground.png (Android adaptif): kanvas
    TRANSPARAN + glyph radius tinta maks ≤ 150px (= 31.6dp pada
    kanvas 108dp; lingkaran dijamin r=33dp + margin).
  Semua diukur per-piksel (alpha≥16) lalu diskalakan bila melampaui
  → tidak ada stroke yang terpotong di bentuk launcher mana pun.

SPLASH (11 kepadatan Android): kertas #F5F1E8 + GRID dengan
  KERAPATAN ASLI APP (sel = sisi terpendek/12 ≈ 34px CSS pada layar
  nyata — splash = miniatur literal layar pembuka) + LOCKUP brand
  satu baris "漢字帳 Kanjichō" — replika persis .kd-brand topbar:
  kanji Shippori 800 indigo + romaji Zen Kaku Gothic New 500
  ink-soft, baseline sejajar, gap 8/26em. (Subset @fontsource Zen
  Kaku tidak memuat U+014D "ō" — browser app memakai fallback sistem
  untuk satu huruf itu; di splash macron digambar manual di atas "o"
  terakhir supaya tipografi tetap Zen Kaku.) Cold-start kini mulus:
  splash kertas bergaris + brand → app terbuka menampilkan baris yang
  sama di atas grid yang sama.

Menghasilkan:
  1. public/icons/icon-512.png           — ikon utama (kertas + grid)
  2. public/icons/icon-512-maskable.png  — varian maskable PWA
  3. public/icons/icon-192.png           — downscale LANCZOS
  4. scripts/icon-512-foreground.png     — sumber layer adaptif
     (intermediate — BUKAN di public/ agar tidak ikut terkirim
     ke dist/APK; dibaca gen_android_icons.py)
  5. scripts/icon-512-background.png     — sumber layer BACKGROUND
     adaptif: kertas + grid full-bleed TANPA glyph (glyph = layer
     foreground; grid = tekstur background yang boleh dipotong
     mask launcher — persis filosofi ikon adaptif Android)
  6. android res drawable*/splash.png ×11 — splash branded

Jalankan ulang kapan pun desain berubah:
  python3 scripts/gen_app_icon.py && python3 scripts/gen_android_icons.py
Butuh: pip fontTools+brotli, Pillow, numpy (semuanya sudah ada).
"""
import os
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHIPPORI_800 = os.path.join(
    ROOT, "node_modules", "@fontsource", "shippori-mincho", "files",
    "shippori-mincho-japanese-800-normal.woff2",
)
ZENKAKU_500 = os.path.join(
    ROOT, "node_modules", "@fontsource", "zen-kaku-gothic-new", "files",
    "zen-kaku-gothic-new-latin-500-normal.woff2",
)

# Palet — satu sumber kebenaran dengan global.css (light) + .kd-brand.
PAPER = (245, 241, 232)     # --paper    #F5F1E8 (latar app saat dibuka)
INDIGO = (31, 60, 92)       # --indigo   #1F3C5C (warna .kd-brand)
INK_SOFT = (107, 101, 89)   # --ink-soft #6B6559 (warna .kd-brand small)

GLYPH_CHAR = "字"            # kanji "huruf/aksara" — tema inti app
BRAND_KANJI = "漢字帳"        # lockup splash = brand topbar app
BRAND_ROMAJI = "Kanjicho"    # + macron manual di atas "o" terakhir

# Grid genkōyōshi: warna --paper-line app; 4 sel per sisi ikon
# (app: ±12 sel per lebar layar — diperbesar agar grid tetap terbaca
# di ukuran launcher 48-192px).
GRID_LINE = (221, 213, 195)  # --paper-line #DDD5C3
GRID_CELLS = 4

# Batas ukuran (px pada kanvas 512) — lihat docstring untuk alasannya.
ICON_INK_RATIO = 0.45        # tinggi ink glyph vs kanvas (t106: dari 60%)
MASKABLE_MAX_R = 195.0       # maskable PWA: lingkaran aman r=204.8
FOREGROUND_MAX_R = 150.0     # adaptif Android: lingkaran r=156.4

# Splash: ukuran lockup brand vs sisi terpendek layar.
SPLASH_KANJI_RATIO = 0.105   # tinggi ink 漢字帳 ≈ 10.5% sisi terpendek
SPLASH_WIDTH_CAP = 0.62      # lebar lockup maks 62% (aman di mdpi 320px)


def woff2_to_ttf(path, need_text):
    """woff2 @fontsource → TTF sementara (Pillow tidak baca woff2).
    Verifikasi dulu semua karakter yang dibutuhkan ada di subset."""
    if not os.path.exists(path):
        raise SystemExit(f"font tidak ada: {path} — jalankan npm install")
    font = TTFont(path)
    cmap = font.getBestCmap()
    missing = [ch for ch in need_text if ord(ch) not in cmap]
    if missing:
        raise SystemExit(f"glyph hilang di {os.path.basename(path)}: {missing}")
    font.flavor = None  # lepas kompresi woff2 → TTF biasa
    tmp = tempfile.NamedTemporaryFile(suffix=".ttf", delete=False)
    font.save(tmp.name)
    font.close()
    return tmp.name


def text_tile(ttf_path, text, target_h, color):
    """Render teks → RGBA tile dengan TINGGI INK == target_h.

    Centering berbasis ink-bbox aktual (bukan em-box): font CJK
    menempatkan glyph dengan metrik baseline yang membuat penempatan
    tampak serong bila dihitung dari em-box. Tile dikembalikan dalam
    ukuran ink persis — pemanggil yang memposisikan.
    """
    n = max(len(text), 1)
    probe_px = max(int(target_h * 3), 192)
    probe = Image.new("L", (probe_px * (n + 1), probe_px * 2), 0)
    ImageDraw.Draw(probe).text(
        (probe_px // 2, probe_px // 2), text,
        font=ImageFont.truetype(ttf_path, probe_px), fill=255)
    bbox = probe.getbbox()
    if not bbox:
        raise SystemExit(f"glyph kosong: {text!r}")
    ink_h = bbox[3] - bbox[1]

    # Ukuran font agar tinggi ink ≈ target_h (linear terhadap em).
    size = max(int(probe_px * target_h / ink_h), 4)
    canvas = Image.new("L", (size * (n + 1), size * 3), 0)
    ImageDraw.Draw(canvas).text(
        (size // 2, size), text,
        font=ImageFont.truetype(ttf_path, size), fill=255)
    bb = canvas.getbbox()
    crop = canvas.crop(bb)

    tile = Image.new("RGBA", crop.size, color + (0,))
    tile.putalpha(crop)
    return tile


def ink_max_radius(tile, thresh=16):
    """Jarak maksimum piksel tinta (alpha≥thresh) dari pusat tile."""
    alpha = np.asarray(tile.split()[3])
    ys, xs = np.nonzero(alpha >= thresh)
    if len(xs) == 0:
        return 0.0
    h, w = alpha.shape
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    return float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max())


def draw_grid(img, cell_px):
    """Grid genkōyōshi (#DDD5C3) di atas kertas — replika background
    app (.kd-root: SVG 34px shape-rendering crispEdges). Garis
    INTERIOR saja: garis di tepi kanvas akan terbaca sebagai BORDER
    (elemen yang dihapus per arahan Ronde 11). Lebar garis memakai
    rasio app: 1px per 34px sel. Digambar SEBELUM glyph — z-order
    sama seperti app (glyph menimpa grid, bukan sebaliknya).
    """
    w, h = img.size
    d = ImageDraw.Draw(img)
    lw = max(round(cell_px / 34.0), 1)
    half1, half2 = lw // 2, (lw + 1) // 2 - 1

    x = float(cell_px)
    while x < w - lw:
        px = round(x)
        d.rectangle((px - half1, 0, px + half2, h - 1),
                    fill=GRID_LINE + (255,))
        x += cell_px
    y = float(cell_px)
    while y < h - lw:
        py = round(y)
        d.rectangle((0, py - half1, w - 1, py + half2),
                    fill=GRID_LINE + (255,))
        y += cell_px


def draw_glyph_centered(img, ttf_path, char, target_h, color, max_radius=None):
    """Gambar glyph terpusat di img; bila max_radius diisi dan radius
    tinta aktual melampauinya, render ulang diskalakan (2-pass) supaya
    TIDAK ADA stroke yang keluar zona aman — diukur, bukan dikira."""
    tile = text_tile(ttf_path, char, target_h, color)
    if max_radius:
        r = ink_max_radius(tile)
        if r > max_radius:
            scale = max_radius / r
            tile = text_tile(ttf_path, char, max(int(target_h * scale), 4), color)
            r2 = ink_max_radius(tile)
            if r2 > max_radius:  # koreksi pembulatan terakhir via resize
                tile = tile.resize(
                    (max(int(tile.width * max_radius / r2), 1),
                     max(int(tile.height * max_radius / r2), 1)),
                    Image.LANCZOS)
    w, h = img.size
    img.alpha_composite(
        tile, (int((w - tile.width) / 2), int((h - tile.height) / 2)))
    return tile


# ------------------------------------------------------------------
# Splash: lockup brand "漢字帳 Kanjichō" — replika .kd-brand topbar
# ------------------------------------------------------------------

def _probe_metrics(zen_ttf, size):
    """Metrik romaji dari render probe: cap-height 'K' + ink 'o'."""
    font = ImageFont.truetype(zen_ttf, size)
    out = {}
    for ch, key in (("K", "cap"), ("o", "o")):
        pw = size * 4
        p = Image.new("L", (pw, pw), 0)
        ImageDraw.Draw(p).text((pw // 4, pw // 2), ch, font=font,
                               fill=255, anchor="ls")  # y = baseline
        bb = p.getbbox()
        out[key] = {"left": bb[0] - pw // 4, "width": bb[2] - bb[0],
                    "top": pw // 2 - bb[1]}  # top = jarak di atas baseline
    return out


def _draw_romaji(d, x0, baseline, zen_ttf, size, color):
    """'Kanjichō' per karakter (anchor baseline) + macron manual.

    Subset @fontsource Zen Kaku tidak memuat U+014D (ō); browser app
    otomatis fallback sistem untuk huruf itu. Di splash kita gambar
    sendiri macron-nya di atas 'o' terakhir — posisi & ukuran diambil
    dari ink bbox 'o' dan cap-height 'K' yang diukur, jadi hasilnya
    seperti karakter ō asli font, bukan tebakan.
    """
    font = ImageFont.truetype(zen_ttf, size)
    x = float(x0)
    x_o = None
    for ch in BRAND_ROMAJI:
        d.text((x, baseline), ch, font=font, fill=color + (255,),
               anchor="ls")
        if ch == "o":
            x_o = x
        x += font.getlength(ch)
    if x_o is None:
        raise SystemExit("romaji tanpa 'o' — cek BRAND_ROMAJI")

    m = _probe_metrics(zen_ttf, size)
    bar_w = m["o"]["width"] * 0.92
    bar_h = max(2, round(size * 0.055))
    cx_bar = x_o + m["o"]["left"] + m["o"]["width"] / 2.0
    y1 = baseline - m["cap"]["top"] - round(size * 0.02)  # sedikit di atas cap
    y0 = y1 - bar_h
    d.rounded_rectangle(
        (round(cx_bar - bar_w / 2), y0, round(cx_bar + bar_w / 2), y1),
        radius=bar_h / 2.0, fill=color + (255,))


def brand_lockup_tile(ship_ttf, zen_ttf, s1):
    """Satu baris '漢字帳 Kanjichō' baseline sejajar (persis .kd-brand):
    Shippori 800 indigo + gap 8/26em + Zen Kaku 500 ink-soft."""
    s2 = max(round(s1 * 12.5 / 26), 4)   # 12.5px small @ kanji 26px
    gap = s1 * 8.0 / 26.0                # gap 8px @ 26px
    kfont = ImageFont.truetype(ship_ttf, s1)

    W = int(s1 * 5 + s2 * 10)
    H = int(s1 * 3)
    baseline = round(H * 0.66)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text((s1 * 0.5, baseline), BRAND_KANJI, font=kfont,
           fill=INDIGO + (255,), anchor="ls")
    romaji_x = s1 * 0.5 + kfont.getlength(BRAND_KANJI) + gap
    _draw_romaji(d, romaji_x, baseline, zen_ttf, s2, INK_SOFT)

    bb = img.getbbox()
    return img.crop(bb)


def em_ink_factor(ttf_path, text):
    """Rasio tinggi-ink per em — untuk konversi ukuran font ↔ ink."""
    probe_px = 200
    probe = Image.new("L", (probe_px * (len(text) + 1), probe_px * 2), 0)
    ImageDraw.Draw(probe).text(
        (probe_px // 2, probe_px // 2), text,
        font=ImageFont.truetype(ttf_path, probe_px), fill=255)
    bb = probe.getbbox()
    return (bb[3] - bb[1]) / float(probe_px)


def make_splash(w, h, ship_ttf, zen_ttf):
    """Splash: kertas + grid (kerapatan asli app) + lockup brand
    terpusat (ink-bbox) — miniatur literal layar pembuka app."""
    minside = min(w, h)
    kanji_h = minside * SPLASH_KANJI_RATIO
    s1 = max(round(kanji_h / em_ink_factor(ship_ttf, BRAND_KANJI)), 8)
    tile = brand_lockup_tile(ship_ttf, zen_ttf, s1)
    if tile.width > minside * SPLASH_WIDTH_CAP:  # layar sempit (mdpi 320)
        ratio = minside * SPLASH_WIDTH_CAP / tile.width
        tile = tile.resize((max(int(tile.width * ratio), 1),
                            max(int(tile.height * ratio), 1)), Image.LANCZOS)
    im = Image.new("RGBA", (w, h), PAPER + (255,))
    draw_grid(im, minside / 12.0)  # kerapatan asli app: sel ≈ 34px CSS
    im.alpha_composite(tile, ((w - tile.width) // 2, (h - tile.height) // 2))
    return im


SPLASHES = {
    "drawable": (480, 320),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
}


def main():
    ship = woff2_to_ttf(SHIPPORI_800, GLYPH_CHAR + BRAND_KANJI)
    zen = woff2_to_ttf(ZENKAKU_500, BRAND_ROMAJI)
    icons = os.path.join(ROOT, "public", "icons")
    os.makedirs(icons, exist_ok=True)

    try:
        # 1. Ikon utama 512 — kertas + grid + 字 (legacy square, PWA,
        #    Play Store, apple-touch): mask launcher memotong kertas.
        art = Image.new("RGBA", (512, 512), PAPER + (255,))
        draw_grid(art, 512.0 / GRID_CELLS)
        t = draw_glyph_centered(art, ship, GLYPH_CHAR,
                                round(512 * ICON_INK_RATIO), INDIGO)
        art.convert("RGB").save(os.path.join(icons, "icon-512.png"))
        art.resize((192, 192), Image.LANCZOS).convert("RGB").save(
            os.path.join(icons, "icon-192.png"))
        print(f"icon-512/192: ink {t.width}x{t.height}px (grid {GRID_CELLS} sel), "
              f"radius tinta {ink_max_radius(t):.1f}px")

        # 2. Maskable PWA — glyph dijaga dalam lingkaran aman r=40%
        #    (grid full-bleed: tekstur background, boleh terpotong mask).
        m = Image.new("RGBA", (512, 512), PAPER + (255,))
        draw_grid(m, 512.0 / GRID_CELLS)
        tm = draw_glyph_centered(m, ship, GLYPH_CHAR,
                                 round(512 * ICON_INK_RATIO), INDIGO,
                                 max_radius=MASKABLE_MAX_R)
        m.convert("RGB").save(os.path.join(icons, "icon-512-maskable.png"))
        print(f"icon-512-maskable: ink {tm.width}x{tm.height}px, "
              f"radius tinta {ink_max_radius(tm):.1f}/{MASKABLE_MAX_R:.0f}px")

        # 3. Foreground adaptif — TRANSPARAN + glyph zona aman (di
        #    scripts/, intermediate untuk gen_android_icons.py).
        fg = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        tf = draw_glyph_centered(fg, ship, GLYPH_CHAR,
                                 round(512 * ICON_INK_RATIO), INDIGO,
                                 max_radius=FOREGROUND_MAX_R)
        fg.save(os.path.join(ROOT, "scripts", "icon-512-foreground.png"))
        print(f"foreground: ink {tf.width}x{tf.height}px, "
              f"radius tinta {ink_max_radius(tf):.1f}/{FOREGROUND_MAX_R:.0f}px")

        # 4. Background adaptif — kertas + grid full-bleed TANPA glyph
        #    (glyph = layer foreground; grid boleh dipotong mask).
        bg = Image.new("RGBA", (512, 512), PAPER + (255,))
        draw_grid(bg, 512.0 / GRID_CELLS)
        bg.save(os.path.join(ROOT, "scripts", "icon-512-background.png"))
        print("background: kertas + grid full-bleed (tanpa glyph)")

        # 5. Splash Android ×11 — kertas + grid + lockup 漢字帳 Kanjichō.
        res = os.path.join(ROOT, "android", "app", "src", "main", "res")
        for folder, (w, h) in SPLASHES.items():
            make_splash(w, h, ship, zen).convert("RGB").save(
                os.path.join(res, folder, "splash.png"))
        print(f"splash → {len(SPLASHES)} kepadatan (kertas + grid + lockup)")
    finally:
        os.unlink(ship)
        os.unlink(zen)


if __name__ == "__main__":
    main()
