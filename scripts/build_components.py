#!/usr/bin/env python3
"""build_components.py — Ekstrak data dekomposisi komponen kanji dari SVG
KanjiVG menjadi JSON ringkas per level JLPT untuk Kanjichō.

Sumber data = struktur stroke-group KanjiVG: tiap <g> ber-atribut
kvg:element adalah komponen; grup level-pertama (anak langsung grup
root kanji) adalah bagian-bagian penyusun kanji. Contoh (時/06642):
    <g kvg:element="日" kvg:position="left" kvg:radical="general">
    <g kvg:element="寺" kvg:position="right" kvg:phon="寺">
→ 時 = 日 + 寺.

Aturan ekstraksi:
  R1  Komponen = grup gN level pertama (anak langsung root kanji);
      grup bersarang lebih dalam (sub-grup) milik komponen induknya.
  R2  Wadah TANPA kvg:element transparan: anak berlabelnya dinaikkan
      (rekursif) ke level pertama. Contoh (前): wadah atas tanpa label
      → 八; wadah bawah tanpa label → 月 + 刂.
  R3  Bagian yang dipecah (kvg:part="1"/"2", elemen sama) digabung
      kembali; jumlah goresannya dijumlah.
  R4  Glyph yang ditampilkan = kvg:element (bentuk TERTULIS — 亻, 刂,
      飠), bukan kvg:original. kvg:original (bentuk asli/etimologis:
      人, 刀, 食) disimpan sebagai field "o" untuk tooltip, dan dipakai
      sebagai TARGET LINK kalau bentuk tertulisnya bukan kanji di DB.
      Contoh (全): element="王" original="玉" → tampil 王 (4 goresan,
      konsisten dengan total 6 = 2 + 4), tooltip "originally 玉".
  R5  Goresan yang tidak termasuk grup manapun (path telanjang di
      root) atau daun tanpa label → bagian "{u: N}" (chip redup
      "+N strokes") di akhir daftar.
  R6  "lv" = level JLPT di DB tempat kanji target-link berada (untuk
      navigasi klik di Browse; loadLevelKanji cache per level).
      "k" = kanji target link bila beda dari glyph (亻 → 人).
  R7  Glyph "berisiko font" — astral (CJK Ext-B, mis. 𠂉) atau CJK
      Radicals Supplement U+2E80–2EFF (⻌ ⻖ ⻏ ⺕ …) — tidak dimuat
      font app; bila kvg:original-nya aman (⻌→辶, 𠂊→勹, ⺍→つ) tampil-
      kan bentuk itu; selain itu goresannya dilipat ke {u} supaya
      tidak ada chip tofu.

Baca:
  - raw/kanjivg-master/kanji/*.svg  (KanjiVG master, CC BY-SA 3.0 —
    unduh repo-nya ke raw/ dulu, lihat README bagian Data sources)
  - output/n5.json .. n1.json        (daftar kanji per level + DB
                                      resolusi lv + stroke_count)

Tulis:
  - output/components_n5.json ... components_n1.json
    Format: { "<kanji>": { "t": <total goresan>,
                            "p": [ { "e": glyph, "s": goresan,
                                     "lv": "N5".."N1"|null,
                                     "k": kanjiLink (jika != e),
                                     "o": bentukAsli (jika ada),
                                     "r": 1 (radikal), "ph": 1 (fonetik),
                                     "m": arti singkat (form radikal
                                          non-kanji saja) },
                                   { "u": N } ] } }
    Kanji tanpa komponen berlabel (kanji primitif, mis. 雨) tidak
    ditulis — app tidak menampilkan seksi komponen untuk mereka.

Kontrak pipeline: sama dengan build_strokes.py — semua langkah baca/
tulis di output/ (workspace); src/data/ hanya menerima hasil lewat
satu cp promosi setelah langkah 5. --data-dir src/data/ tetap bisa
dipakai untuk meng-audit salinan yang benar-benar dipakai app.

Verifikasi (build GAGAL exit 1 bila ada masalah):
  - SVG ada untuk semua kanji app
  - jumlah goresan total == stroke_count data app
  - sum(goresan semua bagian) == total (tidak ada yang hilang)
  - setiap bagian ber-e harus punya glyph 1 karakter

Pemakaian:
    python scripts/build_components.py \
        [--kanjivg-dir DIR] [--data-dir DIR] [--out-dir DIR]
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

LEVELS = ["n5", "n4", "n3", "n2", "n1"]
KVG = "{http://kanjivg.tagaini.net}"
SVGNS = "{http://www.w3.org/2000/svg}"

# Arti singkat untuk bentuk komponen yang BUKAN kanji berdiri sendiri
# (tidak akan ketemu di DB app) — frekuensi tertinggi hasil scan.
# Hanya dipakai kalau elemen (maupun original-nya) tidak ada di DB.
RADICAL_MEANINGS = {
    "艹": "grass", "⻌": "road", "辶": "road", "宀": "crown",
    "⻖": "hill", "⻏": "village", "阝": "mound", "囗": "enclosure",
    "广": "cliff", "厂": "cliff", "丶": "dot", "頁": "page", "彳": "step",
    "攵": "strike", "隹": "bird", "亠": "lid", "丿": "slash",
    "尸": "flag", "冖": "cover", "冫": "ice", "氵": "water",
    "忄": "heart", "扌": "hand", "犭": "beast", "罒": "net",
    "龸": "top", "尢": "lame", "丬": "two", "糹": "silk",
    "貝": "shell", "釒": "metal", "飠": "food", "訁": "word",
    "⺼": "flesh", "⻂": "?", "冂": "frame", "卜": "divination",
    "讠": "word", "饣": "food", "纟": "silk", "钅": "metal",
    "勹": "wrap", "臼": "mortar", "阜": "hill", "爪": "claw",
    "爿": "plank", "彑": "snare",
}


def kv_filename(kanji):
    # KanjiVG memakai hex codepoint 5 digit dengan leading nol.
    return f"{ord(kanji):05x}"


def strokes_of(g):
    return sum(1 for el in g.iter()
               if el.tag == SVGNS + "path" and "-s" in (el.get("id") or ""))


def child_groups(g):
    """Anak langsung yang merupakan stroke-group (id berakhiran -gN)."""
    return [c for c in g
            if c.tag == SVGNS + "g"
            and (c.get("id", "").split("-")[-1].startswith("g"))]


def kanji_root(svg_root, hexid):
    """Grup root kanji: svg > g#StrokePaths > g#hexid."""
    for child in svg_root:
        if child.get("id") == f"kvg:StrokePaths_{hexid}":
            for sub in child:
                if sub.get("id") == f"kvg:{hexid}":
                    return sub
    return None


