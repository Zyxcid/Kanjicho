#!/usr/bin/env python3
"""
build_examples.py — Langkah 3 pipeline: susun daftar kata contoh untuk
tiap kanji dari sumber mentah.

Baca:
  - raw/JMdict_e.gz        (kamus Jepang→Inggris, XML)
  - raw/BCCWJ_frequencylist_luw2_ver1_0.tsv  (daftar frekuensi kata BCCWJ)
  - raw/JLPT_vocab_ALL.json  (WAJIB — level kosakata JLPT; argumen ke-5
                          EKSPLISIT seperti JLPT_kanji_ALL.json di
                          convert_kanji.py, default raw/. Sumber sama
                          dengan level kanji: Bluskyo/JLPT_Vocabulary)
  - output/n5.json ... n1.json  (data kanji dari convert_kanji.py)

Konvensi pipeline: semua sumber mentah pihak ketiga dikumpulkan di raw/
di root aplikasi (satu-satunya rumah data unduhan); scripts/ = kode,
output/ = workspace build, src/data/ = hasil promosi (lihat README).

Tulis:
  - output/n5_examples.json ... n1_examples.json
    Format: { "kanji_char": [{word, reading, meaning, type}, ...] }
  - output/n5.json ... n1.json (UPDATE IN PLACE):
    `primary_readings` [{kana, romaji, type}] — bacaan primary yang
    ditopang contoh kata (dipakai UI untuk bold bacaan sumber kuis &
    kuis untuk memilih jawaban). Field kerja `primary_romaji`
    (di-seed convert_kanji.py, di-rank rerank_readings.py) TIDAK ikut
    dikirim: dibuang saat menulis karena romajinya sudah termuat
    di `primary_readings`.

ARSITEKTUR (sejak pipeline surgery — tipe contoh ditentukan ATRIBUSI
STRUKTURAL, bukan lagi bentuk kata/substring; kelas bug 総トン数,
白雪姫, 活性化 ditutup di akarnya):

  JMdict ──► BCCWJ freq ──► kandidat kata
                                │
              attribute_example_reading() — alignment DP kata↔bacaan:
              posisi kanji, kana mengkonsumsi dirinya (okurigana/chunk
              katakana), kanji mengkonsumsi SATU bacaan (on / stem kun
              dari format bertitik KANJIDIC2 = data segmentasi),
              geminasi がく→がっ, rendaku (loose), 々 = ulang chunk;
              homofoni on/kun dipecahkan TIE-BREAK STRUKTURAL
              (okurigana persis → kun; posisi majemuk → on; sisanya
              konservatif unknown) — Fix-2 kelas R2
                                │
                    pool ON              pool KUN   (kandidat HANYA
                      │                    │         boleh masuk pool
                      ▼                    ▼         se-tipenya)
               slot contoh on  +  slot contoh kun
               (korpus dulu; slot yang tetap kosong diisi FALLBACK
               KAMUS JMdict — ejaan alternatif seperti 活かす, keb
               kedua entri 生かす【いかす】 — MELALUI atribusi yang
               sama, tidak sekadar dipercaya sebagai kun)
                                │
               filter_entry (heuristik longgar, tahap KANDIDAT)
                                │
               strict_primary_pass (struktural, tahap KEBENARAN)
                                │
               freq_backing_pass (P2a natural — kandidat se-tipe
               ber-backing ketat + frekuensi korpus >= 4x primary dan
               >= 2000 → tukar primary; ATURAN UMUM reproducible,
               BUKAN special case per kanji)

Contoh: 活性化【かっせいか】 → 活 terbukti カツ (on, via geminasi かっ)
→ masuk pool ON — bukan pool KUN milik い.かす meski kana い/いか
kebetulan tersubstring di reading contoh.

Validasi primary TIGA TAHAP (aturan ketat adalah otoritas final —
dulu hidup sebagai pass terpisah audit_primary_readings.mjs):
  1. filter_entry (heuristik longgar, tahap KANDIDAT): buang primary
     yang tidak tersubstring di contoh, derive ulang dari contoh
     bertipe sama. Heuristik boleh memesan kandidat saja — dan contoh
     kini bertipe ATRIBUSI (bukan bentuk kata).
  2. strict_primary_pass (struktural, tahap KEBENARAN): tiap primary
     discoring ATURAN KETAT terhadap contoh yang benar-benar
     ditampilkan app — kun: stem harus PREFIX reading contoh dengan
     kanji di POSISI AWAL kata dan okurigana harus cocok
     (たす.ける ↔ 助ける たすける, bukan すけ yang cuma kebetulan
     substring); on: substring / pola geminasi (がく → がっこう).
     Primary skor < 2 yang punya kandidat se-tipe skor >= 2 DIGANTI
     (skor tertinggi, urutan data sebagai tiebreak). Skor 1
     longgar-tapi-valid (人 ひと via 一人 ひとり) DIPERTAHANKAN —
     hanya struktur data yang boleh memutuskan, bukan kebetulan pola.
  3. freq_backing_pass (P2a, tahap PENYELESAIAN frekuensi): primary
     yang tetap lemah (skor atribusi < 2) padahal ada kandidat se-tipe
     ber-backing ketat DAN kandidat menang frekuensi korpus >= 4x
     (dengan ambang bawah 2000) → TUKAR. Inilah pengganti patch
     manual 摂列由形代 dengan aturan reproducible. Varian morfologis
     (た.れ/た.れる, pasangan bersuara) dan primary yang justru
     pemenang frekuensi TIDAK ditukar.

Tiap kanji dicari 2 kata contoh umum: satu pakai on'yomi, satu pakai
kun'yomi — TIPE tiap contoh ditentukan atribusi struktural. Kata
dirank berdasarkan frekuensi korpus BCCWJ supaya contoh paling umum
dipilih.

Kata juga dicocokkan level JLPT dari daftar kosakata (WAJIB), dicek
setelah preferensi multi-karakter dan sebelum pencocokan bacaan primary:
  tier 0  kata adalah kosakata JLPT level kanji itu atau LEBIH MUDAH —
          sangat diutamakan: kanji N3 diberi kata level N3-ke-bawah, jadi
          平 menampilkan 平和/平ら (keduanya N3), bukan 平成 (bukan kata
          JLPT) atau 平たい (N1)
  tier 1  sisanya — kosakata lebih sulit atau bukan kata JLPT. Keduanya
          diperlakukan sama supaya kata umum yang kebetulan tidak ada di
          daftar (何度, 東京, 三人) tidak tergeser kata "terdaftar" yang
          lebih langka dan lebih sulit.
Level hanya preferensi, bukan filter keras: kalau tidak ada kata lebih
mudah untuk suatu bacaan, urutan frekuensi tetap menentukan.

Kata yang ejaan kanjinya bukan bentuk tulis normal dilewati:
  - sense JMdict bertanda "usually written using kana alone" (mis. 平仮名
    biasanya ditulis ひらがな), dan
  - bentuk kanji bertanda "rare kanji form" (ke_inf &rK;).

Pemakaian:
    python scripts/build_examples.py [raw/JMdict_e.gz] [raw/BCCWJ_...tsv]
                                  [input_dir] [output_dir] [raw/JLPT_vocab_ALL.json]
    (semua arg opsional — default raw/ untuk sumber mentah, output/ untuk
     workspace; perintah lengkap eksplisit ada di README)

jlpt_vocab.json WAJIB: diberikan eksplisit sebagai arg ke-5 (default
raw/JLPT_vocab_ALL.json, konvensi yang sama dengan JLPT_kanji_ALL.json
di convert_kanji.py — tanpa auto-detect). Kalau file tidak ada, script
keluar — ranking frekuensi-saja diam-diam menghasilkan contoh
lebih buruk (平 dapat 平成, bukan 平和).
"""

import gzip
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rerank_readings import kana_to_romaji, clean_reading, katakana_to_hiragana

MAX_EXAMPLES_PER_KANJI = 2
MIN_WORD_LEN = 1
MAX_WORD_LEN = 4

# P2a threshold — disepakati bersama audit v2 (reading_quality_audit.py
# memakai STRONG_MARGIN/FREQ_FLOOR bernilai sama; margin kelompok data
# terpisah bersih: kasus kuat semua >= 6x, kasus non-kuat semua <= 3.95x).
# Nilai ini ATURAN UMUM pipeline — tidak ada nama kanji di kode.
P2A_STRONG_MARGIN = 4.0   # kandidat >= 4x frekuensi primary -> tukar
P2A_FREQ_FLOOR = 2000     # ambang bawah frekuensi kandidat (anti-noise)

# Penanda misc/ke_inf JMdict (entitas sudah diekspansi parser XML):
UK_HINT = "usually written using kana alone"
RK_HINT = "rare kanji form"


def clean_kun(text):
    return text.replace(".", "").strip("-")


# ============================================================
# Parsing JMdict
# ============================================================

def parse_jmdict(jmdict_path):
    """Parse JMdict → (terms, alt_terms).

    terms     : { keb-PERTAMA: [(reading, glosses), ...] } — sumber
                kandidat UTAMA (dipasangkan frekuensi BCCWJ;
                identik dengan pipeline pra-surgery supaya perubahan
                contoh murni efek atribusi, bukan perubahan sumber).
    alt_terms : { SEMUA keb: [(reading, glosses), ...] } — sumber
                FALLBACK KAMUS untuk slot yang korpus tak punya kata
                umum (mis. 活かす adalah keb kedua entri 生かす【いかす】;
                BCCWJ hanya memuat ejaan 生かす). Ejaan keb yang
                ditandai rK (rare kanji form) dilewati per-ejaan.

    Lewati entry yang ejaan kanjinya bukan bentuk tulis normal — buruk
    sebagai contoh bacaan:
      - semua sense bertanda "usually written using kana alone" (uk),
      - bentuk kanji pertama bertanda "rare kanji form" (rK).
    """
    print(f"Parsing JMdict from {jmdict_path} ...")

    if str(jmdict_path).endswith(".gz"):
        f = gzip.open(jmdict_path, "rt", encoding="utf-8")
    else:
        f = open(jmdict_path, encoding="utf-8")

    terms = {}
    alt_terms = {}
    skipped_uk = 0
    context = ET.iterparse(f, events=("end",))
    for _event, entry in context:
        if entry.tag != "entry":
            continue

        keb = entry.find(".//k_ele/keb")
        if keb is None or not keb.text:
            entry.clear()
            continue
        term = keb.text

        if not (MIN_WORD_LEN <= len(term) <= MAX_WORD_LEN):
            entry.clear()
            continue

        # Ejaan kanji langka (ke_inf &rK;) — contoh bacaan yang buruk.
        ke_inf = entry.find(".//k_ele/ke_inf")
        if ke_inf is not None and RK_HINT in (ke_inf.text or ""):
            skipped_uk += 1
            entry.clear()
            continue

        reb = entry.find(".//r_ele/reb")
        if reb is None or not reb.text:
            entry.clear()
            continue
        reading = reb.text

        glosses = [g.text for g in entry.findall(".//sense/gloss") if g.text]
        if not glosses:
            entry.clear()
            continue

        # "Usually written using kana alone" (misc &uk;): kalau SEMUA sense
        # yang punya gloss bertanda uk, ejaan kanjinya bukan yang biasanya
        # dilihat pelajar (mis. 平仮名 vs ひらがな) — lewati.
        senses = [s for s in entry.findall("sense") if s.findall("gloss")]
        if senses and all(
            any(UK_HINT in (m.text or "") for m in s.findall("misc"))
            for s in senses
        ):
            skipped_uk += 1
            entry.clear()
            continue

        pair = (reading, glosses)
        terms.setdefault(term, []).append(pair)
        # Semua ejaan (keb) entri — sumber fallback kamus. Ejaan per-keb
        # yang ditandai rK dilewati; panjang dibatasi MAX_WORD_LEN sama
        # seperti kandidat utama. Reading yang dipakai = reb pertama
        # (paritas dengan jalur utama); pasangan (ejaan, reading) yang
        # aneh nanti ditolak sendiri oleh atribusi DP.
        for k_ele in entry.findall("k_ele"):
            k = k_ele.find("keb")
            if k is None or not k.text:
                continue
            if not (MIN_WORD_LEN <= len(k.text) <= MAX_WORD_LEN):
                continue
            inf = k_ele.find("ke_inf")
            if inf is not None and RK_HINT in (inf.text or ""):
                continue
            bucket = alt_terms.setdefault(k.text, [])
            if pair not in bucket:
                bucket.append(pair)
        entry.clear()

    f.close()
    print(f"  Loaded {len(terms)} JMdict terms with kanji (len {MIN_WORD_LEN}-{MAX_WORD_LEN})"
          f" — skipped {skipped_uk} kana-preferred/rare-spelling entries")
    print(f"  {len(alt_terms)} ejaan kanji (semua keb non-rK) untuk fallback kamus")
    return terms, alt_terms


