/**
 * Test logika murni: srs.js (FSRS-6: adapter rating binomial, kurva lupa
 * terlatih, update S/D, aturan same-day, migrasi state) + quizGenerator.js
 * (primary readings, weak quiz).
 * Jalankan: node scripts/test_logic.mjs
 */
import {
  createInitialUnitState,
  reviewUnit,
  wasReviewedEarly,
  ratingFromScore,
  gradeQuizScore,
  migrateUnitState,
  intervalForTargetRetention,
  forgettingCurve,
  shortTermStability,
  nextDifficulty,
  RATING,
} from "../src/lib/srs.js";
import { generateQuiz, generateWeakQuiz, scoreQuiz, DONT_KNOW } from "../src/lib/quizGenerator.js";
import { kanaToRomaji } from "../src/lib/kana.js";
import { computeStudyStats, formatHHMM, toDateStr } from "../src/lib/studyStats.js";
import { intervalUntilLabel, formatDueExact } from "../src/lib/dueFormat.js";
import n5 from "../src/data/n5.json" with { type: "json" };
import n5ex from "../src/data/n5_examples.json" with { type: "json" };
import n1 from "../src/data/n1.json" with { type: "json" };
import n1ex from "../src/data/n1_examples.json" with { type: "json" };
import n2 from "../src/data/n2.json" with { type: "json" };
import n2ex from "../src/data/n2_examples.json" with { type: "json" };
import n3 from "../src/data/n3.json" with { type: "json" };
import n3ex from "../src/data/n3_examples.json" with { type: "json" };
import n4 from "../src/data/n4.json" with { type: "json" };
import n4ex from "../src/data/n4_examples.json" with { type: "json" };

const MS_DAY = 1000 * 60 * 60 * 24;
let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    failures++;
    console.error(`  FAIL ${msg}`);
  }
}

console.log("SRS FSRS-6: adapter rating (binomial) & kurva lupa");
{
  // Adapter absolut (kuis pertama / tanpa ekspektasi), n = 15 soal.
  assert(ratingFromScore(1.0) === RATING.EASY, "score 1.0 → Easy");
  assert(ratingFromScore(14 / 15) === RATING.GOOD, "score 14/15 → Good");
  assert(ratingFromScore(12 / 15) === RATING.HARD, "score 12/15 → Hard");
  assert(ratingFromScore(9 / 15) === RATING.AGAIN, "score 9/15 (60%) → Again (batas absolut)");

  // Adapter binomial: skor SAMA → rating BERBEDA tergantung ekspektasi R.
  // Review tepat waktu (R=0.9 → μ=13.5, σ≈1.16):
  assert(gradeQuizScore(11 / 15, 0.9) === RATING.AGAIN, "11/15 saat ekspektasi 13.5 → Again (z≈−2.15)");
  assert(gradeQuizScore(12 / 15, 0.9) === RATING.HARD, "12/15 saat ekspektasi 13.5 → Hard");
  assert(gradeQuizScore(14 / 15, 0.9) === RATING.GOOD, "14/15 saat ekspektasi 13.5 → Good");
  // Review terlambat (R=0.6 → μ=9): 14/15 = bukti kuat → Easy.
  assert(gradeQuizScore(14 / 15, 0.6) === RATING.EASY, "14/15 saat ekspektasi 9 → Easy (z≈+2.6)");
  assert(gradeQuizScore(10 / 15, 0.6) === RATING.GOOD, "10/15 saat ekspektasi 9 → Good");
  // Floor absolut 60% DIHAPUS: 9/15 saat ekspektasi 9 = pas prediksi → Good,
  // bukan lapse paksaan persentase mentah.
  assert(gradeQuizScore(9 / 15, 0.6) === RATING.GOOD, "9/15 saat ekspektasi 9 → Good (z≈0)");
  // Kasus audit: unit S≈100 hari lama tak direview (R≈0.3) → 9/15 adalah
  // kejutan POSITIF — dinilai sesuai ekspektasi, bukan persentase mentah.
  assert(gradeQuizScore(9 / 15, 0.3) === RATING.GOOD, "9/15 saat ekspektasi 4.5 → Good (z≈+2.5)");
  // Jaring pengaman katastrofik (bookend ≤30%): selalu Again berapa pun
  // ekspektasinya — nyaris tak tersentuh saat operasi normal.
  assert(gradeQuizScore(4 / 15, 0.3) === RATING.AGAIN, "4/15 (≤30%) → Again (jaring pengaman)");
  assert(gradeQuizScore(4 / 15, 0.55) === RATING.AGAIN, "4/15 saat R=0.55 → Again (z≈−2.4 juga negatif)");
  // Mode "continuous" (kondisi D eksperimen): grade kontinu g = 3 + z/3
  // dibulatkan ke rating FSRS — pita z lebih lunak di sisi bawah.
  assert(gradeQuizScore(11 / 15, 0.9, 15, "continuous") === RATING.HARD, "continuous: 11/15@0.9 → Hard (g≈2.3)");
  assert(gradeQuizScore(14 / 15, 0.6, 15, "continuous") === RATING.EASY, "continuous: 14/15@0.6 → Easy (g≈3.9)");
  assert(gradeQuizScore(10 / 15, 0.6, 15, "continuous") === RATING.GOOD, "continuous: 10/15@0.6 → Good (g≈3.2)");
  assert(gradeQuizScore(9 / 15, 0.9, 15, "continuous") === RATING.HARD, "continuous: 9/15@0.9 → Hard (g≈1.7, lunak vs Again binomial)");
  // Review dini (R≈1): σ di-floor 0.5 supaya z tidak meledak.
  assert(gradeQuizScore(13 / 15, 0.99) === RATING.HARD, "13/15 saat ekspektasi ~15 → Hard");
  assert(gradeQuizScore(12 / 15, 0.99) === RATING.AGAIN, "12/15 saat ekspektasi ~15 → Again");

  // Kurva lupa FSRS-6 (decay terlatih w20=0.1542): identitas tetap terjaga.
  assert(Math.abs(forgettingCurve(10, 10) - 0.9) < 1e-9, "R(t=S, S) = 0.9");
  assert(Math.abs(forgettingCurve(0, 5) - 1) < 1e-9, "R(0) = 1");
  assert(forgettingCurve(5, 10) < forgettingCurve(2, 10), "R menurun seiring waktu");
  // Kurva FSRS-6 lebih landai daripada FSRS-4.5: retensi overdue turun perlahan.
  assert(forgettingCurve(40, 10) > 0.5, "R(4·S) masih > 0.5 (kurva landai khas FSRS-6)");
  assert(
    Math.abs(intervalForTargetRetention(8.2956, 0.9) - 8.2956) < 1e-6,
    "interval di target 0.9 = S"
  );
  assert(
    intervalForTargetRetention(10, 0.85) > 10,
    "target retensi lebih rendah → interval lebih panjang"
  );
}

