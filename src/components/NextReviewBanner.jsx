import React from "react";
import { Clock, CalendarClock, CalendarDays, ChevronRight } from "lucide-react";
import { intervalUntilLabel } from "../lib/dueFormat.js";

/**
 * NextReviewBanner — ringkasan jadwal review user dalam satu baris banner.
 *
 * Tiga state — SEMUANYA tombol yang membuka overlay kalender review
 * (CalendarModal) lewat onOpenCalendar:
 *   - belum belajar apa pun → "Review calendar · Start a unit to schedule
 *     your first review" — kalender masih kosong, tapi affordance "banner
 *     ini = kalender" diperkenalkan sejak hari pertama (ikon kalender,
 *     label, chevron, hover)
 *   - ada unit due          → "N units ready to review now"
 *   - ada jadwal            → "Next review: <unit> · in N days/hours"
 *
 * Label jadwal memakai timestamp jatuh tempo persis (stats.nextReviewAt):
 * unit Relearning yang due 6 jam lagi tampil "in 6 hours", bukan "tomorrow"
 * (ceil hari lama menjemput pukul 00:00 esok meski jatuh tempo malam ini).
 *
 * Overlay menampilkan kalender + panel hari (jam due per unit); footer
 * overlay punya link "Study progress" ke layar Progress (riwayat, streak,
 * forecast) — satu pintu statistik, tanpa kartu stat di layar utama.
 * Kalau onOpenCalendar tidak diberikan (defensif — semua pemanggil
 * sekarang menyediakannya), banner state awal jatuh ke versi statis.
 */
export default function NextReviewBanner({ stats, onOpenCalendar }) {
  const { studied, due, nextReviewDays, nextReviewAt, nextReviewUnit } = stats;
  const canOpen = typeof onOpenCalendar === "function";

  if (studied === 0) {
    // State awal: teks lama "Start a unit to schedule your first review"
    // kini berlabel "Review calendar" + ikon + chevron dan BISA DIKLIK —
    // membuka kalender (kosong) supaya user tahu ke mana banner ini
    // mengarah, sambil tetap diarahkan memulai unit pertama.
    if (!canOpen) {
      return (
        <div className="kd-next-review-banner">
          <CalendarDays size={14} />
          <span>Start a unit to schedule your first review</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        className="kd-next-review-banner kd-nrb-clickable"
        onClick={onOpenCalendar}
      >
        <CalendarDays size={14} />
        <span className="kd-nrb-label">Review calendar</span>
        <span>Start a unit to schedule your first review</span>
        <ChevronRight size={14} className="kd-nrb-chevron" />
      </button>
    );
  }

  if (due > 0) {
    return (
      <button
        type="button"
        className="kd-next-review-banner due kd-nrb-clickable"
        onClick={onOpenCalendar}
        disabled={!canOpen}
      >
        <Clock size={14} />
        <span className="kd-nrb-strong">
          {due} unit{due === 1 ? "" : "s"} ready to review now
        </span>
        {canOpen && <ChevronRight size={14} className="kd-nrb-chevron" />}
      </button>
    );
  }

  if (nextReviewUnit && (nextReviewAt || nextReviewDays !== null)) {
    // Presisi jam dari timestamp jatuh tempo — fallback ke label hari lama
    // kalau pemanggil tidak menyertakan nextReviewAt.
    const label = nextReviewAt
      ? `in ${intervalUntilLabel(nextReviewAt)}`
      : nextReviewDays <= 0
        ? "today"
        : nextReviewDays === 1
          ? "tomorrow"
          : `in ${nextReviewDays} days`;
    return (
      <button
        type="button"
        className="kd-next-review-banner kd-nrb-clickable"
        onClick={onOpenCalendar}
        disabled={!canOpen}
      >
        <CalendarClock size={14} />
        <span className="kd-nrb-label">Next review</span>
        <span className="kd-nrb-unit">{nextReviewUnit}</span>
        <span className="kd-nrb-when">· {label}</span>
        {canOpen && <ChevronRight size={14} className="kd-nrb-chevron" />}
      </button>
    );
  }

  return null;
}
