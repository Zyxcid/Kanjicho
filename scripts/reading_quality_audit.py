#!/usr/bin/env python3
"""
reading_quality_audit.py — AUDIT KUALITAS MESIN DATA READING Kanjichō
untuk SELURUH kanji (N5–N1, 2.211 entri) memakai ATRIBUSI STRUKTURAL.

MOTIVASI (temuan audit user atas strict-backing-in-pipeline):
  Bug bukan di FSRS/UI, tapi di HUBUNGAN reading ↔ contoh:
  1. filter_entry/build_examples_for_kanji menentukan tipe contoh (on/kun)
     memakai SUBSTRING (`h in reading_hira`, `k in reading_hira`) +
     classify_word_shape ("semua kanji → on, ada kana → kun") —
     総トン数【そうトンすう】 jatuh ke KUN padahal 総 dibaca ソウ (on).
     Mirror-nya: contoh berlabel ON yang sebenarnya kun (白雪姫【しらゆきひめ】
     "menopang" キ padahal き milik 雪).
  2. rerank_readings.rank_readings mengkredit frekuensi lewat substring
     (`c in word_reading`) — frekuensi reading bisa "dicuri" reading lain
     (すけ ⊂ たすける), dan tabrakan antar-bacaan se-tipe bergantung URUTAN
     KANJIDIC2 (break pertama menang).
  3. strict_primary_pass bagus, tapi TERLALI BELAKANG dan MEMPERCAYAI label
     tipe contoh — contoh salah tipe merusaknya dua arah.

MESIN INI (satu algoritma atribusi, dipakai semua audit):
  Alignment DP kata↔bacaan: tiap karakter kata dikonsumsi persis —
  kana (hiragana/katakana) mengkonsumsi dirinya sendiri (okurigana,
  chunk katakana トン/ケア/プロ), kanji mengkonsumsi SATU kandidat bacaan
  (on / stem kun dari format bertitik KANJIDIC2 = data segmentasi),
  varian geminasi (がく→がっ sebelum kanji berikutnya), varian rendaku
  (loose; hanya non-awal kata), 々 = ulang chunk sebelumnya (+rendaku loose).
  Hasil: himpunan (segmen_bacaan, tipe) yang TERBUKTI dari struktur —
  bukan kebetulan substring. Contoh: 血糖値 けっとうち = けつ(血,on geminasi)
  + とう(糖,on) + ち(値,kun) → tipe contoh 血 adalah ON, bukan kun.

AUDIT:
  A. Tipe contoh   — contoh yang label on/kun-nya bertentangan dengan
                     atribusi struktural (kelas bug 総トン数 / 白雪姫).
  B. Backing primary (Level A/B/C) — skor backing dihitung terhadap contoh
                     dengan TIPE ATRIBUSI (bukan label), + segmen persis:
                     on A = segmen == bacaan; kun A = stem == segmen
                     (+okurigana kata persis = 3; majemuk = 2).
                     B = longgar-valid (skor 1); C = tidak ditopang (0).
  C. Frekuensi BCCWJ struktural — kredit freq per bacaan hanya lewat
                     atribusi (menggantikan substring rerank); pembanding:
                     reading paling frekuensi se-tipe vs primary kini.

RISIKO per primary v2 (taksonomi keputusan audit — HIGH hanya berisi
  kasus yang benar-benar membutuhkan intervensi):
  🔴 HIGH, dengan SUBKATEGORI:
      example-misclassified      — contoh SALAH TIPE mengisi slot tipe
                                   primary (UI menyesatkan HARI INI);
                                   primary tetap, contoh diganti.
      primary-likely-wrong       — primary skor<2, kandidat se-tipe
                                   ber-backing ketat DAN frekuensi korpus
                                   >= 4x primary (>= FREQ_FLOOR):
                                   "kalah kuat" — verifikasi & tukar.
      primary-valid-example-missing — primary skor<2 tapi pemenang
                                   frekuensi vs kandidatnya: valid,
                                   hanya kurang contoh pembuktian.
  🔵 VARIANT — kandidat lebih baik berupa VARIAN MORFOLOGIS primary
      (on: pasangan bersuara ゲツ/ガツ; kun: STEM SAMA + okurigana
      saling perpanjang, た.れ/た.れる, こま.か/こま.かい). Skor 1 lawan 3
      di keluarga ini hanya berarti "representasi belum konsisten dengan
      aturan backing", BUKAN bukti primary salah — tidak perlu aksi data.
  🟡 SUS    : kandidat ambigu (ada tapi bukti < 4x / di bawah ambang),
              skor<2 tanpa kandidat (Level B/C), pemenang frekuensi
              se-tipe ≠ primary dengan margin kuat, ATAU slot tak
              teratribusi.
  🟢 OK     : skor>=2, slot bersih, frekuensi sepakat (atau tanpa data).

FIX PLAN (read-only): tiap primary HIGH dilengkapi usulan perbaikan —
  kata BCCWJ yang TERBUKTI (atribusi) memakai bacaan primary sebagai
  calon contoh pengganti/tambahan (+gloss JMdict), apa yang sebenarnya
  dibuktikan contoh salah-tipe (opsi pindah slot), dan contoh yang sudah
  membuktikan kandidat (untuk kasus tukar primary).

Pemakaian:
    python scripts/reading_quality_audit.py [data_dir] [raw_dir] [out_dir]
    default: src/data  raw  output
    Tulis: reading_quality_report.md + reading_quality_report.json

READ-ONLY terhadap data — tidak mengubah apa pun (instruksi verify-first).
"""

import gzip
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rerank_readings import katakana_to_hiragana, clean_reading

# ============================================================
# Util
# ============================================================

def is_kanji_char(ch):
    return "\u2e80" <= ch <= "\u2fdf" or ch in "\u3005\u3007\u303b" \
        or "\u3400" <= ch <= "\u4dbf" or "\u4e00" <= ch <= "\u9fff"


def is_kana_char(ch):
    return ("\u3041" <= ch <= "\u309f" or "\u30a1" <= ch <= "\u30fa") \
        and ch != "\u30fb"


def kana_eq(word_ch, read_ch):
    """Kana kata↔hiragana 1:1 (ba read sudah dinormalisasi hiragana)."""
    w = katakana_to_hiragana(word_ch)
    return w == read_ch


# Rendaku: varian bersuara (ba-row) + p-row (loose saja)
_VOICING = {
    "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご",
    "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ",
    "た": "だ", "ち": "ぢ", "つ": "づ", "て": "で", "と": "ど",
    "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ",
}
_P_ROW = {"は": "ぱ", "ひ": "ぴ", "ふ": "ぷ", "へ": "ぺ", "ほ": "ぽ"}

# Kana terakhir bacaan on yang bisa geminasi (く/き/つ/ち/し + し系)
_GEMINABLE_LAST = set("くきつちし")


def voiced_variants(chunk):
    """Varian rendaku sebuah chunk (untuk kanji NON-AWAL kata)."""
    out = []
    if not chunk:
        return out
    first = chunk[0]
    if first in _VOICING:
        out.append(_VOICING[first] + chunk[1:])
    if first in _P_ROW:
        out.append(_P_ROW[first] + chunk[1:])
    return out


# ============================================================
# KANJIDIC2 → tabel bacaan semua kanji (untuk segmentasi kata arbitrer)
# ============================================================