console.log("SRS FSRS-6: kuis pertama, update S/D, aturan same-day");
{
  const s0 = createInitialUnitState();

  // Kuis pertama skor 15/15 → Easy: S0(4)=w3=8.2956. Engine resmi ts-fsrs
  // menjadwalkan interval HARI BULAT: round(S0) = 8 hari (bukan 8.2956 hari
  // pecahan seperti engine manual lama — lihat differential test bagian E).
  const s = reviewUnit(s0, 1.0, new Date(2026, 0, 1, 9, 0));
  assert(Math.abs(s.stability - 8.2956) < 1e-6, "S0(Easy) = w3 = 8.2956");
  assert(
    new Date(s.nextReviewAt) - new Date(2026, 0, 1, 9, 0) === 8 * MS_DAY,
    "nextReviewAt = review + round(S) hari (8 hari, engine ts-fsrs)"
  );
  assert(Math.abs(s.difficulty - 1) < 1e-6, "D0(Easy) di-clamp ke 1 (formula eksponensial)");
  assert(s.lapses === 0, "lapse tidak dihitung pada kuis pertama");
  assert(s.lastRating === RATING.EASY, "rating hasil adapter tercatat (lastRating)");
  assert(s.algorithm === "fsrs6", "state ditandai fsrs6");

  // Monotoni rating awal (jangkar absolut).
  const sHard = reviewUnit(s0, 0.75, new Date(2026, 0, 1, 9, 0)); // 11/15 → Hard
  const sGood = reviewUnit(s0, 0.8667, new Date(2026, 0, 1, 9, 0)); // 13/15 → Good
  const sAgain = reviewUnit(s0, 0.2, new Date(2026, 0, 1, 9, 0)); // 3/15 → Again
  assert(sAgain.stability < sHard.stability, "S0(Again) < S0(Hard)");
  assert(sHard.stability < sGood.stability, "S0(Hard) < S0(Good)");
  assert(sGood.stability < s.stability, "S0(Good) < S0(Easy)");
  assert(Math.abs(sGood.stability - 2.3065) < 1e-6, "S0(Good) = w2 = 2.3065");
  assert(sAgain.difficulty > sGood.difficulty, "rating rendah → D lebih besar");

  // Review tepat waktu (R≈0.9) dengan skor sesuai ekspektasi → S tumbuh besar.
  const onTime = reviewUnit(s, 14 / 15, new Date(2026, 0, 9, 9, 0));
  assert(onTime.stability > s.stability * 2, "review tepat waktu memanjangkan S > 2x");

  // Review dini lintas hari (siang, supaya tanggal UTC = tanggal lokal):
  // bukti lemah (R masih tinggi) → pertumbuhan kecil.
  const earlyNextDay = reviewUnit(s, 14 / 15, new Date(2026, 0, 2, 12, 0));
  assert(earlyNextDay.stability < onTime.stability, "review dini menumbuhkan S lebih sedikit");

  // ULANG SEKETIKA (hari yang sama) → aturan short-term FSRS-6, bukan rumus
  // recall: Hard/Good tidak mengubah S (SInc di-clamp ≥ 1), Easy tumbuh
  // terbatas, Again boleh memangkas — pengganti heuristik anti-grind lama.
  const instantHard = reviewUnit(s, 14 / 15, new Date(2026, 0, 1, 9, 30));
  assert(
    Math.abs(instantHard.stability - s.stability) < 1e-9,
    "same-day Hard: S tidak berubah (SInc ≥ 1)"
  );
  const instantEasy = reviewUnit(s, 1.0, new Date(2026, 0, 1, 9, 30));
  assert(instantEasy.stability > s.stability, "same-day Easy: S tumbuh");
  assert(instantEasy.stability < s.stability * 2, "same-day Easy: pertumbuhan < 2x");

  // Konvergensi same-day: SInc menyusut saat S membesar (suku S^-w19).
  assert(
    shortTermStability(1, RATING.EASY) / 1 > shortTermStability(10, RATING.EASY) / 10 &&
      shortTermStability(10, RATING.EASY) / 10 > shortTermStability(100, RATING.EASY) / 100,
    "SInc same-day menurun saat S naik (konvergen)"
  );

  // Jalur unit lemah: engine ts-fsrs (learning_steps kosong — kuis unit 15
  // soal ≠ flip kartu Anki) menjadwalkan kuis ulang HARI BULAT berikutnya:
  // Again → interval max(1, round(0.212)) = 1 hari, lalu redeem Easy →
  // S tetap kecil. (Engine lama: due ~5 jam di hari yang sama.)
  let weak = reviewUnit(s0, 0.4, new Date(2026, 0, 1, 9, 0)); // 6/15 → Again
  assert(Math.abs(weak.stability - 0.212) < 1e-9, "S0(Again) = w0 = 0.212");
  assert(
    new Date(weak.nextReviewAt) - new Date(2026, 0, 1, 9, 0) === 1 * MS_DAY,
    "kuis pertama Again → due besok (interval min 1 hari)"
  );
  assert(weak.lapses === 0, "Again pada kuis PERTAMA tidak dihitung lapse (unit belum aktif)");
  weak = reviewUnit(weak, 1.0, new Date(weak.nextReviewAt)); // due besok
  assert(weak.stability < 5, "unit lemah pasca-Again: S tetap < 5 hari");

  // Deteksi wasReviewedEarly & skor invalid.
  assert(wasReviewedEarly(s, new Date(2026, 0, 1, 9, 5)) === true, "wasReviewedEarly true untuk ulang seketika");
  assert(wasReviewedEarly(s, new Date(2026, 0, 20)) === false, "wasReviewedEarly false saat sesuai jadwal");
  let threw = false;
  try {
    reviewUnit(s0, 1.5, new Date());
  } catch {
    threw = true;
  }
  assert(threw, "score di luar 0..1 melempar error");
}