# ============================================================
# Pemuatan frekuensi BCCWJ
# ============================================================

def load_bccwj_freq(tsv_path):
    """Muat frekuensi BCCWJ → { term: (frekuensi, reading_hira, pos) }.
    Juga menyusun indeks per-reading: { reading_hira: [(frekuensi,
    lemma, pos), ...] } (urut frekuensi turun) — dipakai mencari frekuensi
    berdasar reading saat bentuk tulisnya berbeda (JMdict punya 現れる,
    BCCWJ punya 現われる — reading sama あらわれる).

    POS (kolom 4) disimpan supaya kandidat contoh bisa menyaring nama
    diri (固有名詞) — port aturan fix-plan audit v2: frekuensi besar milik
    nama orang/tempat/acara (篤姫 あつひめ, 川崎) TIDAK boleh menjdi
    contoh pembelajaran meski frekuensinya tinggi.

    Kolom 6 TSV BCCWJ adalah jumlah kemunculan (lebih besar = makin
    umum). Term yang muncul beberapa kali (POS beda) → simpan frekuensi
    TERTINGGI (pemakaian paling umum).
    """
    print(f"Loading BCCWJ from {tsv_path} ...")
    import csv
    freq = {}
    freq_by_reading = {}  # reading_hira -> [(frequency, lemma, pos), ...]
    with open(tsv_path, encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)  # baris header
        for row in reader:
            if len(row) < 7:
                continue
            lemma = row[2]
            lform = row[1]
            pos = row[3] if len(row) > 3 else ""
            try:
                f_val = int(row[6])  # jumlah kemunculan (lebih besar = makin umum)
            except (ValueError, IndexError):
                continue
            reading_hira = katakana_to_hiragana(lform)
            # Simpan frekuensi TERTINGGI per term (pemakaian paling umum).
            if lemma not in freq or f_val > freq[lemma][0]:
                freq[lemma] = (f_val, reading_hira, pos)
            # Index juga per reading (untuk lookup varian ejaan)
            freq_by_reading.setdefault(reading_hira, []).append((f_val, lemma, pos))
    for reading_hira in freq_by_reading:
        freq_by_reading[reading_hira].sort(reverse=True)
    print(f"  Loaded {len(freq)} BCCWJ frequency entries ({len(freq_by_reading)} by reading)")
    return freq, freq_by_reading


# ============================================================
# Level kosakata JLPT
# ============================================================

def load_jlpt_vocab(vocab_path):
    """Muat level kosakata JLPT dari JLPT_vocab_ALL.json
    (Bluskyo/JLPT_Vocabulary — proyek yang sama dengan level kanji).

    Format: { term: [{"reading": "へいわ", "level": 3}, ...] } dengan
    level 1 = N1 (paling sulit) ... 5 = N5 (paling mudah).

    Return ({(term, reading_hira): level}, {term: {levels}}) — map kedua
    dipakai untuk term yang ejaannya muncul di beberapa level dengan
    reading berbeda (商人 しょうにん N3 vs あきんど N1).
    """
    with open(vocab_path, encoding="utf-8") as f:
        raw = json.load(f)
    by_term_reading = {}
    by_term = {}
    for term, entries in raw.items():
        levels = set()
        for e in entries:
            reading = katakana_to_hiragana(e.get("reading", "").strip())
            level = e.get("level")
            if not reading or level not in (1, 2, 3, 4, 5):
                continue
            by_term_reading[(term, reading)] = level
            levels.add(level)
        if levels:
            by_term[term] = levels
    print(f"  Loaded {len(by_term)} JLPT vocabulary terms "
          f"({len(by_term_reading)} term+reading levels) from {vocab_path.name}")
    return by_term_reading, by_term


def jlpt_word_level(term, reading_hira, vocab_by_tr, vocab_by_term):
    """Level JLPT (5 = N5 termudah) satu kata, atau None kalau tak
    terdaftar/ambigu.

    1. Cocok persis (term, reading) — level yang tepat untuk ejaan yang
       dipakai lintas level dengan reading berbeda.
    2. Fallback term saja — hanya dipercaya kalau SEMUA reading term itu
       sepakat satu level.
    """
    lvl = vocab_by_tr.get((term, reading_hira))
    if lvl is not None:
        return lvl
    levels = vocab_by_term.get(term)
    if levels and len(levels) == 1:
        return next(iter(levels))
    return None


# ============================================================
# Penyusunan contoh
# ============================================================

PLACE_NAME_GLOSS_HINTS = ("prefecture", "city in", "capital of", "district in")


def is_likely_proper_noun(term, gloss):
    gloss_lower = gloss.lower()
    if any(hint in gloss_lower for hint in PLACE_NAME_GLOSS_HINTS):
        return True
    return False


# ============================================================
# ATRIBUSI STRUKTURAL — alignment DP kata ↔ bacaan
# (Surgery 1; port mesin reading_quality_audit.py. Pipeline =
#  produsen, audit = verifikator independen — dua implementasi
#  dari SATU algoritma yang sama, kesepakatan keduanya adalah
#  invariant yang dijaga audit pasca-build.)
#
# Prinsip: kana (hiragana/katakana) mengkonsumsi dirinya sendiri
# (okurigana, chunk katakana seperti トン/ケア/プロ); kanji
# mengkonsumsi SATU kandidat bacaan (on / stem kun — format bertitik
# KANJIDIC2 adalah data segmentasi); geminasi がく→がっ hanya sah
# sebelum kanji/々; rendaku hanya non-awal kata (jalur loose);
# 々 = ulang chunk sebelumnya. Hasil: segmen bacaan kanji target
# yang TERBUKTI dari struktur — bukan kebetulan substring.
# ============================================================

def kana_eq(word_ch, read_ch):
    """Kana kata↔hiragana 1:1 (reading sudah dinormalisasi hiragana)."""
    return katakana_to_hiragana(word_ch) == read_ch


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


def load_kanjidic2_readings(path):
    """KANJIDIC2 → { kanji: {"on": [...], "kun": [...]} }.

    Tabel bacaan SEMUA kanji — dibutuhkan untuk segmentasi kata
    arbitrer: kata contoh memuat kanji lain di luar target
    (活性化 butuh bacaan 性 dan 化 juga, bukan hanya 活)."""
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


def build_cand_table(kanjidic):
    """{ kanji: [ (chunk, base, type, flag), ... ] }

    chunk = string yang benar-benar cocok di reading kata;
    base  = bacaan basis untuk kredit (on: bacaan on; kun: STEM);
    flag  = "" plain | "gem" geminasi (hanya sah sebelum kanji lain)
            | "r" rendaku (hanya sah non-awal kata).
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


_ATTR_CACHE = {}


def attribute(word, reading, target, cand_table):
    """Atribusi bacaan TARGET dalam satu kata (alignment DP).

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
        # tstate: (base, type) target bila sudah dikonsumsi, else NOT
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


def _entry_reading_keys(on_readings, kun_readings):
    """Kunci bacaan entri untuk preferensi segmen: (on_keys, kun_stems).

    on_keys  = bacaan on dibersihkan (hiragana, tanpa strip);
    kun_stems = stem tiap bacaan kun (format bertitik dipotong,
    penanda strip dihapus — たす.ける → たす, -り → り)."""
    on_keys = set()
    for r in on_readings or []:
        k = clean_reading(r)
        if k:
            on_keys.add(k)
    kun_stems = set()
    for r in kun_readings or []:
        k = kun_stem(r)
        if k:
            kun_stems.add(k)
    return on_keys, kun_stems


def _dotted_kun_okuri(kun_readings):
    """[(stem, okurigana), ...] dari bacaan kun BERTITIK (format KANJIDIC2
    = data segmentasi; penanda strip dihapus). Dipakai tie-break homofoni
    on/kun (Fix-2) — okurigana yang mengikuti kanji adalah bukti
    struktural kuat bahwa segmen itu adalah bacaan kun."""
    out = []
    for r in kun_readings or []:
        core = re.sub(r"^-+|-+$", "", katakana_to_hiragana(r))
        if "." in core:
            stem, okuri = core.split(".", 1)
            if stem and okuri:
                out.append((stem, okuri))
    return out


def _resolve_homophone_type(kanji, word, segs, kun_readings):
    """Tie-break struktural homofoni on/kun (Fix-2, kelas R2 review diff).

    Segment DP yang cocok dengan bacaan on DAN kun sekaligus (キ/き,
    クン/くん) TIDAK langsung membuang kandidat — putuskan dari bukti
    struktural posisi kanji + okurigana (berjenjang, konservatif):

      (a) kana setelah kanji cocok okurigana bacaan kun bertitik yang
          stem-nya termasuk segmen → KUN (死ぬ し+ぬ ↔ し.ぬ; 医する
          い+する ↔ い.する; prefix sah untuk bentuk konjugasi —
          死なれる し+なれる ↔ し.な.る);
      (b) kana setelah kanji TIDAK cocok okurigana mana pun →
          konservatif (None): bukti tidak cukup;
      (c) kanji di posisi majemuk — diikuti kanji lain atau akhir kata
          multi-karakter → ON (elemen homofon di kata majemuk Sino
          dibaca on: 病気 キ, 訓練 クン, 放送 ホウ, 必死 シ, 脳卒中
          ソツ);
      (d) kata satu-kanji → konservatif (None).

    Aturan umum untuk semua kanji (tanpa nama kanji); hanya berlaku
    untuk kata yang SUDAH lolos alignment DP — tidak menghidupkan
    kembali kredit substring palsu (kelas ひと⊂ひとり)."""
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