def load_kanjidic2(path):
    print(f"Loading KANJIDIC2 from {path} ...")
    table = {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for _ev, el in ET.iterparse(f, events=("end",)):
            if el.tag != "character":
                continue
            lit = el.find(".//literal")
            if lit is None or not lit.text:
                el.clear()
                continue
            on, kun = [], []
            for r in el.findall(".//reading"):
                rt = r.get("r_type")
                if rt == "ja_on" and r.text:
                    on.append(r.text)
                elif rt == "ja_kun" and r.text:
                    kun.append(r.text)
            if on or kun:
                table[lit.text] = {"on": on, "kun": kun}
            el.clear()
    print(f"  {len(table)} kanji dengan bacaan on/kun")
    return table


# ============================================================
# Kandidat per kanji — chunk + basis kredit + tipe + flag varian
# ============================================================

def build_cand_table(kanjidic):
    """{kanji: [ (chunk, base, type, flag), ... ]}
    chunk = string yang benar-benar cocok di reading kata;
    base  = bacaan basis untuk kredit (on: bacaan on; kun: STEM);
    flag  = "" plain | "gem" geminasi (hanya sah sebelum kanji lain)
            | "r-ba"/"r-pa" rendaku (hanya sah non-awal kata).
    """
    table = {}
    for ch, rds in kanjidic.items():
        cands = []
        seen = set()

        def add(chunk, base, t, flag):
            key = (chunk, t, flag)
            if chunk and key not in seen:
                seen.add(key)
                cands.append((chunk, base, t, flag))

        for r in rds["on"]:
            base = clean_reading(r)  # hiragana, tanpa titik/strip
            if not base:
                continue
            add(base, base, "on", "")
            if len(base) >= 2 and base[-1] in _GEMINABLE_LAST:
                add(base[:-1] + "っ", base, "on", "gem")
            # varian rendaku (loose)
            for v in voiced_variants(base):
                add(v, base, "on", "r")
        for r in rds["kun"]:
            full = katakana_to_hiragana(r)
            # strip dash posisi (awal/akhir) — penanda posisi, bukan kana
            stripped = re.sub(r"^-+|-+$", "", full)
            if not stripped:
                continue
            if "." in stripped:
                stem = stripped.split(".", 1)[0]
                if stem:
                    add(stem, stem, "kun", "")
                    for v in voiced_variants(stem):
                        add(v, stem, "kun", "r")
                # okurigana setelah titik ditulis KANA di kata —
                # aturan kana DP yang mengonsumsinya; cukup stem.
            else:
                add(stripped, stripped, "kun", "")
                for v in voiced_variants(stripped):
                    add(v, stripped, "kun", "r")
        if cands:
            table[ch] = cands
    return table


# ============================================================
# Atribusi struktural: alignment DP kata ↔ bacaan
# ============================================================

_ATTR_CACHE = {}


def attribute(word, reading, target, cand_table):
    """Atribusi bacaan TARGET dalam satu kata.

    Return {"strict": set((base, type)), "loose": set((base, type))}
    — base: bacaan on / stem kun yang TERBUKTI jadi segmen target
      (varian geminasi/rendaku dikembalikan ke basisnya).
      strict = tanpa rendaku; loose = melibatkan rendaku.
    Kosong dua-duanya = tidak bisa diatribusi (kata aneh / ateji).
    """
    key = (word, reading, target)
    if key in _ATTR_CACHE:
        return _ATTR_CACHE[key]

    r = katakana_to_hiragana(reading)
    # reading mengandung kanji → tidak teranalisis (lForm = lemma)
    if any(is_kanji_char(c) for c in r):
        _ATTR_CACHE[key] = {"strict": set(), "loose": set()}
        return _ATTR_CACHE[key]

    n, m = len(word), len(r)
    NOT = (None, None)
    memo = {}

    def rec(i, j, tstate, prev, loose):
        # tstate: (base,type) target bila sudah dikonsumsi, else NOT
        # prev: (chunk, base, type) kanji tepat sebelum i (untuk 々)
        k = (i, j, tstate, prev if (i < n and word[i] == "々") else None, loose)
        if k in memo:
            return memo[k]
        out = set()
        if i == n and j == m:
            if tstate != NOT:
                out.add(tstate)
            memo[k] = out
            return out
        if i >= n or j >= m:
            memo[k] = out
            return out
        ch = word[i]

        if is_kana_char(ch):
            if kana_eq(ch, r[j]):
                out |= rec(i + 1, j + 1, tstate, None, loose)
        elif ch == "々":
            if prev is not None:
                pchunk, pbase, ptype = prev
                # varian bersuara 々 (ときどき) hanya di jalur loose
                opts = [(pchunk, False)]
                if loose:
                    for v in voiced_variants(pchunk):
                        opts.append((v, True))
                for var, _is_loose in opts:
                    if r.startswith(var, j):
                        out |= rec(i + 1, j + len(var), tstate,
                                   (var, pbase, ptype), loose)
        elif is_kanji_char(ch):
            for chunk, base, t, flag in cand_table.get(ch, ()):
                if flag == "gem":
                    # geminasi hanya sah bila karakter berikutnya kanji/々
                    nxt = word[i + 1] if i + 1 < n else ""
                    if not (nxt and (is_kanji_char(nxt) or nxt == "々")):
                        continue
                if flag == "r":
                    # rendaku: tidak di awal kata; hanya jalur loose
                    if i == 0 or not loose:
                        continue
                if r.startswith(chunk, j):
                    if tstate != NOT and ch == target:
                        # kemunculan kedua target — pakai yang pertama
                        nt = tstate
                    else:
                        nt = (base, t) if ch == target else tstate
                    out |= rec(i + 1, j + len(chunk), nt,
                               (chunk, base, t), loose or flag == "r")
        memo[k] = out
        return out

    strict = rec(0, 0, NOT, None, False)
    loose = rec(0, 0, NOT, None, True) if not strict else strict
    res = {"strict": strict, "loose": loose}
    _ATTR_CACHE[key] = res
    return res


# ============================================================
# Pemuatan data app
# ============================================================

def load_app_data(data_dir):
    """{(level, kanji): (entry, examples)} dari src/data."""
    print(f"Loading app data from {data_dir} ...")
    entries = {}
    for lvl in range(5, 0, -1):
        with open(data_dir / f"n{lvl}.json", encoding="utf-8") as f:
            kanji_list = json.load(f)
        with open(data_dir / f"n{lvl}_examples.json", encoding="utf-8") as f:
            exs = json.load(f)
        for e in kanji_list:
            k = e["kanji"]
            entries[k] = (lvl, e, exs.get(k, []))
    print(f"  {len(entries)} kanji, "
          f"{sum(len(x[2]) for x in entries.values())} contoh")
    return entries


# ============================================================
# Audit A — tipe contoh (label vs atribusi struktural)
# ============================================================

def _dotted_kun_okuri(kun_readings):
    """[(stem, okurigana), ...] dari bacaan kun BERTITIK (format
    KANJIDIC2 = data segmentasi; penanda strip dihapus). Dipakai
    tie-break homofoni on/kun — PORT dari build_examples.py (Fix-2
    kelas R2; pipeline = produsen, audit = verifikator — dua
    implementasi dari SATU algoritma yang sama, invariant yang dijaga)."""
    out = []
    for r in kun_readings or []:
        core = re.sub(r"^-+|-+$", "", katakana_to_hiragana(r))
        if "." in core:
            stem, okuri = core.split(".", 1)
            if stem and okuri:
                out.append((stem, okuri))
    return out


def _resolve_homophone_type(kanji, word, segs, kun_readings):
    """Tie-break struktural homofoni on/kun — PORT dari
    build_examples.py (Fix-2 kelas R2):
      (a) kana setelah kanji cocok okurigana kun bertitik (stem-nya
          termasuk segmen) → KUN (死ぬ し+ぬ ↔ し.ぬ);
      (b) kana setelah kanji tak cocok okurigana mana pun → None;
      (c) posisi majemuk (diikuti kanji / akhir kata multi-karakter)
          → ON (病気 キ, 訓練 クン, 放送 ホウ);
      (d) kata satu-kanji → None (konservatif)."""
    idx = word.find(kanji)
    if idx < 0:
        return None
    rest = word[idx + 1:]
    if rest and is_kana_char(rest[0]):
        stems = {b for (b, t) in segs if t == "kun"}
        for stem, okuri in _dotted_kun_okuri(kun_readings):
            if stem in stems and rest.startswith(okuri):
                return "kun"
        return None
    if rest == "" and len(word) == 1:
        return None
    return "on"


def audit_example_types(entries, cands):
    """Untuk tiap contoh: atribusi tipe target + bandingkan label.

    Homofoni on/kun (segmen cocok on DAN kun — キ/き) kini dipecahkan
    DULU dengan tie-break struktural yang sama dengan pipeline
    (Fix-2 port; dulu langsung AMBIGUOUS). Sisanya — yang benar-benar
    tak terpecahkan — tetap AMBIGUOUS.

    Return {kanji: [ex_report, ...]} dengan ex_report:
      {word, reading, stored, attributed (set tipe), quality, verdict}
      verdict: OK | MISCLASSIFIED | UNKNOWN | AMBIGUOUS
    """
    result = {}
    counts = {"ok": 0, "mis_on": 0, "mis_kun": 0, "unknown": 0,
              "ambig": 0, "homofoni_resolved": 0}
    for k, (_lvl, e, exs) in entries.items():
        kun_readings = e.get("readings", {}).get("kun", []) or []
        reps = []
        for ex in exs:
            word, reading, stored = ex["word"], ex["reading"], ex["type"]
            attr = attribute(word, reading, k, cands)
            strict, loose = attr["strict"], attr["loose"]
            if strict:
                types = {t for (_b, t) in strict}
                quality = "strict"
            elif loose:
                types = {t for (_b, t) in loose}
                quality = "loose"
            else:
                types = set()
                quality = "none"
            resolved = None
            if len(types) > 1:
                # Fix-2 port: pecah homofoni dengan tie-break struktural
                # — kesepakatan dengan pipeline (attribute_example_reading).
                resolved = _resolve_homophone_type(
                    k, word, (strict or loose), kun_readings)
                if resolved:
                    types = {resolved}
                    counts["homofoni_resolved"] += 1
            if not types:
                verdict = "UNKNOWN"
                counts["unknown"] += 1
            elif len(types) > 1:
                verdict = "AMBIGUOUS"  # dua-duanya mungkin — bukti tidak unik
                counts["ambig"] += 1
            elif stored in types:
                verdict = "OK"
                counts["ok"] += 1
            else:
                verdict = "MISCLASSIFIED"
                counts["mis_on" if types == {"on"} else "mis_kun"] += 1
            reps.append({
                "word": word, "reading": reading, "stored": stored,
                "attributed": sorted(types), "quality": quality,
                "segments": sorted(f"{b}/{t}" for (b, t) in (strict or loose)),
                "homofoni_resolved": resolved,
                "verdict": verdict,
            })
        result[k] = reps
    return result, counts


# ============================================================
# Audit B — backing primary dengan contoh bertipe-atribusi
# ============================================================

def primary_parts(kana):
    """(stem, okuri) bacaan kun: たす.ける → (たす, ける); ち → (ち, None)."""
    full = re.sub(r"^-+|-+$", "", katakana_to_hiragana(kana))
    if "." in full:
        stem, okuri = full.split(".", 1)
        return stem, okuri
    return full, None


def corrected_on_score(kana, ex_reports, kanji):
    """2 = segmen atribusi == bacaan on (kanji TERBUKTI dibaca begitu);
    1 = fallback substring/geminasi lama untuk contoh tak-teratribusi;
    0 = tidak ada bukti struktural."""
    on_h = clean_reading(kana)
    if not on_h:
        return 0
    best = 0
    for rep in ex_reports:
        # hanya contoh yang tipe-atribusi (atau label) menyertai "on"
        attr_on = any(seg.endswith("/on") for seg in rep["segments"])
        label_on = rep["stored"] == "on"
        if not (attr_on or label_on):
            continue
        if attr_on and any(
            seg == f"{on_h}/on" for seg in rep["segments"]
        ):
            best = max(best, 2)
        elif not rep["segments"] and label_on:
            # tak teratribusi → bukti lama paling-paling "kemungkinan"
            r = katakana_to_hiragana(rep["reading"])
            if on_h and on_h in r:
                best = max(best, 1)
            elif len(on_h) > 1 and r.startswith(on_h[:-1] + "っ"):
                best = max(best, 1)
    return best


def corrected_kun_score(kana, ex_reports, kanji):
    """3 = segmen == stem + okurigana kata persis;
    2 = segmen == stem, kata majemuk/satu-kanji (segmen tetap terbukti);
    1 = segmen == stem tapi okurigana beda, ATAU fallback posisi lama
        untuk contoh tak-teratribusi; 0 = tidak ada bukti struktural."""
    stem, okuri = primary_parts(kana)
    if not stem:
        return 0
    best = 0
    for rep in ex_reports:
        attr_kun = any(seg.endswith("/kun") for seg in rep["segments"])
        label_kun = rep["stored"] == "kun"
        if not (attr_kun or label_kun):
            continue
        seg_match = any(
            seg == f"{stem}/kun" for seg in rep["segments"]
        )
        if seg_match:
            idx = rep["word"].find(kanji)
            rest = rep["word"][idx + 1:] if idx >= 0 else ""
            if rest == "" or not is_kana_char(rest[0]):
                best = max(best, 2)  # majemuk / satu-kanji
            elif okuri is not None:
                best = max(best, 3 if rest == okuri else 1)
            else:
                best = max(best, 3 if rest == "" else 1)
        elif not rep["segments"] and label_kun:
            # fallback aturan posisi lama (bukti lemah, max 1)
            r = katakana_to_hiragana(rep["reading"])
            word = rep["word"]
            if not word.startswith(kanji):
                if stem in r:
                    best = max(best, 1)
                continue
            if not r.startswith(stem):
                continue
            rest = word[1:]
            if rest == "" or not is_kana_char(rest[0]):
                best = max(best, 1)  # (posisi terbukti tapi tak tersegmentasi)
            else:
                best = max(best, 1)
    return best


def corrected_score(kana, ex_type, ex_reports, kanji):
    if ex_type == "on":
        return corrected_on_score(kana, ex_reports, kanji)
    return corrected_kun_score(kana, ex_reports, kanji)


def score_letter(s):
    if s >= 2:
        return "A"
    if s == 1:
        return "B"
    return "C"


# ============================================================
# Audit C — frekuensi BCCWJ dengan atribusi struktural
# ============================================================

def load_bccwj_rows(path, wanted_kanji):
    """Baris BCCWJ (lemma, reading_hira, freq) yang mengandung salah satu
    kanji target — satu pass, indeks per kanji."""
    print(f"Loading BCCWJ from {path} ...")
    import csv
    index = {k: [] for k in wanted_kanji}
    n_rows = 0
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)
        for row in reader:
            if len(row) < 7:
                continue
            lemma = row[2]
            lform = row[1]
            if not any(c in wanted_kanji for c in lemma):
                continue
            try:
                freq = int(row[6])
            except ValueError:
                continue
            reading = katakana_to_hiragana(lform)
            if any(is_kanji_char(c) for c in reading):
                continue  # lForm tak teranalisis (berisi kanji)
            n_rows += 1
            pos = row[3] if len(row) > 3 else ""
            for c in set(lemma):
                if c in index:
                    index[c].append((lemma, reading, freq, pos))
    print(f"  {n_rows} baris terindeks untuk {len(wanted_kanji)} kanji")
    return index


