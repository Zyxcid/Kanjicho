import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Flame } from "lucide-react";
import { LEVEL_IDS, getKanjiForLevel, getUnitsForLevel, getKanjiForUnit, getLevelMeta } from "./lib/dataLoader.js";
import { createInitialUnitState, reviewUnit } from "./lib/srs.js";
import { generateQuiz, scoreQuiz } from "./lib/quizGenerator.js";
import * as storage from "./lib/storage.js";

import Home from "./components/Home.jsx";
import UnitSelect from "./components/UnitSelect.jsx";
import Quiz from "./components/Quiz.jsx";
import Result from "./components/Result.jsx";
import Toast from "./components/Toast.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";

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
 */
function computeStreak(attempts) {
  const dateSet = new Set(attempts.map((a) => a.timestamp.slice(0, 10)));
  const cursor = new Date();
  if (!dateSet.has(toDateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dateSet.has(toDateStr(cursor))) return 0;
  }
  let streak = 0;
  while (dateSet.has(toDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function App() {
  const [view, setView] = useState("home"); // home | unitSelect | quiz | result
  const [progress, setProgress] = useState({}); // unitId -> srsState
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeLevel, setActiveLevel] = useState("N5");
  const [activeUnit, setActiveUnit] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);

  // Load semua progress + riwayat kuis dari IndexedDB sekali saat app dibuka.
  useEffect(() => {
    Promise.all([storage.getAllProgress(), storage.getAllQuizAttempts()]).then(([records, attempts]) => {
      const map = {};
      records.forEach((r) => {
        map[r.unitId] = r;
      });
      setProgress(map);
      setStreak(computeStreak(attempts));
      setLoading(false);
    });
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // Stats agregat SEMUA level (dipakai di Home, sebelum user pilih level tertentu)
  const allLevelsStats = useMemo(() => {
    let due = 0, notStarted = 0, mastered = 0;
    LEVEL_IDS.forEach((level) => {
      getUnitsForLevel(level).forEach((u) => {
        const status = unitStatus(progress[u]);
        if (status === "due") due++;
        else if (status === "new") notStarted++;
        else if (status === "mastered") mastered++;
      });
    });
    return { due, notStarted, mastered };
  }, [progress]);

  // Stats khusus level yang lagi dibuka (dipakai di layar pilih unit)
  const levelStats = useMemo(() => {
    const units = getUnitsForLevel(activeLevel);
    const due = units.filter((u) => unitStatus(progress[u]) === "due").length;
    const notStarted = units.filter((u) => unitStatus(progress[u]) === "new").length;
    const mastered = units.filter((u) => unitStatus(progress[u]) === "mastered").length;
    return { due, notStarted, mastered };
  }, [progress, activeLevel]);

  function openLevel(level) {
    setActiveLevel(level);
    setView("unitSelect");
  }

  function startUnit(unitId) {
    const kanjiInUnit = getKanjiForUnit(activeLevel, unitId);
    const pool = getKanjiForLevel(activeLevel);
    if (pool.length < 4) {
      showToast("This level doesn't have enough kanji to generate distractors.");
      return;
    }
    setActiveUnit(unitId);
    setQuiz(generateQuiz(kanjiInUnit, pool));
    setQIndex(0);
    setAnswers([]);
    setSelectedChoice(null);
    setView("quiz");
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
    setView("result");

    // Persist ke IndexedDB (tidak perlu ditunggu / await sebelum ganti layar --
    // UI sudah update optimistically dari state React di atas)
    await storage.saveUnitProgress(activeUnit, activeLevel, newState);
    await storage.logQuizAttempt(activeUnit, finalResult);
  }

  if (loading) {
    return <div className="kd-root kd-loading">Loading your progress…</div>;
  }

  return (
    <div className="kd-root">
      <div className="kd-topbar">
        <div className="kd-brand">
          漢字ドリル <small>JLPT Kanji Practice</small>
        </div>
        <div className="kd-topbar-right">
          {view === "home" && (
            <div className="kd-streak">
              <Flame size={14} /> {streak} day{streak === 1 ? "" : "s"} streak
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>

      {view === "home" && <Home levelIds={LEVEL_IDS} getLevelMeta={getLevelMeta} onOpenLevel={openLevel} stats={allLevelsStats} />}

      {view === "unitSelect" && (
        <UnitSelect
          level={activeLevel}
          units={getUnitsForLevel(activeLevel)}
          progress={progress}
          stats={levelStats}
          getKanjiForUnit={getKanjiForUnit}
          onBack={() => setView("home")}
          onStartUnit={startUnit}
        />
      )}

      {view === "quiz" && quiz && (
        <Quiz
          quiz={quiz}
          qIndex={qIndex}
          selectedChoice={selectedChoice}
          onSubmitAnswer={submitAnswer}
          onContinue={handleContinue}
          onCancel={() => setView("unitSelect")}
        />
      )}

      {view === "result" && result && (
        <Result
          result={result}
          activeUnit={activeUnit}
          onBackToUnits={() => setView("unitSelect")}
          onHome={() => setView("home")}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