def attribute_example_reading(kanji, word, reading, on_readings,
                              kun_readings, cand_table, entry_keys=None):
    """SATU fungsi pusat penentu TIPE contoh (Surgery 1).

    Pipeline lama menentukan on/kun dari SUBSTRING + bentuk kata
    (has_on/has_kun + classify_word_shape) — dua heuristik kebetulan
    pola. Fungsi ini menggantinya dengan atribusi struktural:
    alignment DP memastikan kanji target memang mengkonsumsi SATU
    bacaan (on / stem kun) di POSISInya di kata itu.

    Argumen:
      kanji        : kanji target
      word         : kata contoh (ejaan kanji + kana)
      reading      : bacaan kata contoh (katakana/hiragana)
      on_readings  : bacaan on entri kanji (otoritas data app)
      kun_readings : bacaan kun entri kanji (format bertitik)
      cand_table   : tabel kandidat KANJIDIC2 semua kanji
      entry_keys   : (on_keys, kun_stems) pra-hitung (opsional —
                     penggunaan dalam loop besar)

    Return:
      {"type": "on" | "kun" | "unknown",
       "reading": reading ternormalisasi hiragana,
       "score": 2 (alignment strict) | 1 (loose/rendaku) | 0,
       "matched_reading": segmen bacaan kanji target — base on /
       stem kun (hiragana) — None bila unknown. Segmen yang cocok
       dengan bacaan entri diutamakan; tanpa itu, segmen terpanjang.

    unknown = tak teratribusi, ATAU ambigu yang TIDAK BISA dipecahkan
    tie-break struktural (Fix-2: homofoni on/kun dipecahkan dulu lewat
    okurigana/posisi — 病気 キ, 訓練 クン, 死ぬ し.ぬ; sisanya tetap
    konservatif) → kata TIDAK BOLEH dipercaya mengisi slot mana pun
    (konsisten dengan kebijakan audit: UNKNOWN/AMBIGUOUS bukan
    bukti apa pun).

    Contoh:
      活性化 かっせいか → 活 = カツ (on, geminasi) → type=on
      芸能プロ げいのうプロ → 芸 = ゲイ (on) → type=on
      一人 ひとり → 人 = り (kun, -り KANJIDIC2) → type=kun
      活かす いかす → 活 = い (kun, stem い.かす) → type=kun
      病気 びょうき → 気 = キ (on — homofoni き dipecahkan posisi
      majemuk, Fix-2; dulu unknown → dibuang total) → type=on
      死ぬ しぬ → 死 = し.ぬ (kun — okurigana ぬ persis, Fix-2;
      dulu unknown) → type=kun
    """
    attr = attribute(word, reading, kanji, cand_table)
    segs = attr["strict"] or attr["loose"]
    reading_hira = katakana_to_hiragana(reading)
    if not segs:
        return {"type": "unknown", "reading": reading_hira,
                "score": 0, "matched_reading": None}
    types = {t for (_b, t) in segs}
    if len(types) != 1:
        # Fix-2 (kelas R2): homofoni on/kun — tie-break struktural,
        # bukan langsung buang kandidat (病気/訓練/放送/死ぬ/医する
        # kembali membuktikan キ/クン/ホウ/し.ぬ/い.する). Tanpa bukti
        # struktural cukup (kata satu-kanji; okurigana tak cocok)
        # tetap unknown — konservatif.
        t = _resolve_homophone_type(kanji, word, segs, kun_readings)
        if t is None:
            return {"type": "unknown", "reading": reading_hira,
                    "score": 0, "matched_reading": None}
    else:
        t = next(iter(types))

    on_keys, kun_stems = entry_keys if entry_keys is not None \
        else _entry_reading_keys(on_readings, kun_readings)
    keys = on_keys if t == "on" else kun_stems
    # sorted dulu supaya max() deterministik saat beberapa segmen sama
    # panjang — tanpa ini, urutan iterasi set (randomisasi hash Python)
    # bisa memilih pemenang berbeda antar proses (reproducibility).
    bases = sorted(b for (b, tt) in segs if tt == t)
    in_entry = sorted(b for b in bases if b in keys)
    matched = max(in_entry or bases, key=len)

    score = 2 if attr["strict"] else 1
    return {"type": t, "reading": reading_hira, "score": score,
            "matched_reading": matched}


# --- Konverter kana→romaji minimal untuk mencocokkan primary_romaji
# dengan bacaan kana --- (cukup akurat untuk mengenali bacaan asal string
# romaji — bukan konverter lengkap)
_KANA_TO_ROMAJI_MIN = {
    "あ":"a","い":"i","う":"u","え":"e","お":"o",
    "か":"ka","き":"ki","く":"ku","け":"ke","こ":"ko",
    "さ":"sa","し":"shi","す":"su","せ":"se","そ":"so",
    "た":"ta","ち":"chi","つ":"tsu","て":"te","と":"to",
    "な":"na","に":"ni","ぬ":"nu","ね":"ne","の":"no",
    "は":"ha","ひ":"hi","ふ":"fu","へ":"he","ほ":"ho",
    "ま":"ma","み":"mi","む":"mu","め":"me","も":"mo",
    "や":"ya","ゆ":"yu","よ":"yo",
    "ら":"ra","り":"ri","る":"ru","れ":"re","ろ":"ro",
    "わ":"wa","を":"wo","ん":"n",
    "が":"ga","ぎ":"gi","ぐ":"gu","げ":"ge","ご":"go",
    "ざ":"za","じ":"ji","ず":"zu","ぜ":"ze","ぞ":"zo",
    "だ":"da","ぢ":"ji","づ":"zu","で":"de","ど":"do",
    "ば":"ba","び":"bi","ぶ":"bu","べ":"be","ぼ":"bo",
    "ぱ":"pa","ぴ":"pi","ぷ":"pu","ぺ":"pe","ぽ":"po",
    "ぁ":"a","ぃ":"i","ぅ":"u","ぇ":"e","ぉ":"o",
    "ゃ":"ya","ゅ":"yu","ょ":"yo","っ":"",
}
_PALATAL_MIN = {
    "ki":{"ya":"kya","yu":"kyu","yo":"kyo"},
    "gi":{"ya":"gya","yu":"gyu","yo":"gyo"},
    "shi":{"ya":"sha","yu":"shu","yo":"sho"},
    "ji":{"ya":"ja","yu":"ju","yo":"jo"},
    "chi":{"ya":"cha","yu":"chu","yo":"cho"},
    "ni":{"ya":"nya","yu":"nyu","yo":"nyo"},
    "hi":{"ya":"hya","yu":"hyu","yo":"hyo"},
    "bi":{"ya":"bya","yu":"byu","yo":"byo"},
    "pi":{"ya":"pya","yu":"pyu","yo":"pyo"},
    "mi":{"ya":"mya","yu":"myu","yo":"myo"},
    "ri":{"ya":"rya","yu":"ryu","yo":"ryo"},
}


def _kana_to_romaji_minimal(kana):
    """Kana→romaji minimal untuk pencocokan bacaan (kasus umum saja)."""
    s = katakana_to_hiragana(kana).replace(".", "").strip("-")
    out = ""
    i = 0
    while i < len(s):
        ch = s[i]
        nxt = s[i+1] if i+1 < len(s) else ""
        if ch == "ー":
            if out and out[-1] in "aeiou":
                out += out[-1]
            i += 1
            continue
        base = _KANA_TO_ROMAJI_MIN.get(ch, ch)
        if nxt in ("ゃ","ゅ","ょ"):
            y = _KANA_TO_ROMAJI_MIN.get(nxt, "")
            if base in _PALATAL_MIN and y in _PALATAL_MIN[base]:
                out += _PALATAL_MIN[base][y]
                i += 2
                continue
        out += base
        i += 1
    return out


def romaji_matches_reading(romaji, kana_reading):
    """Apakah string romaji (mis. 'too') berasal dari bacaan kana (mis.
    'とお')? Dipakai mencari bacaan on/kun asal satu primary_romaji,
    supaya kata contoh yang memakai bacaan itu bisa diutamakan."""
    converted = _kana_to_romaji_minimal(kana_reading)
    return romaji == converted


def kanji_subseq(text):
    """Subsekuens kanji-saja dari satu kata: 現れる→現, 現われる→現,
    本盗→本盗. Dipakai mengenali varian ejaan (kanji sama, okurigana
    beda) tanpa mencocokkan kata tak berhubungan yang kebetulan
    se-reading dan memuat kanji yang sama (本当 vs 本盗)."""
    return "".join(ch for ch in text if "\u4e00" <= ch <= "\u9fff")


def lookup_freq(term, entries, kanji, freq_index, freq_by_reading):
    """Frekuensi BCCWJ untuk satu term JMdict → (frekuensi, reading_hira,
    pos atau None).

    1. Hit langsung bentuk tulis — hanya dipercaya kalau reading BCCWJ
       cocok dengan salah satu reading JMdict term itu. BCCWJ menyimpan
       mis. 貴方 dengan reading あなた (reading umumnya) sementara entry
       kita 貴方【きほう】; tanpa guard ini reading langka bisa mengalahkan
       frekuensi 方法 untuk 方.
    2. Fallback per-reading — untuk varian ejaan (現れる/現われる): lemma
       BCCWJ harus KATA yang SAMA: identik dengan term, atau urutan kanji
       sama dengan kana beda. Lemma yang kebetulan se-reading dan memuat
       kanji itu DITOLAK — kalau tidak, 本盗【ほんとう】 mewarisi frekuensi
       besar 本当.
    """
    if term in freq_index:
        f_direct, reading_direct, pos_direct = freq_index[term]
        if any(katakana_to_hiragana(r) == reading_direct for r, _g in entries):
            return f_direct, reading_direct, pos_direct
    term_kanji = kanji_subseq(term)
    for reading, _glosses in entries:
        reading_hira = katakana_to_hiragana(reading)
        for f_val, lemma, pos in freq_by_reading.get(reading_hira, []):
            if lemma == term or kanji_subseq(lemma) == term_kanji:
                return f_val, reading_hira, pos
    return None, None, None


# Statistik observabilitas build (di-reset per level oleh main();
# murni pelaporan — tidak memengaruhi seleksi).
_BUILD_STATS = {"fallback_filled": 0, "attr_unknown": 0}


