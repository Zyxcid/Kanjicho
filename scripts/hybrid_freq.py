#!/usr/bin/env python3
"""hybrid_freq.py — sinyal frekuensi HYBRID: jiten.moe (utama) + pri JMdict
(fallback).

Sumber & lisensi:
  - Daftar frekuensi global Jiten (CC BY-SA 4.0 — kompatibel dengan
    lisensi data lain) adalah sinyal korpus UTAMA: 298.699 pasangan
    kata-bacaan berkanji, register sehari-hari/media yang dekat dengan
    kosakata N5-N3.
  - Penanda common JMdict ke_pri/re_pri (pseudo-freq band 2.500-50.000,
    500 kata per band — resolusi kasar, condong register editorial
    koran) menjadi FALLBACK untuk kata yang tidak terattestasi jiten.

Aturan hybrid (dipakai rerank_readings.py DAN build_examples.py lewat
apply_hybrid() tepat setelah parse_jmdict — satu titik injeksi):
  1. Pasangan (ejaan kanji, bacaan) terattestasi di jiten dengan
     rank <= JITEN_MAX_RANK → freq = JITEN_SCALE // rank
     (MENIMPA nilai pri; Zipf 20.000.000/rank).
  2. Terattestasi tapi rank > JITEN_MAX_RANK (LEMAH) + pri-marked →
     freq di-CAP ke WEAK_CAP (turunkan nilai pri yang lebih tinggi;
     nilai di bawah cap dibiarkan). Attestasi lemah adalah BUKTI
     KEBARANGAN riil: kata yang kamus koran anggap umum (二死
     news1/nf04 ≈ 47.000) tapi riilnya cuma #104.000 di media tidak
     boleh mengalahkan kata yang benar-benar umum (第二 #2.926).
     Cap = band "umum lemah" pri (ichi2/news2/spec2/gai2 = 2.500).
  3. Terattestasi LEMAH + TANPA pri → freq = SLOT_FLOOR (50):
     kelas SLOT-FILL-ONLY — di BAWAH SEED_MARGIN rerank (100) sehingga
     tak bisa menggulingkan urutan kamus, dan di bawah
     P2A_FREQ_FLOOR (2000) sehingga tak bisa menukar primary; tapi
     freq > 0 menjadikannya kandidat korpus supaya slot contoh N1
     sastra tetap terisi (奈落 #21k, 山彦 #75k — kata NYATA, hanya
     bukan top-10k media dan tanpa tanda editorial). Tanpa kelas ini,
     99 kanji N1 kehilangan semua contohnya.
  4. Tidak ada di jiten → pri tetap (kata editorial/korpus koran
     yang jarang muncul di media hiburan tetap dapat kredit pri).

Skala JITEN_SCALE = 20.000.000 membuat ambang absolut pipeline
bermakna sebagai rasio rank: P2A_FREQ_FLOOR 2000 ↔ rank 10.000;
P2A_STRONG_MARGIN 4x menjadi rasio rank riil (kandidat 4x lebih umum
= rank ~4x lebih kecil). Lapisan pri fallback memakai skala band
2.500-50.000 — perbandingan lintas skala hanya terjadi antar kata
yang terpisah cutoff, dan kata editorial top (nf01 = 50.000) memang
layak bersaing dengan kata media rank menengah.

Bacaan dinormalisasi katakana→hiragana sebelum pencocokan kunci
(JMdict reb kadang katakana; Form jiten selalu kana).
"""
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Ambang & skala — lihat docstring modul.
JITEN_MAX_RANK = 10_000
JITEN_SCALE = 20_000_000
# Cap untuk attestasi LEMAH (rank > JITEN_MAX_RANK tapi tercatat):
# menurunkan nilai pri kata riil-langka ke band "umum lemah".
# SELARAS P2A_FREQ_FLOOR 2000 (cap 2.500 tetap lolos floor, persis
# perilaku tier-2 ichi2/news2).
WEAK_CAP = 2_500
# Lantai slot-fill-only untuk attestasi lemah TANPA pri: di bawah
# SEED_MARGIN (100) dan P2A_FREQ_FLOOR (2000) — bisa mengisi slot
# contoh, tidak bisa memengaruhi ranking bacaan/primary.
SLOT_FLOOR = 50

# Nama file kanonik di raw/ (fail-fast bila hilang: rebuild harus
# deterministik; fallback senyap = data tak reproduksibel — filosofi
# sama dengan JLPT_vocab_ALL.json di build_examples.py t68).
JITEN_CSV_NAME = "frequency_list_global.csv"


def _kata_to_hira(text):
    """Katakana → hiragana (offset U+30A0..U+30F6 → U+3041..U+3096).
    Salinan lokal kecil (convert_kanji/rerank punya masing-masing;
    salinan di sini supaya modul bebas import-siklik)."""
    out = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def load_jiten(csv_path=None):
    """Muat CSV jiten → {(word, form_hira): rank}.

    Baris kana-murni ikut dimuat (murah, tak pernah cocok dengan kunci
    ejaan-kanji JMdict) supaya file tidak perlu pra-filter.
    """
    path = Path(csv_path) if csv_path else ROOT / "raw" / JITEN_CSV_NAME
    if not path.exists():
        return None
    pairs = {}
    with open(path, encoding="utf-8") as fh:
        reader = csv.reader(fh)
        next(reader, None)  # header: Word,Form,Rank
        for row in reader:
            if len(row) < 3:
                continue
            word, form, rank_s = row[0].strip(), row[1].strip(), row[2]
            try:
                rank = int(rank_s)
            except ValueError:
                continue
            if rank < 1 or not word or not form:
                continue
            key = (word, _kata_to_hira(form))
            # Rank terkecil menang kalau pasangan kembar muncul.
            if key not in pairs or rank < pairs[key]:
                pairs[key] = rank
    return pairs


