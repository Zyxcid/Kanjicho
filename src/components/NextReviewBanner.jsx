import React from "react";
import { Clock, CalendarClock, Sparkles, ChevronRight } from "lucide-react";

/**
 * NextReviewBanner — shows the user's review schedule at a glance.
 *
 * Three states:
 *   - nothing studied yet → "Start a unit to schedule your first review"
 *   - units are due now      → "N units ready to review now"
 *   - reviews scheduled      → "Next review: <unit> · in N days"
 *
 * This replaces the old static "Not started" number with actionable timing.
 *
 * The "due" and "scheduled" states are CLICKABLE (via onJump) -- they jump
 * straight into the quiz for `nextReviewUnit`, i.e. whichever started unit
 * has the EARLIEST next_review_at (the one closest to being forgotten if
 * already due, or the very next one coming up otherwise). The "nothing
 * studied yet" state has no unit to jump to, so it stays a plain message.
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
