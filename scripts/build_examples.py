#!/usr/bin/env python3
"""
build_examples.py — Langkah 3 pipeline: susun daftar kata contoh untuk
tiap kanji dari sumber mentah.

Baca:
  - JMdict_e.gz          (kamus Jepang→Inggris, XML)
  - BCCWJ_frequencylist_luw2_ver1_0.tsv  (daftar frekuensi kata BCCWJ)
  - JLPT_vocab_ALL.json  (WAJIB — level kosakata JLPT; auto-detect di
                          sebelah sumber lain atau berikan sebagai arg ke-5.
                          Sumber sama dengan level kanji:
                          Bluskyo/JLPT_Vocabulary)
  - output/n5.json ... n1.json  (data kanji dari convert_kanji.py)

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

Tiap kanji dicari 2 kata contoh umum: satu pakai on'yomi, satu pakai
kun'yomi. Kata dirank berdasarkan frekuensi korpus BCCWJ supaya contoh
paling umum dipilih.

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
    python scripts/build_examples.py <jmdict_e.gz> <bccwj.tsv> [input_dir] [output_dir] [jlpt_vocab.json]

jlpt_vocab.json WAJIB: auto-detect di sebelah JMdict_e.gz, di input dir,
atau di root proyek saat tidak diberikan eksplisit. Kalau tidak ketemu,
script keluar — ranking frekuensi-saja diam-diam menghasilkan contoh
lebih buruk (平 dapat 平成, bukan 平和).
"""

import gzip
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rerank_readings import kana_to_romaji, clean_reading, katakana_to_hiragana

MAX_EXAMPLES_PER_KANJI = 2
MIN_WORD_LEN = 1
MAX_WORD_LEN = 4

# Penanda misc/ke_inf JMdict (entitas sudah diekspansi parser XML):
UK_HINT = "usually written using kana alone"
RK_HINT = "rare kanji form"


def is_cjk(ch):
    return "\u4e00" <= ch <= "\u9fff"


def clean_kun(text):
    return text.replace(".", "").strip("-")


# ============================================================
# Parsing JMdict
# ============================================================

def parse_jmdict(jmdict_path):
    """Parse JMdict → { term: [(reading, glosses), ...] }.

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

        terms.setdefault(term, []).append((reading, glosses))
        entry.clear()

    f.close()
    print(f"  Loaded {len(terms)} JMdict terms with kanji (len {MIN_WORD_LEN}-{MAX_WORD_LEN})"
          f" — skipped {skipped_uk} kana-preferred/rare-spelling entries")
    return terms


# ============================================================
# Pemuatan frekuensi BCCWJ
# ============================================================

def load_bccwj_freq(tsv_path):
    """Muat frekuensi BCCWJ → { term: (frekuensi, reading_hira) }.
    Juga menyusun indeks per-reading: { reading_hira: [(frekuensi,
    lemma), ...] } (urut frekuensi turun) — dipakai mencari frekuensi
    berdasar reading saat bentuk tulisnya berbeda (JMdict punya 現れる,
    BCCWJ punya 現われる — reading sama あらわれる).

    Kolom 6 TSV BCCWJ adalah jumlah kemunculan (lebih besar = makin
    umum). Term yang muncul beberapa kali (POS beda) → simpan frekuensi
    TERTINGGI (pemakaian paling umum).
    """
    print(f"Loading BCCWJ from {tsv_path} ...")
    import csv
    freq = {}
    freq_by_reading = {}  # reading_hira -> [(frequency, lemma), ...]
    with open(tsv_path, encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)  # baris header
        for row in reader:
            if len(row) < 7:
                continue
            lemma = row[2]
            lform = row[1]
            try:
                f_val = int(row[6])  # jumlah kemunculan (lebih besar = makin umum)
            except (ValueError, IndexError):
                continue
            reading_hira = katakana_to_hiragana(lform)
            # Simpan frekuensi TERTINGGI per term (pemakaian paling umum).
            if lemma not in freq or f_val > freq[lemma][0]:
                freq[lemma] = (f_val, reading_hira)
            # Index juga per reading (untuk lookup varian ejaan)
            freq_by_reading.setdefault(reading_hira, []).append((f_val, lemma))
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


def build_reading_sets(entry):
    on_hira = {katakana_to_hiragana(r) for r in entry["readings"]["on"]}
    kun_roots = set()
    for r in entry["readings"]["kun"]:
        cleaned = clean_kun(r)
        if cleaned:
            kun_roots.add(katakana_to_hiragana(cleaned))
        if "." in r:
            stem = r.split(".")[0].strip("-")
            if stem:
                kun_roots.add(katakana_to_hiragana(stem))
    return on_hira, kun_roots


def classify_word_shape(term):
    if all(is_cjk(ch) for ch in term):
        return "on"
    return "kun"


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
    """Frekuensi BCCWJ untuk satu term JMdict → (frekuensi, reading_hira).

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
        f_direct, reading_direct = freq_index[term]
        if any(katakana_to_hiragana(r) == reading_direct for r, _g in entries):
            return f_direct, reading_direct
    term_kanji = kanji_subseq(term)
    for reading, _glosses in entries:
        reading_hira = katakana_to_hiragana(reading)
        for f_val, lemma in freq_by_reading.get(reading_hira, []):
            if lemma == term or kanji_subseq(lemma) == term_kanji:
                return f_val, reading_hira
    return None, None


