import React from "react";
import { ChevronRight, Flame } from "lucide-react";
import { intervalUntilLabel } from "../lib/dueFormat.js";

/**
 * intervalUntilLabel → bentuk ringkas untuk ANGKA kartu "Next due" ("6h").
 * Panel kartu sempit (~130px di ponsel), jadi "6 hours" dipadatkan;
 * "under a minute" dipetak ke "<1m". "now" dikembalikan null — tak mungkin
 * tampil bersamaan dengan due = 0 (unit yang jatuh tempo terhitung due),
 * jadi pemanggil jatuh ke varian "0 · Due now".
 */
function compactInterval(iso) {
  const label = intervalUntilLabel(iso);
  if (label === "now") return null;
  return label
    .replace("under a minute", "<1m")
    .replace(/ min$/, "m")
    .replace(/ hours?$/, "h")
    .replace(/ days?$/, "d");
}

/**
 * StatCards — panel statistik Home (semua level) dan layar pilih unit
 * (scope level itu), SATU BARIS horizontal kartu SAMA UKURAN:
 *
 *   [api + N] · N/total Studied · N Due now · N Mastered
 *
 * Dua keputusan user melekat di sini (menggantikan banner review yang
 * dihapus; t54 mengembalikan kartu streak):
 *   1. KARTU STREAK (t54: "logo api disertai angka, berukuran sama,
 *      satu baris"; t55: label dihapus — api sudah memberi konteks):
 *      angka hari beruntut + api inline, TANPA label teks — kartu
 *      keempat yang sama ukuran dan satu baris horizontal dengan
 *      Studied/Due/Mastered (desktop 4×1fr; ponsel TETAP satu baris 4
 *      kolom, font kompak). lit = kuis hari ini sudah (api menyala +
 *      angka gold), at-risk = streak nyata belum dikuis hari ini (api
 *      outline + angka seal), streak 0 = kartu tidak dirender (baris
 *      kembali 3 kartu). Keadaan via tooltip + aria-label — detail
 *      kalender tetap di overlay (titik hari aktif).
 *   2. Kartu "Due now" = pintu jadwal-review (dulu tugas banner), dan
 *      saat 0 due ia BERUBAH PERAN jadi kartu "Next due": angka besar
 *      menampilkan INTERVAL terdekat ("3h" / "2d", presisi jam — unit
 *      Relearning yang due 6 jam lagi tampil "6h", bukan "tomorrow"),
 *      label berganti "Next due". Klik = buka overlay kalender (Home:
 *      semua level; UnitSelect: ter-filter level itu). Saat ada yang due
 *      → aksen seal (angka, label, chevron) supaya urgensi menonjol;
 *      saat "Next due" → angka di-mute (informasional, bukan alarm).
 *      t55: kartu statistik tidak lagi punya garis tepi (dashed/solid
 *      dianggap tidak menarik) — border hanya MUNCUL saat tombol
 *      klikable di-hover; chevron tetap jadi penanda affordance.
 *      Bila onOpenCalendar tidak disediakan (defensif), kartu jatuh ke
 *      varian pasif tanpa chevron.
 *
 * Kartu Studied/Mastered tetap pasif. Angka "Studied" menyertakan
 * totalnya sebagai SUFIKS KECIL (mis. 15 besar + /151 kecil) supaya
 * proporsinya terbaca tanpa membuat angka lebar — di layar sempit angka
 * "15/151" satu ukuran pernah memaksa wrap di tengah angka dan merusak
 * kesejajaran kartu tetangganya.
 *
 * Stat "missed kanji" sengaja TIDAK ada di sini: jumlah missed sudah
 * terbaca dari pill di tiap kartu unit (dan pill itulah pintunya ke
 * missed review) — menghitungnya dua kali hanya menambah derau.
 */
