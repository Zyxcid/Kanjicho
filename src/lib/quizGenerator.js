/**
 * quizGenerator.js — generate soal pilihan ganda dari data kanji.
 *
 * Dua jenis soal:
 *   - "reading" : tampilkan kanji, pilih bacaan yang benar. Tiap pilihan
 *                 adalah objek {kana, romaji} — UI menampilkan salah
 *                 satunya sesuai toggle kana/romaji (Quiz.jsx), dan toggle
 *                 bisa KAPAN PUN tanpa regenerate kuis karena keduanya
 *                 sudah tersimpan di soal.
 *   - "meaning" : tampilkan kanji, pilih arti Inggris yang benar (string).
 *
 * Jawaban benar ditandai `correctIndex` — penilaian membandingkan INDEKS
 * pilihan user, bukan labelnya, jadi skrip tampilan tidak memengaruhi skor.
 *
 * Distractor diambil dari kanji lain di LEVEL YANG SAMA (bukan cuma unit)
 * supaya soal tetap masuk akal tapi tidak mudah ditebak dari konteks unit.
 * Tombol "Tidak tahu" ditangani layer UI sebagai tombol terpisah di luar
 * pilihan ganda — modul ini hanya menghasilkan soal + pilihan yang valid.
 *
 * Modul murni: tidak menyentuh storage/state luar.
 */

const CHOICE_COUNT = 4; // 1 benar + 3 distractor

// ---- Util internal ----

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Pasangan {kana, romaji} semua bacaan PRIMARY satu kanji — sumber jawaban
 * benar & distractor soal bacaan.
 *
 * Sumber utama: `primary_readings` dari pipeline (sudah difilter agar
 * selalu ditopang contoh kata). Fallback data lama tanpa field ini:
 * pasangkan readings.on + .kun dengan romaji_readings per indeks HANYA
 * kalau jumlahnya pas (pipeline me-dedupe romaji_readings, jadi kalau
 * jumlahnya beda, pairing per indeks bisa salah — lebih aman pakai kana
 * untuk kedua skrip).
 */
function readingPairs(kanjiEntry) {
  const primary = kanjiEntry.primary_readings || [];
  if (primary.length > 0) {
    return primary.map((p) => ({ kana: p.kana, romaji: p.romaji }));
  }
  const on = kanjiEntry.readings?.on || [];
  const kun = kanjiEntry.readings?.kun || [];
  const allKana = [...on, ...kun];
  const romaji = kanjiEntry.romaji_readings || [];
  if (romaji.length === allKana.length) {
    return allKana.map((kana, i) => ({ kana, romaji: romaji[i] }));
  }
  return allKana.map((kana) => ({ kana, romaji: kana }));
}

/**
 * Satu jawaban "benar" representatif dari satu kanji sesuai questionType.
 * Kalau ada beberapa kandidat, pilih acak supaya variatif antar kuis.
 * Reading → {kana, romaji} (primary); meaning → string.
 */
function getAnswerForKanji(kanjiEntry, questionType) {
  if (questionType === "reading") {
    return pickRandom(readingPairs(kanjiEntry));
  }
  return pickRandom(kanjiEntry.meanings);
}

/**
 * Generate satu soal untuk satu kanji.
 *
 * @param {object} targetKanji - entry kanji yang ditanyakan (dari n5.json dkk)
 * @param {Array<object>} distractorPool - kanji lain (biasanya 1 level) untuk sumber distractor
 * @param {"reading"|"meaning"} questionType
 */
