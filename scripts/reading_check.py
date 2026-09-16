#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
reading_check.py — verifikasi bacaan kata target dalam kalimat contoh
(t109). Modul bersama untuk build_sentences.py (gate seleksi kandidat)
dan audit_sentence_readings.py (QA).

MASALAH YANG DISELESAIKAN: kalimat dipilih lewat kecocokan TULISAN kata,
tapi kata yang sama bisa dibaca beda di kalimat (中［ちゅう］"medium"
↔ トムは車の中［なか］にいるよ). Dua "pendapat" tokenisator dipakai
bersama karena kelemahannya saling menutup:

  fugashi + unidic-lite — morfologi bagus, TAPI field `kana` adalah kana
    UNDERLYING per morfem, bukan bacaan surface: 土曜日→ドヨウ+ヒ
    (harus ドヨウビ), 座布団→ザ+フトン (ザブトン), 一冊→イチ+サツ
    (イッサツ), 外国人→ガイコク+ニン (…ジン).
  pykakasi — bacaan SURFACE benar (どようび/ざぶとん/いっさつ), TAPI
    kadang salah pilih bacaan kontekstual (一寸→ちょっと, 上手さ→
    じょうずさ) dan kadang kehilangan sokuon (八つ→やつ).

Toleransi fonologis saat membandingkan bacaan expected (examples.json,
SURFACE) vs bacaan kontekstual:
  - tanda okurigana JMdict (.-/) dibuang, katakana→hiragana
  - dakuten/handakuten diabaikan kedua sisi (は↔ば↔ぱ) — rendaku tak
    terprediksi; aman karena kedua sisi adalah bacaan kata YANG SAMA
  - 'っ' ↔ 'ち'/'つ' (kontraksi sokuon: いっぽ↔いちほ)
  - 'じっ' ↔ 'じゅう' (十: にじっせいき↔にじゅうせいき)
  - sufiks 人: expected …じん ↔ kontekstual …にん (unidic selalu
    lemma ニン untuk 人 bersuffix — cek ekor kata saja, tak umum)
  - bandingkan tanpa 'っ' sama sekali sebagai upaya terakhir (quirk
    pykakasi kadang menjatuhkan sokuon)

Verdict kombinasi dua pendapat (dipakai audit; gate build memakai
logika OR + daftar tolak manual):
  ok        — salah satu pendapat cocok (kalimat dipercaya)
  mismatch  — kedua pendapat bilang beda (kalimat bermasalah)
  disagree  — pendapat split (masuk daftar pertimbangan manual)
  unverified — kedua pendapat gagal MENSAJAKAN bacaan (misalignment)

