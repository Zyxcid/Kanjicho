#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_furigana.py — bacaan kana (furigana) untuk kanji di kalimat contoh
Kanjichō (t108; dibaca ulang t109). Langkah KE-3 pipeline kalimat:

  1. scripts/build_sentences.py      (pilih kalimat dari Tatoeba + gate bacaan)
  2. scripts/id_translation/translate_sentences.mjs   (terjemahan ID)
  3. scripts/build_furigana.py       (script ini)

(t109) SUMBER BACAAN — hybrid dua tokenisator (lihat reading_check.py):
  - PRIMER: pykakasi — bacaan SURFACE (どようび, ざぶとん, いっさつ).
    Versi t108 memakai field `kana` unidic yang ternyata kana UNDERLYING
    per morfem → ruby salah sistematis: 土曜日[どようひ], 座布団[ざふとん],
    一冊[いちさつ], 外国人[がいこくにん].
  - unidic dibaca utk rentang chunk yang sama; bila KEDUA alat saling
    BUNDAK (bukan sekadar beda notasi fonologis), LEXICON KATA CONTOH
    (n*_examples.json — 3.960 kata, bacaan terkurasi) jadi wasit: bacaan
    yang cocok lexicon dipakai. Tanpa wasit → pykakasi (surface-first).
  - KATA TARGET (di-highlight UI): bacaan otoritatif examples — entri
    yang COCOK KONTEKS dipilih bila kata punya >1 bacaan terdaftar
    (t108 selalu memakai bacaan entri pertama → memaksa ちゅう pada
    kalimat yang dibaca なか; kini konteks yang menentukan).

  Ruby per CHUNK pykakasi (batas kata-ish): run kanji dalam chunk
  diberi ruby dengan algoritma strip okurigana:

    食べる (たべる) → 食[た]べる     (ruby hanya di run kanji)
    座布団 (ざぶとん) → 座布団[ざぶとん]  (satu run → ruby utuh kata)

Output: field `furi` per entri — [[start, len, <kana>], …], offset
karakter ke dalam `jp`, urut & tak tumpang-tindih. UI tinggal render
<ruby>; tidak ada tokenisasi di runtime (aplikasi tetap offline, tanpa
dictionary di bundle).

Idempotent: entri yang sudah punya `furi` dilewati (--force untuk
bangun ulang). Format output kompak — sama seperti build_sentences.py.

Dependensi: python3 + fugashi + unidic-lite + pykakasi
  pip install fugashi unidic-lite pykakasi
  (environment tertentu: --break-system-packages)