def build_examples_for_kanji(kanji, jmdict_terms, freq_index, on_hira, kun_roots,
                              primary_on_hira=None, primary_kun_hira=None,
                              freq_by_reading=None, kanji_level=None, vocab=None):
    """Susun kata contoh untuk satu kanji.

    Kalau primary_on_hira / primary_kun_hira diberikan (bacaan yang
    ditentukan rerank_readings.py sebagai yang paling umum), kata contoh
    yang readingnya MEMUAT bacaan primary itu sangat diutamakan — supaya
    jawaban kuis dan contoh yang ditampilkan selalu pakai bacaan sama.

    freq_by_reading memungkinkan lookup frekuensi BCCWJ per reading (bukan
    hanya bentuk tulis), jadi varian ejaan ketemu (JMdict 現れる cocok
    dengan BCCWJ 現われる, keduanya dibaca あらわれる).

    kanji_level (1..5) + vocab (dari load_jlpt_vocab) mengaktifkan
    preferensi level JLPT: kata multi-karakter di level kanji itu atau
    lebih mudah dipilih sebelum yang lain (kata lebih sulit/tidak
    terdaftar tetap pakai urutan primary-match + frekuensi). Level tidak
    pernah menghapus kandidat — kalau tidak ada yang lebih mudah,
    frekuensi tetap menentukan.
    """
    on_candidates = []
    kun_candidates = []

    for term, entries in jmdict_terms.items():
        if kanji not in term:
            continue

        # Frekuensi BCCWJ untuk term ini, diatribusikan ke reading yang
        # benar-benar dimiliki term itu (guard lihat lookup_freq).
        freq_val, bccwj_reading = lookup_freq(term, entries, kanji, freq_index, freq_by_reading)

        if freq_val is None:
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

        reading_hira = katakana_to_hiragana(reading)
        has_on = any(h in reading_hira for h in on_hira if h)
        has_kun = any(k in reading_hira for k in kun_roots if k)

        if has_on and has_kun:
            item_type = classify_word_shape(term)
        elif has_on:
            item_type = "on"
        elif has_kun:
            item_type = "kun"
        else:
            continue

        # Cek apakah reading kata ini memuat bacaan PRIMARY (yang
        # ditentukan rerank_readings.py paling umum). Kalau ya, kata ini
        # jauh lebih baik sebagai contoh — kuis dan reveal akan
        # menampilkan bacaan yang sama.
        matches_primary = False
        if item_type == "on" and primary_on_hira and primary_on_hira in reading_hira:
            matches_primary = True
        if item_type == "kun" and primary_kun_hira and primary_kun_hira in reading_hira:
            matches_primary = True

        # Tier level JLPT (daftar kosakata wajib):
        #   0 = terdaftar di level kanji itu atau lebih mudah → diutamakan
        #   1 = sisanya (lebih sulit, atau bukan kata JLPT)
        # Keduanya setara supaya kata umum yang tidak ada di daftar
        # (何度, 東京) tidak tergeser kata sulit "terdaftar" yang lebih
        # langka.
        tier = 1
        if vocab is not None and kanji_level is not None:
            word_lvl = jlpt_word_level(term, reading_hira, vocab[0], vocab[1])
            if word_lvl is not None and word_lvl >= kanji_level:
                tier = 0

        # Simpan: (tier, flag_primary, -frekuensi, term, reading, gloss)
        item = (tier, 0 if matches_primary else 1, -freq_val, term, reading, gloss)
        if item_type == "on":
            on_candidates.append(item)
        else:
            kun_candidates.append(item)

    # Urut: kata multi-karakter dulu (kata satu-kanji adalah contoh buruk —
    # tidak menunjukkan apa pun di luar kanjinya sendiri), lalu tier JLPT,
    # lalu cocok primary, lalu frekuensi.
    on_candidates.sort(key=lambda x: (0 if len(x[3]) > 1 else 1, x[0], x[1], x[2]))
    kun_candidates.sort(key=lambda x: (0 if len(x[3]) > 1 else 1, x[0], x[1], x[2]))

    results = []
    if on_candidates:
        _t, _p, _f, t, r, g = on_candidates[0]
        results.append({"word": t, "reading": r, "meaning": g, "type": "on"})
    if kun_candidates:
        _t, _p, _f, t, r, g = kun_candidates[0]
        results.append({"word": t, "reading": r, "meaning": g, "type": "kun"})

    if len(results) < MAX_EXAMPLES_PER_KANJI:
        pool = on_candidates if kun_candidates and results and results[0]["type"] == "kun" else kun_candidates
        for _t, _p, _f, t, r, g in pool:
            if t not in {res["word"] for res in results}:
                results.append({"word": t, "reading": r, "meaning": g, "type": classify_word_shape(t)})
                break

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
    """Ratakan bacaan on/kun → [{kana, romaji, type, key}] — `key` adalah
    substring kana untuk mencocokkan reading kata contoh."""
    infos = []
    for r in entry.get("readings", {}).get("on", []) or []:
        key = clean_reading(r)
        if key:
            infos.append({
                "kana": r,
                "romaji": kana_to_romaji(key),
                "type": "on",
                "key": katakana_to_hiragana(key),
            })
    for r in entry.get("readings", {}).get("kun", []) or []:
        key = clean_reading(r)
        if not key:
            continue
        stem = kun_stem(r)
        infos.append({
            "kana": r,
            "romaji": kana_to_romaji(key),
            "type": "kun",
            # cocokkan pakai stem kalau ada (ramah kata majemuk),
            # kalau tidak pakai bacaan lengkap
            "key": katakana_to_hiragana(stem) if stem else katakana_to_hiragana(key),
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

    Per tipe bacaan: kalau primary tipe itu TIDAK backed tapi kata contoh
    bertipe itu justru memakai bacaan lain se-tipe, primary di-derive ulang
    dari contoh (mis. 平: contoh kun 平ら【たいら】 menopang たいら, jadi
    primary kun jadi `taira`, bukan `hira` yang tidak ditopang) — kuis
    selalu menanyakan bacaan yang benar-benar dilihat pelajar di contoh.
    `derived` berisi romaji yang ditambahkan dengan cara ini.
    """
    pr = get_primary_romaji(entry)
    infos = reading_infos(entry)

    # Reading kata contoh per tipe (hiragana, ternormalisasi).
    ex_read = {"on": [], "kun": []}
    for ex in examples or []:
        t = ex.get("type")
        if t in ex_read:
            ex_read[t].append(katakana_to_hiragana(ex.get("reading", "")))

    def is_backed(info):
        return any(info["key"] in rd for rd in ex_read[info["type"]] if rd)

    backed_infos = [i for i in infos if is_backed(i)]
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
                best = max(cands, key=lambda i: len(i["key"]))
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
            if c["kana"] not in used and is_backed(c):
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
# Main
# ============================================================

def main():
    jmdict_path = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parent.parent / "JMdict_e.gz"
    bccwj_path = Path(sys.argv[2]) if len(sys.argv) > 2 else \
        Path(__file__).resolve().parent.parent / "BCCWJ_frequencylist_luw2_ver1_0.tsv"
    input_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else \
        Path(__file__).resolve().parent.parent / "output"
    output_dir = Path(sys.argv[4]) if len(sys.argv) > 4 else input_dir
    vocab_path = Path(sys.argv[5]) if len(sys.argv) > 5 else None

    # Auto-detect daftar kosakata JLPT di sebelah sumber mentah lain,
    # supaya pemilihan contoh level-aware jalan tanpa flag CLI tambahan.
    if vocab_path is None:
        for cand in (jmdict_path.parent / "JLPT_vocab_ALL.json",
                     input_dir / "JLPT_vocab_ALL.json",
                     Path(__file__).resolve().parent.parent / "JLPT_vocab_ALL.json"):
            if cand.exists():
                vocab_path = cand
                break

    if not jmdict_path.exists():
        print(f"Error: JMdict file not found: {jmdict_path}", file=sys.stderr)
        sys.exit(1)
    if not bccwj_path.exists():
        print(f"Error: BCCWJ file not found: {bccwj_path}", file=sys.stderr)
        sys.exit(1)
    # Daftar kosakata WAJIB (bukan opsional): tanpa itu, ranking contoh
    # diam-diam turun ke frekuensi-saja — hasilnya lebih buruk
    # (平 → 平成, bukan 平和). Gagal cepat saja.
    if vocab_path is None or not vocab_path.exists():
        print(
            "Error: JLPT vocabulary list not found. It is required — without\n"
            "it, examples silently degrade to frequency-only ranking (e.g. 平\n"
            "gets 平成 instead of 平和).\n"
            "Download JLPT_vocab_ALL.json from:\n"
            "  https://github.com/Bluskyo/JLPT_Vocabulary  (data/vocab/results/)\n"
            "and place it next to JMdict_e.gz, or pass it as the 5th argument.",
            file=sys.stderr,
        )
        sys.exit(1)

    jmdict_terms = parse_jmdict(jmdict_path)
    freq_index, freq_by_reading = load_bccwj_freq(bccwj_path)

    # Wajib — dijamin ada oleh pengecekan di atas.
    vocab = load_jlpt_vocab(vocab_path)

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

    for level_file in sorted(input_dir.glob("n[1-5].json")):
        with open(level_file, encoding="utf-8") as f:
            kanji_list = json.load(f)

        # n3.json -> 3 (angka lebih besar = level lebih mudah; untuk tier)
        kanji_level = int(level_file.stem[1:])

        result = {}
        no_example = 0
        for entry in kanji_list:
            kanji = entry["kanji"]
            on_hira, kun_roots = build_reading_sets(entry)

            # Ambil bacaan primary (diset rerank_readings.py, atau dipulihkan
            # dari run build_examples sebelumnya) sebagai hiragana, supaya
            # kata contoh yang memakainya bisa diutamakan.
            primary_on_hira = None
            primary_kun_hira = None
            pr = get_primary_romaji(entry)
            for romaji in pr:
                # Cari bacaan on/kun kanji mana yang cocok dengan romaji ini
                for r in entry.get("readings", {}).get("on", []):
                    if romaji_matches_reading(romaji, r):
                        primary_on_hira = katakana_to_hiragana(clean_kun(r))
                        break
                for r in entry.get("readings", {}).get("kun", []):
                    if romaji_matches_reading(romaji, r):
                        primary_kun_hira = katakana_to_hiragana(clean_kun(r))
                        break

            examples = build_examples_for_kanji(
                kanji, jmdict_terms, freq_index, on_hira, kun_roots,
                primary_on_hira, primary_kun_hira, freq_by_reading,
                kanji_level, vocab
            )
            result[kanji] = examples
            if not examples:
                no_example += 1

        out_path = output_dir / f"{level_file.stem}_examples.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        # Filter daftar kerja primary ke bacaan yang ditopang contoh dan
        # simpan bentuk kananya (primary_readings) — kuis hanya menanyakan
        # bacaan yang ditopang, UI men-bold tepat kana itu. Data final
        # HANYA menyimpan primary_readings (romaji termuat per item);
        # primary_romaji tetap field kerja internal pipeline dan dibuang
        # di sini supaya keduanya tidak bisa berpisah (drift).
        filtered = 0
        derived_total = 0
        for entry in kanji_list:
            exs = result.get(entry["kanji"], [])
            new_pr, primary_readings, derived = filter_entry(entry, exs)
            if new_pr != get_primary_romaji(entry):
                filtered += 1
            derived_total += len(derived)
            entry["primary_readings"] = primary_readings
            entry.pop("primary_romaji", None)

        kanji_path = output_dir / level_file.name
        with open(kanji_path, "w", encoding="utf-8") as f:
            json.dump(kanji_list, f, ensure_ascii=False, indent=2)

        both_types = sum(1 for v in result.values() if len({e["type"] for e in v}) == 2)
        print(f"  {level_file.stem}: {len(result) - no_example}/{len(result)} kanji got examples "
              f"({both_types} with both on+kun) → {out_path.name}")
        print(f"    primary readings filtered on {filtered}/{len(kanji_list)} kanji "
              f"({derived_total} re-derived from examples) → {kanji_path.name}")
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


if __name__ == "__main__":
    main()