def jiten_pseudo_freq(rank):
    """rank → freq pseudo (Zipf, skala 20 juta token)."""
    return max(1, JITEN_SCALE // rank)


def apply_hybrid(terms, alt_terms, jiten):
    """Overlay in-place pada struktur parse_jmdict. Return stats.

    terms/alt_terms : {keb: [(reading, glosses, freq), ...]} — hanya
    elemen freq yang diganti; urutan & isi lain tak disentuh.
    """
    stats = {
        "jiten_overridden": 0,   # kasus 1 (freq jiten menimpa)
        "weak_capped": 0,        # kasus 2 (rank > cutoff + pri → cap)
        "weak_slotfloor": 0,     # kasus 3 (rank > cutoff tanpa pri → 50)
        "pairs_seen": 0,
        "terms_touched": 0,
    }

    def overlay(bucket, term):
        changed = False
        for i, (reading, glosses, freq) in enumerate(bucket):
            stats["pairs_seen"] += 1
            key = (term, _kata_to_hira(reading))
            rank = jiten.get(key)
            if rank is None:
                continue  # kasus 4: unattested → pri tetap (0 jika non-pri)
            if rank <= JITEN_MAX_RANK:
                # kasus 1: kuat → freq jiten riil.
                bucket[i] = (reading, glosses, jiten_pseudo_freq(rank))
                stats["jiten_overridden"] += 1
                changed = True
            elif freq >= WEAK_CAP:
                # kasus 2: lemah + pri-marked (nilai pri ≥ 2.500) → cap.
                bucket[i] = (reading, glosses, WEAK_CAP)
                stats["weak_capped"] += 1
                changed = True
            else:
                # kasus 3: lemah + TANPA pri (freq 0) → slot-fill-only.
                bucket[i] = (reading, glosses, SLOT_FLOOR)
                stats["weak_slotfloor"] += 1
                changed = True
        return changed

    for term, bucket in terms.items():
        if overlay(bucket, term):
            stats["terms_touched"] += 1
    for keb, bucket in alt_terms.items():
        overlay(bucket, keb)
    return stats


def attach(raw_dir, terms, alt_terms, label="hybrid"):
    """Muat jiten (fail-fast bila file hilang) + apply_hybrid + log.

    Dipakai rerank_readings.py & build_examples.py segera setelah
    parse_jmdict — SATU titik injeksi supaya dua langkah melihat sinyal
    yang identik. raw_dir = direktori berisi JMdict (raw/).

    t73: return (stats, jiten) — jiten (map {(word, form_hira): rank})
    dikembalikan supaya build_examples.py bisa men-refine gerbang
    varian ejaan TANPA memuat CSV dua kali; caller lain boleh
    mengabaikan elemen kedua.
    """
    path = Path(raw_dir) / JITEN_CSV_NAME
    jiten = load_jiten(path)
    if jiten is None:
        print(
            f"Error: Jiten frequency list not found: {path}\n"
            f"It is the PRIMARY corpus signal (hybrid: jiten + pri fallback).\n"
            f"Download frequency_list_global.csv (Global) from:\n"
            f"  https://jiten.moe/frequency-dictionaries  (CSV column)\n"
            f"into raw/ (see raw/jiten_frequency_README.md), then re-run.\n"
            f"CC BY-SA 4.0 — attribution required in app credits + data repo.",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"  [{label}] jiten global: {len(jiten):,} pasangan kata-bacaan "
          f"(cutoff rank <= {JITEN_MAX_RANK:,})")
    stats = apply_hybrid(terms, alt_terms, jiten)
    print(f"  [{label}] overlay: {stats['jiten_overridden']:,} kuat menimpa; "
          f"{stats['weak_capped']:,} lemah+pri di-cap {WEAK_CAP:,}; "
          f"{stats['weak_slotfloor']:,} lemah tanpa pri → slot-floor "
          f"{SLOT_FLOOR}; {stats['pairs_seen']:,} pasangan diperiksa")
    return stats, jiten


if __name__ == "__main__":
    # Uji cepat mandiri: muat + laporkan distribusi.
    j = load_jiten()
    if j is None:
        print("CSV tidak ditemukan — letakkan di raw/")
        sys.exit(1)
    ranks = sorted(j.values())
    n = len(ranks)
    print(f"{n:,} pasangan; rank min {ranks[0]}, median {ranks[n // 2]}, "
          f"p90 {ranks[int(n * 0.9)]}, max {ranks[-1]}")
    attested = sum(1 for r in ranks if r <= JITEN_MAX_RANK)
    print(f"terattestasi kuat (<= {JITEN_MAX_RANK:,}): {attested:,}")