def labeled_parts_from(groups):
    """R1+R2: grup berlabel jadi bagian; wadah tanpa label turun
    rekursif. Kembalikan (parts, ) — bagian mentah ber-atribut.

    Grup dengan element yang BUKAN satu karakter Unicode (mis. id
    CDP-* ala KanjiVG untuk komponen tanpa codepoint) juga diperlaku-
    kan transparan: tidak bisa dirender sebagai glyph, jadi anak
    berlabelnya dinaikkan dan goresan daunnya jatuh ke bagian {u}."""
    parts = []
    for g in groups:
        el = g.get(KVG + "element")
        if el and len(el) == 1:
            parts.append({
                "e": el,
                "orig": g.get(KVG + "original"),
                "s": strokes_of(g),
                "rad": g.get(KVG + "radical"),
                "phon": g.get(KVG + "phon"),
                "part": g.get(KVG + "part"),
            })
        else:
            parts.extend(labeled_parts_from(child_groups(g)))
    return parts


def extract(svg_path, hexid):
    """Kembalikan (total_strokes, parts) atau None bila SVG tidak
    terstruktur. parts = hasil R1-R3 (label + merge pecahan)."""
    root = ET.parse(svg_path).getroot()
    kg = kanji_root(root, hexid)
    if kg is None:
        return None
    total = strokes_of(kg)
    raw = labeled_parts_from(child_groups(kg))
    # R3 — gabungkan bagian pecahan (kvg:part) dengan elemen sama.
    merged, seen = [], {}
    for p in raw:
        if p["part"]:
            key = ("part", p["e"])
            if key in seen:
                seen[key]["s"] += p["s"]
                continue
            q = dict(p)
            seen[key] = q
            merged.append(q)
        else:
            merged.append(p)
    return total, merged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kanjivg-dir",
                    default=Path(__file__).resolve().parent.parent / "raw"
                    / "kanjivg-master" / "kanji")
    ap.add_argument("--data-dir",
                    default=Path(__file__).resolve().parent.parent / "output")
    ap.add_argument("--out-dir",
                    default=Path(__file__).resolve().parent.parent / "output")
    args = ap.parse_args()

    kv_dir, data_dir, out_dir = (Path(args.kanjivg_dir),
                                 Path(args.data_dir), Path(args.out_dir))
    if not kv_dir.is_dir():
        sys.exit(f"KanjiVG dir not found: {kv_dir} — unduh repo KanjiVG "
                 "(github.com/KanjiVG/kanjivg, ZIP master) dan ekstrak ke "
                 "raw/kanjivg-master/, atau pass --kanjivg-dir.")
    if not data_dir.is_dir():
        sys.exit(f"Data dir not found: {data_dir} (default = workspace "
                 "pipeline output/). Jalankan langkah 1-3 dulu, atau pass "
                 "--data-dir (mis. src/data untuk audit salinan terpasang).")

    # DB app: kanji -> level (level pertama tempat kanji itu muncul).
    db = {}
    stroke_counts = {}
    for lvl in LEVELS:
        src = data_dir / f"{lvl}.json"
        raw = json.loads(src.read_text(encoding="utf-8"))
        items = list(raw.values()) if isinstance(raw, dict) else raw
        for it in items:
            db.setdefault(it["kanji"], lvl.upper())
            stroke_counts.setdefault(it["kanji"], it.get("stroke_count"))

    problems = []
    total_kanji = total_parts = total_bytes = 0
    for lvl in LEVELS:
        src = data_dir / f"{lvl}.json"
        raw = json.loads(src.read_text(encoding="utf-8"))
        items = list(raw.values()) if isinstance(raw, dict) else raw
        out = {}
        for it in items:
            ch = it["kanji"]
            svg_path = kv_dir / f"{kv_filename(ch)}.svg"
            if not svg_path.exists():
                problems.append(f"{lvl} {ch}: KanjiVG SVG missing")
                continue
            res = extract(svg_path, kv_filename(ch))
            if res is None:
                problems.append(f"{lvl} {ch}: no kanji root group parsed")
                continue
            total, raw_parts = res

            parts = []
            for p in raw_parts:
                e = p["e"]
                orig = p["orig"]
                # R7 — glyph "berisiko font" tidak dimuat Shippori
                # Mincho dan dukungan font sistem tidak konsisten →
                # tofu. Dua set berisiko: astral (CJK Ext-B, mis. 𠂉)
                # dan CJK Radicals Supplement U+2E80–2EFF (⻌ ⻖ ⻏ ⺕ ⺍ …).
                # KanjiVG hampir selalu memberi kvg:original yang aman
                # (⻌→辶, ⻖→阜, ⻏→邑, 𠂊→勹, 𦥑→臼, ⺍→つ) → tampilkan
                # bentuk itu; selain itu goresannya dilipat ke {u} (chip
                # "+N" — persamaan tetap jujur soal jumlah).
                def risky(c):
                    return c is None or ord(c) > 0xFFFF or 0x2E80 <= ord(c) <= 0x2EFF
                if risky(e):
                    if orig and not risky(orig) and len(orig) == 1:
                        e = orig
                        orig = None
                    else:
                        continue  # goresannya otomatis masuk {u} lewat
                                  # selisih total - sum(parts)
                if not e or len(e) != 1:
                    problems.append(f"{lvl} {ch}: bad part glyph {e!r}")
                    continue
                part = {"e": e, "s": p["s"]}
                # R4/R6 — target link: bentuk tertulis dulu, lalu
                # bentuk asli; lv + k hanya dicatat bila ketemu (bagian
                # tanpa link tidak punya field lv sama sekali).
                target = e if e in db else (p["orig"] if p["orig"] in db else None)
                if target is not None:
                    part["lv"] = db[target]
                    if target != e:
                        part["k"] = target
                else:
                    m = RADICAL_MEANINGS.get(e)
                    if m:
                        part["m"] = m
                if p["orig"] and p["orig"] != e:
                    part["o"] = p["orig"]
                if p["rad"]:
                    part["r"] = 1
                if p["phon"]:
                    part["ph"] = 1
                parts.append(part)

            # R5 — goresan yang tidak terkover grup apa pun.
            covered = sum(p["s"] for p in parts)
            if covered < total:
                parts.append({"u": total - covered})

            # Verifikasi jumlah goresan.
            sc = stroke_counts.get(ch)
            if sc is not None and total != sc:
                problems.append(f"{lvl} {ch}: stroke_count={sc} but "
                                f"KanjiVG has {total} paths")
                continue
            if covered > total:
                problems.append(f"{lvl} {ch}: parts cover {covered} of "
                                f"{total} strokes")
                continue

            # Kanji tanpa komponen berlabel dilewati (tidak ada
            # persamaan yang bisa ditampilkan).
            named = [p for p in parts if "e" in p]
            if not named:
                continue
            out[ch] = {"t": total, "p": parts}

        dst = out_dir / f"components_{lvl}.json"
        payload = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        dst.write_text(payload, encoding="utf-8")
        total_kanji += len(out)
        total_parts += sum(len(v["p"]) for v in out.values())
        total_bytes += dst.stat().st_size
        linked = sum(1 for v in out.values() for p in v["p"] if p.get("lv"))
        print(f"{lvl.upper()}: {len(out)} kanji decomposed -> "
              f"{dst.name} ({dst.stat().st_size / 1024:.0f} KB, "
              f"{linked} linked parts)")

    print(f"TOTAL: {total_kanji} kanji, {total_parts} parts, "
          f"{total_bytes / 1024:.0f} KB")
    if problems:
        print(f"\nPROBLEMS ({len(problems)}):")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("All stroke sums verified against KanjiVG paths and app "
          "stroke_count — 0 problems.")


if __name__ == "__main__":
    main()
