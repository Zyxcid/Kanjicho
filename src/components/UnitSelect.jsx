import React, { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { unitStatus, daysUntil } from "../App.jsx";
import { loadLevelKanji } from "../lib/dataLoader.js";
import NextReviewBanner from "./NextReviewBanner.jsx";

const STATUS_LABEL = {
  new: "Not started",
  due: "Review now",
  scheduled: "Scheduled",
  mastered: "Mastered",
};

export default function UnitSelect({ level, units, progress, stats, onBack, onStartUnit, onJumpToNextReview }) {
  // Kanji data lengkap untuk level ini di-load di sini (bukan di App.jsx),
  // karena preview strip tiap unit card butuh isi kanjinya. loadLevelKanji()
  // sudah di-cache secara internal, jadi berpindah-pindah unit/kembali ke
  // level yang sama tidak fetch ulang.
  const [kanjiList, setKanjiList] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setKanjiList(null);
    loadLevelKanji(level).then((list) => {
      if (!cancelled) setKanjiList(list);
    });
    return () => {
      cancelled = true;
    };
  }, [level]);

  function previewFor(unitId) {
    if (!kanjiList) return "";
    return kanjiList
      .filter((k) => k.unit === unitId)
      .slice(0, 4)
      .map((k) => k.kanji)
      .join(" ");
  }

  return (
    <>
      <button className="kd-back" onClick={onBack}>
        <ChevronLeft size={16} /> Home
      </button>

      <div className="kd-hero">
        <div className="kd-hero-row">
          <div className="kd-stat studied">
            <div className="kd-stat-num">{stats.studied}</div>
            <div className="kd-stat-label">Studied</div>
          </div>
          <div className="kd-stat due">
            <div className="kd-stat-num">{stats.due}</div>
            <div className="kd-stat-label">Due now</div>
          </div>
          <div className="kd-stat mastered">
            <div className="kd-stat-num">{stats.mastered}</div>
            <div className="kd-stat-label">Mastered</div>
          </div>
        </div>
      </div>

      <NextReviewBanner stats={stats} onJump={onJumpToNextReview} />

      <div className="kd-section-title">{level} Units</div>
      <div className="kd-unit-grid">
        {units.map((unitId) => {
          const state = progress[unitId];
          const status = unitStatus(state);
          return (
            <button
              key={unitId}
              className={`kd-unit-card ${status}`}
              disabled={!kanjiList}
              onClick={() => onStartUnit(unitId)}
            >
              {status === "mastered" && <div className="kd-hanko gold">済</div>}
              {status === "due" && <div className="kd-hanko">要</div>}
              <div className="kd-unit-title">{unitId}</div>
              <div className="kd-unit-status">
                {STATUS_LABEL[status]}
                {status === "scheduled" && ` · in ${daysUntil(state.nextReviewAt)} days`}
              </div>
              <div className="kd-unit-preview">{kanjiList ? previewFor(unitId) : "…"}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}