console.log("SRS FSRS-6: lapse unit matang & dinamika difficulty");
{
  // Unit matang: kuis pertama Good, lalu 4x review tepat waktu.
  let mature = reviewUnit(createInitialUnitState(), 14 / 15, new Date(2026, 0, 1, 9, 0));
  for (let i = 0; i < 4; i++) {
    mature = reviewUnit(mature, 14 / 15, new Date(mature.nextReviewAt));
  }
  assert(mature.stability > 10, "unit matang: S tumbuh melewati 10 hari");

  // Lapse (≤60%) tepat waktu → S dipangkas + cap post-lapse FSRS-6.
  const lapsed = reviewUnit(mature, 0.2, new Date(mature.nextReviewAt));
  assert(lapsed.stability < mature.stability * 0.952, "lapse memangkas S (cap S/e^(w17·w18))");
  assert(lapsed.lapses === mature.lapses + 1, "lapse tercatat");
  assert(lapsed.difficulty > mature.difficulty, "lapse menaikkan difficulty");

  // Loop relearning engine resmi: unit AKTIF yang lapse masuk Relearning
  // (fsrsState 3) dan due lagi ±6 jam — remedial hari-yang-sama dengan
  // ritme kuis unit (keputusan Kanjichō, default "10m" untuk flip kartu).
  const lapseAt = new Date(mature.nextReviewAt);
  assert(lapsed.fsrsState === 3, "lapse → state Relearning (fsrsState=3)");
  const relearnGapHours = (new Date(lapsed.nextReviewAt) - lapseAt) / MS_DAY * 24;
  assert(
    Math.abs(relearnGapHours - 6) < 0.02,
    "lapse → due ~6 jam (langkah relearning)"
  );
  // Lulus kuis relearn → graduate ke jadwal hari normal. Catatan dinamika:
  // pada R≈1 adapter menuntut bukti kuat — keluar dari loop butuh skor
  // sempurna (15/15 → Easy); 14/15 dinilai Hard (tetap di loop, +9 jam).
  const passed = reviewUnit(lapsed, 1.0, new Date(lapsed.nextReviewAt));
  assert(passed.fsrsState === 2, "lulus relearning → kembali Review (fsrsState=2)");
  assert(
    new Date(passed.nextReviewAt) > new Date(passed.lastReviewedAt),
    "setelah graduate → jadwal hari (interval ≥ 1)"
  );
  // Gagal lagi di loop → tetap Relearning (loop berlanjut sampai lulus).
  const looped = reviewUnit(lapsed, 0.2, new Date(lapsed.nextReviewAt));
  assert(looped.fsrsState === 3, "gagal di relearning → tetap Relearning");
  assert(
    (new Date(looped.nextReviewAt) - new Date(looped.lastReviewedAt)) / MS_DAY * 24 < 12,
    "relearning ulang tetap sub-hari (Hard ~9 jam / Again 6 jam)"
  );

  // Difficulty: linear damping (ΔD menyusut saat D besar) + arah rating.
  const dHigh = nextDifficulty(9, RATING.AGAIN);
  const dLow = nextDifficulty(2, RATING.AGAIN);
  assert(dHigh - 9 < dLow - 2, "ΔD lebih kecil saat D tinggi (linear damping)");
  assert(nextDifficulty(5, RATING.EASY) < 5, "Easy menurunkan D");
  assert(nextDifficulty(5, RATING.AGAIN) > 5, "Again menaikkan D");

  // MAX_INTERVAL = kebijakan SCHEDULER, S = kondisi memori — tidak dicampur:
  // S boleh melewati 365, interval jadwal di-cap tepat di 365.
  const strong = {
    stability: 600,
    difficulty: 5,
    lastReviewedAt: new Date(2026, 0, 1, 9, 0).toISOString(),
    nextReviewAt: new Date(2026, 0, 10, 9, 0).toISOString(),
    reviewCount: 30,
    lapses: 0,
    lastScore: 0.93,
    lastRating: 3,
    algorithm: "fsrs6",
  };
  const boosted = reviewUnit(strong, 14 / 15, new Date(2026, 0, 10, 9, 0));
  assert(boosted.stability > 365, "S boleh melewati 365 (kondisi memori tak dibatasi)");
  const gapDays = (new Date(boosted.nextReviewAt) - new Date(2026, 0, 10, 9, 0)) / MS_DAY;
  assert(Math.abs(gapDays - 365) < 1e-6, "interval jadwal di-cap tepat 365 hari (MAX_INTERVAL)");
}

