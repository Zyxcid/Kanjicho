/**
 * kana.js — konverter kana → romaji (Hepburn) versi JS.
 *
 * Port SETIA dari kana_to_romaji() di scripts/convert_kanji.py (pipeline):
 * tabel, urutan aturan, dan hasilnya sama persis — terverifikasi 0
 * mismatch terhadap semua primary_readings data final (test_logic.mjs).
 *
 * Kenapa konverter runtime, bukan field romaji tambahan di data?
 *  - Bacaan On/Kun lengkap + reading contoh kata cuma tersimpan kana;
 *   menambah romaji membesarkan bundle untuk sesuatu yang deterministik.
 *  - Skrip tampilan (toggle あ/Aa) urusan presentasi — data kuis tidak
 *   boleh berubah cuma karena user ganti skrip.
 */

const KATA_TO_HIRA_SMALL = {
  ァ: "ぁ", ィ: "ぃ", ゥ: "ぅ", ェ: "ぇ", ォ: "ぉ",
  ャ: "ゃ", ュ: "ゅ", ョ: "ょ", ッ: "っ",
};

const KANA_TO_ROMAJI = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", を: "wo", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゃ: "ya", ゅ: "yu", ょ: "yo", っ: "",
};

const PALATAL = {
  ki: { ya: "kya", yu: "kyu", yo: "kyo" },
  gi: { ya: "gya", yu: "gyu", yo: "gyo" },
  shi: { ya: "sha", yu: "shu", yo: "sho" },
  ji: { ya: "ja", yu: "ju", yo: "jo" },
  chi: { ya: "cha", yu: "chu", yo: "cho" },
  ni: { ya: "nya", yu: "nyu", yo: "nyo" },
  hi: { ya: "hya", yu: "hyu", yo: "hyo" },
  bi: { ya: "bya", yu: "byu", yo: "byo" },
  pi: { ya: "pya", yu: "pyu", yo: "pyo" },
  mi: { ya: "mya", yu: "myu", yo: "myo" },
  ri: { ya: "rya", yu: "ryu", yo: "ryo" },
};

const LONG_VOWEL = {
  a: "a", i: "i", u: "u", e: "e", o: "o",
  sha: "a", shu: "u", sho: "o",
  cha: "a", chu: "u", cho: "o",
  ja: "a", ju: "u", jo: "o",
};

function katakanaToHiragana(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCodePoint(code - 0x60);
    } else if (KATA_TO_HIRA_SMALL[ch] !== undefined) {
      out += KATA_TO_HIRA_SMALL[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Kana (hiragana/katakana, dengan っ ー ゃゅょ dan prefiks "-"/".")
 * → romaji Hepburn. Karakter tak dikenal dilewati (sama seperti versi
 * Python). Deterministik & murni — aman dipanggil saat render.
 */
export function kanaToRomaji(kanaStr) {
  if (!kanaStr) return "";
  const chars = [...katakanaToHiragana(String(kanaStr))].filter(
    (ch) => ch !== "." && ch !== "-"
  );
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    const nxt = i + 1 < chars.length ? chars[i + 1] : "";
    if (ch === "っ") {
      const nextRomaji = KANA_TO_ROMAJI[nxt] || "";
      if (nextRomaji) {
        out += nextRomaji[0];
        i += 1;
        continue;
      }
      out += "tsu";
      i += 1;
      continue;
    }
    if (ch === "ー") {
      // Perpanjang vokal suku kata terakhir (アー → aa, シー → shii,
      // リョー → ryoo): cari vokal terakhir di output yang sudah terbentuk.
      let m = null;
      for (let k = out.length - 1; k >= 0; k--) {
        if ("aeiou".includes(out[k])) {
          m = out[k];
          break;
        }
      }
      if (m) out += LONG_VOWEL[m] || m;
      i += 1;
      continue;
    }
    const base = KANA_TO_ROMAJI[ch];
    if (nxt === "ゃ" || nxt === "ゅ" || nxt === "ょ") {
      const ySmall = KANA_TO_ROMAJI[nxt] || "";
      if (base !== undefined && PALATAL[base] && PALATAL[base][ySmall] !== undefined) {
        out += PALATAL[base][ySmall];
        i += 2;
        continue;
      }
    }
    if (base !== undefined) out += base;
    i += 1;
  }
  return out;
}
