import React, { useState, useEffect, useMemo, useCallback } from "react";
import { LEVEL_IDS, getUnitsForLevel, getLevelMeta, loadLevelKanji } from "./lib/dataLoader.js";
import { createInitialUnitState, reviewUnit } from "./lib/srs.js";
import { generateQuiz, scoreQuiz } from "./lib/quizGenerator.js";
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
 * ini belum ada aktivitas, streak tetap dihitung dari kemarin (belum
 * "putus" sampai hari ini benar-benar lewat tanpa aktivitas).
 *
 * Return { streak, doneToday } -- doneToday dipakai UI (Home.jsx) untuk
 * bedakan visual "hari ini sudah aman" vs "belum", supaya user tidak cuma
 * mengandalkan baca angka untuk tahu statusnya.
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
  // Screen navigation is driven by the URL hash via useRouter, so the
  // browser Back button navigates within the app instead of exiting it.
  const { view, level: routeLevel, unit: routeUnit, navigate } = useRouter();

  // activeLevel/activeUnit lag the route so UnitSelect keeps showing the
  // right level even when we briefly route home (e.g. Quiz Cancel goes to
  // the level the quiz was in).
  const [activeLevel, setActiveLevel] = useState(routeLevel || "N5");
  const [activeUnit, setActiveUnit] = useState(routeUnit);

  const [progress, setProgress] = useState({}); // unitId -> srsState
  const [streak, setStreak] = useState(0);
  const [streakDoneToday, setStreakDoneToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);

  // Keep activeLevel / activeUnit in sync with the route as the user
  // navigates (forward navigation sets them; back navigation restores them).
  useEffect(() => {
    if (routeLevel) setActiveLevel(routeLevel);
    if (routeUnit) setActiveUnit(routeUnit);
  }, [routeLevel, routeUnit]);

  // Load semua progress + riwayat kuis dari IndexedDB sekali saat app dibuka.
  useEffect(() => {
    Promise.all([storage.getAllProgress(), storage.getAllQuizAttempts()]).then(([records, attempts]) => {
      const map = {};
      records.forEach((r) => {
        map[r.unitId] = r;
      });
      setProgress(map);
      const { streak: s, doneToday } = computeStreak(attempts);
      setStreak(s);
      setStreakDoneToday(doneToday);
      setLoading(false);
    });
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // Hitung statistik untuk satu set unit: berapa yang sudah pernah dikuiskan
  // ("studied"), berapa yang jatuh tempo sekarang ("due"), berapa yang sudah
  // dikuasai ("mastered"), plus info review terdekat berikutnya (unit + hari).
  function computeStats(units) {
    let studied = 0, due = 0, mastered = 0;
    let soonestAt = null, soonestUnit = null;
    units.forEach((u) => {
      const state = progress[u];
      const status = unitStatus(state);
      if (status === "due") due++;
      else if (status === "mastered") mastered++;
      // "Studied" = pernah dikerjakan minimal sekali (stability sudah terisi).
      if (state && state.stability !== null) studied++;
      // Cari nextReviewAt paling dekat di antara unit yang sudah dipelajari.
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

  // Stats agregat SEMUA level (dipakai di Home, sebelum user pilih level tertentu)
  const allLevelsStats = useMemo(
    () => computeStats(LEVEL_IDS.flatMap((l) => getUnitsForLevel(l))),
    [progress]
  );

  // Stats per-level untuk badge tiap kartu level di Home. Dihitung sekali
  // dari `progress` tiap kali progress berubah, lalu dipass sebagai lookup.
  const levelStatsMap = useMemo(() => {
    const map = {};
    LEVEL_IDS.forEach((l) => {
      map[l] = computeStats(getUnitsForLevel(l));
    });
    return map;
  }, [progress]);

  // Badging API -- taruh angka "due" di icon app (kalau PWA sudah di-install
  // & browser dukung). Cuma bisa update pas app kebuka; TIDAK jalan di
  // background kalau app tertutup (bukan push notification sungguhan,
  // lihat catatan di README). Feature-detect supaya aman di browser yang
  // belum dukung (mis. Safari/iOS).
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const due = allLevelsStats.due;
    if (due > 0) {
      navigator.setAppBadge(due).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [allLevelsStats.due]);

  // Stats khusus level yang lagi dibuka (dipakai di layar pilih unit)
  const levelStats = useMemo(
    () => computeStats(getUnitsForLevel(activeLevel)),
    [progress, activeLevel]
  );

  function openLevel(level) {
    setActiveLevel(level);
    navigate("unitSelect", { level });
  }

  // level (parameter kedua, opsional) dipakai kalau unit yang mau dibuka
  // BUKAN dari activeLevel saat ini -- mis. klik banner "next review" di
  // Home yang bisa nunjuk ke unit di level manapun. Kalau tidak dikasih,
  // fallback ke activeLevel seperti biasa (dipakai UnitSelect).
  async function startUnit(unitId, level = activeLevel) {
    // loadLevelKanji() sudah di-cache -- kalau UnitSelect sudah lebih dulu
    // load level ini (biasanya sudah, karena preview strip butuh itu juga),
    // baris ini langsung resolve dari cache, tidak fetch ulang.
    const pool = await loadLevelKanji(level);
    if (pool.length < 4) {
      showToast("This level doesn't have enough kanji to generate distractors.");
      return;
    }
    const kanjiInUnit = pool.filter((k) => k.unit === unitId);
    setActiveLevel(level);
    setActiveUnit(unitId);
    setQuiz(generateQuiz(kanjiInUnit, pool));
    setQIndex(0);
    setAnswers([]);
    setSelectedChoice(null);
    navigate("quiz", { level, unit: unitId });
  }

  // Dipanggil dari klik banner "next review" (Home & UnitSelect) -- level
  // unit itu di-derive dari progress-nya sendiri (jlptLevel tersimpan per
  // record, lihat storage.js), TIDAK diasumsikan sama dengan activeLevel.
  function jumpToNextReview(unitId) {
    if (!unitId) return;
    const level = progress[unitId]?.jlptLevel;
    if (!level) return;
    startUnit(unitId, level);
  }

  function submitAnswer(choice) {
    if (selectedChoice) return;
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
    const prevState = progress[activeUnit] || createInitialUnitState();
    const newState = reviewUnit(prevState, finalResult.score, new Date());

    setProgress((p) => ({ ...p, [activeUnit]: newState }));
    setResult({ ...finalResult, newState });
    navigate("result", { level: activeLevel, unit: activeUnit });

    // Persist ke IndexedDB (tidak perlu ditunggu / await sebelum ganti layar --
    // UI sudah update optimistically dari state React di atas)
    await storage.saveUnitProgress(activeUnit, activeLevel, newState);
    await storage.logQuizAttempt(activeUnit, finalResult);

    // Recompute streak SEKARANG, bukan cuma sekali pas app dibuka -- kalau
    // tidak, kuis pertama hari itu tidak langsung kelihatan nambah
    // streak-nya di Home sampai halaman di-reload.
    const attempts = await storage.getAllQuizAttempts();
    const { streak: s, doneToday } = computeStreak(attempts);
    setStreak(s);
    setStreakDoneToday(doneToday);
  }

  if (loading) {
    return <div className="kd-root kd-loading">Loading your progress…</div>;
  }

  // If the route points at quiz/result but the in-memory state for that screen
  // isn't there (e.g. after a reload), gracefully fall back to the unit list
  // instead of rendering a blank screen.
  const effectiveView =
    (view === "quiz" && !quiz) || (view === "result" && !result)
      ? "unitSelect"
      : view;

  return (
    <div className="kd-root">
      <div className="kd-topbar">
        <div className="kd-brand">
          漢字帳 <small>Kanjichō · JLPT Kanji Practice</small>
        </div>
        <div className="kd-topbar-right">
          <HelpButton />
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
        />
      )}

      {effectiveView === "quiz" && quiz && (
        <Quiz
          quiz={quiz}
          qIndex={qIndex}
          selectedChoice={selectedChoice}
          onSubmitAnswer={submitAnswer}
          onContinue={handleContinue}
          // Quiz Cancel = browser Back semantics: return to the unit list
          // the quiz was launched from.
          onCancel={() => navigate("unitSelect", { level: activeLevel })}
        />
      )}

      {effectiveView === "result" && result && (
        <Result
          result={result}
          activeUnit={activeUnit}
          onBackToUnits={() => navigate("unitSelect", { level: activeLevel })}
          onHome={() => navigate("home")}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
