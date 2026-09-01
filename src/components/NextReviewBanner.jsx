import React from "react";
import { Clock, CalendarClock, Sparkles, ChevronRight } from "lucide-react";

/**
 * NextReviewBanner — ringkasan jadwal review user dalam satu baris banner.
 *
 * Tiga state:
 *   - belum belajar apa pun → "Start a unit to schedule your first review"
 *   - ada unit due          → "N units ready to review now"
 *   - ada jadwal            → "Next review: <unit> · in N days"
 *
 * State "due" dan "scheduled" BISA DIKLIK (via onJump) — langsung membuka
 * kuis untuk unit dengan nextReviewAt paling dekat (paling mendesak
 * direview). State "belum belajar" tidak punya unit untuk dibuka.
 */
export default function NextReviewBanner({ stats, onJump }) {
  const { studied, due, nextReviewDays, nextReviewUnit } = stats;

  if (studied === 0) {
    return (
      <div className="kd-next-review-banner">
        <Sparkles size={14} />
        <span>Start a unit to schedule your first review</span>
      </div>
    );
  }

  const canJump = typeof onJump === "function" && !!nextReviewUnit;

  if (due > 0) {
    return (
      <button
        className="kd-next-review-banner due kd-nrb-clickable"
        onClick={canJump ? () => onJump(nextReviewUnit) : undefined}
        disabled={!canJump}
      >
        <Clock size={14} />
        <span className="kd-nrb-strong">
          {due} unit{due === 1 ? "" : "s"} ready to review now
        </span>
        {canJump && <ChevronRight size={14} className="kd-nrb-chevron" />}
      </button>
    );
  }

  if (nextReviewUnit && nextReviewDays !== null) {
    const label =
      nextReviewDays <= 0
        ? "today"
        : nextReviewDays === 1
          ? "tomorrow"
          : `in ${nextReviewDays} days`;
    return (
      <button
        className="kd-next-review-banner kd-nrb-clickable"
        onClick={canJump ? () => onJump(nextReviewUnit) : undefined}
        disabled={!canJump}
      >
        <CalendarClock size={14} />
        <span className="kd-nrb-label">Next review</span>
        <span className="kd-nrb-unit">{nextReviewUnit}</span>
        <span className="kd-nrb-when">· {label}</span>
        {canJump && <ChevronRight size={14} className="kd-nrb-chevron" />}
      </button>
    );
  }

  return null;
}