def build_examples_for_kanji(kanji, jmdict_terms, term_index, freq_index,
                              cand_table, on_readings, kun_readings,
                              primary_on_hira=None, primary_kun_reading=None,
                              freq_by_reading=None, kanji_level=None,
                              vocab=None, alt_terms=None, alt_index=None):
    """Susun kata contoh untuk satu kanji — attribution-first
    (Surgery 2 / Tahap B: kandidat hanya boleh masuk pool SE-TIPENYA).

    TIPE contoh ditentukan `attribute_example_reading` (alignment DP
    struktural), menggantikan substring has_on/has_kun +
    classify_word_shape. Kata yang tak teratribusi / ambigu TIDAK
    dipercaya mengisi slot mana pun — dicatat sebagai attr_unknown.

    Pengisian dua slot (on + kun), korpus dulu:
      1. kandidat KORPUS — term JMdict (keb pertama) dengan frekuensi
         BCCWJ; ranking: multi-karakter → tier JLPT → cocok primary →
         frekuensi. "Cocok primary" kini berarti SEGMEN teratribusi
         kanji == bacaan primary (bukan substring reading kata —
         geminasi かっ ikut terbukti, kebetulan しょ う milik kanji
         lain tidak bisa mencuri preferensi).
      2. FALLBACK KAMUS — untuk slot yang tetap kosong: ejaan alternatif
         JMdict TANPA frekuensi korpus (mis. 活かす — BCCWJ hanya
         memuat 生かす). Fallback MELALUI ATRIBUSI YANG SAMA + gerbang
         tambahan: segmen harus cocok bacaan yang entri kanji miliki
         (fallback tidak boleh memperkenalkan bacaan asing). Ranking:
         multi-karakter → tier → cocok primary → OKURIGANA PERSIS
         primary (活かす mengalahkan 活き untuk primary い.かす) →
         kata terpendek.

    primary_on_hira / primary_kun_reading (bacaan primary hasil
    rerank_readings.py; kun dalam BENTUK PENUH BERTITIK, mis.
    たす.ける / ひと): kata contoh yang SEGMEN-nya persis bacaan
    primary sangat diutamakan — kuis dan reveal menampilkan bacaan
    yang sama. Stem primary dihitung dari kun_stem(reading),
    okurigana dari bagian setelah titik.

    term_index / alt_index: indeks kanji→kata (dibangun sekali oleh
    main() dari jmdict_terms / alt_terms, urut entry JMdict — urutan
    ini adalah tiebreak yang stabil). None → kandidat kosong.

    kanji_level (1..5) + vocab: preferensi level JLPT (tier 0 = kata
    di level kanji itu atau lebih mudah). Level tidak pernah
    menghapus kandidat — kalau tidak ada yang lebih mudah, urutan
    primary-match + frekuensi tetap menentukan.
    """
    on_candidates, kun_candidates = [], []      # korpus (ada freq BCCWJ)
    on_fallback, kun_fallback = [], []          # kamus (tanpa freq korpus)

    entry_keys = _entry_reading_keys(on_readings, kun_readings)
    primary_kun_stem = kun_stem(primary_kun_reading) \
        if primary_kun_reading else None
    primary_kun_okuri = None
    if primary_kun_reading and "." in primary_kun_reading:
        primary_kun_okuri = primary_kun_reading.split(".", 1)[1]

    def _kun_okuri_exact(word, matched_stem):
        """True bila okurigana kata persis okurigana primary (fallback
        kamus: 活かす↔い.かす lebih baik daripada 活き↔い stem-sama).
        Syarat: segmen stem == stem primary (kecocokan okurigana baru
        bermakna pada bacaan yang sama)."""
        if primary_kun_stem is None or matched_stem != primary_kun_stem:
            return False
        idx = word.find(kanji)
        rest = word[idx + 1:] if idx >= 0 else ""
        if primary_kun_okuri is not None:
            return rest == primary_kun_okuri
        return rest == ""  # primary polos (ひと): kata satu-kanji

    # Fix-6: kata satu-kanji yang bacaannya PERSIS primary (蚕【かいこ】,
    # 館【やかた】, 机【つくえ】) tidak lagi didemoti oleh preferensi
    # multi-karakter — tanpa ini primary pemenang-frekuensi dipaksa
    # ditukar ke bacaan lain yang dibuktikan kata majemuk langka
    # (夏蚕【なつご】 freq 3 membuktikan こ, 箱館戦争 membuktikan たて).
    # Guard ganda: kata satu-kanji tercatat di _single_kanji_exact dan
    # flag okurigana slot-3-nya dipatok 1 sehingga ia TIDAK PERNAH
    # mengalahkan kata multi-karakter yang se-sama-sama cocok primary
    # + okurigana persis (目【め】 kalah lawan 目薬 untuk primary め) —
    # hanya menang lawan kandidat yang tidak cocok primary sama sekali.
    # (Untuk kata satu-kanji, rest selalu "" sehingga _kun_okuri_exact
    #  hanya bisa True untuk primary TANPA titik — かいこ/やかた/つくえ/
    #  ひと — dan segmen == stem primary; reading kata == segmen karena
    #  kata hanya satu huruf. Syarat "primary persis" jadi implisit.)
    _single_kanji_exact = set()

    # ---- 1) kandidat korpus ----
    for term in (term_index or {}).get(kanji, []):
        entries = jmdict_terms[term]

        # Frekuensi BCCWJ untuk term ini, diatribusikan ke reading yang
        # benar-benar dimiliki term itu (guard lihat lookup_freq).
        freq_val, bccwj_reading, bccwj_pos = lookup_freq(
            term, entries, kanji, freq_index, freq_by_reading)
        if freq_val is None:
            continue  # bukan kandidat korpus — jalur fallback yang menangani
        if bccwj_pos and "固有名詞" in bccwj_pos:
            # Nama diri (orang/tempat/acara — 篤姫, 川崎) bukan contoh
            # pembelajaran walau frekuensinya tinggi — port aturan
            # fix-plan audit v2 (POS kolom-4 BCCWJ).
            continue

        # Cari entry JMdict yang readingnya cocok dengan reading BCCWJ
        matching_entry = next(
            (e for e in entries if katakana_to_hiragana(e[0]) == katakana_to_hiragana(bccwj_reading)),
            None,
        )
        if matching_entry is None:
            # Kalau tidak ada yang cocok persis, pakai entry pertama
            matching_entry = entries[0]

        reading, glosses = matching_entry
        gloss = glosses[0]
        if is_likely_proper_noun(term, gloss):
            continue

        attr = attribute_example_reading(
            kanji, term, reading, on_readings, kun_readings,
            cand_table, entry_keys)
        if attr["type"] == "unknown":
            _BUILD_STATS["attr_unknown"] += 1
            continue
        item_type = attr["type"]

        # Cocok primary: SEGMEN teratribusi kanji == bacaan primary —
        # bukan substring reading. Kalau ya, kata ini jauh lebih baik
        # sebagai contoh: kuis dan reveal menampilkan bacaan yang sama.
        matches_primary = False
        if item_type == "on" and primary_on_hira:
            matches_primary = attr["matched_reading"] == primary_on_hira
        elif item_type == "kun" and primary_kun_stem:
            matches_primary = attr["matched_reading"] == primary_kun_stem

        # Tier level JLPT (daftar kosakata wajib):
        #   0 = terdaftar di level kanji itu atau lebih mudah → diutamakan
        #   1 = sisanya (lebih sulit, atau bukan kata JLPT)
        # Keduanya setara supaya kata umum yang tidak ada di daftar
        # (何度, 東京) tidak tergeser kata sulit "terdaftar" yang lebih
        # langka.
        tier = 1
        if vocab is not None and kanji_level is not None:
            word_lvl = jlpt_word_level(
                term, attr["reading"], vocab[0], vocab[1])
            if word_lvl is not None and word_lvl >= kanji_level:
                tier = 0

        # Simpan (bentuk tuple  sama untuk korpus & kamus supaya satu
        # _take/sort): (tier, flag_primary, slot-3, slot-4, term, reading,
        # gloss). Korpus: slot-4 = -frekuensi; kamus: slot-3 = flag
        # okurigana persis, slot-4 = panjang kata.
        # Fix-7: slot-3 korpus kini juga flag okurigana persis primary
        # (sebelumnya konstan 0) — kata bentuk-kamus (笑う vs 笑い,
        # 極める vs 極めて) mengalahkan bentuk stem/te-form se-freq.
        # On tidak ber-okurigana → slot-3 tetap konstan 0.
        # Fix-6: kata satu-kanji primary-persis dicatat supaya _rank
        # memperlakukannya sebagai multi-karakter (lihat _rank).
        if item_type == "kun":
            okuri_flag = 0 if _kun_okuri_exact(
                term, attr["matched_reading"]) else 1
            if okuri_flag == 0 and len(term) == 1:
                _single_kanji_exact.add(term)
                okuri_flag = 1  # guard: tak boleh kalahkan multi-kar. exact
        else:
            okuri_flag = 0
        item = (tier, 0 if matches_primary else 1, okuri_flag, -freq_val,
                term, reading, gloss)
        if item_type == "on":
            on_candidates.append(item)
        else:
            kun_candidates.append(item)

    # ---- 2) fallback kamus untuk slot yang (mungkin) kosong ----
    # Di-scan SEKARANG, dipakai NANTI hanya bila slot tipe itu tetap
    # tidak terisi kandidat korpus. Reading = reb pertama (paritas
    # jalur utama); pasangan aneh ditolak sendiri oleh atribusi.
    if alt_terms is not None and alt_index is not None:
        for keb in alt_index.get(kanji, []):
            reading, glosses = alt_terms[keb][0]
            gloss = glosses[0]
            if is_likely_proper_noun(keb, gloss):
                continue

            attr = attribute_example_reading(
                kanji, keb, reading, on_readings, kun_readings,
                cand_table, entry_keys)
            if attr["type"] == "unknown":
                continue
            item_type = attr["type"]

            # Gerbang fallback (lebih ketat dari korpus): segmen harus
            # bacaan yang DATA APP miliki — fallback kamus tidak boleh
            # memperkenalkan bacaan yang tidak diajarkan entri ini.
            keys = entry_keys[0] if item_type == "on" else entry_keys[1]
            if attr["matched_reading"] not in keys:
                continue

            matches_primary = False
            if item_type == "on" and primary_on_hira:
                matches_primary = attr["matched_reading"] == primary_on_hira
            elif item_type == "kun" and primary_kun_stem:
                matches_primary = attr["matched_reading"] == primary_kun_stem

            okuri_exact = _kun_okuri_exact(keb, attr["matched_reading"])

            # Fix-6 (paritas jalur kamus): kata satu-kanji fallback yang
            # membuktikan primary persis juga dicatat; slot-3 tetap 1
            # (guard sama dengan jalur korpus).
            fallback_okuri_flag = 0 if okuri_exact else 1
            if okuri_exact and len(keb) == 1 and item_type == "kun":
                _single_kanji_exact.add(keb)
                fallback_okuri_flag = 1

            tier = 1
            if vocab is not None and kanji_level is not None:
                word_lvl = jlpt_word_level(
                    keb, attr["reading"], vocab[0], vocab[1])
                if word_lvl is not None and word_lvl >= kanji_level:
                    tier = 0

            # fallback tanpa frekuensi: okurigana persis primary dulu,
            # lalu kata terpendek (frekuensi tak tersedia untuk mengurutkan).
            item = (tier, 0 if matches_primary else 1,
                    fallback_okuri_flag, len(keb), keb, reading, gloss)
            if item_type == "on":
                on_fallback.append(item)
            else:
                kun_fallback.append(item)

    # Urut (kunci sama untuk korpus & kamus — bentuk tuple seragam):
    # kata multi-karakter dulu (kata satu-kanji adalah contoh buruk —
    # tidak menunjukkan apa pun di luar kanjinya sendiri), lalu tier
    # JLPT, lalu cocok primary, lalu slot-3/slot-4 (korpus: okurigana
    # persis [Fix-7] lalu frekuensi; kamus: okurigana persis primary,
    # lalu panjang kata).
    # Fix-6: KECUALI — kata satu-kanji yang membuktikan primary PERSIS
    # (蚕【かいこ】) diperlakukan multi-karakter, dengan okurigana flag 1
    # (dipatok saat konstruksi item) supaya tetap kalah lawan kata
    # multi-karakter se-level yang juga cocok primary + okurigana persis.
    def _multi_flag(x):
        if len(x[4]) > 1:
            return 0
        return 0 if x[4] in _single_kanji_exact else 1

    _rank = lambda x: (_multi_flag(x), x[0], x[1], x[2], x[3])  # noqa: E731
    on_candidates.sort(key=_rank)
    kun_candidates.sort(key=_rank)
    on_fallback.sort(key=_rank)
    kun_fallback.sort(key=_rank)

    # ---- 3) pasang slot: korpus dulu, kamus belakangan; slot on
    # mendahului slot kun (urutan stabil, sama dengan pipeline lama).
    def _take(pool, item_type):
        if not pool:
            return None
        _t, _p, _o, _l, t, r, g = pool[0]
        return {"word": t, "reading": r, "meaning": g, "type": item_type}

    slot_on = _take(on_candidates, "on")
    slot_kun = _take(kun_candidates, "kun")
    if slot_on is None:
        slot_on = _take(on_fallback, "on")
        if slot_on is not None:
            _BUILD_STATS["fallback_filled"] += 1
    if slot_kun is None:
        slot_kun = _take(kun_fallback, "kun")
        if slot_kun is not None:
            _BUILD_STATS["fallback_filled"] += 1

    results = [s for s in (slot_on, slot_kun) if s is not None]
    return results[:MAX_EXAMPLES_PER_KANJI]


