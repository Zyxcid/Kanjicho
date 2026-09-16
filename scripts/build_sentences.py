#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_sentences.py — pipeline pemilihan kalimat contoh Kanjichō dari
unduhan pasangan kalimat Tatoeba (t107; dijadikan script proyek t108
supaya `src/data/n*_sentences.json` bisa direproduksi ulang, seperti
build_examples.py).

Langkah pipeline kalimat (urutan):
  1. scripts/build_sentences.py        (script ini — pilih kalimat)
  2. scripts/id_translation/translate_sentences.mjs   (terjemahan ID)
  3. scripts/build_furigana.py         (bacaan ruby tiap kanji)

Input:
  - Tatoeba "Links + sentences" exports (Downloads page): dua TSV
    "Pasangan kalimat dalam bahasa Jepang-Inggris …tsv" dan
    "…Jepang-Indonesia …tsv". Letakkan keduanya di satu folder, lalu:
      python3 scripts/build_sentences.py --tatoeba-dir <folder>
    (nama file dicari via glob "*Jepang-Inggris*.tsv" — tanggal di nama
    file bebas; nama Indonesia bervariasi per bahasa antarmuka unduhan,
    gunakan --tatoeba-en/--tatoeba-id bila pola gagal)
  - src/data/n*_examples.json (kata contoh per level — kunci seleksi)
  - src/data/n*.json (peta kanji→level untuk skor kesesuaian level)
  - src/data/n*_sentences.json yang SUDAH ADA (bila ada): terjemahan `id`
    dan `furi` dipertahankan untuk entri yang kalimatnya tidak berubah
    (jp sama) → rebuild dengan snapshot Tatoeba baru hanya perlu LLM
    untuk kalimat yang benar-benar baru/ganti. --fresh mengabaikan merge.

Output:
  - src/data/n{5,4,3,2,1}_sentences.json
      { "<kata>": { "jp": <kalimat>, "en": <terjemahan EN Tatoeba>,
                    "id": <terjemahan ID — native Tatoeba bila ada,
                           sisanya diisi translate_sentences.mjs>,
                    "pos": [<indeks kemunculan batas-bersih>, …],
                    "furi": [[start, len, <bacaan kana>], …] } }
        (field `id` non-native dan `furi` diisi langkah berikutnya;
         `furi` oleh build_furigana.py)
  - scripts/sentences_report.json (statistik build; tidak di-ship ke app)

Desain seleksi (keputusan t107, worklog Task 15):
  - SATU kalimat per kata (permintaan user).
  - Batas-bersih: karakter SEBELUM & SESUDAH kemunculan kata tidak boleh
    kanji — mencegah salah-highlight kata di dalam compound (日 dalam
    日本), dengan biaya minuscule kehilangan kandidat legit tanpa
    partikel (毎日勉強する) — korpus besar, median 20 kandidat/kata.
  - (t109) GATE BACAAN: kandidat hanya lolos bila kata target di
    kalimat itu terbaca sesuai `reading` examples (verifikasi dua
    tokenisator + toleransi fonologis — lihat scripts/reading_check.py)
    ATAU diterima manual (scripts/reading_overrides.json). Memutus
    kelas bug "kata sama, bacaan beda" (中［ちゅう］"medium" vs 車の中
    ［なか］). Kata tanpa kandidat yang lolos → tanpa kalimat (lebih
    baik tanpa kalimat daripada kalimat yang menyesatkan).
  - Skor: panjang (target lembut per level) + jarak level kanji di luar
    kata target (N5 paling ketat, N1 longgar) + penalti kemunculan ganda
    + bonus kalimat native JP-ID + kebersihan EN.
  - Dedup antar-kata: preferensi kalimat belum terpakai (penalti lembut),
    kata diproses dari yang paling langka (kandidat tersedikit) dulu.
  - `pos` dipracompute → UI tinggal slice, tanpa port logika batas ke JS.

