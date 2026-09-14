import React, { useState, useEffect } from "react";
import { CircleX, Trash2 } from "lucide-react";
import { unitStatus } from "../App.jsx";
import { intervalUntilLabel } from "../lib/dueFormat.js";
import { loadLevelKanji } from "../lib/dataLoader.js";
import { useDialogOverlay } from "../lib/useRouter.js";
import { t } from "../lib/i18n.js";
import StatCards from "./StatCards.jsx";

const STATUS_LABEL = {
  new: "unit.status.new",
  due: "unit.status.due",
  scheduled: "unit.status.scheduled",
  mastered: "unit.status.mastered",
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

  // (t92) SATU pintu aktivasi untuk SELURUH kartu unit. Keluhan user:
  // "area klik unit agak aneh, tidak bisa klik di bagian N-U" — kartu
  // tampak seperti satu tombol utuh (border + hover naik + bayangan),
  // tapi hanya tombol utama di BAWAH yang benar-benar bisa diklik; baris
  // judul "N5-U1" (bagian atas kartu) adalah zona mati. Perbaikan: klik
  // dipasang di KARTU (div pembungkus) — semua klik di dalam kartu,
  // termasuk pada tombol utama (event click menggelembung naik ke kartu),
  // masuk ke fungsi yang sama. Tombol utama tetap ada untuk fokus
  // keyboard (Tab + Enter memicu click → menggelembung ke kartu juga);
  // pill "✕ N" mencegah gelembung supaya kliknya tetap membuka weak
  // review, bukan unit. Guard kanjiList: klik saat data masih loading
  // diabaikan (menggantikan perlindungan disabled tombol untuk area baru).
  function activateUnit(unitId) {
    if (!kanjiList) return;
    const status = unitStatus(progress[unitId]);
    const dim = status === "scheduled";
    const drillGated = missedCountFor(unitId) > 0;
    if (dim || (status === "mastered" && drillGated)) {
      openDrillDialog(unitId);
    } else {
      onStartUnit(unitId);
    }
  }

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
      {/* (t88) Navigasi pulang: tombol "< Home" BERLABEL di TOPBAR
          (App.jsx, kiri, menggantikan brand di layar ini) — dikembalikan
          dari panah polos t83 atas permintaan (afordansi satu ketukan);
          tetap satu pola navigasi-kiri/aksi-kanan di semua sublayar. */}

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
        <span>{t("unit.section", { level })}</span>
        {showReset && stats.studied > 0 && (
          <button
            className="kd-reset-progress"
            onClick={openResetDialog}
            title={t("unit.reset.title")}
          >
            <Trash2 size={13} strokeWidth={2.25} /> {t("unit.reset")}
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
          return (
            <div
              key={unitId}
              className={`kd-unit-card ${status}${dim ? " dim" : ""}`}
              onClick={() => activateUnit(unitId)}
            >
              {/* Baris judul: judul unit + pill "✕ N" missed review (desain
                  lama pra-hanko, diminta user kembali). HANKO DIHAPUS
                  SEPENUHNYA (済/要/✕N stamp pojok tidak ada lagi): status
                  unit tetap terbaca dari label tombol utama + warna border
                  kartu; sinyal missed kini pill kecil di sebelah judul —
                  satu elemen, satu sinyal, dan merupakan TOMBOL: klik =
                  review missed unit itu. stopPropagation (t92): klik pill
                  TIDAK ikut mengaktivasi kartu. */}
              <div className="kd-unit-head">
                <div className="kd-unit-title">{unitId}</div>
                {missed > 0 && (
                  <button
                    type="button"
                    className="kd-unit-missed"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartWeakReview(unitId);
                    }}
                    title={t("unit.missed.title", { n: missed })}
                    aria-label={t("unit.missed.aria", { n: missed })}
                  >
                    <CircleX size={12} strokeWidth={2.25} /> {missed}
                  </button>
                )}
              </div>
              {/* Tombol utama = status + preview kanji — kini TOMBOL FOKUS
                  saja (klik di mana pun di kartu masuk ke activateUnit di
                  atas lewat gelembungan click). Tanpa onClick sendiri:
                  klik tombol memicu click pada tombol → menggelembung ke
                  kartu → satu kali aktivasi (tidak dobel). disabled tetap
                  menjaga semantik loading + gaya redupnya. */}
              <button
                type="button"
                className="kd-unit-main"
                disabled={!kanjiList}
                aria-label={`${unitId} — ${t(STATUS_LABEL[status])}`}
              >
                <div className="kd-unit-status">
                  {t(STATUS_LABEL[status])}
                  {status === "scheduled" &&
                    ` · ${t("unit.in", { label: intervalUntilLabel(state.nextReviewAt) })}`}
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
            <p className="kd-drill-confirm-text">{t("unit.dialog.resetTitle", { level })}</p>
            <p className="kd-drill-confirm-text">
              {t("unit.dialog.resetLine2")}
            </p>
            <p className="kd-drill-confirm-text">{t("unit.dialog.resetLine3")}</p>
            <div className="kd-btn-row">
              <button className="kd-btn secondary" onClick={closeResetDialogUI}>
                {t("common.cancel")}
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
                {t("common.delete")}
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
                    {t("unit.dialog.missed1", { n: pendingMissed })}
                  </p>
                  <p className="kd-drill-confirm-text">
                    {t("unit.dialog.missed2")}
                  </p>
                  <div className="kd-btn-row">
                    <button
                      className="kd-btn secondary"
                      onClick={closeDrillDialogUI}
                    >
                      {t("common.cancel")}
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
                      {t("unit.dialog.review")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="kd-drill-confirm-text">
                    {t("unit.dialog.notDue1")}
                  </p>
                  <p className="kd-drill-confirm-text">
                    {t("unit.dialog.notDue2")}
                  </p>
                  <div className="kd-btn-row">
                    <button
                      className="kd-btn secondary"
                      onClick={closeDrillDialogUI}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      className="kd-btn primary"
                      onClick={() => {
                        const unitId = pendingDrill;
                        dismissDrillDialog();
                        onStartUnit(unitId);
                      }}
                    >
                      {t("unit.dialog.practice")}
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
