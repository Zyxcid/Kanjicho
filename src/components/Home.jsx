import React from "react";
import { BookOpen } from "lucide-react";

export default function Home({ levelIds, getLevelMeta, onOpenLevel, onBrowse, stats }) {
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

      {/* Browse entry: jump to the full kanji library (every kanji, all levels). */}
      <div className="kd-browse-entry-row">
        <button className="kd-browse-entry" onClick={onBrowse}>
          <BookOpen size={16} />
          <span>Browse all kanji</span>
          <small>Reference library · N5–N1</small>
        </button>
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
