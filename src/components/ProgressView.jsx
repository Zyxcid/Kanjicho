import React, { useMemo } from "react";
import { ChevronLeft, Flame, Trophy, CalendarDays } from "lucide-react";
import { toDateStr, formatHHMM } from "../lib/studyStats.js";
import ReviewCalendar, { buildScheduleEntries, startOfDay, addDays, shortDate, units } from "./ReviewCalendar.jsx";

/**
 * ProgressView — layar kalender & statistik belajar, dibuka dengan mengklik
 * kartu stat (Studied / Due now / Mastered / streak) di Home atau UnitSelect.
 *
 * Tiga bagian:
 *   1. Strip statistik riwayat : Days studied · Current streak · Best streak
 *      (streak dihitung dari quizAttempts — lihat lib/studyStats.js).
 *   2. ReviewCalendar          : kalender bulanan + panel hari terpilih —
 *      unit yang due beserta JAM-nya, baris overdue bisa diklik untuk
 *      langsung mereview (komponen yang sama dipakai overlay CalendarModal
 *      dari klik banner review).
 *   3. Coming up (2 minggu)   : prakiraan review per hari dengan jam; chip
 *      overdue (waktunya sudah lewat) bisa diklik untuk lompat ke kuisnya.
 *
 * Prop `level` (route #/progress/N5) memfilter jadwal review ke unit level
 * itu — angka kartu stat UnitSelect dan kalender tetap sejalan. Statistik
 * streak/hari belajar selalu global: kebiasaan belajar tidak per-level.
 */

const FORECAST_DAYS = 14;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Label baris prakiraan: Today / Tomorrow / tanggal pendek. */
function dayLabel(date, todayStart) {
  const diff = Math.round((startOfDay(date) - todayStart) / MS_PER_DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return shortDate(date);
}

export default function ProgressView({ studyStats, progress, level, stats, backLabel, onBack, onJump }) {
  // "Sekarang" dibekukan sekali per kunjungan layar: penentuan overdue tidak
  // bergeser sendiri saat layar terbuka lama (angka berubah saat data
  // progress berubah — selesai kuis → App re-render dengan state baru).
  const now = useMemo(() => new Date(), []);
  const todayStart = startOfDay(now);

  // Jadwal review (dari state SRS di memori), ter-filter per level.
  const entries = useMemo(() => buildScheduleEntries(progress, level), [progress, level]);

  // Kunci hari (lokal) → daftar unit yang dijadwalkan hari itu.
  const dueByDay = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const day = toDateStr(e.at);
      const list = map.get(day);
      if (list) list.push(e);
      else map.set(day, [e]);
    }
    return map;
  }, [entries]);

  // ---- Prakiraan 2 minggu ----
  const forecast = useMemo(() => {
    const rows = [];
    for (let i = 0; i < FORECAST_DAYS; i++) {
      const date = addDays(todayStart, i);
      const key = toDateStr(date);
      const list =
        i === 0
          ? entries.filter((e) => e.at < addDays(todayStart, 1)) // hari ini = overdue + sisa hari ini
          : dueByDay.get(key) || [];
      if (list.length > 0) rows.push({ key, date, list });
    }
    const horizonStart = addDays(todayStart, FORECAST_DAYS);
    const moreAfter = entries.filter((e) => e.at >= horizonStart).length;
    return { rows, moreAfter, horizonStart };
  }, [entries, dueByDay, todayStart]);

  return (
    <>
      <button className="kd-back" onClick={onBack}>
        <ChevronLeft size={16} /> {backLabel}
      </button>

      <div className="kd-section-title">Progress</div>
      <div className="kd-progress-sub">
        {level ? `${level} units` : "All levels"} · {stats.studied}/{stats.total} studied ·{" "}
        {stats.due} due now · {stats.mastered} mastered
      </div>

      {/* Riwayat belajar: angka yang diminta user — sudah berapa hari
          belajar, streak sekarang, dan rekor streak terpanjang. */}
      <div className="kd-hero">
        <div className="kd-hero-row">
          <div className="kd-stat studied">
            <div className="kd-stat-num">
              <CalendarDays size={16} className="kd-stat-flame" /> {studyStats.daysStudied}
            </div>
            <div className="kd-stat-label">Days studied</div>
          </div>
          <div className="kd-stat current">
            <div className="kd-stat-num">
              <Flame size={16} className="kd-stat-flame" fill={studyStats.doneToday ? "currentColor" : "none"} />{" "}
              {studyStats.streak}
            </div>
            <div className="kd-stat-label">Current streak</div>
          </div>
          <div className="kd-stat mastered">
            <div className="kd-stat-num">
              <Trophy size={16} className="kd-stat-flame" /> {studyStats.longestStreak}
            </div>
            <div className="kd-stat-label">Best streak</div>
          </div>
        </div>
      </div>

      {/* Kalender + panel hari (komponen bersama dengan overlay banner). */}
      <ReviewCalendar entries={entries} activity={studyStats.activity} onJump={onJump} />

      <div className="kd-section-title kd-section-title-row">
        <span>Coming up</span>
        <small className="kd-title-note">next 2 weeks</small>
      </div>
      <div className="kd-forecast">
        {forecast.rows.length === 0 ? (
          <p className="kd-day-empty">
            {stats.studied === 0
              ? "Start a unit to schedule your first review"
              : "No reviews scheduled in the next 2 weeks"}
          </p>
        ) : (
          <>
            {forecast.rows.map(({ key, date, list }) => (
              <div key={key} className="kd-forecast-row">
                <span className="kd-forecast-day">{dayLabel(date, todayStart)}</span>
                <div className="kd-forecast-chips">
                  {list.map((e) => {
                    const actionable = e.at <= now; // hanya tunggakan yang bisa dilompati
                    const chip = (
                      <>
                        {e.unitId} <span className="kd-chip-time">{formatHHMM(e.at)}</span>
                      </>
                    );
                    return actionable ? (
                      <button
                        key={e.unitId}
                        className="kd-chip late"
                        onClick={() => onJump(e.unitId)}
                        title={`Review ${e.unitId} now`}
                      >
                        {chip}
                      </button>
                    ) : (
                      <span key={e.unitId} className="kd-chip">
                        {chip}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
            {forecast.moreAfter > 0 && (
              <p className="kd-forecast-more">
                +{units(forecast.moreAfter)} after {shortDate(forecast.horizonStart)}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