def structural_freq_for_kanji(kanji, rows, cands):
    """Frekuensi per bacaan HANYA lewat atribusi struktural.
    Return (freq_on, freq_kun, words_on, words_kun, n_words, n_unattr)
    — words_*: contoh kata peng-kredit per kunci (≤500) untuk deteksi
    "keluarga bacaan" (bentuk ganda KANJIDIC2: 月 ゲツ/ガツ, 代 か.わる/
    かわ.る — morfem sama, bentuk bertitik beda; jangan dianggap
    ketidakcocokan ranking)."""
    freq_on, freq_kun = {}, {}
    words_on, words_kun = {}, {}
    n_words = n_unattr = 0
    for lemma, reading, freq, _pos in rows:
        attr = attribute(lemma, reading, kanji, cands)
        segs = attr["strict"] or attr["loose"]
        if not segs:
            n_unattr += 1
            continue
        wid = (lemma, reading)  # identitas kata+ejaan: 異形 いけ ≠ 異形 いぎょう
        for base, t in segs:
            if t == "on":
                freq_on[base] = freq_on.get(base, 0) + freq
                if len(words_on.get(base, ())) < 500:
                    words_on.setdefault(base, set()).add(wid)
            else:
                freq_kun[base] = freq_kun.get(base, 0) + freq
                if len(words_kun.get(base, ())) < 500:
                    words_kun.setdefault(base, set()).add(wid)
        n_words += 1
    return freq_on, freq_kun, words_on, words_kun, n_words, n_unattr


# Bentuk ganda KANJIDIC2 = keluarga morfem yang sama, bukan sinyal
# ranking: pasangan on bersuara (ゲツ/ガツ) dan stem se-prefix
# (か/かわ dari か.わる/かわ.る).

def _voiced_pair(a, b):
    """a/b sama panjang, beda HANYA kana pertamanya, dan bedanya
    pengsuaraan rendaku (げつ/がつ, し/じ, ふ/ぶ)."""
    if len(a) != len(b) or not a:
        return False
    if a[1:] != b[1:]:
        return False
    return (_VOICING.get(a[0]) == b[0] or _P_ROW.get(a[0]) == b[0]
            or _VOICING.get(b[0]) == a[0] or _P_ROW.get(b[0]) == a[0])


def _prefix_pair(a, b):
    if not a or not b or a == b:
        return False
    return a.startswith(b) or b.startswith(a)


def _listed_stems(entry):
    stems = set()
    for r in entry.get("readings", {}).get("kun", []) or []:
        stripped = re.sub(r"^-+|-+$", "", katakana_to_hiragana(r))
        if "." in stripped:
            s = stripped.split(".", 1)[0]
            if s:
                stems.add(s)
        elif stripped:
            stems.add(stripped)
    return stems


def is_morph_variant(kana, alt_kana, t):
    """True bila primary dan kandidat adalah VARIAN MORFOLOGIS sekeluarga.

    on  → pasangan bersuara dari kana dasar yang SAMA (し/じ, ふ/ぶ,
          つ/づ — panjang sama, ekor sama). Kasus vokal-bergeser
          (ゲツ/ガツ) sengaja TIDAK dianggap varian (bukan rendaku
          kana-dasar-sama; tidak muncul di data HIGH saat ini).
    kun → STEM SAMA + okurigana saling perpanjang (た.れ/た.れる,
          こま.か/こま.かい, -まぎ.れ/まぎ.れる, う.まれ/う.まれる).
    Keluarga ini adalah bentuk-bentuk kamus dari morfem yang sama:
    skor 1 lawan 3 di dalamnya HANYA berarti representasi primary vs
    bentuk contoh belum konsisten — bukan bukti primary salah.
    Sengaja DANGKAL: beda stem (かた/かたち, かわ.り/か.わり, お.り/おり)
    TIDAK dianggap varian — itu sinyal ranking yang layak diverifikasi.
    """
    if not kana or not alt_kana:
        return False
    if t == "on":
        a, b = clean_reading(kana), clean_reading(alt_kana)
        return bool(a and b and _voiced_pair(a, b))
    sa, oa = primary_parts(kana)
    sb, ob = primary_parts(alt_kana)
    if not sa or sa != sb:
        return False
    if oa is None and ob is None:
        return False  # identik — bukan kasus kandidat
    if oa is None or ob is None:
        return True   # stem sama: bentuk telanjang vs ber-okurigana
    return oa != ob and (ob.startswith(oa) or oa.startswith(ob))


# ============================================================
# Klasifikasi risiko + laporan
# ============================================================

FREQ_MARGIN = 2.0     # pemenang ≥ 2× frekuensi primary → mencurigakan
FREQ_FLOOR = 2000     # ambang bawah frekuensi pemenang (anti-noise korpus)
STRONG_MARGIN = 4.0   # kandidat "jauh lebih kuat": ≥4× primary + ≥FREQ_FLOOR
                      # (kelompok A: margin data terpisah bersih — kasus
                      # A semua ≥6×/∞, kasus non-A semua ≤3,95×)
PROPOSAL_MIN_FREQ = 30  # usulan contoh: frekuensi BCCWJ minimal
PROPOSAL_MAX_LEN = 5    # usulan contoh: panjang kata maksimal
PROPOSAL_TOP = 3        # usulan contoh: banyaknya kandidat per slot