# ============================================================
# Filter bacaan primary (hanya yang ditopang contoh)
# ============================================================

def kun_stem(kana_reading):
    """Stem bacaan kun: bagian sebelum '.' pertama — bentuk yang muncul
    di dalam kata majemuk (靖 やす.んじる → やす di 靖国 やすくに)."""
    stem = kana_reading.split(".")[0].strip("-")
    return katakana_to_hiragana(stem) if stem else ""


def reading_infos(entry):
    """Ratakan bacaan on/kun → [{kana, romaji, type, key, full}] — `key`
    adalah substring kana untuk mencocokkan reading kata contoh, `full`
    bacaan lengkap bersih (stem + okurigana)."""
    infos = []
    for r in entry.get("readings", {}).get("on", []) or []:
        key = clean_reading(r)
        if key:
            infos.append({
                "kana": r,
                "romaji": kana_to_romaji(key),
                "type": "on",
                "key": katakana_to_hiragana(key),
                # full untuk on = bacaan bersih (tanpa okurigana) — dipakai
                # pencocokan persis exact_eq di deriv_rank (filter_entry);
                # dulu hilang di sini sehingga pipeline segar (input rerank)
                # KeyError 'full' saat cabang derivasi on terpicu.
                "full": katakana_to_hiragana(key),
            })
    for r in entry.get("readings", {}).get("kun", []) or []:
        full = clean_reading(r)
        if not full:
            continue
        stem = kun_stem(r)
        infos.append({
            "kana": r,
            "romaji": kana_to_romaji(full),
            "type": "kun",
            # cocokkan pakai stem kalau ada (ramah kata majemuk),
            # kalau tidak pakai bacaan lengkap
            "key": katakana_to_hiragana(stem) if stem else katakana_to_hiragana(full),
            # bacaan lengkap — match penuh mengalahkan match stem antar
            # bacaan se-stem (lihat filter_entry)
            "full": katakana_to_hiragana(full),
        })
    return infos


def get_primary_romaji(entry):
    """Daftar kerja primary romaji kanji (field internal pipeline).

    Di-seed convert_kanji.py (on[0]+kun[0]) lalu dirank
    rerank_readings.py. Data final hanya menyimpan `primary_readings`
    (romaji per item), jadi saat build_examples.py dijalankan ulang di
    outputnya sendiri, daftar ini dipulihkan dari sana — menjaga langkah
    tetap idempotent tanpa menyimpan field redundan di data.
    """
    pr = entry.get("primary_romaji") or []
    if not pr:
        pr = [p["romaji"] for p in entry.get("primary_readings") or []]
    return pr


def filter_entry(entry, examples):
    """Return (primary_romaji_baru, primary_readings, derived) untuk satu kanji.

    Satu primary romaji "backed" kalau ada bacaan kanji itu yang
    menghasilkan romaji tersebut DAN bacaannya termuat di reading salah
    satu kata contoh bertipe SAMA. Bacaan tanpa kata contoh dibuang dari
    daftar kerja — kuis tidak boleh menanyakannya.

    "Termuat" pada tahap kandidat INI (heuristik longgar) menghitung:
    substring murni, pola geminasi on (セツ → せっしゅ), DAN — sejak
    Fix-1 (kelas R1 review diff) — varian bersuara rendaku segmen pada
    posisi non-awal (出口【でぐち】 membuktikan くち; 木箱【きばこ】
    membuktikan はこ). Tanpa rendaku-aware, 108 primary (84 di antaranya
    v2-OK: 口 箱 顔 声 紙 皿 北 発 …) dibuang padahal contoh yang
    ditampilkan app justru membuktikannya dalam wujud bersuara — tahap
    KEBENARAN strict tidak punya jalur menambah kembali (drop final).

    Khusus kun, "termuat" bertingkat: match PENUH (bacaan lengkap
    stem+okurigana termuat di reading contoh, mis. はな.す di 放す
    【はなす】) mengalahkan match STEM antar bacaan yang berbagi stem —
    kalau satu anggota grup stem match penuh, anggota lain dianggap tidak
    ditopang (放す tidak menopang はな.つ/はな.れる yang se-stem). Tanpa
    match penuh, stem tetap menopang semua anggotanya (kata majemuk:
    靖国【やすくに】menopang やす.んじる via やす).

    Per tipe bacaan: kalau primary tipe itu TIDAK backed tapi kata contoh
    bertipe itu justru memakai bacaan lain se-tipe, primary di-derive ulang
    dari contoh (mis. 平: contoh kun 平ら【たいら】 menopang たいら, jadi
    primary kun jadi `taira`, bukan `hira` yang tidak ditopang) — kuis
    selalu menanyakan bacaan yang benar-benar dilihat pelajar di contoh.
    `derived` berisi romaji yang ditambahkan dengan cara ini.
    """
    pr = get_primary_romaji(entry)
    kanji = entry["kanji"]
    infos = reading_infos(entry)

    # Reading kata contoh per tipe (hiragana, ternormalisasi) + ejaan
    # katanya (posisi kanji — guard rendaku Fix-1).
    ex_read = {"on": [], "kun": []}
    ex_word = {"on": [], "kun": []}
    for ex in examples or []:
        t = ex.get("type")
        if t in ex_read:
            ex_read[t].append(katakana_to_hiragana(ex.get("reading", "")))
            ex_word[t].append(ex.get("word", ""))

    def contained(kana, t):
        """Backing kandidat TAHAP LONGGAR. Substring + (khusus on) pola
        geminasi せつ → せっしゅ — geminasi adalah bukti STRUKTURAL
        (cermin cabang skor-1 on_strict_score dan fallback audit);
        tanpanya, bacaan on yang hanya muncul tergeminasi (摂 セツ via
        摂取 せっしゅ) salah dianggap tanpa kandidat dan primary-nya
        bisa hilang di tahap kandidat — tahap KEBENARAN strict tak
        punya jalur menambah kembali.

        Fix-1 (kelas R1): varian bersuara (rendaku) kana pertama segmen
        — は→ば/ぱ, た→だ, か→が, さ→ざ — diterima sebagai bukti
        backing longgar untuk segmen pada posisi NON-AWAL: kanji tidak
        di awal kata DAN varian tidak di awal reading (kaidah
        morfonologi rendaku standar; cermin jalur loose atribusi DP
        flag "r" yang mensyaratkan keduanya). Simetris untuk on (満足
        まんぞく membuktikan ソク; 南北 なんぼく → ホク) dan kun (出口
        でぐち → くち; 木箱 きばこ → はこ), dan terhadap fix geminasi
        yang sudah ada."""
        for rd, wd in zip(ex_read[t], ex_word[t]):
            if not rd:
                continue
            if kana in rd:
                return True
            if t == "on" and len(kana) > 1 \
                    and rd.startswith(kana[:-1] + "\u3063"):  # っ
                return True
            # Fix-1: rendaku hanya sah pada posisi non-awal — kanji
            # bukan huruf pertama kata, varian tidak di awal reading.
            if wd and wd.find(kanji) > 0:
                for v in voiced_variants(kana):
                    pos = rd.find(v)
                    if pos > 0:
                        return True
        return False

    for i in infos:
        i["backed"] = contained(i["key"], i["type"])

    by_stem = {}
    for i in infos:
        if i["type"] == "kun" and i["backed"]:
            by_stem.setdefault(i["key"], []).append(i)
    for group in by_stem.values():
        full_backed = [i for i in group if contained(i["full"], "kun")]
        if full_backed:
            for i in group:
                if i not in full_backed:
                    i["backed"] = False

    backed_infos = [i for i in infos if i["backed"]]
    backed_romaji = {i["romaji"] for i in backed_infos}

    new_pr = [r for r in pr if r in backed_romaji]
    derived = []

    if not backed_infos:
        # Tidak ada contoh yang cocok dengan bacaan kanji ini (atau tidak
        # ada contoh sama sekali) — tidak bisa diverifikasi. Biarkan
        # apa adanya (mengosongkan primary malah menurunkan kuis ke
        # SEMUA bacaan).
        new_pr = list(pr)
    else:
        # Ikuti contoh, per tipe bacaan: kalau primary satu tipe tidak
        # backed tapi contoh justru memakai bacaan lain se-tipe, kuiskan
        # bacaan yang contoh tampilkan.
        pr_set = set(new_pr)
        covered = {i["type"] for i in backed_infos if i["romaji"] in pr_set}
        for t in ("on", "kun"):
            if t in covered:
                continue
            cands = [i for i in backed_infos if i["type"] == t]
            if cands:
                # Utamakan bacaan yang SAMA PERSIS dengan reading contoh
                # (kata polos kanji+okurigana: 約まる=つづまる → つづ.まる),
                # baru bacaan terpanjang. Tanpa ini stem terpanjang menang
                # padahal bukan bacaan yang dipakai contoh (約まる justru
                # memilih つづま.やか; 恥じる memilih はじ, bukan は.じる).
                def deriv_rank(i):
                    exact_eq = any(rd == i["full"] for rd in ex_read[t] if rd)
                    return (1 if exact_eq else 0, len(i["full"]))

                best = max(cands, key=deriv_rank)
                if best["romaji"] not in new_pr:
                    new_pr.append(best["romaji"])
                    derived.append(best["romaji"])

    # Atribusi kana untuk tiap primary romaji. Utamakan bacaan yang
    # benar-benar ditopang contoh (menyelesaikan tabrakan romaji seperti
    # ジュウ/ヂュう yang sama-sama → "juu"), lalu kana pertama yang
    # belum terpakai.
    primary_readings = []
    used = set()
    for r in new_pr:
        candidates = [i for i in infos if i["romaji"] == r]
        pick = None
        for c in candidates:
            if c["kana"] not in used and c["backed"]:
                pick = c
                break
        if pick is None:
            for c in candidates:
                if c["kana"] not in used:
                    pick = c
                    break
        if pick is None:
            continue
        used.add(pick["kana"])
        primary_readings.append({
            "kana": pick["kana"],
            "romaji": r,
            "type": pick["type"],
        })

    return new_pr, primary_readings, derived