console.log("SRS FSRS-6: distribusi rating adapter saat scheduler terkalibrasi");
{
  // Scheduler sehat (target R=0.9) → skor ~ Binomial(15, 0.9), mean 13.5.
  const pmf = (k, n, p) => {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
    return c * Math.pow(p, k) * Math.pow(1 - p, n - k);
  };
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let k = 0; k <= 15; k++) dist[gradeQuizScore(k / 15, 0.9)] += pmf(k, 15, 0.9);
  assert(dist[3] > 0.5, `Good dominan saat terkalibrasi (${(dist[3] * 100).toFixed(1)}%)`);
  assert(dist[4] > 0.15 && dist[4] < 0.3, `Easy ≈ P(15/15) (${(dist[4] * 100).toFixed(1)}%)`);
  assert(dist[1] > 0.02 && dist[1] < 0.1, `Again sehat ~5% (${(dist[1] * 100).toFixed(1)}%)`);
  assert(dist[2] > 0.05 && dist[2] < 0.25, `Hard wajar (${(dist[2] * 100).toFixed(1)}%)`);

  // Baseline "naive" (ambang persentase mentah) di kondisi sama: ~55% Easy
  // dan bin Again (<50%) nyaris tak pernah menyala — miskalibrasi yang
  // memotivasi adapter relatif (baseline pembanding untuk eksperimen
  // skripsi: ablation adapter naive vs absolute vs binomial).
  const naive = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let k = 0; k <= 15; k++) {
    const sc = k / 15;
    naive[sc < 0.5 ? 1 : sc < 0.7 ? 2 : sc < 0.9 ? 3 : 4] += pmf(k, 15, 0.9);
  }
  assert(naive[4] > 0.5, `naive: mayoritas review dinilai Easy (${(naive[4] * 100).toFixed(1)}%)`);
  assert(naive[1] < 0.001, `naive: Again (<50%) praktis tak pernah menyala (${(naive[1] * 100).toFixed(3)}%)`);
}

