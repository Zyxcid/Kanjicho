import React, { useState, useEffect } from "react";
import { CircleX, Trash2 } from "lucide-react";
import { unitStatus } from "../App.jsx";
import { intervalUntilLabel } from "../lib/dueFormat.js";
import { loadLevelKanji } from "../lib/dataLoader.js";
import { useDialogOverlay } from "../lib/useRouter.js";
import StatCards from "./StatCards.jsx";

const STATUS_LABEL = {
  new: "Not started",
  due: "Review now",
  scheduled: "Scheduled",
  mastered: "Mastered",
};

export default function UnitSelect({
  level,
  units,
  progress,
  stats,
  studyStats,
  onStartUnit,
  onOpenCalendar,
  onResetProgress,
  // Tombol reset disembunyikan default; toggle ada di modal Help (seksi
  // Progress). showReset=false → tombol tidak dirender sama sekali.
  showReset,
  weakChars,
  onStartWeakReview,
}) {
  // Data kanji lengkap level ini di-load di sini (bukan di App.jsx)
  // karena preview strip tiap kartu butuh isi kanjinya. loadLevelKanji()
  // sudah di-cache, jadi berpindah unit / kembali ke level yang sama tidak
  // fetch ulang.
  const [kanjiList, setKanjiList] = useState(null);
  // Unit yang menunggu popup: "scheduled" tanpa missed → konfirmasi
  // practice; "scheduled"/"mastered" DENGAN missed → gate "review dulu"
  // (practice terkunci sampai missed bersih). Terintegrasi history Back
  // (t65): Back saat popup terbuka menutup popup-nya, bukan berpindah
  // layar.
  const [pendingDrill, openDrillDialog, closeDrillDialogUI, dismissDrillDialog] = useDialogOverlay(null);
  // Dialog konfirmasi "Reset progress" (destruktif — hapus seluruh
  // progress level yang sedang dilihat). Back juga menutupnya (t65).
  const [confirmReset, openResetDialog, closeResetDialogUI] = useDialogOverlay(null);

  useEffect(() => {
    let cancelled = false;
    setKanjiList(null);
    loadLevelKanji(level).then((list) => {
      if (!cancelled) setKanjiList(list);
    });
    return () => {
      cancelled = true;
    };
  }, [level]);

  function previewFor(unitId) {
    if (!kanjiList) return "";
    return kanjiList
      .filter((k) => k.unit === unitId)
      .slice(0, 4)
      .map((k) => k.kanji)
      .join(" ");
  }

  // Berapa kanji unit ini yang sedang "missed" — untuk pill "✕ N" di
  // sebelah judul kartu unit. Kanji milik unit yang sedang DUE sudah
  // direset saat data dimuat (lihat App.jsx resetMissedForDueUnits):
  // review jatuh tempo menguji ulang seluruh unit sebagai pengukuran
  // bersih, jadi pill hanya muncul untuk unit yang belum jatuh tempo.
  function missedCountFor(unitId) {
    if (!kanjiList || !weakChars) return 0;
    return kanjiList.filter(
      (k) => k.unit === unitId && weakChars.has(k.kanji)
    ).length;
  }

  return (
    <>
      {/* (t83) Tombol "< Home" dihapus — navigasi pulang kini panah back
          di TOPBAR (App.jsx, kiri, menggantikan brand di layar ini);
          satu pola navigasi-kiri/aksi-kanan di semua sublayar. */}

      {/* Statistik kartu besar scope level ini (Studied x/total, Due now,
          Mastered — lihat StatCards.jsx): kartu streak global (api +
          angka tanpa label, t55) satu baris sama ukuran dengan kartu
          lain (t54), kartu "Due now"/"Next due" jadi pintu overlay
          kalender review ter-filter level ini (menggantikan banner yang
          dihapus). Dibaca dulu, sama seperti Home. */}
      <StatCards
        stats={stats}
        studyStats={studyStats}
        onOpenCalendar={onOpenCalendar}
      />

      {/* Judul seksi + tombol reset di ujung kanan (space-between, pola
          sama dengan judul Browse). Tombol hanya muncul kalau diaktifkan
          dari modal Help DAN ada progress yang bisa dihapus — tidak ada
          gunanya menawarkan reset pada level yang masih bersih. */}
      <div className="kd-section-title kd-section-title-row">
        <span>{level} Units</span>
        {showReset && stats.studied > 0 && (
          <button
            className="kd-reset-progress"
            onClick={openResetDialog}
            title={`Delete this level's progress: SRS schedule, quiz history and missed kanji. Other levels are not affected.`}
          >
            <Trash2 size={13} strokeWidth={2.25} /> Reset progress
          </button>
        )}
      </div>
      <div className="kd-unit-grid">
        {units.map((unitId) => {
          const state = progress[unitId];
          const status = unitStatus(state);
          // Hanya unit "scheduled" yang tampak redup: cue visual bahwa
          // membukanya hanyalah latihan bebas. Unit "mastered" tampil normal;
          // "new"/"due" justru paling menonjol karena itu yang dikerjakan.
          const dim = status === "scheduled";
          const missed = missedCountFor(unitId);
          // Practice hanya terbuka SETELAH missed kanji unit itu bersih:
          // unit dim/mastered yang masih punya missed → klik tombol utamanya
          // membuka popup "review dulu". Unit new/due tetap langsung membuka
          // kuis SRS (review jatuh tempo prioritas; kanji missed ikut
          // ditanyakan lagi di sana).
          const drillGated = missed > 0;
          return (
            <div key={unitId} className={`kd-unit-card ${status}${dim ? " dim" : ""}`}>
              {/* Baris judul: judul unit + pill "✕ N" missed review (desain
                  lama pra-hanko, diminta user kembali). HANKO DIHAPUS
                  SEPENUHNYA (済/要/✕N stamp pojok tidak ada lagi): status
                  unit tetap terbaca dari label tombol utama + warna border
                  kartu; sinyal missed kini pill kecil di sebelah judul —
                  satu elemen, satu sinyal, dan merupakan TOMBOL: klik =
                  review missed unit itu. */}
              <div className="kd-unit-head">
                <div className="kd-unit-title">{unitId}</div>
                {missed > 0 && (
                  <button
                    type="button"
                    className="kd-unit-missed"
                    onClick={() => onStartWeakReview(unitId)}
                    title={`Quiz the ${missed} kanji you missed in this unit — doesn't change your schedule`}
                    aria-label={`Review ${missed} missed kanji`}
                  >
                    <CircleX size={12} strokeWidth={2.25} /> {missed}
                  </button>
                )}
              </div>
              {/* Tombol utama = status + preview kanji. Klik unit dim →
                  konfirmasi practice; dim/mastered dengan missed → gate
                  "review dulu"; status lain langsung membuka kuis (mode
                  diderive di App.jsx startUnit). */}
              <button
                className="kd-unit-main"
                disabled={!kanjiList}
                onClick={() =>
                  (dim || (status === "mastered" && drillGated))
                    ? openDrillDialog(unitId)
                    : onStartUnit(unitId)
                }
              >
                <div className="kd-unit-status">
                  {STATUS_LABEL[status]}
                  {status === "scheduled" &&
                    ` · in ${intervalUntilLabel(state.nextReviewAt)}`}
                </div>
                <div className="kd-unit-preview">{kanjiList ? previewFor(unitId) : "…"}</div>
              </button>
            </div>
          );
        })}
      </div>

      {confirmReset && (
        <div className="kd-modal-overlay" onClick={closeResetDialogUI}>
          <div className="kd-modal kd-drill-confirm" onClick={(e) => e.stopPropagation()}>
            {/* Konfirmasi destruktif: sebutkan eksplisit apa saja yang
                terhapus supaya tidak dikira hanya jadwal SRS-nya. Klik di
                luar dialog = batal. */}
            <p className="kd-drill-confirm-text">Delete all {level} progress?</p>
            <p className="kd-drill-confirm-text">
              SRS schedule, quiz history and missed kanji for this level will be removed
            </p>
            <p className="kd-drill-confirm-text">other levels are not affected</p>
            <div className="kd-btn-row">
              <button className="kd-btn secondary" onClick={closeResetDialogUI}>
                Cancel
              </button>
              <button
                className="kd-btn danger"
                onClick={() => {
                  // Konsumsi entri overlay dulu ( sama seperti Cancel ),
                  // baru eksekusi — reset tidak menavigasi, jadi entri
                  // harus benar-benar dibuang dari history.
                  closeResetDialogUI();
                  onResetProgress(level);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDrill && (() => {
        // Popup ini punya dua wajah: unit masih punya missed kanji →
        // gate "review dulu"; tanpa missed → konfirmasi practice biasa.
        const pendingMissed = missedCountFor(pendingDrill);
        return (
          <div className="kd-modal-overlay">
            <div className="kd-modal kd-drill-confirm" onClick={(e) => e.stopPropagation()}>
              {pendingMissed > 0 ? (
                <>
                  {/* Dua kalimat pendek di dua baris terpisah (tanpa
                      em-dash — gaya user). */}
                  <p className="kd-drill-confirm-text">
                    This unit still has {pendingMissed} missed kanji
                  </p>
                  <p className="kd-drill-confirm-text">
                    practice opens again once they&apos;re cleared
                  </p>
                  <div className="kd-btn-row">
                    <button
                      className="kd-btn secondary"
                      onClick={closeDrillDialogUI}
                    >
                      Cancel
                    </button>
                    {/* Cukup "Review" tanpa angka — jumlah missed sudah
                        disebut di kalimat atasnya. dismiss ( bukan close ):
                        aksi ini langsung disusul navigasi ke kuis — entri
                        dialog basi digantikan entri kuis ( lihat
                        useRouter.navigate ). */}
                    <button
                      className="kd-btn primary"
                      onClick={() => {
                        const unitId = pendingDrill;
                        dismissDrillDialog();
                        onStartWeakReview(unitId);
                      }}
                    >
                      Review
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="kd-drill-confirm-text">
                    This unit isn&apos;t due yet
                  </p>
                  <p className="kd-drill-confirm-text">
                    practice won&apos;t change your review schedule
                  </p>
                  <div className="kd-btn-row">
                    <button
                      className="kd-btn secondary"
                      onClick={closeDrillDialogUI}
                    >
                      Cancel
                    </button>
                    <button
                      className="kd-btn primary"
                      onClick={() => {
                        const unitId = pendingDrill;
                        dismissDrillDialog();
                        onStartUnit(unitId);
                      }}
                    >
                      Practice
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}
