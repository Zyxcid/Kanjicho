import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { toDateStr, formatHHMM } from "../lib/studyStats.js";
import { t, localeOf } from "../lib/i18n.js";

/**
 * ReviewCalendar — kalender bulanan review (kd-cal) dengan panel hari
 * terpilih (kd-day-panel) sebagai seksi dalam kartu yang sama (t92),
 * dipakai di dua tempat:
 *   - CalendarModal : overlay dari klik kartu statistik Due now (default
 *                      hari ini).
 *   - ProgressView  : (kode layar lama, tidak lagi dipasang di App.)
 *
 * Kalender: angka seal = unit dijadwalkan review hari itu, angka + titik
 * GOLD = hari yang benar-benar dipakai belajar (≥ 1 kuis — t76: satu
 * warna dengan kartu streak). Klik tanggal → panel hari itu menampilkan
 * unit + JAM jatuh tempo persis (nextReviewAt tersimpan sebagai timestamp).
 * Baris overdue (jam sudah lewat) adalah tombol — onJump membuka kuisnya.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// (t89) Header hari dalam seminggu — kunci kamus "cal.weekdays" (string
// dipisah spasi, 7 label 2-huruf). Minggu tetap MULAI MINGGU di kedua
// bahasa (kalender Jepang; grid tidak bergeser — hanya labelnya berganti).
function weekdays() {
  return t("cal.weekdays").split(" ");
}

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

/** "Wed, Sep 3" — label hari ringkas (locale mengikuti bahasa aktif). */
export function shortDate(d) {
  return d.toLocaleDateString(localeOf(), { weekday: "short", month: "short", day: "numeric" });
}

export function units(n) {
  return n === 1 ? t("cal.unitOne", { n }) : t("cal.units", { n });
}

/** Jadwal review dari state SRS: [{unitId, at}] terurut waktu. `level`
 *  memfilter ke unit level itu (dipakai saat konteksnya per-level).
 *  (t78) Fallback prefix unitId ("N1-U3" → "N1") bila state in-memory
 *  belum memuat jlptLevel — record DB selalu memuatnya (kolom), tapi
 *  objek hasil reviewUnit() sesi berjalan tidak; tanpa fallback,
 *  kalender per-level kehilangan jadwal unit yang baru selesai dikuis. */
export function buildScheduleEntries(progress, level) {
  const out = [];
  for (const [unitId, state] of Object.entries(progress || {})) {
    if (!state || !state.nextReviewAt) continue;
    if (level && (state.jlptLevel || unitId.split("-")[0]) !== level) continue;
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
      {/* Kalender bulanan + panel hari — (t92) kini SATU kartu: dulu
          kd-day-panel adalah kotak kedua ber-border DASHED terpisah di
          bawah kartu kalender yang ber-border solid (keluhan user: "bagian
          border due terasa out of place" — dua kotak bersarang dengan dua
          gaya garis berbeda). Kedua-duanya dipakai selalu bersama, jadi
          panel hari menjadi SEKSI di dalam kartu kalender, dipisah satu
          garis solid tipis (bahasa garis "kertas" yang sama dengan grid
          genkouyoushi). Klik tanggal → panel detail hari itu. */}
      <div className="kd-cal">
        <div className="kd-cal-head">
          <span className="kd-cal-title">
            {anchor.toLocaleDateString(localeOf(), { month: "long", year: "numeric" })}
          </span>
          <div className="kd-cal-nav">
            {!isCurrentMonth && (
              <button className="kd-cal-today-btn" onClick={() => setAnchor(new Date(now.getFullYear(), now.getMonth(), 1))}>
                {t("cal.today")}
              </button>
            )}
            <button disabled={!canPrev} onClick={() => shiftMonth(-1)} aria-label={t("cal.prev")}>
              <ChevronLeft size={14} />
            </button>
            <button disabled={!canNext} onClick={() => shiftMonth(1)} aria-label={t("cal.next")}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="kd-cal-grid">
          {weekdays().map((w) => (
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
              // t76: hari dengan aktivitas kuis → kelas .active (angka gold,
              // satu warna dengan streak). Urutan kelas tidak penting;
              // prioritas warna diatur urutan rule CSS (lihat global.css).
              studied ? "active" : "",
              key === selected ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={key}
                className={cls}
                onClick={() => setSelected(key)}
                aria-label={`${shortDate(d)}${due ? ", " + t("cal.cellDue", { n: due }) : ""}${studied ? ", " + t("cal.cellStudied") : ""}`}
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

        {/* Detail hari terpilih (default hari ini): unit + jam jatuh tempo
            — seksi dalam kartu yang sama, di bawah garis pemisah. */}
        <div className="kd-day-panel">
          <div className="kd-day-panel-head">
            <span className="kd-day-panel-title">{isToday ? t("cal.today") : shortDate(selectedDate)}</span>
            {dayRows.length > 0 && <span className="kd-day-panel-count">{units(dayRows.length)}</span>}
          </div>
          {dayRows.length === 0 ? (
            <p className="kd-day-empty">{isToday ? t("cal.empty.today") : t("cal.empty.day")}</p>
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
                    {overdue && <span className="kd-day-overdue">{t("cal.overdue")}</span>}
                  </>
                );
                return overdue ? (
                  <button
                    key={e.unitId}
                    className="kd-day-row"
                    onClick={() => onJump && onJump(e.unitId)}
                    title={t("cal.reviewNow", { unit: e.unitId })}
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
              <Check size={12} /> {activityCount === 1 ? t("cal.quizzesOne") : t("cal.quizzes", { n: activityCount })}{" "}
              {isToday ? t("cal.todayWord") : t("cal.thisDayWord")}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
