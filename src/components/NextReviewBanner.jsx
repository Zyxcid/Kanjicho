import React from "react";
import { Clock, CalendarClock, Sparkles } from "lucide-react";

/**
 * NextReviewBanner — shows the user's review schedule at a glance.
 *
 * Three states:
 *   - nothing studied yet → "Start a unit to schedule your first review"
 *   - units are due now      → "N units ready to review now"
 *   - reviews scheduled      → "Next review: <unit> · in N days"
 *
 * This replaces the old static "Not started" number with actionable timing.
 */
export default function NextReviewBanner({ stats }) {
  const { studied, due, nextReviewDays, nextReviewUnit } = stats;

  if (studied === 0) {
    return (
      <div className="kd-next-review-banner">
        <Sparkles size={14} />
        <span>Start a unit to schedule your first review</span>
      </div>
    );
  }

  if (due > 0) {
    return (
      <div className="kd-next-review-banner due">
        <Clock size={14} />
        <span className="kd-nrb-strong">
          {due} unit{due === 1 ? "" : "s"} ready to review now
        </span>
      </div>
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
      <div className="kd-next-review-banner">
        <CalendarClock size={14} />
        <span className="kd-nrb-label">Next review</span>
        <span className="kd-nrb-unit">{nextReviewUnit}</span>
        <span className="kd-nrb-when">· {label}</span>
      </div>
    );
  }

  return null;
}
