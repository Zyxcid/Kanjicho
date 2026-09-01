import React, { useState, useEffect, useMemo, useCallback } from "react";
import { LEVEL_IDS, getUnitsForLevel, getLevelMeta, loadLevelKanji } from "./lib/dataLoader.js";
import { createInitialUnitState, reviewUnit } from "./lib/srs.js";
import { generateQuiz, generateWeakQuiz, scoreQuiz } from "./lib/quizGenerator.js";
import * as storage from "./lib/storage.js";
import { useRouter } from "./lib/useRouter.js";

import Home from "./components/Home.jsx";
import UnitSelect from "./components/UnitSelect.jsx";
import Quiz from "./components/Quiz.jsx";
import Result from "./components/Result.jsx";
import Toast from "./components/Toast.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import Browse from "./components/Browse.jsx";
import HelpButton from "./components/HelpButton.jsx";

export function unitStatus(state) {
  if (!state || state.stability === null) return "new";
  const daysLeft = daysUntil(state.nextReviewAt);
  if (daysLeft <= 0) return "due";
  if (state.stability >= 30) return "mastered";
  return "scheduled";
}

export function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Hitung streak harian dari riwayat kuis: berapa hari BERTURUT-TURUT user
 * mengerjakan minimal satu kuis, dihitung mundur dari hari ini. Kalau hari
 * ini belum ada aktivitas, streak dihitung dari kemarin (belum "putus"
 * sampai hari ini benar-benar lewat kosong).
 *
 * Return { streak, doneToday } — doneToday dipakai Home.jsx untuk warna
 * stat streak (emas = aman, merah = terancam).
 */
function computeStreak(attempts) {
  const dateSet = new Set(attempts.map((a) => a.timestamp.slice(0, 10)));
  const doneToday = dateSet.has(toDateStr(new Date()));

  const cursor = new Date();
  if (!doneToday) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dateSet.has(toDateStr(cursor))) return { streak: 0, doneToday: false };
  }
  let streak = 0;
  while (dateSet.has(toDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, doneToday };
}

