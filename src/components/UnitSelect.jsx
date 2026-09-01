import React, { useState, useEffect } from "react";
import { ChevronLeft, CircleX } from "lucide-react";
import { unitStatus, daysUntil } from "../App.jsx";
import { loadLevelKanji } from "../lib/dataLoader.js";
import NextReviewBanner from "./NextReviewBanner.jsx";

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
  onBack,
  onStartUnit,
  onJumpToNextReview,
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
  // (practice terkunci sampai missed bersih).
  const [pendingDrill, setPendingDrill] = useState(null);

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

  // Berapa kanji unit ini yang sedang "missed" — untuk pill di kartu unit.
  function missedCountFor(unitId) {
    if (!kanjiList || !weakChars) return 0;
    return kanjiList.filter(
      (k) => k.unit === unitId && weakChars.has(k.kanji)
    ).length;
  }

  return (
    <>
      <button className="kd-back" onClick={onBack}>
        <ChevronLeft size={16} /> Home
      </button>

      <div className="kd-hero">
        <div className="kd-hero-row">
          <div className="kd-stat studied">
            <div className="kd-stat-num">{stats.studied}</div>
            <div className="kd-stat-label">Studied</div>
          </div>
          <div className="kd-stat due">
            <div className="kd-stat-num">{stats.due}</div>
            <div className="kd-stat-label">Due now</div>
          </div>
          <div className="kd-stat mastered">
            <div className="kd-stat-num">{stats.mastered}</div>
            <div className="kd-stat-label">Mastered</div>
          </div>
        </div>
      </div>

      <NextReviewBanner stats={stats} onJump={onJumpToNextReview} />

      <div className="kd-section-title">{level} Units</div>
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
              {status === "mastered" && <div className="kd-hanko gold">済</div>}
              {status === "due" && <div className="kd-hanko">要</div>}
              {/* Baris judul: judul unit kiri + pill "✕ N" di ujung kanan
                  (space-between). Pill tombol TERPISAH dari kd-unit-main
                  karena tombol tidak boleh nested. */}
              <div className="kd-unit-head">
                <div className="kd-unit-title">{unitId}</div>
                {missed > 0 && (
                  <button
                    className="kd-unit-missed"
                    onClick={() => onStartWeakReview(unitId)}
                    title={`Quiz the ${missed} kanji you missed in this unit — doesn't change your schedule`}
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
                    ? setPendingDrill(unitId)
                    : onStartUnit(unitId)
                }
              >
                <div className="kd-unit-status">
                  {STATUS_LABEL[status]}
                  {status === "scheduled" && ` · in ${daysUntil(state.nextReviewAt)} days`}
                </div>
                <div className="kd-unit-preview">{kanjiList ? previewFor(unitId) : "…"}</div>
              </button>
            </div>
          );
        })}
      </div>

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
                      onClick={() => setPendingDrill(null)}
                    >
                      Cancel
                    </button>
                    {/* Cukup "Review" tanpa angka — jumlah missed sudah
                        disebut di kalimat atasnya. */}
                    <button
                      className="kd-btn primary"
                      onClick={() => {
                        const unitId = pendingDrill;
                        setPendingDrill(null);
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
                      onClick={() => setPendingDrill(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="kd-btn primary"
                      onClick={() => {
                        const unitId = pendingDrill;
                        setPendingDrill(null);
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