Dependensi: pip install fugashi unidic-lite pykakasi
"""
import re

try:
    import fugashi
except ImportError:
    fugashi = None
try:
    import pykakasi
except ImportError:
    pykakasi = None

READING_MARKS_RE = re.compile(r"[.\-‐−・\s]")
HIRA_OK_RE = re.compile(r"^[ぁ-ゖー]+$")
# kanji (sama dengan build_sentences/build_furigana)
KANJI_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〆]")

# dakuten/handakuten → bentuk dasar (は行 basis utk ぱ/ば, dsb.)
_VOICED_MAP = str.maketrans(
    "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽヴ",
    "かきくけこさしすせそたちつてとはひふへほはひふへぽう",
)


def kata_to_hira(s):
    out = []
    for ch in s:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def norm_reading(r):
    """kana bersih hiragana, tanpa tanda okurigana."""
    return kata_to_hira(READING_MARKS_RE.sub("", r or ""))


def _base(s):
    return s.translate(_VOICED_MAP)


def _walk(a, b):
    """Char-walk dua bacaan (sudah _base): True bila ekuivalen dengan
    toleransi kontraksi sokuon / 十."""
    i = j = 0
    la, lb = len(a), len(b)
    while i < la and j < lb:
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        if a.startswith("じっ", i) and b.startswith("じゅう", j):
            i += 2
            j += 3
            continue
        if b.startswith("じっ", j) and a.startswith("じゅう", i):
            j += 2
            i += 3
            continue
        # varian kontraksi 十: にじっせいき ↔ にじゅっせいき
        if a.startswith("じっ", i) and b.startswith("じゅっ", j):
            i += 2
            j += 3
            continue
        if b.startswith("じっ", j) and a.startswith("じゅっ", i):
            j += 2
            i += 3
            continue
        # varian kontraksi 十: にじっせいき ↔ にじゅうせいき ↔ にじゅっせいき
        # ('じ' di kedua sisi sudah terkonsumsi sama — sisanya っ vs ゅう/ゅっ)
        if a[i] == "っ" and b.startswith("ゅう", j):
            i += 1
            j += 2
            continue
        if b[j] == "っ" and a.startswith("ゅう", i):
            j += 1
            i += 2
            continue
        if a[i] == "っ" and b.startswith("ゅっ", j):
            i += 1
            j += 2
            continue
        if b[j] == "っ" and a.startswith("ゅっ", i):
            j += 1
            i += 2
            continue
        if a[i] == "っ" and b[j] in "ちつ":
            i += 1
            j += 1
            continue
        if b[j] == "っ" and a[i] in "ちつ":
            j += 1
            i += 1
            continue
        return False
    return i == la and j == lb


def readings_match(expected, ctx, surface=None):
    """True bila bacaan expected (examples) ekuivalen dengan bacaan
    kontekstual menurut toleransi di atas."""
    e = _base(norm_reading(expected))
    c = _base(norm_reading(ctx))
    if not e or not c:
        return False
    if e == c or _walk(e, c):
        return True
    # sufiks 人: unidic lemma ニン vs bacaan sebenarnya ジン
    if surface and surface.endswith("人") and e.endswith("しん") and c.endswith("にん"):
        if e[:-2] == c[:-2]:
            return True
    # quirk pykakasi: sokuon kadang hilang (やっつ→やつ)
    if e.replace("っ", "") == c.replace("っ", ""):
        return True
    return False


class ReadingVerifier:
    """Dua tokenisator + ekstraksi bacaan pada rentang kata target."""

    def __init__(self):
        if fugashi is None:
            raise SystemExit("butuh fugashi: pip install fugashi unidic-lite")
        if pykakasi is None:
            raise SystemExit("butuh pykakasi: pip install pykakasi")
        self._tagger = fugashi.Tagger()
        self._kks = pykakasi.kakasi()
        self._unidic_cache = {}
        self._pika_cache = {}

    # ---- span unidic: [(start, end, surface, kana_hira)] ----
    def unidic_spans(self, jp):
        if jp in self._unidic_cache:
            return self._unidic_cache[jp]
        spans = []
        ptr = 0
        for tok in self._tagger(jp):
            surf = tok.surface
            if not surf:
                continue
            idx = jp.find(surf, ptr)
            if idx < 0:
                continue
            ptr = idx + len(surf)
            kana = getattr(tok.feature, "kana", None) or ""
            spans.append((idx, idx + len(surf), surf, kata_to_hira(kana)))
        self._unidic_cache[jp] = spans
        return spans

    # ---- span pykakasi: [(start, end, orig, hira)] ----
    def pika_spans(self, jp):
        if jp in self._pika_cache:
            return self._pika_cache[jp]
        spans = []
        pos = 0
        for item in self._kks.convert(jp):
            orig = item.get("orig", "")
            hira = item.get("hira", "")
            if not orig:
                continue
            # pika kadang MENORMALKAN karakter (mis. ㎜ → mm + duplikasi
            # '48') sehingga penjumlahan len(orig) bergeser dari teks
            # sumber — cari maju seperti unidic_spans; chunk yang tak
            # ketemu dilewati (bacaan tak dipercaya utk offsetnya).
            idx = jp.find(orig, pos)
            if idx < 0:
                continue
            pos = idx + len(orig)
            spans.append((idx, idx + len(orig), orig, hira))
        self._pika_cache[jp] = spans
        return spans

    # ---- bacaan pada rentang [start, start+length) ----
    @staticmethod
    def _reading_unidic(spans, start, length):
        end = start + length
        covering = [s for s in spans if s[0] < end and s[1] > start]
        if not covering:
            return None
        if covering[0][0] != start or covering[-1][1] != end:
            return None
        for a, b in zip(covering, covering[1:]):
            if a[1] != b[0]:
                return None
        return "".join(s[3] for s in covering)

    @staticmethod
    def _reading_pika(spans, start, length):
        end = start + length
        covering = [s for s in spans if s[0] < end and s[1] > start]
        if not covering:
            return None
        # chunk boleh MELAMPAUI batas kata di tepi luar (mis. kata 中 di
        # dalam chunk 中に) — bagian chunk di luar kata harus kana murni
        # supaya bisa dilepas dari bacaan (okurigana). Chunk ANTARA kata
        # harus berbatasan rapat (tanpa celah).
        for a, b in zip(covering, covering[1:]):
            if a[1] != b[0]:
                return None
        parts = []
        for (s0, s1, orig, hira) in covering:
            pre = orig[: start - s0] if s0 < start else ""
            post = orig[end - s0:] if s1 > end else ""
            r = hira
            if pre:
                if KANJI_RE.search(pre):
                    return None
                ph = kata_to_hira(pre)
                if not r.startswith(ph):
                    return None
                r = r[len(ph):]
            if post:
                if KANJI_RE.search(post):
                    return None
                ph = kata_to_hira(post)
                if not r.endswith(ph):
                    return None
                r = r[: len(r) - len(ph)]
            if not r:
                return None
            parts.append(r)
        return "".join(parts)

    def reading_at(self, jp, start, length, tool):
        spans = self.unidic_spans(jp) if tool == "unidic" else self.pika_spans(jp)
        if tool == "unidic":
            return self._reading_unidic(spans, start, length)
        return self._reading_pika(spans, start, length)

    def contextual_readings(self, jp, pos_list, length):
        """{tool: set(bacaan)} untuk semua kemunculan; None dalam set =
        kemunculan yang tak ter-saji alat itu."""
        out = {}
        for tool in ("unidic", "pika"):
            vals = set()
            for p in pos_list:
                vals.add(self.reading_at(jp, p, length, tool))
            out[tool] = vals
        return out

    def ok_breakdown(self, jp, pos_list, length, expected, surface=None):
        """Detail verifikasi: bacaan per alat + apakah alat itu
        menyaji & cocok. Dipakai audit utk daftar 'single_tool'
        (verdict ok tapi hanya satu alat yang memverifikasi — titik
        rawan false-accept pykakasi/unidic, diadjudikasi manual)."""
        exp = expected if isinstance(expected, (set, frozenset)) else {expected}

        def match_any(v):
            return any(readings_match(e, v, surface) for e in exp)

        u_vals = [self.reading_at(jp, p, length, "unidic") for p in pos_list]
        p_vals = [self.reading_at(jp, p, length, "pika") for p in pos_list]
        u_read = [v for v in u_vals if v is not None]
        p_read = [v for v in p_vals if v is not None]
        return {
            "unidic_ok": len(u_read) == len(u_vals) and all(match_any(v) for v in u_read),
            "pika_ok": len(p_read) == len(p_vals) and all(match_any(v) for v in p_read),
            "unidic": u_read,
            "pika": p_read,
        }

    def verdict(self, jp, pos_list, length, expected, surface=None):
        """'ok' | 'mismatch' | 'disagree' | 'unverified'.

        `expected` boleh satu bacaan atau SET bacaan (kata dengan entri
        contoh on+kun) — kecocokan dengan salah satu cukup.

        ok          — ≥1 alat menyaji semua kemunculan DAN cocok (OR)
        mismatch    — kedua alat menyaji semua & keduanya beda (pasti)
        unverified  — tidak ada alat yang bisa menyaji (misalignment)
        disagree    — tepat satu alat menyaji (dan bilang beda)
        """
        exp = expected if isinstance(expected, (set, frozenset)) else {expected}

        def match_any(v):
            return any(readings_match(e, v, surface) for e in exp)

        u_vals = [self.reading_at(jp, p, length, "unidic") for p in pos_list]
        p_vals = [self.reading_at(jp, p, length, "pika") for p in pos_list]
        u_unread = any(v is None for v in u_vals)
        p_unread = any(v is None for v in p_vals)
        if not u_unread and all(match_any(v) for v in u_vals):
            return "ok"
        if not p_unread and all(match_any(v) for v in p_vals):
            return "ok"
        if not u_unread and not p_unread:
            return "mismatch"
        if u_unread and p_unread:
            return "unverified"
        return "disagree"

    def gate_pass(self, jp, pos_list, length, expected, surface=None, overrides=None):
        """Gate seleksi build_sentences: kandidat LULUS bila
        (verdict 'ok' = salah satu alat memverifikasi cocok) DAN bukan
        pasangan (kata, kalimat) yang ditolak manual. Kalimat yang
        diterima manual (accept) dipaksa lolos — hasil adjudikasi
        audit_sentence_readings.py di scripts/reading_overrides.json."""
        if overrides:
            acc = overrides.get("accept", {}).get(surface)
            if acc and jp in acc:
                return True
            rej = overrides.get("reject", {}).get(surface)
            if rej and jp in rej:
                return False
        return self.verdict(jp, pos_list, length, expected, surface) == "ok"