export default function App() {
  // Navigasi layar lewat hash URL (useRouter) supaya tombol Back browser
  // berpindah layar di dalam app, bukan keluar.
  const { view, level: routeLevel, unit: routeUnit, navigate } = useRouter();

  // Skrip tampilan kana/romaji: "romaji" (default, ramah pemula) atau
  // "kana" (autentik — melatih baca kana langsung). Mengatur seluruh layar
  // kuis: label pilihan jawaban, bacaan On/Kun di panel reveal, dan reading
  // contoh kata. Disimpan di localStorage supaya bertahan lintas sesi;
  // toggle berlaku LIVE (pilihan soal menyimpan kana+romaji sekaligus,
  // reveal dikonversi runtime — lihat lib/kana.js).
  const [answerScript, setAnswerScript] = useState(
    () => localStorage.getItem("kanji-answer-script") || "romaji"
  );

  function toggleAnswerScript() {
    setAnswerScript((s) => {
      const next = s === "kana" ? "romaji" : "kana";
      localStorage.setItem("kanji-answer-script", next);
      return next;
    });
  }

  // Toggle "tampilkan tombol Reset progress" di modal Help (seksi
  // Progress). Default OFF — aksi destruktif jarang dipakai, jadi
  // disembunyikan sampai diaktifkan. Karena state-nya di sini, tombol di
  // UnitSelect muncul/hilang LIVE saat toggle diklik (modal Help bahkan
  // belum perlu ditutup dulu untuk melihatnya).
  const [showReset, setShowReset] = useState(
    () => localStorage.getItem("kanji-show-reset") === "1"
  );

  function toggleShowReset() {
    setShowReset((v) => {
      const next = !v;
      localStorage.setItem("kanji-show-reset", next ? "1" : "0");
      return next;
    });
  }

  // activeLevel/activeUnit tertinggal dari route supaya UnitSelect tetap
  // menampilkan level yang benar saat kita sempat route home (mis. Cancel
  // kuis kembali ke level asal kuisnya).
  const [activeLevel, setActiveLevel] = useState(routeLevel || "N5");
  const [activeUnit, setActiveUnit] = useState(routeUnit);

  const [progress, setProgress] = useState({}); // unitId -> srsState
  const [streak, setStreak] = useState(0);
  const [streakDoneToday, setStreakDoneToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState(null);
  // Mode sesi kuis yang sedang berjalan:
  //   "srs"      — kuis sungguhan: update jadwal SRS + kanjiStats + streak
  //   "practice" — latihan bebas: tidak mengubah apa pun
  //   "weak"     — missed kanji review: update kanjiStats + streak, tanpa SRS
  const [quizMode, setQuizMode] = useState("srs");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);
  // Kanji yang sedang "missed" (pernah salah, belum ditebus) — untuk pill
  // "✕ N" di tiap kartu unit (UnitSelect).
  const [weakKanji, setWeakKanji] = useState([]);
  // Level asal sesi missed review — untuk tombol "Back to Units" di Result
  // kembali ke daftar unit level itu.
  const [weakOriginLevel, setWeakOriginLevel] = useState(null);

  // Lookup cepat kanji → "sedang missed" (Set of chars) untuk UnitSelect.
  const weakChars = useMemo(() => new Set(weakKanji.map((r) => r.kanji)), [weakKanji]);

  // Sinkronkan activeLevel/activeUnit dengan route saat user navigasi.
  useEffect(() => {
    if (routeLevel) setActiveLevel(routeLevel);
    if (routeUnit) setActiveUnit(routeUnit);
  }, [routeLevel, routeUnit]);

  // Muat ulang seluruh data dari IndexedDB ke state React. Dipakai saat
  // app dibuka dan setelah progress satu level dihapus (Reset progress di
  // UnitSelect) — semua layar yang bergantung state ini (Home, kartu unit,
  // streak, pill missed, badge PWA) otomatis ikut bersih tanpa reload.
  function loadAllData() {
    return Promise.all([
      storage.getAllProgress(),
      storage.getAllQuizAttempts(),
      storage.getWeakKanji(),
    ]).then(([records, attempts, weak]) => {
      const map = {};
      records.forEach((r) => {
        map[r.unitId] = r;
      });
      setProgress(map);
      const { streak: s, doneToday } = computeStreak(attempts);
      setStreak(s);
      setStreakDoneToday(doneToday);
      setWeakKanji(weak);
    });
  }

  useEffect(() => {
    loadAllData().finally(() => setLoading(false));
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // Shortcut global: q = klik tombol back (".kd-back") di layar yang punya
  // tombol itu. Diimplementasikan dengan meng-KLIK tombolnya (bukan
  // navigasi langsung) supaya shortcut menempuh alur yang sama dengan klik
  // mouse — termasuk dialog konfirmasi keluar kuis di Quiz.jsx.
  useEffect(() => {
    function handleBackKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+Q/Cmd+Q = OS/browser
      if (e.key.toLowerCase() !== "q") return;
      // User sedang mengetik (search box Browse) — jangan direbut.
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      // Modal terbuka (help / detail Browse / konfirmasi) — shortcut tidak
      // menembus modal.
      if (document.querySelector(".kd-modal-overlay")) return;
      // Home & Result tidak punya tombol back → q tidak melakukan apa-apa.
      document.querySelector(".kd-back")?.click();
    }
    window.addEventListener("keydown", handleBackKey);
    return () => window.removeEventListener("keydown", handleBackKey);
  }, []);

  // Statistik satu set unit: berapa yang pernah dikuiskan ("studied"),
  // jatuh tempo ("due"), dikuasai ("mastered"), + review terdekat
  // (unit + hari).
  function computeStats(units) {
    let studied = 0, due = 0, mastered = 0;
    let soonestAt = null, soonestUnit = null;
    units.forEach((u) => {
      const state = progress[u];
      const status = unitStatus(state);
      if (status === "due") due++;
      else if (status === "mastered") mastered++;
      // "Studied" = pernah dikerjakan minimal sekali.
      if (state && state.stability !== null) studied++;
      // Cari nextReviewAt terdekat di antara unit yang sudah dipelajari.
      if (state && state.nextReviewAt) {
        const at = new Date(state.nextReviewAt).getTime();
        if (soonestAt === null || at < soonestAt) {
          soonestAt = at;
          soonestUnit = u;
        }
      }
    });
    let nextReviewDays = null;
    if (soonestAt !== null) {
      nextReviewDays = Math.ceil((soonestAt - Date.now()) / (1000 * 60 * 60 * 24));
    }
    return {
      studied,
      due,
      mastered,
      total: units.length,
      nextReviewDays,
      nextReviewUnit: soonestUnit,
    };
  }

  // Stats agregat semua level (Home, sebelum user pilih level tertentu).
  const allLevelsStats = useMemo(
    () => computeStats(LEVEL_IDS.flatMap((l) => getUnitsForLevel(l))),
    [progress]
  );

  // Stats per level untuk badge tiap kartu level di Home.
  const levelStatsMap = useMemo(() => {
    const map = {};
    LEVEL_IDS.forEach((l) => {
      map[l] = computeStats(getUnitsForLevel(l));
    });
    return map;
  }, [progress]);

  // Badge angka "due" di ikon app (PWA ter-install & browser dukung).
  // Hanya ter-update saat app terbuka — bukan push notification
  // (lihat catatan di README). Feature-detect untuk browser yang belum
  // dukung (mis. Safari/iOS).
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const due = allLevelsStats.due;
    if (due > 0) {
      navigator.setAppBadge(due).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [allLevelsStats.due]);

  // Stats level yang sedang dibuka (layar pilih unit).
  const levelStats = useMemo(
    () => computeStats(getUnitsForLevel(activeLevel)),
    [progress, activeLevel]
  );

  function openLevel(level) {
    setActiveLevel(level);
    navigate("unitSelect", { level });
  }

  // Parameter kedua (level) dipakai kalau unit yang dibuka BUKAN dari
  // activeLevel — mis. klik banner "next review" di Home yang bisa
  // menunjuk unit level mana pun. Tanpa itu, fallback ke activeLevel.
  //
  // Mode kuis DIDERIVE dari status unit, bukan dipilih user:
  //   - "new" / "due" → kuis SRS: satu-satunya yang menggerakkan jadwal
  //     SRS, streak, dan statistik.
  //   - lainnya (scheduled/mastered) → latihan bebas: kuis yang sama tapi
  //     tidak menulis apa pun. Unit scheduled tampak redup + popup
  //     konfirmasi singkat saat diklik; tanpa label "practice" di UI.
  async function startUnit(unitId, level = activeLevel) {
    const status = unitStatus(progress[unitId]);
    const mode = status === "new" || status === "due" ? "srs" : "practice";
    // loadLevelKanji() sudah di-cache — kalau UnitSelect lebih dulu load
    // level ini (biasanya sudah, untuk preview strip), baris ini langsung
    // resolve dari cache.
    const pool = await loadLevelKanji(level);
    if (pool.length < 4) {
      showToast("This level doesn't have enough kanji to generate distractors.");
      return;
    }
    const kanjiInUnit = pool.filter((k) => k.unit === unitId);
    setActiveLevel(level);
    setActiveUnit(unitId);
    setQuizMode(mode);
    setQuiz(generateQuiz(kanjiInUnit, pool));
    setQIndex(0);
    setAnswers([]);
    setSelectedChoice(null);
    navigate("quiz", { level, unit: unitId });
  }

  // Missed-kanji review per unit: kumpulkan kanji unit itu yang pernah
  // dijawab salah dan belum ditebus (lihat WEAK_REDEEM_CORRECT_STREAK di
  // storage.js), lalu buat kuis darinya. Panjang sesi = semua missed kanji
  // unit itu (tanpa batas).
  async function startWeakReview(unitId) {
    const pool = await loadLevelKanji(activeLevel);
    if (pool.length < 4) {
      showToast("This level doesn't have enough kanji to generate distractors.");
      return;
    }
    const entries = pool.filter((k) => k.unit === unitId && weakChars.has(k.kanji));

    if (entries.length === 0) {
      showToast("No missed kanji in this unit right now.");
      return;
    }

    setWeakOriginLevel(activeLevel);
    setQuizMode("weak");
    setQuiz(generateWeakQuiz(entries, { [activeLevel]: pool }));
    setQIndex(0);
    setAnswers([]);
    setSelectedChoice(null);
    navigate("quiz", { unit: "weak" });
  }

  // Tombol "Reset progress" di UnitSelect: hapus seluruh progress level
  // itu (deleteLevelProgress di storage.js — dialog konfirmasinya ada di
  // UnitSelect), lalu muat ulang state. Kontribusi streak dari kuis level
  // itu ikut hilang karena streak dihitung ulang dari sisa attempts.
  async function resetLevelProgress(level) {
    await storage.deleteLevelProgress(level);
    await loadAllData();
    showToast(`${level} progress deleted`);
  }

  // Dipanggil dari klik banner "next review" (Home & UnitSelect) — level
  // unit di-derive dari progress-nya sendiri (jlptLevel tersimpan per
  // record), tidak diasumsikan sama dengan activeLevel.
  function jumpToNextReview(unitId) {
    if (!unitId) return;
    const level = progress[unitId]?.jlptLevel;
    if (!level) return;
    startUnit(unitId, level);
  }

  function submitAnswer(choice) {
    // `choice` = indeks pilihan (number) atau DONT_KNOW. Indeks 0 valid,
    // jadi guard-nya `!== null`, bukan truthiness.
    if (selectedChoice !== null) return;
    setSelectedChoice(choice);
  }

  async function handleContinue() {
    const newAnswers = [...answers, selectedChoice];
    if (qIndex + 1 < quiz.length) {
      setAnswers(newAnswers);
      setQIndex(qIndex + 1);
      setSelectedChoice(null);
      return;
    }

    const finalResult = scoreQuiz(quiz, newAnswers);
    const finishedAt = new Date();
    let extra = { mode: quizMode };

    if (quizMode === "srs") {
      const prevState = progress[activeUnit] || createInitialUnitState();
      const newState = reviewUnit(prevState, finalResult.score, finishedAt);

      setProgress((p) => ({ ...p, [activeUnit]: newState }));
      extra = { ...extra, newState };
    } else if (quizMode === "practice") {
      // Latihan bebas: lampirkan state SRS SAAT INI (tidak diubah sesi ini)
      // supaya layar Result tetap bisa menampilkan "next review" seperti
      // biasa.
      extra = { ...extra, existingState: progress[activeUnit] || null };
    }

    setResult({ ...finalResult, ...extra });
    navigate("result", quizMode === "weak" ? { unit: "weak" } : { level: activeLevel, unit: activeUnit });

    // Persist ke IndexedDB — tidak perlu ditunggu sebelum ganti layar
    // (UI sudah update optimistically dari state React di atas)
    if (quizMode === "srs") {
      await storage.saveUnitProgress(activeUnit, activeLevel, extra.newState);
      await storage.logQuizAttempt(activeUnit, finalResult);
    } else if (quizMode === "weak") {
      // Weak review dihitung sebagai aktivitas belajar (streak) tapi tidak
      // mengubah jadwal SRS unit mana pun.
      await storage.logQuizAttempt("weak-review", finalResult);
    }
    // mode "practice": sengaja tidak menyimpan apa pun.

    if (quizMode === "srs" || quizMode === "weak") {
      await storage.updateKanjiStats(finalResult.details);

      // Berapa kanji yang MASIH missed setelah sesi ini (salah/"don't
      // know" lagi, atau belum ditebus). Dipakai Result untuk baris
      // "N kanji missed". generateWeakQuiz membuat tepat satu soal per
      // kanji, jadi details 1:1 dengan missed kanji unit.
      if (quizMode === "weak") {
        const statsNow = await storage.getKanjiStats(finalResult.details.map((d) => d.kanji));
        const remaining = finalResult.details.filter(
          (d) => !d.isCorrect || (statsNow[d.kanji]?.correctSinceWrong || 0) < storage.WEAK_REDEEM_CORRECT_STREAK
        ).length;
        setResult((r) => (r ? { ...r, remainingMissed: remaining } : r));
      }

      // Refresh daftar weak untuk pill "✕ N" di kartu unit.
      setWeakKanji(await storage.getWeakKanji());
    }

    if (quizMode !== "practice") {
      // Hitung ulang streak SEKARANG, bukan hanya saat app dibuka — supaya
      // kuis pertama hari itu langsung menambah streak di Home.
      const attempts = await storage.getAllQuizAttempts();
      const { streak: s, doneToday } = computeStreak(attempts);
      setStreak(s);
      setStreakDoneToday(doneToday);
    }
  }

  if (loading) {
    return <div className="kd-root kd-loading">Loading your progress…</div>;
  }

  // Kalau route menunjuk quiz/result tapi state in-memory untuk layar itu
  // tidak ada (mis. setelah reload), jatuh ke daftar unit supaya tidak
  // menampilkan layar kosong. Route "weak" jatuh ke Home karena tidak
  // terikat daftar unit level mana pun.
  const effectiveView =
    (view === "quiz" && !quiz) || (view === "result" && !result)
      ? routeUnit === "weak"
        ? "home"
        : "unitSelect"
      : view;

  return (
    <div className="kd-root">
      <div className="kd-topbar">
        <div className="kd-brand">
          漢字帳 <small>Kanjichō · JLPT Kanji Practice</small>
        </div>
        <div className="kd-topbar-right">
          <HelpButton showReset={showReset} onToggleShowReset={toggleShowReset} />
          <ThemeToggle />
        </div>
      </div>

      {effectiveView === "home" && <Home levelIds={LEVEL_IDS} getLevelMeta={getLevelMeta} getLevelStats={(level) => levelStatsMap[level]} onOpenLevel={openLevel} onBrowse={() => navigate("browse")} stats={allLevelsStats} onJumpToNextReview={jumpToNextReview} streak={streak} streakDoneToday={streakDoneToday} />}

      {effectiveView === "browse" && <Browse onBack={() => navigate("home")} />}

      {effectiveView === "unitSelect" && (
        <UnitSelect
          level={activeLevel}
          units={getUnitsForLevel(activeLevel)}
          progress={progress}
          stats={levelStats}
          onBack={() => navigate("home")}
          onStartUnit={startUnit}
          onJumpToNextReview={jumpToNextReview}
          onResetProgress={resetLevelProgress}
          showReset={showReset}
          weakChars={weakChars}
          onStartWeakReview={startWeakReview}
        />
      )}

      {effectiveView === "quiz" && quiz && (
        <Quiz
          quiz={quiz}
          qIndex={qIndex}
          selectedChoice={selectedChoice}
          mode={quizMode}
          answerScript={answerScript}
          onToggleScript={toggleAnswerScript}
          onSubmitAnswer={submitAnswer}
          onContinue={handleContinue}
          // Cancel kuis = semantics Back browser: kembali ke daftar unit
          // asal kuis (missed review → daftar unit level asalnya).
          onCancel={() =>
            quizMode === "weak"
              ? navigate("unitSelect", { level: weakOriginLevel || activeLevel })
              : navigate("unitSelect", { level: activeLevel })
          }
        />
      )}

      {effectiveView === "result" && result && (
        <Result
          result={result}
          mode={result.mode || "srs"}
          activeUnit={activeUnit}
          onBackToUnits={() =>
            result.mode === "weak"
              ? navigate("unitSelect", { level: weakOriginLevel || activeLevel })
              : navigate("unitSelect", { level: activeLevel })
          }
          onHome={() => navigate("home")}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
