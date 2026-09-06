#!/usr/bin/env python3
"""
rerank_readings.py — Langkah 2 pipeline: rank ulang `primary_romaji` tiap
kanji memakai frekuensi kata nyata dari korpus BCCWJ — kredit bacaan
via ATRIBUSI STRUKTURAL (alignment DP), bukan substring (Fix-5).

Untuk tiap kanji, lihat semua KATA korpus yang memuat kanji itu (mis.
時代, 代わり, 世代 untuk 代), atribusikan reading kata ke segmen kanji
dengan mesin yang sama dengan build_examples.py (langkah 3), lalu
jumlahkan frekuensi per bacaan. On'yomi paling sering jadi
primary_romaji[0]; kun'yomi paling sering jadi primary_romaji[1].

MENGAPA ATRIBUSI, BUKAN SUBSTRING (Fix-5 — akar bug seed): pencocokan
substring first-match lama menyebabkan kredit palsu dua arah:
  (1) bacaan pendek mencuri frekuensi bacaan panjang yang memuatnya
      (いる⊂はいる: 入る【はいる】 57030 masuk kolom い.る → seed 入
      salah い.る → contoh 入れる dipilih → primary ikut い.れる;
      rantai yang menghapus はい.る di N5);
  (2) kata bentuk-stem mengkredit bacaan terpendek (栄え【さかえ】 → え).
Dengan DP: kata hanya mengkredit bacaan yang SEGMENT kanjinya
benar-benar cocok (on: exact; kun: stem + okurigana persis bila ada,
kalau tidak stem-keluarga). Kata tak-teratribusi → tidak mengkredit
apa pun (konsisten kebijakan audit: UNKNOWN bukan bukti). Kredit
diindeks BENTUK BERSIH supaya varian titik KANJIDIC2 dari bacaan yang
sama (終 お.わる / おわ.る) tidak saling memecah kredit; POS 固有名詞
tidak mengkredit apa pun; seed default (bacaan pertama kamus) hanya
tergulingkan bila pemenang korpus menang telak (margin > 100).

Input:
  - raw/BCCWJ_frequencylist_luw2_ver1_0.tsv  (daftar frekuensi BCCWJ)
  - output/n*.json  (data kanji hasil langkah 1 — workspace pipeline;
                     default. src/data/ adalah hasil promosi, bukan
                     sumber default)
  - raw/kanjidic2.xml.gz  (opsional — tabel kandidat DP; tanpa ini
                     kredit kembali ke substring lama + peringatan)

Konvensi pipeline: semua sumber mentah pihak ketiga dikumpulkan di raw/
di root aplikasi (lihat build_examples.py / README).

Output:
  - file JSON di-update in place (hanya `primary_romaji` yang di-rank ulang)

Pemakaian:
    python scripts/rerank_readings.py [raw/BCCWJ_frequencylist_luw2_ver1_0.tsv] [path/to/data] [raw/kanjidic2.xml.gz]
"""

import json
import sys
from pathlib import Path

# Fix-5: mesin atribusi DP dari build_examples.py (langkah 3) —
# modul saudara di direktori scripts/ yang sama. IMPOR LAZY (di dalam
# fungsi): build_examples.py mengimpor util kana dari modul ini, jadi
# impor modul-level di sini menciptakan SIKULUS import. Import di dalam
# fungsi hanya sys.modules-lookup setelah muat pertama — perilaku &
# hasil identik, hanya waktu muat yang berbeda.
sys.path.insert(0, str(Path(__file__).resolve().parent))

# ============================================================
# Util kana (sama dengan convert_kanji.py)
# ============================================================

KATA_TO_HIRA_SMALL = {
    "ァ": "ぁ", "ィ": "ぃ", "ゥ": "ぅ", "ェ": "ぇ", "ォ": "ぉ",
    "ャ": "ゃ", "ュ": "ゅ", "ョ": "ょ", "ッ": "っ",
}