def classify_primary(p, ex_reports, entry, freq, freq_words):
    """Risiko satu primary. Return dict analisis lengkap."""
    t = p.get("type")
    kana = p.get("kana", "")
    score = corrected_score(kana, t, ex_reports, entry["kanji"])
    letter = score_letter(score)

    # contoh SALAH TIPE yang sekarang mengisi slot tipe ini (UI menyesatkan)
    mis_slot = [
        rep for rep in ex_reports
        if rep["stored"] == t and rep["verdict"] == "MISCLASSIFIED"
    ]

    # kandidat se-tipe dengan backing ketat (primary lebih baik tersedia?)
    reading_list = entry.get("readings", {}).get(t, []) or []
    primary_kanas = {pp.get("kana") for pp in entry.get("primary_readings", [])}
    best_alt = None
    for cand_kana in reading_list:
        if cand_kana in primary_kanas:
            continue
        s = corrected_score(cand_kana, t, ex_reports, entry["kanji"])
        if s >= 2 and (best_alt is None or s > best_alt[1]):
            best_alt = (cand_kana, s)

    # frekuensi struktural se-tipe + deteksi keluarga bentuk-ganda
    freq_map = freq.get(t, {})
    my_freq = 0
    if t == "on":
        key = clean_reading(kana)
        my_freq = freq_map.get(key, 0)
    else:
        key = primary_parts(kana)[0]
        my_freq = freq_map.get(key, 0)
    winner = None
    family = False
    if freq_map:
        w_key = max(freq_map, key=freq_map.get)
        winner = (w_key, freq_map[w_key])
        if w_key != key:
            w_map = freq_words.get(t, {})
            shared = bool(
                w_map.get(key) and w_map.get(w_key)
                and w_map[key] & w_map[w_key]
            )
            if t == "on":
                on_keys = {clean_reading(x) for x in
                           entry.get("readings", {}).get("on", []) or []}
                family = shared or (
                    key in on_keys and w_key in on_keys
                    and _voiced_pair(key, w_key)
                )
            else:
                stems = _listed_stems(entry)
                # keluarga kun: prefix (か/かわ) ATAU pasangan bersuara
                # (は/ば dari は.れ/-ば.れ — rendaku morfem sama)
                family = shared or (
                    key in stems and w_key in stems
                    and (_prefix_pair(key, w_key) or _voiced_pair(key, w_key))
                )
    freq_mismatch = bool(
        winner and winner[0] != key and not family
        and winner[1] >= FREQ_MARGIN * (my_freq + 1)
        and winner[1] >= FREQ_FLOOR
    )

    # ---- kandidat diperiksa: varian morfologis? seberapa kuat? ----
    variant_alt = False
    alt_freq = 0
    if best_alt:
        alt_kana = best_alt[0]
        variant_alt = is_morph_variant(kana, alt_kana, t)
        alt_key = clean_reading(alt_kana) if t == "on" \
            else primary_parts(alt_kana)[0]
        alt_freq = freq_map.get(alt_key, 0)

    # rekomendasi per kategori v2
    if mis_slot:
        rec = ("PERBAIKI CONTOH (primary tetap) — slot ini diisi kata yang "
               "tidak memakai bacaan primary; lihat usulan pengganti")
    elif best_alt and variant_alt:
        rec = (f"TANPA AKSI DATA — kandidat {best_alt[0]} adalah varian "
               f"morfologis primary (morfem sama); skor 1 vs 3 di keluarga "
               f"ini bukan bukti primary salah")
    elif best_alt and my_freq > alt_freq:
        rec = (f"PERTAHANKAN PRIMARY, TAMBAH CONTOH — primary pemenang "
               f"frekuensi ({my_freq} vs kandidat {alt_freq}); butuh kata "
               f"yang membuktikan bacaan ini")
    elif best_alt and alt_freq >= FREQ_FLOOR \
            and alt_freq >= STRONG_MARGIN * (my_freq + 1):
        rec = (f"GANTI PRIMARY → {best_alt[0]} — backing ketat + frekuensi "
               f"korpus {alt_freq} vs {my_freq} (≥{STRONG_MARGIN:g}× dan "
               f"≥ {FREQ_FLOOR})")
    elif best_alt:
        rec = (f"VERIFIKASI MANUAL — kandidat {best_alt[0]} ada tapi bukti "
               f"belum cukup kuat untuk menukar primary "
               f"(frekuensi {alt_freq} vs {my_freq})")
    elif score < 2:
        rec = "TAMBAH CONTOH yang membuktikan bacaan (Level B/C tanpa kandidat)"
    else:
        rec = ""

    # slot tidak bisa diatribusi sama sekali?
    slot_reps = [rep for rep in ex_reports if rep["stored"] == t]
    slot_blind = bool(slot_reps) and all(
        rep["verdict"] in ("UNKNOWN", "AMBIGUOUS") for rep in slot_reps
    )

    # ---- klasifikasi risiko v2 ----
    weak = score < 2
    if mis_slot:
        risk = "HIGH"
        category = "example-misclassified"
        why = ["contoh-salah-tipe-di-slot"]
    elif weak and best_alt and variant_alt:
        risk = "VARIANT"
        category = "morphological-variant"
        why = ["kandidat-varian-morfologis"]
    elif weak and best_alt and my_freq > alt_freq:
        risk = "HIGH"
        category = "primary-valid-example-missing"
        why = ["kandidat-lebih-baik"]
    elif weak and best_alt and alt_freq >= FREQ_FLOOR \
            and alt_freq >= STRONG_MARGIN * (my_freq + 1):
        risk = "HIGH"
        category = "primary-likely-wrong"
        why = ["kandidat-jauh-lebih-kuat"]
    elif weak and best_alt:
        risk = "SUSPICIOUS"
        category = "primary-ambiguous"
        why = ["kandidat-ambigu"]
        if weak:
            why.append("backing-lemah")
    elif weak or freq_mismatch or slot_blind:
        risk = "SUSPICIOUS"
        category = ""
        why = []
        if weak:
            why.append("backing-lemah")
        if freq_mismatch:
            why.append("frekuensi-tidak-sepakat")
        if slot_blind:
            why.append("slot-tak-teratribusi")
    else:
        risk = "OK"
        category = ""
        why = []

    # varian yang membawa sinyal lain (frekuensi/slot) tetap dilaporkan
    # transparan — tidak ditelan kategori VARIANT
    if risk == "VARIANT" and (freq_mismatch or slot_blind):
        risk = "SUSPICIOUS"
        why = ["kandidat-varian-morfologis"]
        if freq_mismatch:
            why.append("frekuensi-tidak-sepakat")
        if slot_blind:
            why.append("slot-tak-teratribusi")

    return {
        "kana": kana, "type": t, "score": score, "letter": letter,
        "risk": risk, "category": category, "why": why, "recommend": rec,
        "variant": variant_alt,
        "mis_slot": [
            f"{r['word']}【{r['reading']}】 label={r['stored']} "
            f"asli={'/'.join(r['attributed'])}" for r in mis_slot
        ],
        "best_alt": best_alt and f"{best_alt[0]} (skor {best_alt[1]})",
        "best_alt_kana": best_alt[0] if best_alt else None,
        "alt_freq": alt_freq,
        "my_freq": my_freq, "winner": winner, "freq_mismatch": freq_mismatch,
        "freq_family": family, "freq_key": key,
    }


# ============================================================
# Fix plan (read-only) — usulan perbaikan per primary HIGH
# ============================================================

def propose_examples(kanji, ptype, kana, rows, cands, existing_words):
    """Cari kata BCCWJ yang TERBUKTI (atribusi struktural) memakai bacaan
    primary — calon contoh pengganti/tambahan untuk slot ini.

    Return {"pass": [...], "low": [...]} — "pass" lolos ambang frekuensi,
    "low" fallback terbaik di bawah ambang (frekuensi rendah, ditandai).
    Item: {word, reading, freq, exact} — exact = okurigana kata persis
    cocok (kun) / segmen on persis.
    """
    if ptype == "on":
        want, okuri = clean_reading(kana), None
    else:
        want, okuri = primary_parts(kana)
    if not want:
        return {"pass": [], "low": []}
    out, low = [], []
    seen = {}  # lemma -> item (BCCWJ punya baris ganda; simpan freq maks)
    for lemma, reading, freq, pos in rows:
        if "固有名詞" in (pos or ""):
            continue  # nama diri bukan contoh pembelajaran yang baik
        if lemma in existing_words or len(lemma) > PROPOSAL_MAX_LEN:
            continue
        attr = attribute(lemma, reading, kanji, cands)
        segs = attr["strict"] or attr["loose"]
        if (want, ptype) not in segs:
            continue
        prev = seen.get(lemma)
        if prev is not None and prev["freq"] >= freq:
            continue
        exact = True
        if ptype == "kun":
            idx = lemma.find(kanji)
            rest = lemma[idx + 1:] if idx >= 0 else ""
            exact = ((okuri is None and rest == "")
                     or (okuri is not None and rest == okuri))
        item = {"word": lemma, "reading": reading, "freq": freq,
                "exact": exact}
        seen[lemma] = item
        if prev is not None:  # ganti baris lama dengan freq lebih tinggi
            for bucket in (out, low):
                if prev in bucket:
                    bucket.remove(prev)
        (out if freq >= PROPOSAL_MIN_FREQ else low).append(item)
    out.sort(key=lambda x: (not x["exact"], -x["freq"]))
    low.sort(key=lambda x: (not x["exact"], -x["freq"]))
    return {"pass": out[:PROPOSAL_TOP], "low": low[:2]}


def build_fix_plan(entry, prim_rep, ex_reports, rows, cands, primary_index):
    """Rencana perbaikan satu primary berisiko HIGH (tanpa menyentuh data).

    primary_index: {(key_bacaan, tipe): kana} semua primary kanji ini —
    dipakai untuk catatan "contoh salah-tipe membuktikan primary mana".
    """
    kanji = entry["kanji"]
    t = prim_rep["type"]
    kana = prim_rep["kana"]
    existing = {r["word"] for r in ex_reports}
    plan = {}

    # 1) contoh salah-tipe di slot ini sebenarnya membuktikan apa?
    if prim_rep.get("mis_slot"):
        proves = []
        for rep in ex_reports:
            if rep["stored"] != t or rep["verdict"] != "MISCLASSIFIED":
                continue
            for seg in rep["segments"]:
                base, st = seg.rsplit("/", 1)
                tgt = primary_index.get((base, st))
                note = f" = primary {tgt}" if tgt else ""
                proves.append(f"{rep['word']}【{rep['reading']}】 "
                              f"membuktikan {base} ({st}){note}")
        if proves:
            plan["mis_proves"] = sorted(set(proves))

    # 2) usulan contoh untuk slot primary ini
    if prim_rep.get("category") in ("example-misclassified",
                                    "primary-valid-example-missing"):
        plan["proposals"] = propose_examples(
            kanji, t, kana, rows, cands, existing)

    # 3) untuk primary-likely-wrong: contoh yang SUDAH membuktikan kandidat
    alt_kana = prim_rep.get("best_alt_kana")
    if prim_rep.get("category") == "primary-likely-wrong" and alt_kana:
        alt_key = clean_reading(alt_kana) if t == "on" \
            else primary_parts(alt_kana)[0]
        proven = sorted(set(
            f"{r['word']}【{r['reading']}】" for r in ex_reports
            if f"{alt_key}/{t}" in r["segments"]
        ))
        if proven:
            plan["alt_proven_by"] = proven

    return plan


DICT_COLLECT = 15   # batas pengumpulan usulan kamus sebelum sortir