console.log("SRS FSRS-6: migrasi state (model lama & fsrs45)");
{
  // State model lama: tanpa field difficulty/algorithm/lapses.
  const legacy = {
    stability: 12,
    lastReviewedAt: new Date(2026, 0, 1).toISOString(),
    nextReviewAt: new Date(2026, 0, 13).toISOString(),
    reviewCount: 4,
    lastScore: 0.8,
  };
  const m = migrateUnitState(legacy);
  assert(m.algorithm === "fsrs6", "state lama ditandai fsrs6");
  assert(m.stability === 12, "stability dipertahankan (jadwal tidak melompat)");
  assert(m.nextReviewAt === legacy.nextReviewAt, "nextReviewAt tidak diubah");
  assert(m.difficulty >= 1 && m.difficulty <= 10, "difficulty di-infer dalam [1,10]");
  assert(m.lapses === 0, "lapses default 0");
  assert(migrateUnitState(m) === m, "state fsrs6 tidak dimigrasi ulang");
  assert(migrateUnitState(null) !== null, "null state → initial state");

  // State fsrs6 yang sudah valid + state baru: tidak tersentuh.
  const fresh = createInitialUnitState();
  assert(migrateUnitState(fresh) === fresh, "initial state tidak diubah");

  // fsrs45 → fsrs6: definisi S (hari pada R=90%) & D (skala 1-10) sama →
  // S, D, lapses, dan jadwal yang sedang berjalan dipertahankan; hanya
  // kurva lupa & rumus update yang berubah (interval target 0.9 tetap = S).
  const f45 = {
    stability: 7,
    difficulty: 4.5,
    lastReviewedAt: new Date(2026, 0, 1).toISOString(),
    nextReviewAt: new Date(2026, 0, 8).toISOString(),
    reviewCount: 9,
    lapses: 2,
    lastScore: 0.9,
    algorithm: "fsrs45",
  };
  const m2 = migrateUnitState(f45);
  assert(
    m2.algorithm === "fsrs6" && m2.stability === 7 && Math.abs(m2.difficulty - 4.5) < 1e-9 && m2.lapses === 2,
    "fsrs45 → fsrs6: S, D, lapses dipertahankan"
  );
  assert(m2.nextReviewAt === f45.nextReviewAt, "fsrs45 → fsrs6: jadwal dipertahankan");
}

console.log("\nQuiz generator + filtered primary readings");
{
  const pool = n5.map((k) => ({ ...k, examples: n5ex[k.kanji] || [] }));
  const unitKanji = pool.filter((k) => k.unit === "N5-U1");

  const quiz = generateQuiz(unitKanji, pool);
  assert(quiz.length === unitKanji.length, "one question per kanji in unit");

  for (const q of quiz) {
    // Jawaban bacaan = objek {kana, romaji} dari bacaan primary
    assert(
      typeof q.correctIndex === "number" && q.choices[q.correctIndex] === q.correctAnswer,
      `correctIndex points at correctAnswer (${q.kanji})`
    );
    assert(
      q.primaryReadings.some(
        (p) => p.romaji === q.correctAnswer.romaji && p.kana === q.correctAnswer.kana
      ),
      `answer "${q.correctAnswer.kana}/${q.correctAnswer.romaji}" for ${q.kanji} is a primary reading`
    );
    // Setiap distractor tidak boleh bacaan sah dari kanji target — di KEDUA
    // skrip (kana & romaji), supaya aturan ini tetap berlaku setelah toggle
    // kana/romaji mid-sesi.
    const target = pool.find((k) => k.kanji === q.kanji);
    const validRomaji = new Set(target.romaji_readings);
    const validKana = new Set([...target.readings.on, ...target.readings.kun]);
    const distractors = q.choices.filter((c) => c !== q.correctAnswer);
    assert(
      distractors.every(
        (d) => !validRomaji.has(d.romaji) && !validKana.has(d.kana)
      ),
      `no distractor of ${q.kanji} is a valid reading of it (kana & romaji)`
    );
    // Label di kedua skrip tidak boleh kembar antar pilihan (kalau tidak,
    // dua tombol tampil sama tapi cuma satu dianggap benar).
    const romajiLabels = q.choices.map((c) => c.romaji);
    const kanaLabels = q.choices.map((c) => c.kana);
    assert(
      new Set(romajiLabels).size === romajiLabels.length &&
        new Set(kanaLabels).size === kanaLabels.length,
      `choices unique in both scripts (${q.kanji})`
    );
    assert(q.level === "N5" && q.unit === "N5-U1", `question carries level/unit (${q.kanji})`);
  }

  // 社-like case: 対 in n3 (tai only)
  console.log("  (n5 sample ok — full-file check done separately in Python)");

  // scoring: jawaban user = INDEKS pilihan (bukan label) atau DONT_KNOW
  const answers = quiz.map((q) => q.correctIndex);
  answers[0] = DONT_KNOW;
  answers[1] = (quiz[1].correctIndex + 1) % quiz[1].choices.length; // pasti salah
  const r = scoreQuiz(quiz, answers);
  assert(r.details.every((d) => typeof d.level === "string"), "score details carry kanji level");
  assert(r.dontKnowCount === 1, "don't-know counted");
  assert(r.correctCount === quiz.length - 2, "index-based scoring counts correct answers");
  assert(r.wrongCount === 1, "wrong index counted as wrong");
  // indeks 0 harus tetap bisa dijawab & dinilai benar (guard !== null, bukan truthiness)
  const zeroOk = scoreQuiz([quiz[0]], [quiz[0].correctIndex]);
  assert(zeroOk.correctCount === 1, "choice index 0 scores correctly");
}