Dependensi: python3 + pyahocorasick + fugashi + unidic-lite + pykakasi
  (pip install pyahocorasick fugashi unidic-lite pykakasi;
   di Debian/Ubuntu environment tertentu:
   python3 -m pip install <paket> --break-system-packages)

Deterministik: output identik untuk input yang sama (urutan iterasi file
dipertahankan; tie-break stabil) — rebuild tanpa --fresh di repo yang
sudah berisi terjemahan adalah no-op.
"""
import argparse
import glob
import json
import os
import re
import statistics
from collections import defaultdict

try:
    import ahocorasick
except ImportError:
    raise SystemExit(
        "butuh pyahocorasick: pip install pyahocorasick\n"
        "(environment tertentu: python3 -m pip install pyahocorasick --break-system-packages)"
    )

try:
    from reading_check import ReadingVerifier, norm_reading
except ImportError:
    raise SystemExit(
        "butuh scripts/reading_check.py + dependensinya:\n"
        "  pip install fugashi unidic-lite pykakasi\n"
        "(environment tertentu: --break-system-packages)"
    )

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = ["N5", "N4", "N3", "N2", "N1"]
LEVEL_NUM = {"N5": 1, "N4": 2, "N3": 3, "N2": 4, "N1": 5}

# ---- konstanta skor (t107) ----
LEN_TARGET = {"N5": 12, "N4": 16, "N3": 20, "N2": 25, "N1": 30}  # lembut
LEN_OVER_COST = 1.2        # per karakter melebihi target level
GAP_COST = 3.0             # per level-jarak kanji di atas level kata
UNKNOWN_COST = 4.0         # per kanji di luar 2.211 kanji app
DUP_OCC_COST = 2.5         # per kemunculan bersih tambahan
ID_NATIVE_BONUS = 5.0      # kalimat punya pasangan JP-ID native
NO_TERM_PEN = 1.5          # tidak diakhiri 。！？
USED_PEN = 3.0             # kalimat sudah dipakai kata lain
HARD_MAX = 45              # panjang kalimat maksimum (karakter)
EN_MAX = 110
MAX_CAND = 250             # batas kandidat per kata untuk skor

KANJI_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〆]")
HALF_KANA_RE = re.compile(r"[\uFF61-\uFF9F]")
LATIN_RUN_RE = re.compile(r"[A-Za-z]{4,}")
BAD_EN_RE = re.compile(r"https?://|@")


def is_kanji(ch):
    return bool(KANJI_RE.match(ch))


def find_tatoeba_file(directory, patterns, label):
    """Cari file TSV Tatoeba via glob; satu kecocokan → pakai."""
    for pat in patterns:
        matches = sorted(glob.glob(os.path.join(directory, pat)))
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise SystemExit(
                f"[tatoeba] beberapa kandidat {label}: {matches}\n"
                f"  → gunakan --tatoeba-{label} untuk memilih satu."
            )
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--tatoeba-dir", default=os.path.join(ROOT, "scripts", "tatoeba"),
                    help="folder berisi TSV pasangan kalimat Tatoeba (default: scripts/tatoeba)")
    ap.add_argument("--tatoeba-en", default=None, help="path TSV JP-EN eksplisit")
    ap.add_argument("--tatoeba-id", default=None, help="path TSV JP-ID eksplisit")
    ap.add_argument("--fresh", action="store_true",
                    help="abaikan n*_sentences.json yang ada (tanpa merge id/furi)")
    args = ap.parse_args()

    tat_en = args.tatoeba_en or find_tatoeba_file(
        args.tatoeba_dir,
        ["*Jepang-Inggris*.tsv", "*Japanese-English*.tsv", "*jpn-eng*.tsv"],
        "en")
    tat_id = args.tatoeba_id or find_tatoeba_file(
        args.tatoeba_dir,
        ["*Jepang-Indonesia*.tsv", "*Japanese-Indonesian*.tsv", "*jpn-ind*.tsv"],
        "id")
    if not tat_en or not tat_id:
        raise SystemExit(
            "[tatoeba] TSV JP-EN/JP-ID tidak ditemukan di "
            f"{args.tatoeba_dir}\n"
            "  Unduh 'Sentence pairs' Jepang-Inggris & Jepang-Indonesia dari "
            "https://tatoeba.org/en/downloads (weekly exports),\n"
            "  letakkan di folder itu, lalu jalankan ulang.\n"
            "  (nama file mengandung tanggal — dicari via glob.)"
        )
    print(f"[tatoeba] EN: {tat_en}\n[tatoeba] ID: {tat_id}")

    # ---------- 1. kata contoh per level + peta kanji→level ----------
    level_words = {lv: set() for lv in LEVELS}          # lv -> {kata}
    word_level = {}                                    # kata -> level (pertama)
    kanji_level = {}                                   # kanji -> nomor level
    level_word_readings = {lv: {} for lv in LEVELS}    # lv -> kata -> set(bacaan)
    for lv in LEVELS:
        kj = json.load(open(f"{ROOT}/src/data/{lv.lower()}.json", encoding="utf-8"))
        for k in kj:
            kanji_level[k["kanji"]] = LEVEL_NUM[lv]
        ex = json.load(open(f"{ROOT}/src/data/{lv.lower()}_examples.json", encoding="utf-8"))
        rmap = level_word_readings[lv]
        for _k, lst in ex.items():
            for e in lst:
                level_words[lv].add(e["word"])
                word_level.setdefault(e["word"], lv)
                r = norm_reading(e.get("reading", ""))
                if r:
                    rmap.setdefault(e["word"], set()).add(r)

    # (t109) bacaan yang diizinkan utk gate: kata yang dipakai >1 level
    # harus cocok di SEMUA level pemakainya (kalimat yang sama tampil di
    # semua level itu) → irisan set bacaan per level. Irisan kosong =
    # konflik lintas-level → tanpa kalimat (audit melaporkannya).
    allowed = {}
    conflict_words = []
    for w in word_level:
        sets = [level_word_readings[lv][w] for lv in LEVELS
                if w in level_words[lv] and level_word_readings[lv].get(w)]
        if not sets:
            continue
        inter = set.intersection(*sets)
        if inter:
            allowed[w] = inter
        else:
            conflict_words.append(w)

    ALL_WORDS = sorted(word_level)
    print(f"[kata] {len(ALL_WORDS)} kata unik; per level:",
          {lv: len(level_words[lv]) for lv in LEVELS})
    if conflict_words:
        print(f"[gate] KONFLIK: {len(conflict_words)} kata tanpa bacaan yang "
              f"valid di semua level pemakainya → tanpa kalimat")

    # adjudikasi manual (audit t109) — scripts/reading_overrides.json
    ovr_path = os.path.join(ROOT, "scripts", "reading_overrides.json")
    overrides = json.load(open(ovr_path, encoding="utf-8")) if os.path.exists(ovr_path) else {}
    ver = ReadingVerifier()
    gated = [0]

    def gate_ok(jp, w, pos):
        """True bila kata w terbaca sesuai examples di kalimat jp
        (semua kemunculan batas-bersih), atau di-accept manual.
        Drop/force = adjudikasi per-kata (kata yang tak bisa diverifikasi
        alat sama sekali / kalimat spesifik yang dipilih manual)."""
        if w in overrides.get("drop", []):
            return False
        if overrides.get("force", {}).get(w) == jp:
            return True
        exp = allowed.get(w)
        if exp is None:
            return True  # kata tanpa bacaan di examples → tak terverifikasi
        gated[0] += 1
        return ver.gate_pass(jp, pos, len(w), exp, surface=w, overrides=overrides)

    # ---------- 2. muat Tatoeba ----------
    # jp -> daftar EN unik (≤3 terpendek); jp -> ID native
    en_map = defaultdict(set)
    with open(tat_en, encoding="utf-8-sig") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) < 4:
                continue
            jp, en = p[1].strip(), p[3].strip()
            if jp and en:
                en_map[jp].add(en)

    id_map = {}
    with open(tat_id, encoding="utf-8-sig") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p) < 4:
                continue
            jp, tid = p[1].strip(), p[3].strip()
            if jp and tid and jp not in id_map:
                id_map[jp] = tid

    print(f"[tatoeba] {len(en_map)} kalimat JP unik (EN); {len(id_map)} dengan ID native")

    # kandidat bersih per kalimat dihitung SEKALI lewat automaton
    A = ahocorasick.Automaton()
    for w in ALL_WORDS:
        A.add_word(w, w)
    A.make_automaton()

    # word -> list kandidat (jp, en, has_id, pos_list)
    cands = defaultdict(list)
    skipped_half = skipped_latin = 0
    for jp, ens in en_map.items():
        n = len(jp)
        if n > HARD_MAX or n < 4:
            continue
        if HALF_KANA_RE.search(jp):
            skipped_half += 1
            continue
        if LATIN_RUN_RE.search(jp):
            skipped_latin += 1
            continue
        # EN bersih terbaik (≤2). Tie-break eksplisit (len, teks): iterasi
        # SET Python dirandomisasi hash-seed per proses — tanpa ini, dua
        # terjemahan sama-pendek dipilih acak antar-run (26 kasus pada
        # snapshot 2026-09-15) dan output tidak reproducible.
        clean_ens = sorted(
            (e for e in ens if len(e) <= EN_MAX and not BAD_EN_RE.search(e) and len(e) >= 4),
            key=lambda e: (len(e), e),
        )[:2]
        has_id = jp in id_map
        if not clean_ens and not has_id:
            continue
        # kemunculan batas-bersih tiap kata di kalimat ini
        occ = defaultdict(list)
        for end_idx, w in A.iter(jp):
            start = end_idx - len(w) + 1
            before = jp[start - 1] if start > 0 else None
            after = jp[start + len(w)] if start + len(w) < n else None
            if (before is None or not is_kanji(before)) and (after is None or not is_kanji(after)):
                occ[w].append(start)
        if not occ:
            continue
        best_en = clean_ens[0] if clean_ens else None
        for w, pos in occ.items():
            if not gate_ok(jp, w, pos):
                continue
            cands[w].append((jp, best_en, has_id, pos))

    print(f"[filter] skip half-kana: {skipped_half}, latin-run: {skipped_latin}")
    print(f"[gate] {gated[0]} verifikasi bacaan kata-kandidat (tokenisasi di-cache per kalimat)")
    print(f"[kandidat] {len(cands)} kata punya ≥1 kandidat bersih")

    # ---------- 3. skor + pilih ----------
    def sentence_extra_kanji(jp, word):
        """Kanji di luar kata target → daftar level (None = tak dikenal)."""
        inside = set(word)
        out = []
        for ch in jp:
            if is_kanji(ch) and ch not in inside:
                out.append(kanji_level.get(ch))
        return out

    def score(jp, has_id, pos, word):
        lv = word_level[word]
        s = 0.0
        over = len(jp) - LEN_TARGET[lv]
        if over > 0:
            s += over * LEN_OVER_COST
        wnum = LEVEL_NUM[lv]
        for kl in sentence_extra_kanji(jp, word):
            if kl is None:
                s += UNKNOWN_COST
            else:
                gap = kl - wnum
                if gap > 0:
                    s += gap * GAP_COST
        if len(pos) > 1:
            s += (len(pos) - 1) * DUP_OCC_COST
        if has_id:
            s -= ID_NATIVE_BONUS
        if jp[-1] not in "。！？!?":
            s += NO_TERM_PEN
        return s

    # trim kandidat per kata (pertahankan semua native-ID + terpendek sisanya)
    for w in list(cands.keys()):
        lst = cands[w]
        if len(lst) > MAX_CAND:
            native = [c for c in lst if c[2]]
            other = sorted((c for c in lst if not c[2]), key=lambda c: len(c[0]))
            cands[w] = (native + other)[:MAX_CAND]

    # proses kata langka dulu supaya kalimat langka tidak diperebutkan kata umum
    force = overrides.get("force", {})
    order = sorted(cands.keys(), key=lambda w: len(cands[w]))
    used = set()
    chosen = {}  # kata -> (jp, en, has_id, pos)
    no_en_native = 0
    for w in order:
        best = None
        best_key = None
        for (jp, en, has_id, pos) in cands[w]:
            s = score(jp, has_id, pos, w)
            if jp in used:
                s += USED_PEN
            if force.get(w) == jp:
                s -= 1e6  # kalimat yang dipilih manual selalu menang
            if best_key is None or s < best_key:
                best_key = s
                best = (jp, en, has_id, pos)
        jp, en, has_id, pos = best
        if en is None:
            # hanya punya pasangan ID native (tanpa EN layak) — EN kosong,
            # diterjemahkan LLM dari JP nanti
            no_en_native += 1
        used.add(jp)
        chosen[w] = best

    print(f"[pilih] {len(chosen)} kata terlayani; reuse kalimat: "
          f"{len(chosen) - len(used)}; khusus-ID-native-tanpa-EN: {no_en_native}")

    # ---------- 4. emit per level (+ merge id/furi lama) ----------
    report = {"levels": {}, "total_words": len(ALL_WORDS)}
    total_native = 0
    total_llm = 0
    merged_id = merged_furi = 0
    for lv in LEVELS:
        path = f"{ROOT}/src/data/{lv.lower()}_sentences.json"
        old = {}
        if not args.fresh and os.path.exists(path):
            old = json.load(open(path, encoding="utf-8"))
        out = {}
        words = sorted(level_words[lv])
        served = native = 0
        lens = []
        for w in words:
            c = chosen.get(w)
            if not c:
                continue
            jp, en, has_id, pos = c
            entry = {"jp": jp, "en": en or "", "pos": pos}
            if has_id:
                entry["id"] = id_map[jp]
                native += 1
            else:
                total_llm += 1
            prev = old.get(w)
            if prev and prev.get("jp") == jp:
                # kalimat tak berubah → pertahankan kerja terjemahan & furigana
                if not has_id and prev.get("id"):
                    entry["id"] = prev["id"]
                    merged_id += 1
                if prev.get("furi"):
                    entry["furi"] = prev["furi"]
                    merged_furi += 1
            out[w] = entry
            served += 1
            lens.append(len(jp))
        total_native += native
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
            f.write("\n")
        rep = {
            "words": len(words),
            "served": served,
            "pct": round(100 * served / len(words), 1),
            "native_id": native,
            "llm_needed": served - native,
            "len_median": statistics.median(lens) if lens else None,
            "len_mean": round(statistics.mean(lens), 1) if lens else None,
        }
        report["levels"][lv] = rep
        print(f"[emit] {lv}: {served}/{len(words)} = {rep['pct']}% | native ID {native} | "
              f"perlu LLM {rep['llm_needed']} | panjang median {rep['len_median']}")

    report["served_total"] = len(chosen)
    report["native_id_total"] = total_native
    report["llm_needed_total"] = total_llm
    report["merged_id_kept"] = merged_id
    report["merged_furi_kept"] = merged_furi
    with open(f"{ROOT}/scripts/sentences_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"[total] terlayani {len(chosen)}/{len(ALL_WORDS)} = "
          f"{100*len(chosen)/len(ALL_WORDS):.1f}% | native ID {total_native} | perlu LLM {total_llm}"
          f" | merge id lama {merged_id} | merge furi lama {merged_furi}")
    if total_llm - merged_id > 0:
        print("[lanjut] jalankan: node scripts/id_translation/translate_sentences.mjs")


if __name__ == "__main__":
    main()