export default function StatCards({ stats, studyStats, onOpenCalendar }) {
  if (!stats) return null;

  // Streak global (dari log kuis, lihat studyStats.js) — flame hanya
  // indikator: angka/detail tetap di overlay kalender.
  const streak = studyStats?.streak ?? 0;
  const streakDoneToday = studyStats?.doneToday ?? false;

  const canOpen = typeof onOpenCalendar === "function";
  const hasDue = stats.due > 0;

  // Varian "Next due": hanya saat tidak ada yang due DAN ada jadwal
  // terdekat — angka 0 sendirian tidak bilang apa-apa, interval terdekat
  // memberi tahu kapan angka itu akan berubah. Tanpa jadwal sama sekali
  // (fresh user) tetap "0 · Due now": belum ada yang bisa dijadwalkan.
  let nextCompact = null;
  if (!hasDue && stats.nextReviewAt) {
    nextCompact = compactInterval(stats.nextReviewAt);
  }
  const showNext = nextCompact !== null;

  // Kartu streak (t54 angka + api; t55 tanpa label — api sudah cukup
  // memberi konteks): ukuran sama dengan kartu lain, satu baris — hanya
  // saat streak > 0; keadaan via tooltip + warna angka/api.
  const showFlame = streak > 0;
  const flameTitle = streakDoneToday
    ? `${streak}-day streak — done today`
    : `${streak}-day streak — quiz today to keep it`;

  // Angka & label kartu due: dua peran — "N · Due now" (ada yang due)
  // atau "3h · Next due" (kosong, tampilkan jadwal terdekat).
  const dueNum = showNext ? nextCompact : stats.due;
  const dueLabel = showNext ? "Next due" : "Due now";

  const dueContent = (
    <>
      <div className="kd-stat-num">{dueNum}</div>
      <div className={`kd-stat-label${canOpen ? " kd-stat-label-action" : ""}`}>
        <span>{dueLabel}</span>
        {canOpen && <ChevronRight size={11} className="kd-stat-chevron" />}
      </div>
    </>
  );

  const dueTitle = hasDue
    ? `${stats.due} unit${stats.due === 1 ? "" : "s"} ready to review — see what's due and when`
    : showNext
      ? `No units due — next review in ${intervalUntilLabel(stats.nextReviewAt)}. Open the calendar`
      : "Open the review calendar";

  const dueAria = hasDue
    ? `Due now: ${stats.due} units — open review calendar`
    : showNext
      ? `Next review in ${intervalUntilLabel(stats.nextReviewAt)} — open review calendar`
      : "Due now: none — open review calendar";

  return (
    <div className="kd-hero" role="group" aria-label="Study statistics">
      <div className={`kd-hero-row${showFlame ? " count-4" : ""}`}>
        {showFlame && (
          // Tanpa label (t55): api + angka saja. role="img" + aria-label
          // supaya pembaca layar tidak hanya membaca "5" telanjang —
          // seluruh kartu dibacakan sebagai satu frasa streak.
          <div
            className={`kd-stat streak${streakDoneToday ? " lit" : " at-risk"}`}
            title={flameTitle}
            role="img"
            aria-label={flameTitle}
          >
            <div className="kd-stat-num">
              <Flame
                size={16}
                className="kd-streak-flame"
                fill={streakDoneToday ? "currentColor" : "none"}
              />
              {streak}
            </div>
          </div>
        )}
        <div className="kd-stat studied">
          <div className="kd-stat-num">
            {stats.studied}
            <span className="kd-stat-total">/{stats.total}</span>
          </div>
          <div className="kd-stat-label">Studied</div>
        </div>
        {canOpen ? (
          <button
            type="button"
            className={`kd-stat due kd-stat-action${hasDue ? " has-due" : ""}${showNext ? " next-due" : ""}`}
            onClick={onOpenCalendar}
            title={dueTitle}
            aria-label={dueAria}
          >
            {dueContent}
          </button>
        ) : (
          <div className={`kd-stat due${showNext ? " next-due" : ""}`}>{dueContent}</div>
        )}
        <div className="kd-stat mastered">
          <div className="kd-stat-num">{stats.mastered}</div>
          <div className="kd-stat-label">Mastered</div>
        </div>
      </div>
    </div>
  );
}
