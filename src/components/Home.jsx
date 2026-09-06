import React from "react";
import { BookOpen } from "lucide-react";
import NextReviewBanner from "./NextReviewBanner.jsx";
import StatCards from "./StatCards.jsx";

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

/**
 * Home — layar utama: banner review (pintu kalender) + panel statistik
 * kartu besar + browse + grid level.
 *
 * Statistik simple & informatif tampil langsung di sini (scope semua
 * level): tiga kartu non-interaktif "x/total Studied", "Due now",
 * "Mastered" — ala tampilan lama, tanpa stat missed (sudah terbaca dari
 * pill ✕N tiap kartu unit) dan tanpa streak. Banner review di atasnya
 * tetap satu-satunya pintu jadwal (klik = overlay kalender). Progres per
 * level tetap terbaca dari badge tiap kartu level di bawah.
 */
export default function Home({
  levelIds,
  getLevelMeta,
  getLevelStats,
  onOpenLevel,
  onBrowse,
  stats,
  onOpenCalendar,
}) {
  return (
    <>
      {/* Banner review: klik membuka overlay kalender review (bukan langsung
          ke kuis) — user lihat dulu unit yang due + jamnya. */}
      <NextReviewBanner stats={stats} onOpenCalendar={onOpenCalendar} />

      {/* Statistik kartu besar semua level (bacaan sekali lewat, bukan
          tombol — angka "Studied" menyertakan totalnya). */}
      <StatCards stats={stats} />

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
