import React from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import StatCards from "./StatCards.jsx";
import { t } from "../lib/i18n.js";

/**
 * Badge tiap kartu level di Home, mencerminkan progres nyata user:
 *   - mastered == total → "Mastered" (gold)
 *   - due > 0           → "N due" (seal)
 *   - studied > 0       → "studied/total" (indigo)
 *   - else              → "New" (muted)
 */
function levelBadge(stats) {
  if (!stats) return { label: t("home.badge.new"), variant: "muted" };
  if (stats.total > 0 && stats.mastered === stats.total) {
    return { label: t("home.badge.mastered"), variant: "gold" };
  }
  if (stats.due > 0) {
    return { label: t("home.badge.due", { n: stats.due }), variant: "seal" };
  }
  if (stats.studied > 0) {
    return { label: `${stats.studied}/${stats.total}`, variant: "indigo" };
  }
  return { label: t("home.badge.new"), variant: "muted" };
}

/**
 * Home — layar utama: panel statistik kartu besar, lalu tombol Browse
 * (sistem kd-action-row: ikon + judul + subteks + chevron), baru grid
 * level.
 *
 * Banner review DIHAPUS (keputusan user — teksnya terlalu panjang dan
 * jaraknya ke Browse terasa jauh): tugasnya diambil alih kartu "Due
 * now" di hero (klik = overlay kalender review, lihat StatCards.jsx),
 * sehingga statistik langsung bersANDING dengan Browse tanpa baris
 * aksi ekstra. Kartu streak (api + angka, tanpa label — t55) kembali
 * tampil sebagai kartu keempat yang sama ukuran, satu baris horizontal
 * dengan kartu lain (t54). Progres per level tetap terbaca dari badge
 * tiap kartu level di bawah.
 */
export default function Home({
  levelIds,
  getLevelMeta,
  getLevelStats,
  onOpenLevel,
  onBrowse,
  stats,
  studyStats,
  onOpenCalendar,
}) {
  return (
    <>
      {/* Statistik kartu besar semua level — kartu streak (api + angka
          tanpa label, hanya saat streak > 0) satu baris sama ukuran
          dengan Studied / Due / Mastered; kartu "Due now"/"Next due"
          adalah pintu jadwal review (klik = overlay kalender,
          menggantikan banner lama). */}
      <StatCards
        stats={stats}
        studyStats={studyStats}
        onOpenCalendar={onOpenCalendar}
      />

      {/* Entry ke perpustakaan kanji lengkap (semua level) — kini langsung
          di bawah statistik. */}
      <div className="kd-browse-entry-row">
        <button className="kd-action-row kd-browse-entry" onClick={onBrowse}>
          <span className="kd-ar-icon">
            <BookOpen size={16} />
          </span>
          <span className="kd-ar-body">
            <span className="kd-ar-title">{t("home.browse.title")}</span>
            <span className="kd-ar-small">{t("home.browse.small")}</span>
          </span>
        </button>
      </div>

      <div className="kd-section-title">{t("home.levels")}</div>
      <div className="kd-level-grid">
        {levelIds.map((level) => {
          const meta = getLevelMeta(level);
          const badge = levelBadge(getLevelStats ? getLevelStats(level) : null);
          return (
            <button key={level} className="kd-level-card ready" onClick={() => onOpenLevel(level)}>
              <span className={`kd-level-badge ${badge.variant}`}>{badge.label}</span>
              <div className="kd-level-name">{level}</div>
              <div className="kd-level-count">
                {meta.units === 1
                  ? t("home.levelCountOne", { kanji: meta.total, units: meta.units })
                  : t("home.levelCount", { kanji: meta.total, units: meta.units })}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
