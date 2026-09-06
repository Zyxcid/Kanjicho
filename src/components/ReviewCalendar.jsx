import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { toDateStr, formatHHMM } from "../lib/studyStats.js";

/**
 * ReviewCalendar — kalender bulanan review (kd-cal) digabung panel hari
 * terpilih (kd-day-panel), dipakai di dua tempat:
 *   - CalendarModal : overlay dari klik banner review (default hari ini).
 *   - ProgressView  : bagian tengah layar Progress penuh.
 *
 * Kalender: angka seal = unit dijadwalkan review hari itu, titik indigo =
 * hari pernah belajar. Klik tanggal → panel hari itu menampilkan unit +
 * JAM jatuh tempo persis (nextReviewAt tersimpan sebagai timestamp).
 * Baris overdue (jam sudah lewat) adalah tombol — onJump membuka kuisnya.
 */

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]; // minggu mulai Minggu (kalender Jepang/Indonesia)
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function monthKey(d) {
  return d.getFullYear() * 12 + d.getMonth();
}

/** "Wed, Sep 3" — label hari ringkas (en-US, konsisten dgn UI app). */
export function shortDate(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function units(n) {
  return `${n} ${n === 1 ? "unit" : "units"}`;
}

/** Jadwal review dari state SRS: [{unitId, at}] terurut waktu. `level`
 *  memfilter ke unit level itu (dipakai saat konteksnya per-level). */
export function buildScheduleEntries(progress, level) {
  const out = [];
  for (const [unitId, state] of Object.entries(progress || {})) {
    if (!state || !state.nextReviewAt) continue;
    if (level && state.jlptLevel !== level) continue;
    out.push({ unitId, at: new Date(state.nextReviewAt) });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

export default function ReviewCalendar({ entries, activity, onJump }) {
  // "Sekarang" dibekukan sekali per pemasangan komponen: penentuan overdue
  // tidak bergeser sendiri selama layar/modal terbuka (angka berubah saat
  // data progress berubah — selesai kuis → App re-render dengan state baru).
  const now = useMemo(() => new Date(), []);
  const todayStart = startOfDay(now);
  const today = toDateStr(now);

  // Bulan yang sedang dilihat + tanggal terpilih (default: hari ini).
  const [anchor, setAnchor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(today);

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

  // ---- Grid kalender bulan anchor ----
  const cells = useMemo(() => {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const lead = new Date(y, m, 1).getDay(); // 0 = Minggu
    const count = new Date(y, m + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= count; d++) out.push(new Date(y, m, d));
    return out;
  }, [anchor]);

  // Batas navigasi bulan: dari bulan aktivitas/jadwal terawal sampai bulan
  // jadwal terjauh (selalu mencakup bulan ini). Mencegah menjelajah bulan
  // kosong tanpa ujung.
  const navBounds = useMemo(() => {
    let minDay = today;
    let maxDay = today;
    if (activity) {
      for (const day of activity.keys()) {
        if (day < minDay) minDay = day;
        if (day > maxDay) maxDay = day;
      }
    }
    for (const e of entries) {
      const day = toDateStr(e.at);
      if (day < minDay) minDay = day;
      if (day > maxDay) maxDay = day;
    }
    return { minDay, maxDay };
  }, [activity, entries, today]);

  const canPrev = monthKey(anchor) > monthKey(new Date(`${navBounds.minDay}T00:00:00`));
  const canNext = monthKey(anchor) < monthKey(new Date(`${navBounds.maxDay}T00:00:00`));
  const isCurrentMonth = monthKey(anchor) === monthKey(todayStart);

  function shiftMonth(delta) {
    setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
  }

  // ---- Panel hari terpilih ----
  const selectedDate = new Date(`${selected}T00:00:00`);
  const isToday = selected === today;

  // Hari ini: SEMUA tunggakan (nextReviewAt sudah lewat, dari hari apa pun)
  // ditambah unit yang jatuh tempo lagi hari ini. Hari lain: unit yang
  // dijadwalkan persis hari itu (hari lampau = backlog yang belum direview).
  const dayRows = useMemo(() => {
    if (isToday) {
      const tomorrow = addDays(todayStart, 1);
      return entries.filter((e) => e.at < tomorrow);
    }
    return dueByDay.get(selected) || [];
  }, [entries, dueByDay, isToday, selected, todayStart]);

  const activityCount = (activity && activity.get(selected)) || 0;

  return (
    <>
      {/* Kalender bulanan: klik tanggal → panel detail (jam review hari itu). */}
      <div className="kd-cal">
        <div className="kd-cal-head">
          <span className="kd-cal-title">
            {anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <div className="kd-cal-nav">
            {!isCurrentMonth && (
              <button className="kd-cal-today-btn" onClick={() => setAnchor(new Date(now.getFullYear(), now.getMonth(), 1))}>
                Today
              </button>
            )}
            <button disabled={!canPrev} onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={14} />
            </button>
            <button disabled={!canNext} onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="kd-cal-grid">
          {WEEKDAYS.map((w) => (
            <span key={w} className="kd-cal-weekday">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`empty-${i}`} className="kd-cal-cell empty" aria-hidden="true" />;
            const key = toDateStr(d);
            const due = (dueByDay.get(key) || []).length;
            const studied = activity ? activity.has(key) : false;
            const cls = [
              "kd-cal-cell",
              d < todayStart ? "past" : "",
              key === today ? "today" : "",
              key === selected ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={key}
                className={cls}
                onClick={() => setSelected(key)}
                aria-label={`${shortDate(d)}${due ? `, ${units(due)} due` : ""}${studied ? ", studied" : ""}`}
              >
                <span className="kd-cal-daynum">{d.getDate()}</span>
                <span className="kd-cal-marks">
                  {due > 0 && <span className="kd-cal-due">{due}</span>}
                  {studied && <span className="kd-cal-study-dot" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail hari terpilih (default hari ini): unit + jam jatuh tempo. */}
      <div className="kd-day-panel">
        <div className="kd-day-panel-head">
          <span className="kd-day-panel-title">{isToday ? "Today" : shortDate(selectedDate)}</span>
          {dayRows.length > 0 && <span className="kd-day-panel-count">{units(dayRows.length)}</span>}
        </div>
        {dayRows.length === 0 ? (
          <p className="kd-day-empty">{isToday ? "Nothing due today" : "No reviews due this day"}</p>
        ) : (
          <div className="kd-day-list">
            {dayRows.map((e) => {
              // Overdue = waktunya sudah lewat → bisa langsung direview.
              const overdue = e.at <= now;
              const wasEarlierDay = e.at < todayStart;
              const when = (
                <>
                  {wasEarlierDay && <span>{shortDate(e.at)}</span>}
                  <span>{formatHHMM(e.at)}</span>
                  {overdue && <span className="kd-day-overdue">overdue</span>}
                </>
              );
              return overdue ? (
                <button
                  key={e.unitId}
                  className="kd-day-row"
                  onClick={() => onJump && onJump(e.unitId)}
                  title={`Review ${e.unitId} now`}
                >
                  <span className="kd-day-unit">{e.unitId}</span>
                  <span className="kd-day-when">
                    {when}
                    <ChevronRight size={13} className="kd-day-chevron" />
                  </span>
                </button>
              ) : (
                <div key={e.unitId} className="kd-day-row">
                  <span className="kd-day-unit">{e.unitId}</span>
                  <span className="kd-day-when">{when}</span>
                </div>
              );
            })}
          </div>
        )}
        {activityCount > 0 && (
          <div className="kd-day-activity">
            <Check size={12} /> {activityCount === 1 ? "1 quiz completed" : `${activityCount} quizzes completed`}{" "}
            {isToday ? "today" : "this day"}
          </div>
        )}
      </div>
    </>
  );
}