console.log("\nWeak quiz generation");
{
  const pool = n5.map((k) => ({ ...k, examples: n5ex[k.kanji] || [] }));
  const weak = pool.slice(0, 7); // pretend these are the weak ones
  const wq = generateWeakQuiz(weak, { N5: pool });
  assert(wq.length === 7, "one question per weak kanji");
  assert(
    wq.every((q) =>
      q.primaryReadings.some(
        (p) => p.romaji === q.correctAnswer.romaji && p.kana === q.correctAnswer.kana
      )
    ),
    "weak quiz answers are primary readings too"
  );
  let threw = false;
  try { generateWeakQuiz([], { N5: pool }); } catch { threw = true; }
  assert(threw, "empty weak list throws");
}

console.log("\nKana → romaji converter (port pipeline, dipakai reveal panel)");
{
  // Contoh yang mencakup aturan: katakana, yōon, geminasi っ, vokal
  // panjang ー, prefiks "-" dibuang. String ini diambil dari output
  // konverter Python supaya parity kedua implementasi terjaga.
  const cases = [
    ["ニチ", "nichi"], ["いちにち", "ichinichi"], ["じゅう", "juu"],
    ["いっぱい", "ippai"], ["コーヒー", "koohii"], ["-び", "bi"],
    ["きょう", "kyou"], ["しゃ", "sha"], ["しんぶん", "shinbun"],
    ["はっか", "hakka"], ["しょうゆ", "shouyu"], ["ひとつ", "hitotsu"],
  ];
  for (const [input, expected] of cases) {
    assert(kanaToRomaji(input) === expected, `converts ${input} → ${expected}`);
  }
  assert(kanaToRomaji("") === "", "empty input → empty output");

  // Parity penuh 2.211 kanji: romaji runtime harus SAMA PERSIS dengan
  // primary_readings[].romaji dari pipeline (string itu juga label jawaban
  // kuis + yang di-bold di panel reveal mode romaji). Examples di-merge
  // seperti dataLoader.js (file terpisah, keyed by kanji).
  const allLevels = [
    [n1, n1ex], [n2, n2ex], [n3, n3ex], [n4, n4ex], [n5, n5ex],
  ];
  let checked = 0;
  let parityFails = 0;
  let exFails = 0;
  for (const [entries, examples] of allLevels) {
    for (const e of entries) {
      for (const p of e.primary_readings || []) {
        checked++;
        if (kanaToRomaji(p.kana) !== p.romaji) parityFails++;
      }
      // Reading contoh kata: hasil konversi harus non-kosong & murni romaji
      // (kalau ada kana yang tak dikenal converter, hasilnya tetap berisi
      // kana/terpotong — invariant ini menangkapnya).
      for (const ex of examples[e.kanji] || []) {
        const conv = kanaToRomaji(ex.reading);
        if (!/^[a-z]+$/.test(conv)) exFails++;
      }
    }
  }
  assert(parityFails === 0, `runtime romaji == pipeline romaji for all ${checked} primary readings`);
  assert(exFails === 0, "every example reading converts to pure romaji");
}