def load_jmdict_extras(path, wanted, needs, cands):
    """Satu pass JMdict: (1) gloss untuk kata usulan BCCWJ; (2) usulan
    contoh dari KAMUS untuk slot yang korpus tidak menyediakan kata umum.

    wanted: {word: reading} — gloss dicari bila keb==word dan hiragana
    reb == reading (entri pertama yang cocok menang).
    needs: {(kanji, kana): {type, existing, proposed}} — keb (panjang
    ≤ PROPOSAL_MAX_LEN, memuat kanji, tidak dipakai contoh lama/usulan
    BCCWJ) diatribusi; diterima bila segmennya membuktikan bacaan primary.
    Return (glosses, dict_props) — dict_props {(kanji, kana): [item]},
    item freq=0 (sumber kamus, bukan korpus).
    """
    if not wanted and not needs:
        return {}, {}
    print(f"Loading JMdict: {len(wanted)} gloss + {len(needs)} slot "
          f"fallback ...")
    gloss, props = {}, {}
    k_index = {}
    for (kanji, kana), nd in needs.items():
        k_index.setdefault(kanji, []).append((kana, nd))
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for _ev, el in ET.iterparse(f, events=("end",)):
            if el.tag != "entry":
                continue
            kebs = [k.text for k in el.findall(".//k_ele/keb") if k.text]
            gloss_el = el.find(".//gloss")
            gtxt = gloss_el.text if gloss_el is not None \
                and gloss_el.text else None
            hit = any(w in wanted for w in kebs)
            fb_kebs = [w for w in kebs
                       if len(w) <= PROPOSAL_MAX_LEN
                       and any(ch in k_index for ch in w)]
            if not hit and not fb_kebs:
                el.clear()
                continue
            rebs = [r.text for r in el.findall(".//r_ele/reb") if r.text]
            # (1) gloss
            for w in kebs:
                if w in wanted and w not in gloss:
                    rd = katakana_to_hiragana(wanted[w])
                    if any(katakana_to_hiragana(rb) == rd for rb in rebs):
                        gloss[w] = gtxt
            # (2) usulan kamus fallback
            for w in fb_kebs:
                for rb in rebs:
                    reading = katakana_to_hiragana(rb)
                    for ch in w:
                        if ch not in k_index:
                            continue
                        for kana, nd in k_index[ch]:
                            key = (ch, kana)
                            lst = props.setdefault(key, [])
                            if len(lst) >= DICT_COLLECT:
                                continue
                            if w in nd["existing"] or w in nd["proposed"]:
                                continue
                            if any(i["word"] == w and i["reading"] == reading
                                   for i in lst):
                                continue
                            attr = attribute(w, reading, ch, cands)
                            segs = attr["strict"] or attr["loose"]
                            want = clean_reading(kana) if nd["type"] == "on" \
                                else primary_parts(kana)[0]
                            if not want or (want, nd["type"]) not in segs:
                                continue
                            okuri = primary_parts(kana)[1] \
                                if nd["type"] != "on" else None
                            idx = w.find(ch)
                            rest = w[idx + 1:] if idx >= 0 else ""
                            exact = (nd["type"] == "on"
                                     or (okuri is None and rest == "")
                                     or (okuri is not None and rest == okuri))
                            item = {"word": w, "reading": reading,
                                    "freq": 0, "exact": exact}
                            if gtxt:
                                item["gloss"] = gtxt
                            lst.append(item)
            el.clear()
    # sortir: exact dulu, kata terpendek dulu; dedupe bacaan sama;
    # ambil PROPOSAL_TOP teratas
    for key, lst in props.items():
        lst.sort(key=lambda i: (not i["exact"], len(i["word"])))
        seen_rd = set()
        dedup = []
        for i in lst:
            if i["reading"] in seen_rd:
                continue
            seen_rd.add(i["reading"])
            dedup.append(i)
        props[key] = dedup[:PROPOSAL_TOP]
    print(f"  {len(gloss)} gloss, {sum(len(v) for v in props.values())} "
          f"usulan kamus ditemukan")
    return gloss, props


# ============================================================
# Main
# ============================================================

RISK_ORDER = {"HIGH": 4, "VARIANT": 3, "SUSPICIOUS": 2, "OK": 1,
              "NODATA": 0}
RISK_ICON = {"HIGH": "🔴", "VARIANT": "🔵", "SUSPICIOUS": "🟡",
             "OK": "🟢", "NODATA": "⚪"}


def main():
    root = Path(__file__).resolve().parent.parent
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "src" / "data"
    raw_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "raw"
    out_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else root / "output"
    out_dir.mkdir(parents=True, exist_ok=True)

    for p in (data_dir / "n5.json", raw_dir / "kanjidic2.xml.gz"):
        if not p.exists():
            print(f"Error: file tidak ditemukan: {p}", file=sys.stderr)
            sys.exit(1)

    kanjidic = load_kanjidic2(raw_dir / "kanjidic2.xml.gz")
    cands = build_cand_table(kanjidic)
    entries = load_app_data(data_dir)

    # ---- Audit A ----
    print("\n[1/3] Audit tipe contoh (atribusi struktural) ...")
    ex_reports, type_counts = audit_example_types(entries, cands)

    # ---- Audit C (BCCWJ) ----
    print("\n[2/3] Frekuensi BCCWJ dengan atribusi struktural ...")
    bccwj_index = load_bccwj_rows(
        raw_dir / "BCCWJ_frequencylist_luw2_ver1_0.tsv", set(entries)
    )

    # ---- Audit B + klasifikasi risiko ----
    print("\n[3/3] Backing primary + klasifikasi risiko ...")
    # skor metode LAMA (scorer kiriman di atas contoh berlabel asli) —
    # untuk rekonsiliasi dengan klaim audit user.
    from build_examples import on_strict_score as old_on, \
        kun_strict_score as old_kun
    old_unbacked = {"on": 0, "kun": 0}
    new_unbacked = {"on": 0, "kun": 0}

    records = []
    for k, (lvl, e, exs) in entries.items():
        ex_reps = ex_reports[k]
        rows = bccwj_index.get(k, [])
        freq_on, freq_kun, w_on, w_kun, n_w, n_u = \
            structural_freq_for_kanji(k, rows, cands)
        freq = {"on": freq_on, "kun": freq_kun}
        freq_words = {"on": w_on, "kun": w_kun}
        # index primary per kanji (untuk catatan "contoh membuktikan X")
        primary_index = {}
        for p in e.get("primary_readings", []):
            pk = clean_reading(p["kana"]) if p.get("type") == "on" \
                else primary_parts(p["kana"])[0]
            if pk:
                primary_index[(pk, p.get("type"))] = p["kana"]
        prim_reps = []
        fix_plans = []
        for p in e.get("primary_readings", []):
            rep = classify_primary(p, ex_reps, e, freq, freq_words)
            # hitung rekonsiliasi
            if exs:
                old = old_on(p["kana"], exs, k) if p.get("type") == "on" \
                    else old_kun(p["kana"], exs, k)
                if old < 2:
                    old_unbacked[p["type"]] += 1
                if rep["score"] < 2:
                    new_unbacked[p["type"]] += 1
            if rep["risk"] == "HIGH":
                fix_plans.append({
                    "type": rep["type"], "kana": rep["kana"],
                    "category": rep["category"],
                    "plan": build_fix_plan(
                        e, rep, ex_reps, rows, cands, primary_index),
                })
            prim_reps.append(rep)
        if not exs:
            kanji_risk = "NODATA"
        else:
            kanji_risk = max(
                (pr["risk"] for pr in prim_reps), key=lambda r: RISK_ORDER[r]
            ) if prim_reps else "NODATA"
        dr = kanjidic.get(k, {})
        records.append({
            "kanji": k, "level": lvl, "risk": kanji_risk,
            "primaries": prim_reps,
            "examples": ex_reps,
            "freq": {"on": freq_on, "kun": freq_kun},
            "freq_words": n_w, "freq_unattributed": n_u,
            "fix_plans": fix_plans,
            "dict_readings": {"on": dr.get("on", []),
                              "kun": dr.get("kun", [])},
        })
    records.sort(key=lambda r: (r["level"], r["kanji"]))

    # ---- gloss JMdict untuk usulan + fallback kamus untuk slot tanpa
    # ---- kata korpus umum ----
    wanted = {}
    needs = {}
    for rec in records:
        for fp in rec["fix_plans"]:
            props = fp["plan"].get("proposals")
            if props is None:
                continue
            for item in props.get("pass", []) + props.get("low", []):
                wanted.setdefault(item["word"], item["reading"])
            if not props.get("pass"):
                needs[(rec["kanji"], fp["kana"])] = {
                    "type": fp["type"],
                    "existing": {e["word"] for e in rec["examples"]},
                    "proposed": {i["word"]
                                 for i in props.get("low", [])},
                }
    glosses, dict_props = load_jmdict_extras(
        raw_dir / "JMdict_e.gz", wanted, needs, cands)
    for rec in records:
        for fp in rec["fix_plans"]:
            for key in ("pass", "low"):
                for item in fp["plan"].get("proposals", {}).get(key, []):
                    if item["word"] in glosses:
                        item["gloss"] = glosses[item["word"]]
            dp = dict_props.get((rec["kanji"], fp["kana"]))
            if dp:
                fp["plan"].setdefault("proposals", {})["dict"] = dp

    # ---- ringkasan ----
    summary = build_summary(records, type_counts, old_unbacked, new_unbacked)
    print_summary(summary)

    write_json(out_dir / "reading_quality_report.json", summary, records)
    write_markdown(out_dir / "reading_quality_report.md", summary, records)
    print(f"\nLaporan: {out_dir / 'reading_quality_report.md'}")
    print(f"Data    : {out_dir / 'reading_quality_report.json'}")


# ------------------------------------------------------------
# Ringkasan
# ------------------------------------------------------------