# ============================================================
# Verifikasi backing ketat (struktural) — port dari
# audit_primary_readings.mjs, kini tahap KEBENARAN pipeline.
# Heuristik substring boleh lolos lewat kebetulan pola ("すけ" ⊂
# "たすける"); aturan di bawah hanya menerima relasi yang bisa
# DIBUKTIKAN dari struktur data: posisi kanji di kata, stem/okurigana
# bacaan (format bertitik KANJIDIC2 adalah data segmentasi), dan
# reading contoh.
# ============================================================

def is_kanji_char(ch):
    return "\u2e80" <= ch <= "\u2fdf" or ch in "\u3005\u3007\u303b" \
        or "\u3400" <= ch <= "\u4dbf" or "\u4e00" <= ch <= "\u9fff"


def is_kana_char(ch):
    return ("\u3041" <= ch <= "\u309f" or "\u30a1" <= ch <= "\u30fa") \
        and ch != "\u30fb"


def on_strict_score(on_kana, examples, kanji):
    """Skor backing KETAT on: 2 = bentuk hiragana bacaan termuat di
    reading contoh on yang memuat kanji, ATAU pola geminasi
    (がく → がっこう: bacaan tanpa kana terakhir + っ); 0 = tidak.

    Geminasi = bukti KETAT (Fix-8, selaras mesin atribusi DP dan
    audit v3): segmen がっ membuktikan bacaan dasar がく persis
    seperti segmen が membuktikan ガ. Skor 1 lama membuat primary
    geminasi-backed (列 レツ via 列車 れっしゃ) bisa digulingkan
    kandidat substring pendek (レ ⊂ れっしゃ) — kebetulan-pola,
    bukan segmen: kelas pencurian-kredit yang DP tolak (れっ milik
    レツ, bukan レ)."""
    h = katakana_to_hiragana(on_kana)
    best = 0
    for ex in examples or []:
        if ex.get("type") != "on" or kanji not in ex.get("word", ""):
            continue
        r = katakana_to_hiragana(ex.get("reading", ""))
        if h and h in r:
            best = max(best, 2)
        elif len(h) > 1 and r.startswith(h[:-1] + "\u3063"):  # っ
            best = max(best, 2)
    return best


def kun_strict_score(kun_kana, examples, kanji):
    """Skor backing KETAT kun (dash di-strip — penanda posisi, bukan
    kana; たす.ける dipisah stem|okurigana):
      3 = stem PREFIX reading contoh (kanji di awal kata) + okurigana
          persis — たす.ける ↔ 助ける たすける
      2 = kata majemuk / satu-kanji: reading diawali stem (時 とき ↔
          時々; kun standalone: sisa reading kosong)
      1 = longgar-tapi-valid: okurigana beda (たす.かる vs 助ける), atau
          kanji TIDAK di awal kata (下 した ↔ 靴下 くつした — VALID,
          cuma tak terbukti ketat)
      0 = tidak ada relasi struktural (すけ vs 助ける: reading tidak
          diawali すけ → murni kebetulan substring)."""
    full = re.sub(r"^-+|-+$", "", katakana_to_hiragana(kun_kana))
    if "." in full:
        stem, okuri = full.split(".", 1)
    else:
        stem, okuri = full, None
    if not stem:
        return 0
    best = 0
    for ex in examples or []:
        if ex.get("type") != "kun" or kanji not in ex.get("word", ""):
            continue
        r = katakana_to_hiragana(ex.get("reading", ""))
        word = ex.get("word", "")
        if not word.startswith(kanji):
            # Kanji bukan di awal (mis. お+金): hanya longgar.
            if stem in r:
                best = max(best, 1)
            continue
        if not r.startswith(stem):
            continue
        rest = word[1:]  # okurigana kata / kanji majemuk / kosong
        if rest == "" or not is_kana_char(rest[0]):
            # kata majemuk (時々) atau kata satu kanji
            best = max(best, 2)
            continue
        r_rest = r[len(stem):]
        if okuri is not None:
            if r_rest.startswith(okuri):
                best = max(best, 3)
            else:
                best = max(best, 1)
        else:
            # kun standalone (すけ): sisa reading harus kosong — kalau
            # berlanjut ke okurigana, reading ini milik varian bertitik.
            if r_rest == "":
                best = max(best, 3)
            elif is_kana_char(r_rest[0]):
                best = max(best, 1)
    return best


def strict_primary_pass(entry, primary_readings, examples):
    """Tahap KEBENARAN: verifikasi tiap primary_readings dengan aturan
    backing ketat, ganti yang janggal dengan kandidat ketat se-tipe.

    Kebijakan (replace-only, konservatif — cermin audit_primary_readings):
      - primary skor >= 2: dibacking ketat → pertahankan (2 & 3 setara).
      - primary skor < 2 + ada kandidat se-tipe skor >= 2 → GANTI ke
        kandidat (skor tertinggi; urutan data sebagai tiebreak).
      - primary skor < 2 tanpa kandidat ketat → PERTAHANKAN (skor-1
        longgar umumnya benar: 人 ひと via 一人; tidak ada jalur
        penghapusan — penghapusan ditangani filter_entry).
    Return (primary_readings_baru, jumlah_kanji_yang_berubah_di_entry).
    """
    kanji = entry["kanji"]
    if not primary_readings or not examples:
        return primary_readings, False
    on_list = entry.get("readings", {}).get("on", []) or []
    kun_list = entry.get("readings", {}).get("kun", []) or []

    def scorer_of(kana, t):
        if t == "on":
            return on_strict_score(kana, examples, kanji)
        return kun_strict_score(kana, examples, kanji)

    def best_candidate(reading_list, t):
        best = None
        for kana in reading_list:
            score = scorer_of(kana, t)
            if score < 2:
                continue  # pengganti harus dibacking ketat
            if best is None or score > best[1]:
                best = (kana, score)
        return best

    changed = False
    out = []
    for p in primary_readings:
        t = p.get("type")
        score = scorer_of(p.get("kana", ""), t)
        if score >= 2:
            out.append(p)
            continue
        reading_list = on_list if t == "on" else kun_list
        cand = best_candidate(reading_list, t)
        if cand is None:
            out.append(p)
            continue
        kana, _cscore = cand
        out.append({
            "kana": kana,
            "romaji": kana_to_romaji(clean_reading(kana)),
            "type": t,
        })
        changed = True
    return out, changed


# ============================================================
# P2a natural — penyelesaian primary berbasis frekuensi korpus
# STRUKTURAL (Tahap C; port aturan audit v2 reading_quality_audit.py).
#
# strict_primary_pass memutus dari CONTOH yang ditampilkan app saja —
# padahal ada primary yang kalah backing contoh DAN kalah telak di
# korpus (摂 ショウ tak pernah terbukti di kata mana pun; セツ muncul
# di 2650 kejadian). Pass ini menyelesaikannya dengan evidence kedua:
# frekuensi BCCWJ yang dikredit per bacaan HANYA lewat atribusi
# struktural (mengganti kredit substring rerank untuk keputusan akhir).
#
# Syarat TUKAR (semua harus terpenuhi — aturan umum, tanpa nama kanji):
#   - primary lemah  : skor atribusi < 2 (contoh tak membuktikannya)
#   - kandidat kuat  : bacaan se-tipe non-primary dengan skor >= 2
#   - BUKAN varian morfologis (た.れ/た.れる, pasangan bersuara) —
#     skor 1 lawan 3 di keluarga morfem sama bukan bukti primary salah
#   - primary BUKAN pemenang frekuensi (人 ひと 187796 vs り 73201 —
#     pertahankan, kasus "tambah contoh", bukan tukar)
#   - kandidat >= P2A_STRONG_MARGIN x frekuensi primary DAN >=
#     P2A_FREQ_FLOOR — margin kelompok data terpisah bersih.
# ============================================================

def primary_parts(kana):
    """(stem, okuri) bacaan kun: たす.ける → (たす, ける); ち → (ち, None)."""
    full = re.sub(r"^-+|-+$", "", katakana_to_hiragana(kana))
    if "." in full:
        stem, okuri = full.split(".", 1)
        return stem, okuri
    return full, None


def _voiced_pair(a, b):
    """a/b sama panjang, beda HANYA kana pertamanya, dan bedanya
    pengsuaraan rendaku (げつ/がつ, し/じ, ふ/ぶ)."""
    if len(a) != len(b) or not a:
        return False
    if a[1:] != b[1:]:
        return False
    return (_VOICING.get(a[0]) == b[0] or _P_ROW.get(a[0]) == b[0]
            or _VOICING.get(b[0]) == a[0] or _P_ROW.get(b[0]) == a[0])


