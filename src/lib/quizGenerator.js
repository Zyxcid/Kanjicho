/**
 * quiz-generator.js — Generate soal pilihan ganda dari data kanji.
 *
 * Kuis cuma tanya SATU jenis soal: kanji ditampilkan, user pilih bacaan
 * romaji yang benar (dari `primary_romaji`). Arti + on'yomi/kun'yomi +
 * contoh kata muncul di panel reveal SETELAH dijawab (lihat Quiz.jsx),
 * bukan jadi pertanyaan terpisah.
 *
 * Distractor (pilihan salah) diambil dari kanji lain di LEVEL YANG SAMA
 * (bukan cuma unit yang sama), supaya soal tetap related/masuk akal tapi
 * tidak terlalu mudah ditebak dari konteks unit.
 *
 * "Tidak tahu" SENGAJA tidak dimasukkan ke dalam array choices di sini —
 * itu ditangani di layer UI sebagai tombol terpisah di luar pilihan ganda
 * (sesuai rancangan awal). Modul ini hanya menghasilkan soal +
 * pilihan-pilihan yang valid; UI yang menambahkan tombol "Tidak tahu".
 *
 * Modul ini murni (pure function): tidak ada random seed tersembunyi
 * yang tidak bisa dikontrol dari luar (Math.random dipakai langsung,
 * tapi seluruh fungsi tidak menyentuh storage/state luar).
 */

const CHOICE_COUNT = 4; // termasuk 1 jawaban benar + 3 distractor

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

function sampleWithoutReplacement(array, count) {
  return shuffle(array).slice(0, count);
}

/**
 * Ambil bacaan "benar" representatif dari satu kanji (dari `primary_romaji`,
 * fallback ke `romaji_readings` untuk data lama sebelum field itu ada).
 * Kalau kanji punya beberapa bacaan primer, pilih satu secara random supaya
 * variatif setiap kali quiz dibuat (kadang nanya on'yomi, kadang kun'yomi).
 */
function getAnswerForKanji(kanjiEntry) {
  const pool = kanjiEntry.primary_romaji?.length ? kanjiEntry.primary_romaji : kanjiEntry.romaji_readings;
  return pickRandom(pool);
}

/**
 * Generate satu soal untuk satu kanji.
 *
 * @param {object} targetKanji - entry kanji yang ditanyakan (dari file n5.json dkk)
 * @param {Array<object>} distractorPool - kanji lain (biasanya 1 level penuh) untuk sumber distractor
 */
function generateQuestion(targetKanji, distractorPool) {
  const correctAnswer = getAnswerForKanji(targetKanji);

  // Kandidat distractor: kanji lain yang BUKAN targetKanji.
  const candidates = distractorPool.filter((k) => k.kanji !== targetKanji.kanji);

  // ── Distractor exclusion ──
  // Distractor tidak boleh berupa bacaan APAPUN yang sah dari kanji yang
  // DITANYAKAN, bukan cuma correctAnswer yang kepilih. Kalau tidak begitu,
  // user bisa pilih bacaan alternatif yang sah dari kanji itu sendiri dan
  // malah disalahkan sistem — misal untuk 言 (bacaan: gen/gon/iu/koto),
  // kalau jawaban benarnya "iu" tapi "gon" muncul sebagai distractor
  // (diambil dari on'yomi kanji lain), user yang pilih "gon" akan
  // disalahkan padahal itu bacaan sah 言 juga. Exclude seluruh
  // romaji_readings target kanji menutup celah ini.
  const targetInvalid = new Set(targetKanji.romaji_readings || []);
  targetInvalid.add(correctAnswer);

  const distractorAnswers = [];
  const usedAnswers = new Set(targetInvalid);

  // Ambil distractor satu-satu dari kandidat yang sudah diacak, skip
  // kalau jawabannya duplikat dengan yang sudah dipakai ATAU termasuk
  // bacaan sah dari kanji yang ditanyakan.
  for (const candidate of shuffle(candidates)) {
    if (distractorAnswers.length >= CHOICE_COUNT - 1) break;
    const candidateAnswer = getAnswerForKanji(candidate);
    if (!usedAnswers.has(candidateAnswer)) {
      distractorAnswers.push(candidateAnswer);
      usedAnswers.add(candidateAnswer);
    }
  }

  const choices = shuffle([correctAnswer, ...distractorAnswers]);

  return {
    kanji: targetKanji.kanji,
    choices,
    correctAnswer,
    // Data untuk panel "reveal" setelah user menjawab (lihat App.jsx/Quiz.jsx).
    // Bukan bagian dari logic kuis itu sendiri, cuma numpang lewat supaya UI
    // tidak perlu lookup ulang ke data source di tempat lain.
    meanings: targetKanji.meanings,
    on: targetKanji.readings.on,
    kun: targetKanji.readings.kun,
    examples: targetKanji.examples || [],
  };
}

/**
 * Generate satu set soal kuis untuk satu unit.
 *
 * @param {Array<object>} unitKanjiList - daftar kanji dalam unit yang mau dikuiskan
 * @param {Array<object>} distractorPool - kanji satu level (biasanya seluruh level, termasuk unit ini) untuk sumber distractor
 * @param {object} options
 * @param {boolean} [options.shuffleQuestionOrder=true]
 */
function generateQuiz(unitKanjiList, distractorPool, options = {}) {
  const { shuffleQuestionOrder = true } = options;

  if (distractorPool.length < CHOICE_COUNT) {
    throw new Error(
      `distractorPool terlalu kecil (${distractorPool.length} kanji). ` +
      `Minimal butuh ${CHOICE_COUNT} kanji dalam satu level untuk generate distractor.`
    );
  }

  const kanjiOrder = shuffleQuestionOrder ? shuffle(unitKanjiList) : unitKanjiList;

  return kanjiOrder.map((kanjiEntry) => generateQuestion(kanjiEntry, distractorPool));
}

// ---- Scoring ----

// Jawaban user untuk satu soal: string (jawaban yang dipilih) atau
// simbol khusus DONT_KNOW.
const DONT_KNOW = "__DONT_KNOW__";

/**
 * Hitung skor dari satu sesi kuis.
 *
 * @param {Array<object>} questions - hasil dari generateQuiz()
 * @param {Array<string>} userAnswers - array jawaban user, urutan sejajar dengan `questions`.
 *        Isi tiap elemen: jawaban yang dipilih (harus persis salah satu dari choices),
 *        atau DONT_KNOW kalau user pilih "Tidak tahu".
 */
function scoreQuiz(questions, userAnswers) {
  if (questions.length !== userAnswers.length) {
    throw new Error("Jumlah userAnswers harus sama dengan jumlah questions");
  }

  const details = questions.map((q, i) => {
    const userAnswer = userAnswers[i];
    const isDontKnow = userAnswer === DONT_KNOW;
    const isCorrect = !isDontKnow && userAnswer === q.correctAnswer;
    return {
      kanji: q.kanji,
      correctAnswer: q.correctAnswer,
      userAnswer,
      isCorrect,
      isDontKnow,
    };
  });

  const correctCount = details.filter((d) => d.isCorrect).length;
  const dontKnowCount = details.filter((d) => d.isDontKnow).length;
  const score = correctCount / questions.length; // 0..1, dipakai langsung sebagai input reviewUnit() di srs.js

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
  scoreQuiz,
  DONT_KNOW,
  CHOICE_COUNT,
};