function generateQuestion(targetKanji, distractorPool, questionType) {
  const correctAnswer = getAnswerForKanji(targetKanji, questionType);
  const isReading = questionType === "reading";

  // Kandidat distractor: kanji lain yang bukan target.
  const candidates = distractorPool.filter((k) => k.kanji !== targetKanji.kanji);

  // ── Distractor exclusion (per SKRIP, untuk soal bacaan) ──
  // Distractor tidak boleh bacaan sah dari kanji yang ditanyakan — di KEDUA
  // skrip sekaligus. Kalau hanya label yang tampil yang dicek, user bisa
  // memilih bacaan sah lain dan dianggap salah (mis. 言: jawaban "iu",
  // distractor "gon" — "gon" bacaan sah 言). Karena pilihan menyimpan
  // kana+romaji, keduanya harus dikecualikan sekaligus supaya aturan ini
  // tetap berlaku setelah toggle skrip mid-sesi.
  const targetInvalid = new Set();
  const targetKana = new Set();
  if (isReading) {
    (targetKanji.romaji_readings || []).forEach((r) => targetInvalid.add("r:" + r));
    [...(targetKanji.readings?.on || []), ...(targetKanji.readings?.kun || [])]
      .forEach((r) => {
        targetInvalid.add("k:" + r);
        targetKana.add(r);
      });
  } else {
    (targetKanji.meanings || []).forEach((m) => targetInvalid.add("m:" + m));
  }
  // Juga exclude jawaban terpilih itu sendiri.
  targetInvalid.add(isReading ? "r:" + correctAnswer.romaji : "m:" + correctAnswer);
  if (isReading) targetInvalid.add("k:" + correctAnswer.kana);

  const distractorAnswers = [];
  const usedAnswers = new Set(targetInvalid);
  if (isReading) {
    usedAnswers.add("r:" + correctAnswer.romaji);
    usedAnswers.add("k:" + correctAnswer.kana);
  }

  // Ambil distractor satu-satu dari kandidat yang diacak, skip yang
  // duplikat (kana MAUPUN romaji — dua distractor tidak boleh tampil
  // kembar di salah satu skrip) atau bacaan/arti sah dari kanji target.
  for (const candidate of shuffle(candidates)) {
    if (distractorAnswers.length >= CHOICE_COUNT - 1) break;
    const candidateAnswer = getAnswerForKanji(candidate, questionType);
    if (isReading) {
      if (
        usedAnswers.has("r:" + candidateAnswer.romaji) ||
        usedAnswers.has("k:" + candidateAnswer.kana)
      ) {
        continue;
      }
      usedAnswers.add("r:" + candidateAnswer.romaji);
      usedAnswers.add("k:" + candidateAnswer.kana);
    } else {
      if (usedAnswers.has("m:" + candidateAnswer)) continue;
      usedAnswers.add("m:" + candidateAnswer);
    }
    distractorAnswers.push(candidateAnswer);
  }

  const choices = shuffle([correctAnswer, ...distractorAnswers]);
  const correctIndex = choices.indexOf(correctAnswer);

  return {
    kanji: targetKanji.kanji,
    questionType, // "reading" | "meaning"
    choices,
    correctIndex,
    correctAnswer,
    // Data untuk panel "reveal" setelah menjawab — bukan bagian logika
    // kuis, cuma numpang lewat supaya UI tidak perlu lookup ulang ke
    // data source.
    meanings: targetKanji.meanings,
    on: targetKanji.readings.on,
    kun: targetKanji.readings.kun,
    // Bacaan primary (yang di-bold di UI & sumber jawaban kuis), kana +
    // romaji — lihat scripts/build_examples.py.
    primaryReadings: targetKanji.primary_readings || [],
    examples: targetKanji.examples || [],
    // Identitas kanji (untuk update kanjiStats di storage.js dan
    // menyusun kuis weak review lintas level).
    level: targetKanji.jlpt_level,
    unit: targetKanji.unit,
  };
}

/**
 * Generate satu set soal untuk satu unit.
 *
 * @param {Array<object>} unitKanjiList - kanji dalam unit yang mau dikuiskan
 * @param {Array<object>} distractorPool - kanji satu level untuk sumber distractor
 * @param {object} options
 * @param {("reading"|"meaning"|"mixed")} [options.questionType="reading"] - default: cuma tanya bacaan, arti muncul di panel reveal
 * @param {boolean} [options.shuffleQuestionOrder=true]
 */
