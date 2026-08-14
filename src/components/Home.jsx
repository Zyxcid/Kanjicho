import React from "react";

export default function Home({ levelIds, getLevelMeta, onOpenLevel, stats }) {
  return (
    <>
      <div className="kd-hero">
        <div className="kd-hero-row">
          <div className="kd-stat due">
            <div className="kd-stat-num">{stats.due}</div>
            <div className="kd-stat-label">Due now</div>
          </div>
          <div className="kd-stat new">
            <div className="kd-stat-num">{stats.notStarted}</div>
            <div className="kd-stat-label">Not started</div>
          </div>
          <div className="kd-stat mastered">
            <div className="kd-stat-num">{stats.mastered}</div>
            <div className="kd-stat-label">Mastered</div>
          </div>
        </div>
      </div>

      <div className="kd-section-title">Choose a JLPT Level</div>
      <div className="kd-level-grid">
        {levelIds.map((level) => {
          const meta = getLevelMeta(level);
          return (
            <button key={level} className="kd-level-card ready" onClick={() => onOpenLevel(level)}>
              <span className="kd-level-badge">Ready</span>
              <div className="kd-level-name">{level}</div>
              <div className="kd-level-count">
                {meta.total} kanji · {meta.units} units
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