def build_summary(records, type_counts, old_unbacked, new_unbacked):
    risk_counts = {r: 0 for r in RISK_ORDER}
    per_level = {}
    letter_counts = {"on": {"A": 0, "B": 0, "C": 0},
                     "kun": {"A": 0, "B": 0, "C": 0}}
    high_categories = {"example-misclassified": 0,
                       "primary-likely-wrong": 0,
                       "primary-valid-example-missing": 0}
    mis_examples = []  # semua contoh salah tipe
    for rec in records:
        risk_counts[rec["risk"]] += 1
        lv = rec["level"]
        d = per_level.setdefault(lv, {r: 0 for r in RISK_ORDER})
        d[rec["risk"]] += 1
        for pr in rec["primaries"]:
            letter_counts[pr["type"]][pr["letter"]] += 1
            if pr["risk"] == "HIGH" and pr["category"] in high_categories:
                high_categories[pr["category"]] += 1
        for exr in rec["examples"]:
            if exr["verdict"] == "MISCLASSIFIED":
                mis_examples.append((rec["level"], rec["kanji"], exr))
    mis_kun_label = [m for m in mis_examples if m[2]["stored"] == "kun"]
    mis_on_label = [m for m in mis_examples if m[2]["stored"] == "on"]
    return {
        "total_kanji": len(records),
        "total_examples": sum(len(r["examples"]) for r in records),
        "total_primaries": sum(len(r["primaries"]) for r in records),
        "risk_counts": risk_counts,
        "high_categories": high_categories,
        "per_level": per_level,
        "letter_counts": letter_counts,
        "type_counts": type_counts,
        "misclassified_examples": len(mis_examples),
        "mis_kun_label": len(mis_kun_label),   # label kun, aslinya on
        "mis_on_label": len(mis_on_label),     # label on, aslinya kun
        "old_unbacked": old_unbacked,
        "new_unbacked": new_unbacked,
        "mis_examples": mis_examples,
    }


def print_summary(s):
    rc = s["risk_counts"]
    hc = s["high_categories"]
    n = s["total_kanji"]
    print("\n" + "=" * 62)
    print("AUDIT KUALITAS READING — RINGKASAN (v2)")
    print("=" * 62)
    print(f"kanji: {n} | contoh: {s['total_examples']} | "
          f"primary: {s['total_primaries']}")
    print(f"🔴 HIGH      : {rc['HIGH']:5d}  ({100 * rc['HIGH'] / n:.1f}%) — "
          f"semua kasus intervensi")
    print(f"   ├── contoh salah tipe (primary tetap) : {hc['example-misclassified']}")
    print(f"   ├── primary kalah kuat (verifikasi)   : {hc['primary-likely-wrong']}")
    print(f"   └── primary valid, kurang contoh      : "
          f"{hc['primary-valid-example-missing']}")
    print(f"🔵 VARIANT   : {rc['VARIANT']:5d}  (varian morfologis — tanpa aksi data)")
    print(f"🟡 SUSPICIOUS: {rc['SUSPICIOUS']:5d}  ({100 * rc['SUSPICIOUS'] / n:.1f}%)")
    print(f"🟢 OK        : {rc['OK']:5d}  ({100 * rc['OK'] / n:.1f}%)")
    print(f"⚪ NODATA    : {rc['NODATA']:5d}  (tanpa contoh — tak teraudit)")
    print(f"\nLevel backing primary (A=ketat, B=longgar, C=tidak):")
    for t in ("on", "kun"):
        lc = s["letter_counts"][t]
        tot = sum(lc.values())
        print(f"  {t:3s}: A {lc['A']:5d}  B {lc['B']:4d}  C {lc['C']:4d}"
              f"   (total {tot})")
    print(f"\nContoh salah tipe: {s['misclassified_examples']} "
          f"(label kun→asli on: {s['mis_kun_label']}, "
          f"label on→asli kun: {s['mis_on_label']})")
    print("Per level (🔴/🔵/🟡/🟢/⚪):")
    for lv in sorted(s["per_level"], reverse=True):
        d = s["per_level"][lv]
        print(f"  N{lv}: {d['HIGH']:3d} / {d['VARIANT']:2d} / "
              f"{d['SUSPICIOUS']:3d} / {d['OK']:4d} / {d['NODATA']:2d}")
    ou, nu = s["old_unbacked"], s["new_unbacked"]
    print(f"\nRekonsiliasi 'primary tanpa backing ketat':")
    print(f"  metode lama  (scorer kiriman, label asli): on {ou['on']}, kun {ou['kun']}")
    print(f"  metode atribusi (tipe dikoreksi)          : on {nu['on']}, kun {nu['kun']}")
    print(f"  (klaim audit user: 94 = 53 on + 41 kun — metode hampir-sama,")
    print(f"   lihat laporan.md bagian rekonsiliasi)")


# ------------------------------------------------------------
# Penulis laporan
# ------------------------------------------------------------

def _fmt_freq(rep):
    if rep["winner"]:
        w = rep["winner"]
        if w[0] == rep.get("freq_key"):
            note = " — primary = pemenang"
        elif not rep["freq_mismatch"]:
            note = " — margin di bawah ambang"
        else:
            note = ""
        fam = " (keluarga bentuk-ganda)" if rep["freq_family"] else ""
        return (f"freq: primary {rep['my_freq']} vs pemenang "
                f"{w[0]} {w[1]}{fam}{note}")
    return f"freq: primary {rep['my_freq']} (tanpa pemenang)"


def write_json(path, summary, records):
    mis = [
        {"level": lv, "kanji": k,
         "word": e["word"], "reading": e["reading"],
         "stored": e["stored"], "attributed": e["attributed"]}
        for (lv, k, e) in summary["mis_examples"]
    ]
    out = {
        "summary": {k: v for k, v in summary.items() if k != "mis_examples"},
        "misclassified_examples": mis,
        "records": [
            {
                "kanji": r["kanji"], "level": r["level"], "risk": r["risk"],
                "primaries": [
                    {kk: (list(vv) if isinstance(vv, tuple) else vv)
                     for kk, vv in pr.items()} for pr in r["primaries"]
                ],
                "examples": r["examples"],
                "freq": {
                    "on": dict(sorted(r["freq"]["on"].items(),
                                      key=lambda x: -x[1])),
                    "kun": dict(sorted(r["freq"]["kun"].items(),
                                       key=lambda x: -x[1])),
                },
                "freq_words": r["freq_words"],
                "freq_unattributed": r["freq_unattributed"],
                "fix_plans": r.get("fix_plans", []),
                "dict_readings": r.get("dict_readings", {}),
            }
            for r in records
        ],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"  JSON   → {path}")


def _fmt_proposals(plan, kana):
    """Format usulan contoh untuk satu fix plan."""
    lines = []
    props = plan.get("proposals")
    if props is None:
        return lines
    for item in props.get("pass", []):
        g = f" — \u201c{item['gloss']}\u201d" if item.get("gloss") else ""
        ex = "" if item["exact"] else " (okurigana longgar)"
        lines.append(f"- usulan: **{item['word']}【{item['reading']}】** "
                     f"freq {item['freq']:,}{ex}{g}")
    for item in props.get("low", []):
        g = f" — \u201c{item['gloss']}\u201d" if item.get("gloss") else ""
        ex = "" if item["exact"] else " (okurigana longgar)"
        lines.append(f"- usulan (freq rendah): {item['word']}"
                     f"【{item['reading']}】 freq {item['freq']:,}{ex}{g}")
    for item in props.get("dict", []):
        g = f" — \u201c{item['gloss']}\u201d" if item.get("gloss") else ""
        ex = "" if item["exact"] else " (okurigana longgar)"
        lines.append(f"- usulan (kamus JMdict — tidak ada kata umum di "
                     f"korpus): **{item['word']}【{item['reading']}】**{ex}{g}")
    if not any(props.get(k) for k in ("pass", "low", "dict")):
        lines.append(f"- usulan: TIDAK ADA kata BCCWJ/JMdict yang "
                     f"membuktikan {kana} — bacaan kamus sah tapi tak "
                     f"terlihat di korpus umum; opsi: pertahankan primary "
                     f"+ contoh dari kamus lain, atau tinjau ulang primary")
    return lines


def _fmt_dict(r, pr):
    """Bacaan KANJIDIC2 untuk tipe primary ini (urutan kamus)."""
    dr = r.get("dict_readings", {}).get(pr["type"], [])
    if not dr:
        return "—"
    return "、".join(dr[:8])


