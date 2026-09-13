import React from "react";
import { CircleX, Clock } from "lucide-react";
import { formatDueExact, intervalUntilLabel } from "../lib/dueFormat.js";
import { t } from "../lib/i18n.js";

/**
 * Layar hasil. Tampilannya menyesuaikan mode sesi:
 *  - "srs"      → skor + breakdown + jadwal review BARU hasil sesi ini
 *  - "practice" → skor + breakdown + jadwal review SAAT INI (tidak berubah
 *                oleh sesi ini — App melampirkan `existingState`) + baris
 *                kecil "schedule unchanged" supaya tidak dikira bergeser
 *  - "weak"     → skor + breakdown + berapa kanji yang MASIH missed
 *                setelah sesi ini (`remainingMissed`, dihitung App dari
 *                stats pasca-sesi). Kalau masih ada yang missed, tombol
 *                utama berganti "Review again" (onReviewAgain) — sesi
 *                remedial bisa diulang langsung tanpa pulang ke daftar unit.
 */
export default function Result({ result, mode, activeUnit, onBackToUnits, onHome, onReviewAgain }) {
  const isWeak = mode === "weak";
  const isPractice = mode === "practice";

  const stampLabel = isWeak ? t("result.missed") : activeUnit;
  const backLabel = t("result.backToUnits");
  // Untuk SRS: state BARU hasil review. Untuk practice: state lama yang
  // tidak tersentuh. Keduanya dirender dengan panel "Next review in" yang
  // sama — hasil latihan bebas pun tetap informatif.
  const shownState = isPractice ? result.existingState : result.newState;
  // Weak review selesai tapi masih ada kanji missed (salah lagi / belum
  // ditebus) → tawarkan ulang sesi remedialnya. Angka datang async dari
  // IndexedDB; `typeof` guard menahan render tombol sampai siap.
  const canReviewAgain = isWeak && typeof result.remainingMissed === "number" && result.remainingMissed > 0 && !!onReviewAgain;

  return (
    <>
      <div className={`kd-result-stamp ${result.score < 0.7 ? "low" : ""}`}>
        <div className="kd-result-stamp-num">{Math.round(result.score * 100)}%</div>
        <div className="kd-result-stamp-label">{stampLabel}</div>
      </div>

      <div className="kd-result-breakdown">
        <div className="kd-rb-item">
          <div className="kd-rb-num" style={{ color: "var(--indigo)" }}>{result.correctCount}</div>
          <div className="kd-rb-label">{t("result.correct")}</div>
        </div>
        <div className="kd-rb-item">
          <div className="kd-rb-num" style={{ color: "var(--seal)" }}>{result.wrongCount}</div>
          <div className="kd-rb-label">{t("result.wrong")}</div>
        </div>
        <div className="kd-rb-item">
          <div className="kd-rb-num" style={{ color: "var(--ink-soft)" }}>{result.dontKnowCount}</div>
          <div className="kd-rb-label">{t("result.dontKnow")}</div>
        </div>
      </div>

      {shownState && shownState.nextReviewAt && (
        <div className="kd-next-review">
          <Clock size={14} style={{ marginBottom: 4 }} />
          <div>{t("result.next")}</div>
          {/* Durasi dihitung dari nextReviewAt persis (bukan stability):
              loop Relearning ber-jam tampil "6 hours", bukan "2.3 days". */}
          <div className="kd-next-review-num">{intervalUntilLabel(shownState.nextReviewAt)}</div>
          {/* Waktu jatuh tempo persis: tanggal + jam (pukul berapa). */}
          <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
            ({formatDueExact(shownState.nextReviewAt)})
          </div>
          {/* Menegaskan tanggal ini TIDAK digeser oleh sesi practice — tanpa
              ini panelnya identik dengan hasil review sungguhan. */}
          {isPractice && (
            <div className="kd-next-review-note">{t("result.scheduleUnchanged")}</div>
          )}
          {/* (t78) Kartu "Why the same review date?" DIHAPUS atas
              permintaan user — penjelasan jadwal awal (1/2/8 hari)
              cukup dibawa versi ringkasnya di help overlay seksi Quiz;
              layar hasil tetap bersih. */}
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
                ? t("result.stillMissed", { n: result.remainingMissed })
                : t("result.noMissed")
              : "…"}
          </div>
        </div>
      )}

      <div className="kd-btn-row">
        {/* Masih ada missed → "Review again" jadi tombol utama (aksi yang
            dianjurkan); "Back to Units" turun jadi sekunder. Tanpa missed
            (srs/practice/weak bersih) susunan tombol seperti biasa. */}
        {canReviewAgain && (
          <button className="kd-btn primary" onClick={onReviewAgain}>
            {t("result.reviewAgain")}
          </button>
        )}
        <button
          className={`kd-btn ${canReviewAgain ? "secondary" : "primary"}`}
          onClick={onBackToUnits}
        >
          {backLabel}
        </button>
        <button className="kd-btn secondary" onClick={onHome}>{t("common.home")}</button>
      </div>
    </>
  );
}