function generateQuiz(unitKanjiList, distractorPool, options = {}) {
  const { questionType = "reading", shuffleQuestionOrder = true } = options;

  if (distractorPool.length < CHOICE_COUNT) {
    throw new Error(
      `distractorPool terlalu kecil (${distractorPool.length} kanji). ` +
      `Minimal butuh ${CHOICE_COUNT} kanji dalam satu level untuk generate distractor.`
    );
  }

  const kanjiOrder = shuffleQuestionOrder ? shuffle(unitKanjiList) : unitKanjiList;

  return kanjiOrder.map((kanjiEntry) => {
    const type = questionType === "mixed" ? pickRandom(["reading", "meaning"]) : questionType;
    return generateQuestion(kanjiEntry, distractorPool, type);
  });
}

/**
 * Generate kuis "missed kanji review" dari kanji yang pernah dijawab salah
 * (dikumpulkan App.jsx dari storage.getWeakKanji).
 *
 * Beda generateQuiz: soalnya bisa berasal dari beberapa level sekaligus,
 * jadi distractor pool diberikan per-level (map level → daftar kanji)
 * supaya tiap soal tetap distractor dari level yang sama dengan kanjinya.
 *
 * @param {Array<object>} weakKanjiEntries - entry kanji lengkap (hasil loadLevelKanji)
 * @param {Object<string, Array<object>>} poolByLevel - distractor pool per level
 */
function generateWeakQuiz(weakKanjiEntries, poolByLevel) {
  if (!weakKanjiEntries.length) {
    throw new Error("weakKanjiEntries kosong — tidak ada kanji untuk dibuat kuis.");
  }
  return shuffle(weakKanjiEntries).map((entry) => {
    const pool = poolByLevel[entry.jlpt_level] || [];
    if (pool.length < CHOICE_COUNT) {
      throw new Error(
        `Distractor pool untuk ${entry.jlpt_level} terlalu kecil (${pool.length} kanji).`
      );
    }
    return generateQuestion(entry, pool, "reading");
  });
}

// ---- Scoring ----

// Jawaban user per soal: INDEKS pilihan (0..choices.length-1) atau simbol
// DONT_KNOW. Indeks (bukan label) supaya penilaian tidak terpengaruh
// toggle kana/romaji yang bisa berganti mid-sesi.
const DONT_KNOW = "__DONT_KNOW__";

/**
 * Hitung skor satu sesi kuis.
 *
 * @param {Array<object>} questions - hasil generateQuiz()
 * @param {Array<number|string>} userAnswers - sejajar dengan `questions`;
 *        tiap elemen: indeks pilihan yang dipilih, atau DONT_KNOW
 */
function scoreQuiz(questions, userAnswers) {
  if (questions.length !== userAnswers.length) {
    throw new Error("Jumlah userAnswers harus sama dengan jumlah questions");
  }

  const details = questions.map((q, i) => {
    const userAnswer = userAnswers[i];
    const isDontKnow = userAnswer === DONT_KNOW;
    const isCorrect = !isDontKnow && userAnswer === q.correctIndex;
    return {
      kanji: q.kanji,
      questionType: q.questionType,
      level: q.level, // untuk update kanjiStats per-kanji (weak review)
      correctAnswer: q.correctAnswer,
      userAnswer,
      isCorrect,
      isDontKnow,
    };
  });

  const correctCount = details.filter((d) => d.isCorrect).length;
  const dontKnowCount = details.filter((d) => d.isDontKnow).length;
  const score = correctCount / questions.length; // 0..1 — input langsung reviewUnit() di srs.js

  return {
    score,
    correctCount,
    dontKnowCount,
    wrongCount: questions.length - correctCount - dontKnowCount,
    total: questions.length,
    details,
  };
}

export {
  generateQuiz,
  generateQuestion,
  generateWeakQuiz,
  scoreQuiz,
  DONT_KNOW,
  CHOICE_COUNT,
};
