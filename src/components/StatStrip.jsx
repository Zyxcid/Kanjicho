import React from "react";

/**
 * StatStrip — baris statistik ringkas NON-INTERAKTIF di Home dan layar pilih
 * unit; satu-satunya tempat statistik tampil sejak layar Progress dihapus.
 * Chip kecil: ikon + nilai + label.
 *
 * Pemanggil menyaring itemnya: chip yang bernilai nol (streak, due,
 * mastered, missed) tidak dikirim sama sekali supaya baris tetap bersih di
 * hari pertama — hanya chip "units studied" yang selalu tampil karena
 * totalnya sendiri adalah informasi ("0/26" = mulai dari nol).
 *
 * Chip sengaja BUKAN tombol: dulu baris kartu stat adalah pintu ke layar
 * Progress, kini statistik cukup dibaca sekali lewat — satu-satunya pintu
 * jadwal tetap banner review di atasnya (→ overlay kalender).
 */
export default function StatStrip({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="kd-stat-strip">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <span
            key={it.label}
            className={`kd-stat-chip${it.variant ? ` ${it.variant}` : ""}`}
          >
            <Icon size={13} strokeWidth={2.25} />
            <b>{it.value}</b>
            <span className="kd-stat-chip-label">{it.label}</span>
          </span>
        );
      })}
    </div>
  );
}
