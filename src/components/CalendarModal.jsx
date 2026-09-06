import React, { useEffect } from "react";
import { X } from "lucide-react";
import ReviewCalendar from "./ReviewCalendar.jsx";

/**
 * CalendarModal — overlay kalender review (kd-cal + kd-day-panel, default
 * hari ini), dibuka dari klik banner review di Home/UnitSelect. User melihat
 * dulu unit apa saja yang due beserta jamnya, baru memilih — bukan langsung
 * dilempar ke kuis unit yang belum dikenalnya.
 *
 * Tutup lewat tombol X, klik backdrop, atau Escape. Klik baris overdue →
 * onJump (App menutup overlay lalu membuka kuis unit itu).
 *
 * Footer "Study progress" sudah dihapus bersama layar Progress — statistik
 * ringkas (streak, studied, due, mastered, missed) kini tampil sebagai chip
 * non-interaktif langsung di Home/UnitSelect, bukan satu layar khusus.
 */
export default function CalendarModal({ level, entries, activity, onClose, onJump }) {
  // Escape menutup overlay — keydown di window, modal dipasang paling atas.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="kd-modal-overlay" onClick={onClose}>
      <div className="kd-modal kd-cal-modal" onClick={(e) => e.stopPropagation()}>
        <button className="kd-modal-close" onClick={onClose} aria-label="Close" autoFocus>
          <X size={18} />
        </button>

        <div className="kd-cal-modal-title">Review calendar</div>
        <div className="kd-cal-modal-sub">{level ? `${level} units` : "All levels"}</div>

        <ReviewCalendar entries={entries} activity={activity} onJump={onJump} />
      </div>
    </div>
  );
}
