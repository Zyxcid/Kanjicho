import React from "react";
import { BookOpen, Flame } from "lucide-react";
import NextReviewBanner from "./NextReviewBanner.jsx";

/**
 * Badge tiap kartu level di Home, mencerminkan progres nyata user:
 *   - mastered == total → "Mastered" (gold)
 *   - due > 0           → "N due" (seal)
 *   - studied > 0       → "studied/total" (indigo)
 *   - else              → "New" (muted)
 */
function levelBadge(stats) {
  if (!stats) return { label: "New", variant: "muted" };
  if (stats.total > 0 && stats.mastered === stats.total) {
    return { label: "Mastered", variant: "gold" };
  }
  if (stats.due > 0) {
    return { label: `${stats.due} due`, variant: "seal" };
  }
  if (stats.studied > 0) {
    return { label: `${stats.studied}/${stats.total}`, variant: "indigo" };
  }
  return { label: "New", variant: "muted" };
}

export default function Home({ levelIds, getLevelMeta, getLevelStats, onOpenLevel, onBrowse, stats, onJumpToNextReview, streak, streakDoneToday }) {
  const atRisk = streak > 0 && !streakDoneToday; // ada streak & belum kuis hari ini
  return (
    <>
      <div className="kd-hero">
        <div className="kd-hero-row">
          {/* Streak: api + angka saja. Status terbaca dari warna: border
              emas + api terisi = selesai hari ini; border merah = streak
              terancam. Detail lengkap di tooltip (title). */}
          <div
            className={`kd-stat streak ${streakDoneToday ? "lit" : atRisk ? "at-risk" : ""}`}
            title={
              streakDoneToday
                ? `Day streak: ${streak} — today's quiz done`
                : atRisk
                  ? `Day streak: ${streak} — quiz today to keep it`
                  : "Day streak"
            }
          >
            <div className="kd-stat-num">
              <Flame size={18} className="kd-stat-flame" fill={streakDoneToday ? "currentColor" : "none"} /> {streak}
            </div>
          </div>
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

      {/* Entry ke perpustakaan kanji lengkap (semua level). */}
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
          const badge = levelBadge(getLevelStats ? getLevelStats(level) : null);
          return (
            <button key={level} className="kd-level-card ready" onClick={() => onOpenLevel(level)}>
              <span className={`kd-level-badge ${badge.variant}`}>{badge.label}</span>
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
