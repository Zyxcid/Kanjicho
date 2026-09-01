import React from "react";
import { CircleX, Clock } from "lucide-react";

/**
 * Layar hasil. Tampilannya menyesuaikan mode sesi:
 *  - "srs"      → skor + breakdown + jadwal review BARU hasil sesi ini
 *  - "practice" → skor + breakdown + jadwal review SAAT INI (tidak berubah
 *                oleh sesi ini — App melampirkan `existingState`) + baris
 *                kecil "schedule unchanged" supaya tidak dikira bergeser
 *  - "weak"     → skor + breakdown + berapa kanji yang MASIH missed
 *                setelah sesi ini (`remainingMissed`, dihitung App dari
 *                stats pasca-sesi)
 */
export default function Result({ result, mode, activeUnit, onBackToUnits, onHome }) {
  const isWeak = mode === "weak";
  const isPractice = mode === "practice";

  const stampLabel = isWeak ? "Missed review" : activeUnit;
  const backLabel = "Back to Units";
  // Untuk SRS: state BARU hasil review. Untuk practice: state lama yang
  // tidak tersentuh. Keduanya dirender dengan panel "Next review in" yang
  // sama — hasil latihan bebas pun tetap informatif.
  const shownState = isPractice ? result.existingState : result.newState;

  return (
    <>
      <div className={`kd-result-stamp ${result.score < 0.7 ? "low" : ""}`}>
        <div className="kd-result-stamp-num">{Math.round(result.score * 100)}%</div>
        <div className="kd-result-stamp-label">{stampLabel}</div>
      </div>

      <div className="kd-result-breakdown">
        <div className="kd-rb-item">
          <div className="kd-rb-num" style={{ color: "var(--indigo)" }}>{result.correctCount}</div>
          <div className="kd-rb-label">Correct</div>
        </div>
        <div className="kd-rb-item">
          <div className="kd-rb-num" style={{ color: "var(--seal)" }}>{result.wrongCount}</div>
          <div className="kd-rb-label">Wrong</div>
        </div>
        <div className="kd-rb-item">
          <div className="kd-rb-num" style={{ color: "var(--ink-soft)" }}>{result.dontKnowCount}</div>
          <div className="kd-rb-label">Don't know</div>
        </div>
      </div>

      {shownState && (
        <div className="kd-next-review">
          <Clock size={14} style={{ marginBottom: 4 }} />
          <div>Next review in</div>
          <div className="kd-next-review-num">{shownState.stability.toFixed(1)} days</div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
            ({new Date(shownState.nextReviewAt).toLocaleDateString("en-US", { day: "numeric", month: "long" })})
          </div>
          {/* Menegaskan tanggal ini TIDAK digeser oleh sesi practice — tanpa
              ini panelnya identik dengan hasil review sungguhan. */}
          {isPractice && (
            <div className="kd-next-review-note">schedule unchanged</div>
          )}
        </div>
      )}

      {isWeak && (
        <div className="kd-next-review">
          <CircleX size={14} strokeWidth={2.25} style={{ marginBottom: 4 }} />
          <div className="kd-next-review-num" style={{ fontSize: 15 }}>
            {/* Angka datang async dari IndexedDB — "…" hanya tampil sesaat
                sebelum angka siap. */}
            {typeof result.remainingMissed === "number"
              ? result.remainingMissed > 0
                ? `${result.remainingMissed} kanji missed`
                : "No kanji missed"
              : "…"}
          </div>
        </div>
      )}

      <div className="kd-btn-row">
        <button className="kd-btn primary" onClick={onBackToUnits}>{backLabel}</button>
        <button className="kd-btn secondary" onClick={onHome}>Home</button>
      </div>
    </>
  );
}
