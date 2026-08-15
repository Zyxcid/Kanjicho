import React from "react";
import { ChevronLeft } from "lucide-react";
import { unitStatus, daysUntil } from "../App.jsx";
import NextReviewBanner from "./NextReviewBanner.jsx";

const STATUS_LABEL = {
  new: "Not started",
  due: "Review now",
  scheduled: "Scheduled",
  mastered: "Mastered",
};

export default function UnitSelect({ level, units, progress, stats, getKanjiForUnit, onBack, onStartUnit }) {
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

      <NextReviewBanner stats={stats} />

      <div className="kd-section-title">{level} Units</div>
      <div className="kd-unit-grid">
        {units.map((unitId) => {
          const state = progress[unitId];
          const status = unitStatus(state);
          const preview = getKanjiForUnit(level, unitId)
            .slice(0, 4)
            .map((k) => k.kanji)
            .join(" ");
          return (
            <button key={unitId} className={`kd-unit-card ${status}`} onClick={() => onStartUnit(unitId)}>
              {status === "mastered" && <div className="kd-hanko gold">済</div>}
              {status === "due" && <div className="kd-hanko">要</div>}
              <div className="kd-unit-title">{unitId}</div>
              <div className="kd-unit-status">
                {STATUS_LABEL[status]}
                {status === "scheduled" && ` · in ${daysUntil(state.nextReviewAt)} days`}
              </div>
              <div className="kd-unit-preview">{preview}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}