Lisensi: fugashi MIT; unidic-lite Apache-2.0; pykakasi GPL-3.0 — semua
hanya dipakai BUILD-TIME untuk menurunkan bacaan; TIDAK di-ship di app
(lihat NOTICE.md).
"""
import argparse
import json
import os
import re
import statistics
import unicodedata

try:
    from reading_check import ReadingVerifier, readings_match, kata_to_hira, KANJI_RE
except ImportError:
    raise SystemExit(
        "butuh scripts/reading_check.py + dependensinya:\n"
        "  pip install fugashi unidic-lite pykakasi\n"
        "(environment tertentu: python3 -m pip install fugashi unidic-lite pykakasi --break-system-packages)"
    )

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = ["N5", "N4", "N3", "N2", "N1"]

# kana bersih utk ruby: hiragana + chōonpu (hasil konversi katakana)
HIRA_OK_RE = re.compile(r"^[ぁ-ゖー]+$")
# penanda okurigana/compound di reading JMdict (dibersihkan)
READING_MARKS_RE = re.compile(r"[.\-‐−・\s]")


def clean_reading(r):
    """kana hiragana bersih + NFKC (gabung dakuten terpisah)."""
    return unicodedata.normalize("NFKC", kata_to_hira(READING_MARKS_RE.sub("", r or "")))


def runs_of_kanji(surface):
    """Daftar (start, end) run kanji berurutan dalam surface token."""
    runs, start = [], None
    for i, ch in enumerate(surface):
        if KANJI_RE.match(ch):
            if start is None:
                start = i
        else:
            if start is not None:
                runs.append((start, i))
                start = None
    if start is not None:
        runs.append((start, len(surface)))
    return runs


def furi_for_token(surface, reading_full_hira):
    """[(offset, len, kana)] utk SATU chunk; reading = bacaan penuh
    (hiragana). Return None bila tak layak (tanpa kanji / kana kotor)."""
    if not reading_full_hira or not HIRA_OK_RE.match(reading_full_hira):
        return None
    runs = runs_of_kanji(surface)
    if not runs:
        return None
    if reading_full_hira == surface:
        return None  # bacaan == tulisan (tak perlu ruby)
    if len(runs) == 1:
        a, b = runs[0]
        pre, post = surface[:a], surface[b:]
        ok = True
        if pre and not reading_full_hira.startswith(pre):
            ok = False
        if post and not reading_full_hira.endswith(post):
            ok = False
        if ok:
            core = reading_full_hira[len(pre): len(reading_full_hira) - len(post) if post else None]
            if core and HIRA_OK_RE.match(core):
                return [(a, b - a, core)]
    # fallback: chunk multi-run / tak selaras → ruby di seluruh chunk
    return [(0, len(surface), reading_full_hira)]


def reading_over_span(spans, start, end):
    """Bacaan unidic utk rentang [start, end) — token harus menutup
    rentang PERSIS (tanpa melampaui)."""
    covering = [s for s in spans if s[0] < end and s[1] > start]
    if not covering:
        return None
    if covering[0][0] != start or covering[-1][1] != end:
        return None
    for a, b in zip(covering, covering[1:]):
        if a[1] != b[0]:
            return None
    return "".join(s[3] for s in covering)


def main():
    ap = argparse.ArgumentParser(description="furigana untuk n*_sentences.json")
    ap.add_argument("--force", action="store_true",
                    help="bangun ulang entri yang sudah punya furi")
    args = ap.parse_args()

    ver = ReadingVerifier()

    # lexicon bacaan kata contoh (semua level — wasit saat alat bundak);
    # juga bacaan otoritatif kata TARGET
    word_readings = {}
    for lv in LEVELS:
        ex = json.load(open(f"{ROOT}/src/data/{lv.lower()}_examples.json", encoding="utf-8"))
        for _k, lst in ex.items():
            for e in lst:
                r = clean_reading(e.get("reading", ""))
                if r:
                    word_readings.setdefault(e["word"], set()).add(r)

    stats = {"entries": 0, "with_furi": 0, "runs": 0, "kanji_no_furi": 0,
             "arbitrated": 0, "target_ctx": 0}
    lens_runs = []
    for lv in LEVELS:
        path = f"{ROOT}/src/data/{lv.lower()}_sentences.json"
        data = json.load(open(path, encoding="utf-8"))
        served = forced = 0
        for word, e in data.items():
            stats["entries"] += 1
            if e.get("furi") and not args.force:
                stats["with_furi"] += 1
                stats["runs"] += len(e["furi"])
                continue
            jp = e["jp"]
            if not KANJI_RE.search(jp):
                continue
            pika = ver.pika_spans(jp)
            unidic = ver.unidic_spans(jp)
            wl = len(word)
            furi = []
            for (s0, s1, orig, hira) in pika:
                if not KANJI_RE.search(orig):
                    continue
                reading = clean_reading(hira)
                # pendapat kedua: unidic atas rentang chunk yang sama
                u_read = reading_over_span(unidic, s0, s1)
                if u_read:
                    u_read = clean_reading(u_read)
                    if reading and not readings_match(reading, u_read, surface=orig):
                        # alat bundak → lexicon jadi wasit
                        lex = word_readings.get(orig)
                        chosen = None
                        for cand in (reading, u_read):
                            if lex and any(readings_match(lx, cand, orig) for lx in lex):
                                chosen = cand
                                break
                        reading = chosen if chosen is not None else reading
                        stats["arbitrated"] += 1
                # KATA TARGET (di-highlight UI): bacaan otoritatif examples.
                # Chunk boleh MELAMPAUI kata (mis. chunk 中なの utk kata 中) —
                # bagian chunk di luar kata harus kana murni supaya bacaan
                # target bisa dijahit: pre + bacaan_target + post, lalu
                # okurigana di-strip oleh furi_for_token. Entri lexicon yang
                # cocok konteks menang (bukan lagi entri pertama).
                for p in e.get("pos", []):
                    if s0 <= p and p + wl <= s1:
                        pre = orig[: p - s0]
                        post = orig[p - s0 + wl:]
                        if KANJI_RE.search(pre) or KANJI_RE.search(post):
                            break
                        lex = sorted(word_readings.get(word, []))
                        if not lex:
                            break
                        core = None
                        if reading:
                            r = reading
                            if pre and r.startswith(kata_to_hira(pre)):
                                r = r[len(pre):]
                            if post and r.endswith(kata_to_hira(post)):
                                r = r[: len(r) - len(post)]
                            core = r or None
                        target = next(
                            (lx for lx in lex if core and readings_match(lx, core, word)),
                            None,
                        ) or lex[0]
                        reading = (
                            (kata_to_hira(pre) if pre else "")
                            + target
                            + (kata_to_hira(post) if post else "")
                        )
                        stats["target_ctx"] += 1
                        break
                runs = furi_for_token(orig, reading) if reading else None
                if runs:
                    for (off, ln, kana) in runs:
                        furi.append([s0 + off, ln, kana])
            # urutkan & validasi tak tumpang-tindih + run WAJIB ber-kanji
            furi.sort(key=lambda r: r[0])
            clean = []
            last_end = -1
            for (s, ln, kana) in furi:
                if s >= last_end and s + ln <= len(jp) and KANJI_RE.search(jp[s: s + ln]):
                    clean.append([s, ln, kana])
                    last_end = s + ln
            if clean:
                e["furi"] = clean
                stats["with_furi"] += 1
                stats["runs"] += len(clean)
                lens_runs.append(len(clean))
            else:
                stats["kanji_no_furi"] += 1
            served += 1
            if args.force:
                forced += 1
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            f.write("\n")
        print(f"[{lv}] {served} entri diproses"
              + (f" (force {forced})" if args.force else "") + "")

    n = stats["entries"]
    print(f"[total] {stats['with_furi']}/{n} entri ber-furigana "
          f"({100*stats['with_furi']/n:.1f}%) | run ruby {stats['runs']} "
          f"(median {statistics.median(lens_runs) if lens_runs else 0}/kalimat) | "
          f"kalimat ber-kanji tanpa furi: {stats['kanji_no_furi']} | "
          f"wasit lexicon: {stats['arbitrated']} | target kontekstual: {stats['target_ctx']}")


if __name__ == "__main__":
    main()