KANA_TO_ROMAJI = {
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

PALATAL = {
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

LONG_VOWEL = {
    "a":"a","i":"i","u":"u","e":"e","o":"o",
    "sha":"a","shu":"u","sho":"o",
    "cha":"a","chu":"u","cho":"o",
    "ja":"a","ju":"u","jo":"o",
}


def katakana_to_hiragana(text):
    out = []
    for ch in text:
        if "\u30a1" <= ch <= "\u30f6":
            out.append(chr(ord(ch) - 0x60))
        elif ch in KATA_TO_HIRA_SMALL:
            out.append(KATA_TO_HIRA_SMALL[ch])
        else:
            out.append(ch)
    return "".join(out)


def kana_to_romaji(kana_str):
    s = []
    for ch in katakana_to_hiragana(kana_str):
        if ch in (".", "-"):
            continue
        s.append(ch)
    s = "".join(s)
    out = ""
    i = 0
    while i < len(s):
        ch = s[i]
        nxt = s[i + 1] if i + 1 < len(s) else ""
        if ch == "っ":
            next_romaji = KANA_TO_ROMAJI.get(nxt, "")
            if next_romaji:
                out += next_romaji[0]
                i += 1
                continue
            out += "tsu"
            i += 1
            continue
        if ch == "ー":
            m = None
            for c in reversed(out):
                if c in "aeiou":
                    m = c
                    break
            if m:
                out += LONG_VOWEL.get(m, m)
            i += 1
            continue
        base = KANA_TO_ROMAJI.get(ch)
        if nxt in ("ゃ", "ゅ", "ょ"):
            y_small = KANA_TO_ROMAJI.get(nxt, "")
            if base and base in PALATAL and y_small in PALATAL[base]:
                out += PALATAL[base][y_small]
                i += 2
                continue
        if base is not None:
            out += base
        i += 1
    return out


def clean_reading(kana):
    return katakana_to_hiragana(kana).replace(".", "").strip("-")


# ============================================================
# Pemuatan BCCWJ
# ============================================================

def load_bccwj(tsv_path):
    """Muat TSV BCCWJ → [(lemma, reading_hiragana, freq), ...].
    Hanya simpan lemma yang memuat minimal satu kanji."""
    print(f"Loading BCCWJ from {tsv_path} ...")
    import csv
    words = []
    with open(tsv_path, encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)
        for row in reader:
            if len(row) < 7:
                continue
            lemma = row[2]
            lform = row[1]
            pos = row[3] if len(row) > 3 else ""
            try:
                freq = int(row[6])  # jumlah kemunculan (lebih besar = makin umum)
            except (ValueError, IndexError):
                continue
            if not any("\u4e00" <= ch <= "\u9fff" for ch in lemma):
                continue
            reading_hira = katakana_to_hiragana(lform)
            # Fix-5 iterasi-2: pos ikut dibawa — baris 固有名詞 tidak boleh
            # mengkredit bacaan (konsisten aturan POS build_examples).
            words.append((lemma, reading_hira, freq, pos))
    print(f"  Loaded {len(words)} kanji-containing BCCWJ lemmas")
    return words


def build_kanji_word_index(bccwj_words):
    """Susun { kanji_char: [(lemma, reading, freq), ...] }."""
    print("Indexing BCCWJ words by kanji ...")
    index = {}
    for lemma, reading, freq, pos in bccwj_words:
        seen_kanji = set()
        for ch in lemma:
            if "\u4e00" <= ch <= "\u9fff":
                seen_kanji.add(ch)
        for ch in seen_kanji:
            index.setdefault(ch, []).append((lemma, reading, freq, pos))
    print(f"  {len(index)} unique kanji indexed")
    return index


# ============================================================
# Ranking bacaan
# ============================================================

def rank_readings(kanji, on_readings, kun_readings, bccwj_words, cand_table=None):
    """Rank bacaan berdasarkan total frekuensi kata BCCWJ — Fix-5:
    kredit via atribusi struktural DP, bukan substring first-match.

    Per kata (lemma, reading, freq) yang memuat kanji:
      attr = attribute_example_reading(...)  → type on/kun + matched_reading
      - on  : kredit bacaan on yang clean-hira == matched_reading.
      - kun : bacaan se-stem (kun_stem == matched); kalau ada anggota yang
              okurigana-nya PERSIS okurigana kata (kana setelah kanji),
              kredit HANYA anggota itu (務め【つとめ】 → つと.め, bukan
              つと.める); kalau tidak ada, kredit semua anggota stem
              (bukti keluarga stem, mis. 靖国 untuk やす.んじる).
      - unknown → tanpa kredit (kata aneh/ateji bukan bukti).
    Rendaku loose: matched dikembalikan ke BASIS oleh DP (出口【でぐち】
    → basis くち) sehingga kredit tetap ke bacaan benar.
    """
    # Lazy import (lihat komentar modul): hindari sikulus import
    # build_examples ↔ rerank_readings.
    from build_examples import attribute_example_reading, kun_stem

    on_clean = {}
    kun_clean = {}
    for r in on_readings:
        c = clean_reading(r)
        if c:
            on_clean[c] = r
    for r in kun_readings:
        c = clean_reading(r)
        if c:
            kun_clean[c] = r

    # Fix-5 iterasi-2 — kredit diindeks BENTUK BERSIH (titik/strip dibuang):
    # varian titik KANJIDIC2 dari bacaan yang sama (終 お.わる / おわ.る)
    # adalah satu bacaan yang sama dan tidak boleh saling memecah kredit.
    # Pemetaan seed keluaran: clean → varian tertulis PERTAMA (urutan
    # kamus). okuri per varain tetap dipakai untuk uji kata-eksak.
    clean_first = {}
    for c, r in kun_clean.items():
        clean_first.setdefault(c, r)

    # stem → himpunan bentuk bersih yang berbagi stem itu (dedup)
    kun_by_stem = {}
    for c, r in kun_clean.items():
        stem = kun_stem(r)
        okuri = r.split(".", 1)[1] if "." in r else ""
        kun_by_stem.setdefault(stem, [])
        entry = (c, r, okuri)
        if entry not in kun_by_stem[stem]:
            kun_by_stem[stem].append(entry)

    on_freq = {}
    kun_freq = {}

    for lemma, word_reading, freq, pos in bccwj_words:
        if kanji not in lemma:
            continue
        # Fix-5 iterasi-2: nama diri tidak boleh mengkredit bacaan
        # (千歳【ちとせ】 nama kota tidak membuktikan 歳=とせ).
        if pos and "固有名詞" in pos:
            continue
        if cand_table is not None:
            attr = attribute_example_reading(
                kanji, lemma, word_reading,
                on_readings, kun_readings, cand_table)
            if attr["type"] == "unknown" or not attr["matched_reading"]:
                continue
            matched = attr["matched_reading"]
            if attr["type"] == "on":
                if matched in on_clean:
                    on_freq[matched] = on_freq.get(matched, 0) + freq
            else:
                # Kata dengan ekor kana MURNI setelah kanji (kata kerja
                # 入る/終わる: kanji di awal + okurigana; kata akhir-kanji
                # 麻の実; kata satu-kanji 蚕): reading kata = segmen +
                # okurigana persis → uji BENTUK BERSIH SELURUH reading
                # terhadap bacaan (入る はいる == clean(はい.る) — eksak;
                # 終わる おわる == clean(お.わる) == clean(おわ.る) —
                # eksak untuk keduanya karena memang bacaan yang sama).
                idx = lemma.find(kanji)
                tail = lemma[idx + 1:] if idx >= 0 else ""
                if all(not ("\u4e00" <= ch <= "\u9fff") for ch in tail):
                    whole_clean = katakana_to_hiragana(word_reading)
                    if whole_clean in kun_clean:
                        kun_freq[whole_clean] = \
                            kun_freq.get(whole_clean, 0) + freq
                        continue
                group = kun_by_stem.get(matched)
                if not group:
                    continue
                # okurigana kata setelah kanji
                rest = tail
                exact = [c for (c, r, okuri) in group if okuri == rest]
                if exact:
                    # kata membedakan anggota secara pasti (okurigana
                    # persis) → kredit penuh HANYA ke bentuk bersih itu.
                    for c in dict.fromkeys(exact):
                        kun_freq[c] = kun_freq.get(c, 0) + freq
                else:
                    # Kata tidak membedakan anggota grup-stem (入れた
                    # membuktikan い-sesuatu). Bagi rata antar BENTUK
                    # BERSIH berbeda: bukti eksak selalu dominan di atas
                    # bukti kabur, anggota tunggal tetap kredit penuh.
                    cleans = list(dict.fromkeys(c for (c, r, okuri) in group))
                    share = freq / len(cleans)
                    for c in cleans:
                        kun_freq[c] = kun_freq.get(c, 0) + share
        else:  # pragma: no cover — jalur fallback tanpa kanjidic2
            matched_on = None
            matched_kun = None
            for c in on_clean:
                if c and c in word_reading:
                    matched_on = c
                    break
            for c in kun_clean:
                if c and c in word_reading:
                    matched_kun = c
                    break
            if matched_on and matched_kun:
                if len(matched_kun) > len(matched_on):
                    matched_on = None
                elif len(matched_on) > len(matched_kun):
                    matched_kun = None
            if matched_on:
                on_freq[matched_on] = on_freq.get(matched_on, 0) + freq
            if matched_kun:
                kun_freq[matched_kun] = kun_freq.get(matched_kun, 0) + freq

    # Fix-5 iterasi-2 — guard "prior kamus + margin":
    # urutan KANJIDIC2 (bacaan pertama) adalah prior yang layak percaya;
    # korpus hanya boleh menggulingkannya bila buktinya MENANG TELAK
    # (kredit pemenang > kredit default + MARGIN).
    #   - 千歳飴 62 vs とし 18+100 → 歳 tetap とし (default)
    #   - 治る 16, 弘法 24, 言挙げ 4 → default bertahan
    #   - 摂取 ~3000, 入る 60133, 夜 よる 6000+ vs よ ~2000,
    #     二 ふた.つ 54k vs ふた 14k → korpus menang telak ✓
    # Tanpa kredit sama sekali → default (jangan jatuhkan slot:
    # 京 みやこ, 対 あいて) — perilaku sama dengan rerank kanonik.
    SEED_MARGIN = 100

    def _pick(freq_dict, default_reading, winner_map):
        """Pilih seed: default kamus, atau pemenang korpus bila menang
        telak (kredit > default + margin). winner_map: clean → bacaan
        tertulis (on_clean / clean_first)."""
        if default_reading is None:
            return None
        default_clean = clean_reading(default_reading)
        if freq_dict:
            winner_clean = max(freq_dict, key=freq_dict.get)
            if winner_clean != default_clean and \
                    freq_dict[winner_clean] > \
                    freq_dict.get(default_clean, 0) + SEED_MARGIN:
                return winner_map.get(winner_clean, default_reading)
        return default_reading

    best_on = _pick(on_freq,
                    on_readings[0] if on_readings else None, on_clean)
    best_kun = _pick(kun_freq,
                     kun_readings[0] if kun_readings else None, clean_first)

    best_on_romaji = kana_to_romaji(best_on) if best_on else None
    best_kun_romaji = kana_to_romaji(best_kun) if best_kun else None

    return best_on_romaji, best_kun_romaji, on_freq, kun_freq


# ============================================================
# Main
# ============================================================

def main():
    bccwj_path = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path(__file__).resolve().parent.parent / "raw" / "BCCWJ_frequencylist_luw2_ver1_0.tsv"
    # Default = workspace pipeline (output/), konsisten dengan langkah
    # lain — src/data/ adalah hasil promosi, bukan default input.
    data_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else \
        Path(__file__).resolve().parent.parent / "output"

    # Fix-5: arg ke-3 opsional — kanjidic2 untuk tabel kandidat DP
    kanjidic_path = Path(sys.argv[3]) if len(sys.argv) > 3 else \
        Path(__file__).resolve().parent.parent / "raw" / "kanjidic2.xml.gz"

    if not bccwj_path.exists():
        print(f"Error: BCCWJ file not found: {bccwj_path}", file=sys.stderr)
        sys.exit(1)
    if not data_dir.exists():
        print(f"Error: data directory not found: {data_dir}", file=sys.stderr)
        sys.exit(1)

    bccwj_words = load_bccwj(bccwj_path)
    kanji_word_index = build_kanji_word_index(bccwj_words)

    cand_table = None
    if kanjidic_path.exists():
        # Lazy import (lihat komentar modul): hindari sikulus import.
        from build_examples import (
            load_kanjidic2_readings, build_cand_table)
        kanjidic = load_kanjidic2_readings(str(kanjidic_path))
        cand_table = build_cand_table(kanjidic)
        del kanjidic
        print(f"  cand_table: {len(cand_table)} kanji (Fix-5 DP credit)")
    else:
        print(f"Warning: kanjidic2 tidak ditemukan ({kanjidic_path}) — "
              "kredit kembali ke substring lama", file=sys.stderr)

    files = sorted(data_dir.glob("n[1-5].json"))
    print(f"\nRe-ranking primary_romaji in {len(files)} files ...\n")
    total_all = 0
    changed_all = 0
    for f in files:
        with open(f, encoding="utf-8") as fh:
            kanji_list = json.load(fh)
        total_all += len(kanji_list)
        changed = 0
        for entry in kanji_list:
            kanji = entry["kanji"]
            on_readings = entry.get("readings", {}).get("on", []) or []
            kun_readings = entry.get("readings", {}).get("kun", []) or []

            old = entry.get("primary_romaji", [])
            bccwj_for_kanji = kanji_word_index.get(kanji, [])
            best_on, best_kun, on_freq, kun_freq = rank_readings(
                kanji, on_readings, kun_readings, bccwj_for_kanji,
                cand_table=cand_table
            )

            new_pr = []
            if best_on:
                new_pr.append(best_on)
            if best_kun and best_kun != best_on:
                new_pr.append(best_kun)

            if not new_pr:
                new_pr = old
            elif not best_on and not best_kun:
                new_pr = old

            if new_pr != old:
                entry["primary_romaji"] = new_pr
                changed += 1

        with open(f, "w", encoding="utf-8") as fh:
            json.dump(kanji_list, fh, ensure_ascii=False, indent=2)

        changed_all += changed
        print(f"  {f.name}: {changed}/{len(kanji_list)} entries re-ranked")

    print(f"\nDone. {changed_all}/{total_all} kanji had their primary_romaji updated")
    print("(Ranked by real BCCWJ frequency — Fix-5 DP attribution credit.)")


if __name__ == "__main__":
    main()