def write_markdown(path, summary, records):
    L = []
    rc = summary["risk_counts"]
    hc = summary["high_categories"]
    n = summary["total_kanji"]
    L.append("# Laporan Audit Kualitas Reading v2 — Kanjichō")
    L.append("")
    L.append("Audit struktural seluruh kanji app (src/data) — **read-only**, "
             "tidak mengubah data.")
    L.append("Metode: atribusi segmen bacaan via alignment DP kata↔bacaan "
             "(lihat bagian Metodologi). Versi v2 memakai **taksonomi "
             "keputusan**: HIGH hanya berisi kasus yang benar-benar "
             "membutuhkan intervensi; varian morfologis dipisah sebagai "
             "kategori tersendiri.")
    L.append("")
    L.append(f"- Kanji diaudit: **{n}**; contoh: {summary['total_examples']}; "
             f"primary: {summary['total_primaries']}")
    L.append(f"- 🔴 HIGH: **{rc['HIGH']}** (semua kasus intervensi: "
             f"{hc['example-misclassified']} contoh-salah-tipe + "
             f"{hc['primary-likely-wrong']} primary-kalah-kuat + "
             f"{hc['primary-valid-example-missing']} primary-valid-kurang-contoh)"
             f" · 🔵 VARIANT: **{rc['VARIANT']}** · "
             f"🟡 SUSPICIOUS: **{rc['SUSPICIOUS']}** · "
             f"🟢 OK: **{rc['OK']}** · ⚪ tanpa contoh: {rc['NODATA']}")
    L.append(f"- Contoh salah tipe: **{summary['misclassified_examples']}** "
             f"(label kun aslinya on: {summary['mis_kun_label']}; "
             f"label on aslinya kun: {summary['mis_on_label']})")
    L.append("")

    # peta tindak lanjut
    L.append("## Peta tindak lanjut")
    L.append("")
    L.append("Pemisahan kelas masalah mengikuti keputusan review laporan v1 "
             "(57 HIGH → 4 kelas): jangan mengubah 57 data sekaligus — "
             "bedakan kesalahan data, kesalahan contoh, variasi morfologis, "
             "dan kandidat ambigu.")
    L.append("")
    L.append("| Prioritas | Kategori | Jumlah | Aksi |")
    L.append("|---|---|---|---|")
    L.append(f"| 🔴 P1 | example-misclassified | {hc['example-misclassified']} | "
             f"primary TETAP; ganti/pindahkan contoh salah tipe (usulan "
             f"per kasus di bawah) |")
    L.append(f"| 🔴 P2a | primary-likely-wrong | {hc['primary-likely-wrong']} | "
             f"verifikasi & tukar primary — kandidat ber-backing ketat + "
             f"frekuensi ≥ {STRONG_MARGIN:g}× |")
    L.append(f"| 🔴 P2b | primary-valid-example-missing | "
             f"{hc['primary-valid-example-missing']} | primary TETAP "
             f"(pemenang frekuensi); tambahkan contoh pembuktian |")
    L.append(f"| 🔵 — | morphological-variant | {rc['VARIANT']} | "
             f"tanpa aksi data — primary dan kandidat morfem sama |")
    L.append(f"| 🟡 P3 | primary-ambiguous (+SUS lain) | {rc['SUSPICIOUS']} | "
             f"verifikasi manual, jangan otomatis mengganti |")
    L.append("")

    # tabel per level
    L.append("## Ringkasan per level")
    L.append("")
    L.append("| Level | Kanji | 🔴 | 🔵 | 🟡 | 🟢 | ⚪ | on A/B/C | kun A/B/C |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for lv in sorted(summary["per_level"], reverse=True):
        d = summary["per_level"][lv]
        # hitung ulang letters per level (himpunan global tak bisa dipotong)
        ol = {"A": 0, "B": 0, "C": 0}
        kl = {"A": 0, "B": 0, "C": 0}
        for r in records:
            if r["level"] != lv:
                continue
            for pr in r["primaries"]:
                (ol if pr["type"] == "on" else kl)[pr["letter"]] += 1
        tot = sum(d.values())
        L.append(f"| N{lv} | {tot} | {d['HIGH']} | {d['VARIANT']} | "
                 f"{d['SUSPICIOUS']} | {d['OK']} | {d['NODATA']} | "
                 f"{ol['A']}/{ol['B']}/{ol['C']} | {kl['A']}/{kl['B']}/{kl['C']} |")
    L.append("")

    # rekonsiliasi
    L.append("## Rekonsiliasi dengan audit manual (94 = 53 on + 41 kun)")
    L.append("")
    ou, nu = summary["old_unbacked"], summary["new_unbacked"]
    L.append("| Metode | on tanpa backing | kun tanpa backing | total |")
    L.append("|---|---|---|---|")
    L.append(f"| Skorer kiriman (substring, label contoh asli) | {ou['on']} | "
             f"{ou['kun']} | {ou['on'] + ou['kun']} |")
    L.append(f"| Audit user (manual, struktural) | 53 | 41 | 94 |")
    L.append(f"| **Atribusi struktural (audit ini)** | **{nu['on']}** | "
             f"**{nu['kun']}** | **{nu['on'] + nu['kun']}** |")
    L.append("")
    L.append("Perbedaan angka bukan saling membantah — ketiganya mengukur hal "
             "yang sama dengan bukti berbeda:")
    L.append("")
    L.append("1. Skorer kiriman menghitung on \"backed\" bila bacaan muncul "
             "sebagai **substring di mana pun** pada contoh berlabel on — "
             "termasuk kebetulan pola (白雪姫【しらゆきひめ】 \"menopang\" キ "
             "karena き milik 雪). Akibatnya sisi on tampak bersih (0).")
    L.append("2. Audit user sudah memeriksa relasi bacaan↔contoh secara "
             "struktural/manual — angkanya paling dekat dengan audit ini, "
             "selisihnya beda definisi longgar/posisi.")
    L.append("3. Audit ini menambal dua arah sekaligus: contoh salah tipe "
             "dideteksi dulu (atribusi), baru skor backing dihitung — "
             "backing palsu substring hilang, backing kun longgar tetap "
             "terhitung (Level B).")
    L.append("")

    # ---- HIGH P1: contoh salah tipe ----
    L.append(f"## 🔴 P1 — example-misclassified: {hc['example-misclassified']} "
             f"primary (primary TETAP, contoh diganti/dipindah)")
    L.append("")
    L.append("Slot tipe primary diisi contoh yang **tidak memakai bacaan "
             "primary** — UI menyesatkan hari ini. Daftar primary tidak "
             "berubah; yang diperbaiki hanya backing example. Setiap kasus "
             "dilengkapi: apa yang sebenarnya dibuktikan contoh salah-tipe "
             "(opsi pindah slot) dan usulan contoh pengganti dari BCCWJ "
             "(teratribusi strict + gloss JMdict, bila ada).")
    L.append("")
    for r in records:
        for pr in r["primaries"]:
            if pr.get("category") != "example-misclassified":
                continue
            L.append(f"### {r['kanji']} (N{r['level']}) — primary "
                     f"{pr['type']} **{pr['kana']}** — Level {pr['letter']} "
                     f"(skor {pr['score']})")
            L.append(f"- KANJIDIC2 {_fmt_dict(r, pr)}")
            for m in pr["mis_slot"]:
                L.append(f"- ✗ contoh salah tipe: {m}")
            plan = next((fp["plan"] for fp in r.get("fix_plans", [])
                         if fp["category"] == "example-misclassified"
                         and fp["kana"] == pr["kana"]), {})
            for line in plan.get("mis_proves", []):
                L.append(f"- {line}")
            for line in _fmt_proposals(plan, pr["kana"]):
                L.append(line)
            L.append(f"- {_fmt_freq(pr)}")
            L.append("")

    # ---- HIGH P2a: primary kalah kuat ----
    L.append(f"## 🔴 P2a — primary-likely-wrong: {hc['primary-likely-wrong']} "
             f"primary (kandidat jauh lebih kuat — verifikasi & tukar)")
    L.append("")
    L.append(f"Primary skor<2 dengan kandidat se-tipe ber-backing ketat DAN "
             f"frekuensi korpus ≥ {STRONG_MARGIN:g}× primary (≥ {FREQ_FLOOR}). "
             f"Ambang ini memisahkan kelompok dengan bersih: kelompok di bawah "
             f"margin ≤ 3,95× tidak masuk — mereka menjadi kategori ambigu "
             f"(P3). Untuk tiap kasus: urutan bacaan kamus (KANJIDIC2), "
             f"frekuensi struktural, dan contoh yang SUDAH membuktikan "
             f"kandidat (setelah tukar primary, slot langsung ter-backing).")
    L.append("")
    for r in records:
        for pr in r["primaries"]:
            if pr.get("category") != "primary-likely-wrong":
                continue
            L.append(f"### {r['kanji']} (N{r['level']}) — primary "
                     f"{pr['type']} **{pr['kana']}** → kandidat "
                     f"**{pr['best_alt_kana']}**")
            L.append(f"- **rekomendasi: {pr['recommend']}**")
            L.append(f"- KANJIDIC2 (urutan kamus): {_fmt_dict(r, pr)}")
            L.append(f"- {_fmt_freq(pr)} — kandidat {pr['alt_freq']:,}")
            plan = next((fp["plan"] for fp in r.get("fix_plans", [])
                         if fp["category"] == "primary-likely-wrong"
                         and fp["kana"] == pr["kana"]), {})
            for line in plan.get("alt_proven_by", []):
                L.append(f"- contoh yang sudah membuktikan kandidat: {line}")
            for exr in r["examples"]:
                mark = "✗" if exr["verdict"] == "MISCLASSIFIED" else "·"
                L.append(f"- {mark} contoh [{exr['stored']}] "
                         f"{exr['word']}【{exr['reading']}】 → atribusi "
                         f"{exr['attributed'] or '?'} "
                         f"({exr['quality']})")
            L.append("")

    # ---- HIGH P2b: primary valid, kurang contoh ----
    L.append(f"## 🔴 P2b — primary-valid-example-missing: "
             f"{hc['primary-valid-example-missing']} primary "
             f"(pertahankan primary, tambah contoh)")
    L.append("")
    L.append("Primary TIDAK didukung contoh (skor<2) tetapi justru pemenang "
             "frekuensi struktural vs kandidatnya — bukan kasus ganti "
             "primary, tapi kasus **kurang contoh pembuktian**. Usulan "
             "contoh dicari dari BCCWJ; bila tidak ada sama sekali, itu "
             "sinyal bacaan kamus langka yang layak diverifikasi manual.")
    L.append("")
    for r in records:
        for pr in r["primaries"]:
            if pr.get("category") != "primary-valid-example-missing":
                continue
            L.append(f"### {r['kanji']} (N{r['level']}) — primary "
                     f"{pr['type']} **{pr['kana']}** — Level {pr['letter']} "
                     f"(skor {pr['score']})")
            L.append(f"- **rekomendasi: {pr['recommend']}**")
            L.append(f"- KANJIDIC2 (urutan kamus): {_fmt_dict(r, pr)}")
            if pr["best_alt"]:
                L.append(f"- kandidat (skor lebih tinggi tapi freq kalah): "
                         f"{pr['best_alt']}")
            L.append(f"- {_fmt_freq(pr)}")
            plan = next((fp["plan"] for fp in r.get("fix_plans", [])
                         if fp["category"] == "primary-valid-example-missing"
                         and fp["kana"] == pr["kana"]), {})
            for line in _fmt_proposals(plan, pr["kana"]):
                L.append(line)
            for exr in r["examples"]:
                mark = "✗" if exr["verdict"] == "MISCLASSIFIED" else "·"
                L.append(f"- {mark} contoh [{exr['stored']}] "
                         f"{exr['word']}【{exr['reading']}】 → atribusi "
                         f"{exr['attributed'] or '?'} "
                         f"({exr['quality']})")
            L.append("")

    # ---- VARIANT ----
    L.append(f"## 🔵 MORPHOLOGICAL VARIANT — {rc['VARIANT']} kanji "
             f"(tanpa aksi data)")
    L.append("")
    L.append("Kandidat yang \"lebih baik\" ternyata **varian morfologis "
             "primary** — morfem sama, bentuk kamus berbeda: on pasangan "
             "bersuara dari kana dasar yang sama (し/じ, ふ/ぶ), atau kun "
             "dengan STEM SAMA dan okurigana saling perpanjang "
             "(た.れ/た.れる, こま.か/こま.かい). Skor 1 lawan 3 di keluarga "
             "ini hanya berarti representasi primary vs bentuk contoh "
             "belum konsisten dengan aturan backing — **bukan bukti "
             "primary salah**. Tidak ada aksi data yang diperlukan; "
             "keluarga bentuk-ganda KANJIDIC2 (termasuk pasangan "
             "bersuara は.れ/-ば.れ) menjamin keduanya bacaan sah.")
    L.append("")
    L.append("| Kanji | Level | Tipe | Primary | Kandidat (varian) | Freq |")
    L.append("|---|---|---|---|---|---|")
    for r in records:
        for pr in r["primaries"]:
            if pr.get("category") != "morphological-variant":
                continue
            L.append(f"| {r['kanji']} | N{r['level']} | {pr['type']} | "
                     f"{pr['kana']} | {pr['best_alt_kana']} | "
                     f"{pr['my_freq']:,} |")
    L.append("")

    # ---- SUSPICIOUS ----
    L.append(f"## 🟡 SUSPICIOUS — {rc['SUSPICIOUS']} kanji")
    L.append("")
    L.append("Kandidat ambigu (ada kandidat tapi bukti frekuensi belum "
             "cukup kuat — kelas P3: verifikasi manual, jangan otomatis "
             "mengganti), Level B/C tanpa kandidat ketat, frekuensi "
             "struktural tidak sepakat, atau slot tak teratribusi.")
    L.append("")
    amb = [(r, pr) for r in records for pr in r["primaries"]
           if pr.get("category") == "primary-ambiguous"]
    if amb:
        L.append("### Kandidat ambigu (mantan HIGH — P3)")
        L.append("")
        L.append("| Kanji | Level | Tipe | Primary | Kandidat | Freq primary | Freq kandidat | KANJIDIC2 |")
        L.append("|---|---|---|---|---|---|---|---|")
        for r, pr in amb:
            L.append(f"| {r['kanji']} | N{r['level']} | {pr['type']} | "
                     f"{pr['kana']} | {pr['best_alt_kana']} | "
                     f"{pr['my_freq']:,} | {pr['alt_freq']:,} | "
                     f"{_fmt_dict(r, pr)} |")
        L.append("")
    for r in records:
        if r["risk"] != "SUSPICIOUS":
            continue
        parts = []
        for pr in r["primaries"]:
            tag = (f"{pr['type']} {pr['kana']} L{pr['letter']}"
                   f"[{','.join(pr['why'])}]")
            if pr["best_alt"]:
                tag += f" alt≈{pr['best_alt']}"
            parts.append(tag)
        exs = "; ".join(
            f"{e['word']}【{e['reading']}】({e['stored']}→"
            f"{'/'.join(e['attributed']) or '?'})"
            for e in r["examples"]
        )
        L.append(f"- **{r['kanji']}** (N{r['level']}): {' · '.join(parts)}"
                 f" — {exs}")

    L.append("")

    # contoh salah tipe
    L.append(f"## Contoh salah tipe (label on/kun vs atribusi) — "
             f"{summary['misclassified_examples']}")
    L.append("")
    L.append("Kelas bug filter_entry/build_examples (substring + "
             "classify_word_shape). \"label\" = tipe tersimpan di data app; "
             "\"asli\" = tipe terbukti dari segmentasi bacaan.")
    L.append("")
    L.append("| Kanji | Level | Contoh | Bacaan | Label | Asli |")
    L.append("|---|---|---|---|---|---|")
    for lv, k, e in summary["mis_examples"]:
        L.append(f"| {k} | N{lv} | {e['word']} | {e['reading']} | "
                 f"{e['stored']} | {'/'.join(e['attributed'])} |")
    L.append("")

    # frekuensi mismatch (termasuk keluarga sebagai catatan, flag hanya
    # untuk non-keluarga)
    fm = []
    fm_family = []
    for r in records:
        for pr in r["primaries"]:
            if pr["freq_mismatch"]:
                fm.append((r["level"], r["kanji"], pr))
            elif pr["winner"] and pr["freq_family"] and pr["my_freq"] * 4 \
                    < pr["winner"][1] and pr["winner"][1] >= FREQ_FLOOR:
                fm_family.append((r["level"], r["kanji"], pr))
    L.append(f"## Ketidakcocokan frekuensi struktural — {len(fm)} primary "
             f"(+{len(fm_family)} catatan keluarga)")
    L.append("")
    L.append("Pemenang frekuensi BCCWJ **dengan kredit atribusi struktural** "
             "(bukan substring) berbeda dari primary, margin ≥ 2× dan "
             f"≥ {FREQ_FLOOR} kemunculan. Ini sinyal ranking, bukan bukti "
             "kesalahan — keputusan tetap desain. Baris \"keluarga\" = "
             "bentuk ganda KANJIDIC2 dari morfem yang sama (ゲツ/ガツ, "
             "か.わる/かわ.る, は.れ/-ば.れ) — ditampilkan sebagai catatan, "
             "tidak menaikkan risiko.")
    L.append("")
    L.append("| Kanji | Level | Tipe | Primary | Freq primary | Pemenang | Freq pemenang | Keluarga? |")
    L.append("|---|---|---|---|---|---|---|---|")
    for lv, k, pr in fm + fm_family:
        L.append(f"| {k} | N{lv} | {pr['type']} | {pr['kana']} | "
                 f"{pr['my_freq']} | {pr['winner'][0]} | {pr['winner'][1]} | "
                 f"{'ya' if pr['freq_family'] else '—'} |")
    L.append("")

    # NODATA
    nd = [r["kanji"] for r in records if r["risk"] == "NODATA"]
    L.append(f"## ⚪ Tanpa contoh — {len(nd)} kanji (tidak teraudit)")
    L.append("")
    L.append(" ".join(nd))
    L.append("")

    # OK count
    L.append(f"## 🟢 VERIFIED — {rc['OK']} kanji")
    L.append("")
    L.append(f"Primary dibacking ketat (Level A) dengan tipe contoh yang "
             f"sesuai dan frekuensi sepakat. Daftar lengkap per kanji ada di "
             f"`reading_quality_report.json` (risk=OK).")
    L.append("")

    # metodologi
    L.append("## Metodologi")
    L.append("")
    L.append("**Atribusi struktural (alignment DP):** tiap karakter kata "
             "dikonsumsi persis — kana mengkonsumsi dirinya (okurigana, "
             "chunk katakana トン/ケア/プロ), kanji mengkonsumsi SATU "
             "kandidat bacaan (bacaan on, stem kun dari format bertitik "
             "KANJIDIC2), varian geminasi (がく→がっ di depan kanji lain), "
             "varian rendaku (loose, hanya non-awal kata), 々 mengulang chunk "
             "sebelumnya. Jalur strict = tanpa rendaku; jalur loose = "
             "diperbolehkan. Bacaan segmen dikembalikan ke bentuk basis "
             "(がっ → がく, ぢ → ち) untuk kredit.")
    L.append("")
    L.append("**Skor backing (Level):** A = 2/3 — segmen terbukti: on "
             "segmen==bacaan; kun segmen==stem (+okurigana kata persis=3, "
             "majemuk=2). B = 1 — longgar-valid: stem sama okurigana beda, "
             "atau fallback aturan lama untuk contoh yang tak tersegmentasi. "
             "C = 0 — tak ada bukti struktural. Contoh SALAH TIPE tidak "
             "menopang primary tipe labelnya.")
    L.append("")
    L.append(f"**Frekuensi:** kredit per bacaan hanya untuk kata yang "
             f"tersegmentasi penuh; margin mencurigakan ≥ {FREQ_MARGIN:g}× "
             f"dan ≥ {FREQ_FLOOR} kemunculan; kandidat \"jauh lebih kuat\" "
             f"≥ {STRONG_MARGIN:g}×.")
    L.append("")
    L.append("**Taksonomi v2:** HIGH terbagi tiga subkategori aksi "
             "(example-misclassified / primary-likely-wrong / "
             "primary-valid-example-missing); kandidat yang merupakan "
             "varian morfologis primary (morfem sama) diturunkan ke "
             "kategori VARIANT; kandidat dengan bukti di bawah ambang kuat "
             "menjadi SUSPICIOUS primary-ambiguous. Keluarga bentuk-ganda "
             "kun kini juga mengenali pasangan bersuara (は.れ/-ば.れ) "
             "selain pasangan prefix-stem (か.わる/かわ.る).")
    L.append("")
    L.append(f"**Fix plan (usulan):** kata BCCWJ (panjang ≤ "
             f"{PROPOSAL_MAX_LEN}, freq ≥ {PROPOSAL_MIN_FREQ}) yang "
             f"teratribusi membuktikan bacaan primary, diurutkan "
             f"okurigana-persis dulu lalu frekuensi; gloss dari JMdict "
             f"ditambahkan bila entri keb/reb cocok. Bila korpus tidak "
             f"menyediakan kata umum (mis. kata いかす yang umum dieja "
             f"生かす, bukan 活かす), usulan dicari dari kamus JMdict "
             f"(freq 0 — ditandai sumber kamus). Kasus tanpa usulan sama "
             f"sekali = bacaan sah di KANJIDIC2 tapi tak terbukti di mana "
             f"pun — keputusan diserahkan ke review manual.")
    L.append("")
    L.append("**Batasan:** (1) kata ateji/nama tempat tidak tersegmentasi "
             "(愛媛＝え) → UNKNOWN, jujur dilewatkan; (2) kata dengan "
             "segmentasi ganda (bukti tak unik) → AMBIGUOUS, semua segmen "
             "dikredit untuk frekuensi tapi verdict tipe tidak dipakai "
             "mengganti label; (3) ヶ (六ヶ月) di luar cakupan; (4) skor "
             "fallback lama dibatasi max 1; (5) frekuensi kun dibandingkan "
             "di tingkat STEM — bentuk non-bertitik seperti 願 \"-ねがい\" "
             "dibandingkan apa adanya (ねがい vs ねが) sehingga angka "
             "perlu dibaca bersama tabel keluarga.")
    L.append("")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"  MD     → {path}")


if __name__ == "__main__":
    main()