def is_morph_variant(kana, alt_kana, t):
    """True bila primary dan kandidat adalah VARIAN MORFOLOGIS sekeluarga.

    on  → pasangan bersuara dari kana dasar yang SAMA (し/じ, ふ/ぶ).
    kun → STEM SAMA + okurigana saling perpanjang (た.れ/た.れる,
          う.まれ/う.まれる).
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


def load_bccwj_rows_for_kanji(tsv_path, wanted_kanji):
    """Baris BCCWJ (lemma, reading_hira, freq) yang memuat salah satu
    kanji yang SEDANG dievaluasi P2a — satu pass, indeks per kanji."""
    print(f"Loading BCCWJ rows for {len(wanted_kanji)} P2a kanji from {tsv_path.name} ...")
    import csv
    index = {k: [] for k in wanted_kanji}
    n_rows = 0
    with open(tsv_path, encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)
        for row in reader:
            if len(row) < 7:
                continue
            lemma = row[2]
            lform = row[1]
            if not any(c in index for c in lemma):
                continue
            try:
                freq = int(row[6])
            except ValueError:
                continue
            reading = katakana_to_hiragana(lform)
            if any(is_kanji_char(c) for c in reading):
                continue  # lForm tak teranalisis (berisi kanji)
            n_rows += 1
            for c in set(lemma):
                if c in index:
                    index[c].append((lemma, reading, freq))
    print(f"  {n_rows} baris terindeks untuk {len(wanted_kanji)} kanji")
    return index


def structural_freq_for_kanji(kanji, rows, cand_table):
    """Frekuensi per bacaan HANYA lewat atribusi struktural.

    Return (freq_on, freq_kun) — kunci freq_on = bacaan on bersih,
    kunci freq_kun = stem kun. Baris BCCWJ yang tak teratribusi untuk
    kanji ini TIDAK mengkredit bacaan mana pun (frekuensi tidak bisa
    dicuri lewat substring — しょ う di 摂食障害 milik 障, bukan 摂)."""
    freq_on, freq_kun = {}, {}
    for lemma, reading, freq in rows:
        attr = attribute(lemma, reading, kanji, cand_table)
        segs = attr["strict"] or attr["loose"]
        if not segs:
            continue
        for base, t in segs:
            if t == "on":
                freq_on[base] = freq_on.get(base, 0) + freq
            else:
                freq_kun[base] = freq_kun.get(base, 0) + freq
    return freq_on, freq_kun


def _attr_reports(examples, kanji, cand_table):
    """Laporan atribusi ringkas per contoh — input corrected skor:
    {"word", "reading", "stored", "segments" (set (base, type))}."""
    reps = []
    for ex in examples or []:
        attr = attribute(ex["word"], ex["reading"], kanji, cand_table)
        segs = attr["strict"] or attr["loose"]
        reps.append({
            "word": ex["word"], "reading": ex["reading"],
            "stored": ex.get("type"), "segments": segs,
        })
    return reps


def corrected_on_score(kana, reps, kanji):
    """2 = segmen atribusi == bacaan on (kanji TERBUKTI dibaca begitu);
    1 = fallback substring/geminasi lama untuk contoh tak-teratribusi;
    0 = tidak ada bukti struktural."""
    on_h = clean_reading(kana)
    if not on_h:
        return 0
    best = 0
    for rep in reps:
        # hanya contoh yang tipe-atribusi (atau label) menyertai "on"
        attr_on = any(t == "on" for (_b, t) in rep["segments"])
        label_on = rep["stored"] == "on"
        if not (attr_on or label_on):
            continue
        if attr_on and (on_h, "on") in rep["segments"]:
            best = max(best, 2)
        elif not rep["segments"] and label_on:
            # tak teratribusi → bukti lama paling-paling "kemungkinan"
            r = katakana_to_hiragana(rep["reading"])
            if on_h and on_h in r:
                best = max(best, 1)
            elif len(on_h) > 1 and r.startswith(on_h[:-1] + "\u3063"):
                best = max(best, 1)
    return best


def corrected_kun_score(kana, reps, kanji):
    """3 = segmen == stem + okurigana kata persis;
    2 = segmen == stem, kata majemuk/satu-kanji (segmen tetap terbukti);
    1 = segmen == stem tapi okurigana beda, ATAU fallback posisi lama
    untuk contoh tak-teratribusi; 0 = tidak ada bukti struktural."""
    stem, okuri = primary_parts(kana)
    if not stem:
        return 0
    best = 0
    for rep in reps:
        attr_kun = any(t == "kun" for (_b, t) in rep["segments"])
        label_kun = rep["stored"] == "kun"
        if not (attr_kun or label_kun):
            continue
        if (stem, "kun") in rep["segments"]:
            idx = rep["word"].find(kanji)
            rest = rep["word"][idx + 1:] if idx >= 0 else ""
            if rest == "" or not is_kana_char(rest[0]):
                best = max(best, 2)  # majemuk / satu-kanji
            elif okuri is not None:
                best = max(best, 3 if rest == okuri else 1)
            else:
                best = max(best, 3 if rest == "" else 1)
        elif not rep["segments"] and label_kun:
            # fallback aturan posisi lama (bukti lemah, maks 1)
            r = katakana_to_hiragana(rep["reading"])
            word = rep["word"]
            if not word.startswith(kanji):
                if stem in r:
                    best = max(best, 1)
                continue
            if not r.startswith(stem):
                continue
            best = max(best, 1)
    return best


def corrected_score(kana, ex_type, reps, kanji):
    if ex_type == "on":
        return corrected_on_score(kana, reps, kanji)
    return corrected_kun_score(kana, reps, kanji)


def _best_alt_candidate(entry, primary_readings, reps, t):
    """Kandidat bacaan se-tipe terkuat di luar primary (skor >= 2,
    skor tertinggi, urutan data KANJIDIC2 sebagai tiebreak)."""
    kanji = entry["kanji"]
    primary_kanas = {p.get("kana") for p in primary_readings}
    best = None
    for cand_kana in entry.get("readings", {}).get(t, []) or []:
        if cand_kana in primary_kanas:
            continue
        s = corrected_score(cand_kana, t, reps, kanji)
        if s >= 2 and (best is None or s > best[1]):
            best = (cand_kana, s)
    return best


def freq_backing_watch(entry, primary_readings, examples, cand_table):
    """Pra-cek P2a: adakah primary lemah (skor atribusi < 2) yang punya
    kandidat se-tipe kuat (>= 2)? Kanji seperti itu layak dievaluasi
    frekuensi korpus — dipanggil main() untuk SEMUA kanji (murah:
    atribusi di-cache), hasilnya menentukan kanji mana yang diindeks
    dari BCCWJ (mahal: satu pass penuh)."""
    kanji = entry["kanji"]
    if not primary_readings or not examples:
        return False
    reps = _attr_reports(examples, kanji, cand_table)
    for p in primary_readings:
        t = p.get("type")
        if corrected_score(p.get("kana", ""), t, reps, kanji) >= 2:
            continue
        if _best_alt_candidate(entry, primary_readings, reps, t) is not None:
            return True
    return False


def freq_backing_pass(entry, primary_readings, examples, rows, cand_table):
    """Tahap P2a natural (penyelesaian frekuensi — otoritas terakhir).

    Return (primary_readings_baru, catatan_swap) — catatan berisi
    string "kana_lama → kana_baru (freq X vs Y)" per tukaran untuk
    dilaporkan main() secara transparan.

    Kebijakan konservatif — primary hanya ditukar bila SEMUA terpenuhi
    (lihat komentar seksi): lemah, kandidat kuat se-tipe, bukan varian
    morfologis, bukan pemenang frekuensi, margin >= 4x + floor >= 2000.
    Semua kondisi lain → PERTAHANKAN (kasus "tambah contoh pembuktian"
    ditangani audit sebagai rekomendasi, bukan aksi data pipeline).
    """
    kanji = entry["kanji"]
    if not primary_readings or not examples:
        return primary_readings, []
    reps = _attr_reports(examples, kanji, cand_table)
    freq_on, freq_kun = structural_freq_for_kanji(kanji, rows, cand_table)
    freq_map = {"on": freq_on, "kun": freq_kun}

    def freq_key(kana, t):
        return clean_reading(kana) if t == "on" else primary_parts(kana)[0]

    swaps = []
    out = []
    for p in primary_readings:
        t = p.get("type")
        kana = p.get("kana", "")
        if corrected_score(kana, t, reps, kanji) >= 2:
            out.append(p)
            continue
        cand = _best_alt_candidate(entry, primary_readings, reps, t)
        if cand is None:
            out.append(p)
            continue
        alt_kana, _cand_score = cand
        my_freq = freq_map.get(t, {}).get(freq_key(kana, t), 0)
        alt_freq = freq_map.get(t, {}).get(freq_key(alt_kana, t), 0)

        if is_morph_variant(kana, alt_kana, t):
            out.append(p)  # varian morfologis — bukan bukti primary salah
            continue
        if my_freq > alt_freq:
            out.append(p)  # primary justru pemenang frekuensi — pertahankan
            continue
        if alt_freq >= P2A_FREQ_FLOOR and \
                alt_freq >= P2A_STRONG_MARGIN * (my_freq + 1):
            out.append({
                "kana": alt_kana,
                "romaji": kana_to_romaji(clean_reading(alt_kana)),
                "type": t,
            })
            swaps.append(f"{kana} → {alt_kana} "
                         f"(freq {alt_freq} vs {my_freq})")
            continue
        out.append(p)
    return out, swaps


# ============================================================
# Main
# ============================================================

def main():
    root = Path(__file__).resolve().parent.parent
    jmdict_path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "raw" / "JMdict_e.gz"
    bccwj_path = Path(sys.argv[2]) if len(sys.argv) > 2 else \
        root / "raw" / "BCCWJ_frequencylist_luw2_ver1_0.tsv"
    input_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else root / "output"
    output_dir = Path(sys.argv[4]) if len(sys.argv) > 4 else input_dir
    # Arg ke-5 EKSPLISIT (konvensi sama dengan JLPT_kanji_ALL.json di
    # convert_kanji.py) — default raw/. Tidak ada auto-detect: lokasi
    # tersembunyi bisa salah pilih versi stale; path yang terlihat di
    # command line README bisa diaudit langsung.
    vocab_path = Path(sys.argv[5]) if len(sys.argv) > 5 else \
        root / "raw" / "JLPT_vocab_ALL.json"
    # Arg ke-6 opsional — tabel bacaan KANJIDIC2 untuk atribusi
    # struktural (mesin penentu tipe contoh; default raw/, sumber yang
    # sama dengan langkah 1 convert_kanji.py).
    kanjidic_path = Path(sys.argv[6]) if len(sys.argv) > 6 else \
        root / "raw" / "kanjidic2.xml.gz"

    if not jmdict_path.exists():
        print(f"Error: JMdict file not found: {jmdict_path}", file=sys.stderr)
        sys.exit(1)
    if not bccwj_path.exists():
        print(f"Error: BCCWJ file not found: {bccwj_path}", file=sys.stderr)
        sys.exit(1)
    if not kanjidic_path.exists():
        print(f"Error: KANJIDIC2 file not found: {kanjidic_path}\n"
              f"It is required for structural attribution of example "
              f"readings (kanji position → reading alignment).\n"
              f"Place kanjidic2.xml.gz into raw/ (same source as step 1), "
              f"or pass it explicitly as the 6th argument.",
              file=sys.stderr)
        sys.exit(1)
    # Daftar kosakata WAJIB (bukan opsional): tanpa itu, ranking contoh
    # diam-diam turun ke frekuensi-saja — hasilnya lebih buruk
    # (平 → 平成, bukan 平和). Gagal cepat saja.
    if not vocab_path.exists():
        print(
            "Error: JLPT vocabulary list not found: " + str(vocab_path) + "\n"
            "It is required — without it, examples silently degrade to\n"
            "frequency-only ranking (e.g. 平 gets 平成 instead of 平和).\n"
            "Download JLPT_vocab_ALL.json from:\n"
            "  https://github.com/Bluskyo/JLPT_Vocabulary  (data/vocab/results/)\n"
            "into raw/ (the app-root folder for raw sources), or pass it\n"
            "explicitly as the 5th argument.",
            file=sys.stderr,
        )
        sys.exit(1)

    jmdict_terms, alt_terms = parse_jmdict(jmdict_path)
    freq_index, freq_by_reading = load_bccwj_freq(bccwj_path)

    # Wajib — dijamin ada oleh pengecekan di atas.
    vocab = load_jlpt_vocab(vocab_path)

    # Tabel kandidat KANJIDIC2 — mesin atribusi struktural contoh
    # (Surgery 1; dipakai build_examples_for_kanji, freq_backing_*).
    kanjidic = load_kanjidic2_readings(kanjidic_path)
    cand_table = build_cand_table(kanjidic)

    # Indeks kanji→kata: satu pass atas terms/alt_terms, URUT ENTRY
    # JMdict (stabil — sort Python stabil, urutan iterasi ini adalah
    # tiebreak konten yang sama). Mengganti scan penuh terms per kanji
    # (perilaku identik, jauh lebih cepat) dan menambah akses murah ke
    # ejaan alternatif untuk fallback kamus.
    term_index = {}
    for term in jmdict_terms:
        for ch in set(term):
            if is_kanji_char(ch):
                term_index.setdefault(ch, []).append(term)
    alt_index = {}
    for keb in alt_terms:
        for ch in set(keb):
            if is_kanji_char(ch):
                alt_index.setdefault(ch, []).append(keb)

    # Cek apakah primary readings sudah diset rerank_readings.py (atau
    # terbawa sebagai primary_readings dari run build_examples
    # sebelumnya). Kalau ya, utamakan kata contoh yang readingnya cocok.
    # (Ini alasan build_examples.py dijalankan SETELAH rerank_readings.py
    # di pipeline.)
    has_primary = False
    first_file = input_dir / "n5.json"
    if first_file.exists():
        with open(first_file, encoding="utf-8") as f:
            sample = json.load(f)
        if sample and (sample[0].get("primary_romaji") or sample[0].get("primary_readings")):
            has_primary = True
    if has_primary:
        print("  (primary readings detected — preferring examples that match the quiz reading)")
    else:
        print("  (primary readings not set yet — run rerank_readings.py first for best results)")

    # DUA FASE (penulisan file ditunda ke fase B):
    #   A: bangun contoh + filter_entry + strict_primary_pass untuk
    #      SEMUA level; kumpulkan kanji kandidat P2a (primary lemah
    #      dengan kandidat se-tipe kuat).
    #   B: satu pass BCCWJ HANYA untuk kanji P2a itu → freq_backing_pass
    #      (tukar primary bila frekuensi korpus struktural menang telak)
    #      → baru tulis semua file.
    # Frekuensi dievaluasi sekali lintas level (bukan per level), dan
    # file hanya ditulis setelah keputusan P2a selesai supaya contoh,
    # primary_readings, dan file kanji tidak bisa berpisah (drift).
    levels = []   # (level_file, kanji_list, result, stats)
    p2a_watch = set()

    for level_file in sorted(input_dir.glob("n[1-5].json")):
        with open(level_file, encoding="utf-8") as f:
            kanji_list = json.load(f)

        # n3.json -> 3 (angka lebih besar = level lebih mudah; untuk tier)
        kanji_level = int(level_file.stem[1:])

        _BUILD_STATS.update(fallback_filled=0, attr_unknown=0)

        result = {}
        no_example = 0
        for entry in kanji_list:
            kanji = entry["kanji"]
            on_readings = entry.get("readings", {}).get("on", []) or []
            kun_readings = entry.get("readings", {}).get("kun", []) or []

            # Ambil bacaan primary (diset rerank_readings.py, atau dipulihkan
            # dari run build_examples sebelumnya) sebagai hiragana, supaya
            # kata contoh yang SEGMEN-nya cocok bisa diutamakan. Bacaan kun
            # dipakai dalam BENTUK PENUH BERTITIK (い.かす) — stem untuk
            # pencocokan segmen, okurigana untuk ranking fallback kamus.
            primary_on_hira = None
            primary_kun_reading = None
            pr = get_primary_romaji(entry)
            for romaji in pr:
                # Cari bacaan on/kun kanji mana yang cocok dengan romaji ini
                for r in on_readings:
                    if romaji_matches_reading(romaji, r):
                        primary_on_hira = katakana_to_hiragana(clean_kun(r))
                        break
                for r in kun_readings:
                    if romaji_matches_reading(romaji, r):
                        primary_kun_reading = katakana_to_hiragana(r)
                        break

            examples = build_examples_for_kanji(
                kanji, jmdict_terms, term_index, freq_index, cand_table,
                on_readings, kun_readings,
                primary_on_hira, primary_kun_reading, freq_by_reading,
                kanji_level, vocab, alt_terms, alt_index,
            )
            result[kanji] = examples
            if not examples:
                no_example += 1

        # Filter daftar kerja primary ke bacaan yang ditopang contoh dan
        # simpan bentuk kananya (primary_readings) — kuis hanya menanyakan
        # bacaan yang ditopang, UI men-bold tepat kana itu. TIGA tahap:
        # filter_entry (heuristik kandidat) → strict_primary_pass
        # (verifikasi struktural) → [fase B] freq_backing_pass (P2a
        # natural). Data final HANYA menyimpan primary_readings (romaji
        # termuat per item); primary_romaji tetap field kerja internal
        # pipeline dan dibuang di sini supaya keduanya tidak bisa
        # berpisah (drift).
        filtered = 0
        derived_total = 0
        strict_total = 0
        for entry in kanji_list:
            exs = result.get(entry["kanji"], [])
            new_pr, primary_readings, derived = filter_entry(entry, exs)
            primary_readings, strict_changed = strict_primary_pass(
                entry, primary_readings, exs
            )
            if new_pr != get_primary_romaji(entry):
                filtered += 1
            if strict_changed:
                strict_total += 1
            derived_total += len(derived)
            entry["primary_readings"] = primary_readings
            entry.pop("primary_romaji", None)
            if freq_backing_watch(entry, primary_readings, exs, cand_table):
                p2a_watch.add(entry["kanji"])

        levels.append({
            "level_file": level_file, "kanji_list": kanji_list,
            "result": result, "no_example": no_example, "filtered": filtered,
            "derived_total": derived_total, "strict_total": strict_total,
            "build_stats": dict(_BUILD_STATS),
        })

    # ---- Fase B: frekuensi korpus untuk kanji P2a, lalu tulis ----
    rows_index = {}
    if p2a_watch:
        print(f"\nP2a natural: {len(p2a_watch)} kanji dievaluasi frekuensi korpus "
              f"(primary lemah + kandidat se-tipe kuat)")
        rows_index = load_bccwj_rows_for_kanji(bccwj_path, p2a_watch)

    p2a_swap_total = 0
    p2a_notes = []
    for lv in levels:
        level_file = lv["level_file"]
        kanji_list = lv["kanji_list"]
        result = lv["result"]
        kanji_level = int(level_file.stem[1:])

        p2a_swaps = 0
        for entry in kanji_list:
            kanji = entry["kanji"]
            if kanji not in rows_index:
                continue
            exs = result.get(kanji, [])
            new_prs, swaps = freq_backing_pass(
                entry, entry["primary_readings"], exs,
                rows_index[kanji], cand_table)
            if swaps:
                entry["primary_readings"] = new_prs
                p2a_swaps += len(swaps)
                for s in swaps:
                    p2a_notes.append(f"{kanji} ({level_file.stem}): {s}")
        p2a_swap_total += p2a_swaps

        out_path = output_dir / f"{level_file.stem}_examples.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        kanji_path = output_dir / level_file.name
        with open(kanji_path, "w", encoding="utf-8") as f:
            json.dump(kanji_list, f, ensure_ascii=False, indent=2)

        both_types = sum(1 for v in result.values() if len({e["type"] for e in v}) == 2)
        bs = lv["build_stats"]
        print(f"  {level_file.stem}: {len(result) - lv['no_example']}/{len(result)} kanji got examples "
              f"({both_types} with both on+kun) → {out_path.name}")
        print(f"    fallback kamus mengisi {bs['fallback_filled']} slot kosong; "
              f"{bs['attr_unknown']} kandidat korpus tak teratribusi (dilewati)")
        print(f"    primary readings filtered on {lv['filtered']}/{len(kanji_list)} kanji "
              f"({lv['derived_total']} re-derived from examples, {lv['strict_total']} strict-corrected, "
              f"{p2a_swaps} P2a freq-resolved) → {kanji_path.name}")
        if vocab is not None:
            tier_stats = {0: 0, 1: 0, 2: 0}
            for exs in result.values():
                for e in exs:
                    lvl = jlpt_word_level(e["word"], katakana_to_hiragana(e.get("reading", "")),
                                          vocab[0], vocab[1])
                    if lvl is None:
                        tier_stats[2] += 1
                    elif lvl >= kanji_level:
                        tier_stats[0] += 1
                    else:
                        tier_stats[1] += 1
            n_ex = sum(tier_stats.values())
            if n_ex:
                print(f"    example JLPT tiers: same-or-easier {tier_stats[0]} "
                      f"({100 * tier_stats[0] / n_ex:.0f}%), harder-listed {tier_stats[1]} "
                      f"({100 * tier_stats[1] / n_ex:.0f}%), unlisted {tier_stats[2]} "
                      f"({100 * tier_stats[2] / n_ex:.0f}%)")

    if p2a_notes:
        print("\nP2a natural — tukaran primary (aturan umum, bukan special case):")
        for note in p2a_notes:
            print(f"    {note}")
    print(f"\nTotal P2a freq-resolved: {p2a_swap_total} primary di "
          f"{len({n.split(' ')[0] for n in p2a_notes})} kanji")


if __name__ == "__main__":
    main()