console.log("\nStudy stats (streak, rekor streak, hari belajar — kunci hari LOKAL)");
{
  // Deterministik: "now" disuntik + timestamp dibuat dari Date lokal lalu
  // diserialisasi ISO (roundtrip selalu kembali ke hari lokal yang sama).
  const now = new Date(2026, 8, 10, 12, 0); // 10 Sep 2026 12:00
  // attempts = baris quizAttempts: {timestamp: ISO, ...} — bukan string.
  const at = (d, h = 10) => ({ timestamp: new Date(2026, 8, d, h).toISOString() });

  // Hari aktif: 4,5,6 (rentetan lama), 8,9,10 — 9 Sep dua kuis → 6 hari unik.
  const attempts = [at(4), at(5), at(6), at(8), at(9), at(9, 20), at(10, 9)];
  const s = computeStudyStats(attempts, now);
  assert(s.streak === 3, `current streak 3 (got ${s.streak})`);
  assert(s.doneToday === true, "today counts as done");
  assert(s.longestStreak === 3, `longest streak 3 (got ${s.longestStreak})`);
  assert(s.daysStudied === 6, `days studied 6 (got ${s.daysStudied})`);
  assert(s.activity.get("2026-09-09") === 2, "two quizzes same day collapse to one day, count 2");

  // Hari ini belum belajar → streak mundur dari kemarin.
  const s2 = computeStudyStats([at(8), at(9)], now);
  assert(s2.streak === 2 && s2.doneToday === false, "streak counts from yesterday when today empty");

  // Tidak ada aktivitas sama sekali.
  const s3 = computeStudyStats([], now);
  assert(s3.streak === 0 && s3.longestStreak === 0 && s3.daysStudied === 0, "empty attempts → zeros");

  // Rekor lebih panjang dari streak sekarang: 4,5,6,7 lalu bolong; hari ini
  // (10) kosong & hanya 9 yang aktif → streak sekarang 1, rekor 4.
  const s4 = computeStudyStats([at(4), at(5), at(6), at(7), at(9)], now);
  assert(s4.longestStreak === 4 && s4.streak === 1, "longest streak outlives current streak");

  // Kunci hari lokal + format jam 24h.
  assert(toDateStr(new Date(2026, 8, 2, 23, 59)) === "2026-09-02", "toDateStr uses local calendar day");
  assert(formatHHMM(new Date(2026, 8, 10, 14, 5)) === "14:05", "formatHHMM 24h zero-padded");
}

console.log("\nDue format (label interval presisi jam + waktu jatuh tempo persis)");
{
  const now = new Date(2026, 8, 10, 12, 0); // 10 Sep 2026 12:00
  const at = (ms) => new Date(now.getTime() + ms).toISOString();
  const H = 1000 * 60 * 60;
  const D = 24 * H;

  // Granularitas jam (loop Relearning 6h) — bukan "days" dari stability.
  assert(intervalUntilLabel(at(6 * H), now) === "6 hours", "relearning 6h → \"6 hours\"");
  assert(intervalUntilLabel(at(45 * 60 * 1000), now) === "45 min", "45 menit → \"45 min\"");
  assert(intervalUntilLabel(at(30 * 1000), now) === "under a minute", "< 1 menit → \"under a minute\"");

  // Tepi hari: 23.6 jam dibulatkan ke 24 → "1 day" (mulus, bukan "24 hours").
  assert(intervalUntilLabel(at(23.6 * H), now) === "1 day", "23.6h rounds to \"1 day\"");
  assert(intervalUntilLabel(at(20 * H), now) === "20 hours", "20 jam tetap jam");
  assert(intervalUntilLabel(at(1 * H), now) === "1 hour", "singular \"1 hour\"");
  assert(intervalUntilLabel(at(3 * D), now) === "3 days", "3 hari → \"3 days\"");

  // Hari menaik (ceil, selaras daysUntil): 2.1 hari → 3 hari.
  assert(intervalUntilLabel(at(2.1 * D), now) === "3 days", "2.1 hari ceil → \"3 days\"");

  // Sudah lewat → "now" (pemanggil menampilkan CTA review).
  assert(intervalUntilLabel(at(-5 * 60 * 1000), now) === "now", "terlambat → \"now\"");

  // Waktu jatuh tempo persis: tanggal pendek + jam 24h lokal.
  const exact = formatDueExact(new Date(2026, 8, 10, 14, 30));
  assert(exact === "Thu, Sep 10 · 14:30", `formatDueExact "Thu, Sep 10 · 14:30" (got "${exact}")`);
  // Timestamp number juga diterima (computeStats mengembalikan number).
  assert(
    intervalUntilLabel(new Date(2026, 8, 10, 18, 0).getTime(), now) === "6 hours",
    "menerima timestamp number"
  );
}

console.log("Data komponen (components_n*.json — invariant build build_components.py)");
{
  const LEVEL_DATA = { N5: n5, N4: n4, N3: n3, N2: n2, N1: n1 };
  // Import data komponen per level.
  const comps = {};
  for (const lv of Object.keys(LEVEL_DATA)) {
    const mod = await import(`../src/data/components_${lv.toLowerCase()}.json`, { with: { type: "json" } });
    comps[lv] = mod.default;
  }

  // 1) Setiap kanji ber-dekomposisi ada di data levelnya (kunci konsisten).
  for (const [lv, map] of Object.entries(comps)) {
    const known = new Set(LEVEL_DATA[lv].map((k) => k.kanji));
    let orphans = 0;
    for (const ch of Object.keys(map)) if (!known.has(ch)) orphans++;
    assert(orphans === 0, `${lv}: semua kanji kunci ada di n*.json (${Object.keys(map).length} entri)`);
  }

  // 2) Invariant stroke: t == stroke_count data app; sum(s) + sum(u) == t;
  //    glyph e satu karakter; lv valid bila ada; u/k target satu karakter.
  let bad = 0;
  for (const [lv, map] of Object.entries(comps)) {
    const byCh = new Map(LEVEL_DATA[lv].map((k) => [k.kanji, k]));
    for (const [ch, entry] of Object.entries(map)) {
      const sc = byCh.get(ch)?.stroke_count;
      if (sc !== undefined && entry.t !== sc) bad++;
      let sum = 0;
      for (const p of entry.p) {
        if (p.e !== undefined) {
          // codepoint-aware: glyph CJK Ext-B punya 2 unit UTF-16 — build
          // sudah melipatnya, tapi cek tetap aman untuk pasangan surrogate.
          if (typeof p.e !== "string" || [...p.e].length !== 1) bad++;
          // R7: astral (Ext-B) ATAU CJK Radicals Supplement (U+2E80-2EFF)
          // = risiko tofu font — build wajib mensubstitusi/melipat.
          const cp = p.e.codePointAt(0);
          if (cp > 0xffff || (cp >= 0x2e80 && cp <= 0x2eff)) bad++;
          if (p.lv && !(p.lv in LEVEL_DATA)) bad++;
          if (p.k && [...p.k].length !== 1) bad++;
        } else if (p.u === undefined) {
          bad++;
        }
        sum += p.s ?? p.u ?? 0;
      }
      if (sum !== entry.t) bad++;
    }
  }
  assert(bad === 0, "semua level: t=stroke_count, sum(s)+u=t, glyph/link valid");

  // 3) Kasus yang pernah dipertanyakan user (sumber beda):
  //    全 = 人 + 王 (bentuk TERTULIS; original 玉 di tooltip o).
  const zen = comps.N3["全"];
  assert(
    zen && zen.p.length === 2 && zen.p[0].e === "人" && zen.p[1].e === "王" && zen.p[1].o === "玉" && zen.t === 6,
    "全 (N3) = 人 + 王(o:玉), 6 goresan"
  );
  //    体: 亻 varian → link 人 (k), arti chip dari 人.
  const tai = comps.N4["体"];
  assert(
    tai && tai.p[0].e === "亻" && tai.p[0].k === "人" && tai.p[0].lv === "N5",
    "体 (N4): 亻 ber-link kanji 人 (N5)"
  );
  //    急: 𠂊 (astral, Ext-B) disubstitusi bentuk dasar 勹 (R7 — bebas tofu).
  const kyu = comps.N4["急"];
  assert(
    kyu && kyu.p.some((p) => p.e === "勹") && !kyu.p.some((p) => p.e?.codePointAt(0) > 0xffff) && kyu.t === 9,
    "急 (N4) = 勹 + 心 tanpa glyph astral (R7)"
  );
  //    毎: 𠂉 (astral tanpa original aman) dilipat ke goresan lepas {u};
  //    bagian bawahnya berlabel 毋 (radikal, bentuk tulis KanjiVG).
  const mai = comps.N5["毎"];
  assert(
    mai && mai.p.some((p) => p.e === "毋") && !mai.p.some((p) => p.e?.codePointAt(0) > 0xffff) && (mai.p.find((p) => p.u) || {}).u === 2,
    "毎 (N5) = 毋 + {u:2} (𠂉 dilipat, R7)"
  );
  //    時: rantai navigasi Browse (時 → 寺 → 土) tersedia lintas level.
  const toki = comps.N5["時"];
  const tera = comps.N2["寺"];
  assert(
    toki?.p[1].e === "寺" && toki.p[1].lv === "N2" && tera?.p.some((p) => p.e === "土"),
    "時 (N5) → 寺 (N2) → 土: rantai chip dapat dinavigasi"
  );
  //    本: goresan lepas jujur (+1) — 4 + 1 = 5.
  const hon = comps.N5["本"];
  assert(
    hon && hon.p[0].e === "木" && hon.p[1]?.u === 1 && hon.t === 5,
    "本 (N5) = 木 + {u:1} (goresan lepas tercatat)"
  );
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
