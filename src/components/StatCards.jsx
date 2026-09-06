import React from "react";

/**
 * StatCards — panel statistik ringkas NON-INTERAKTIF di Home (semua level)
 * dan layar pilih unit (scope level itu). Tiga kartu angka besar ala
 * tampilan lama, kini read-only:
 *
 *   x/total  ·  Studied    (unit yang pernah dikerjakan / total unit)
 *   N        ·  Due now    (unit jatuh tempo)
 *   N        ·  Mastered   (unit stability >= 30 hari)
 *
 * Kartu BUKAN tombol: layar Progress sudah dihapus, tidak ada tujuan klik
 * — satu-satunya pintu jadwal tetap banner review di atasnya (→ overlay
 * kalender). Nilai 0 tetap ditampilkan (buka halaman = langsung terbaca
 * "mulai dari nol"), dan angka "Studied" selalu menyertakan totalnya
 * (mis. 9/151) supaya progres terasa proporsinya.
 *
 * Stat "missed kanji" sengaja TIDAK ada di sini: jumlah missed sudah
 * terbaca dari pill "✕ N" di tiap kartu unit (dan pill itulah pintunya ke
 * missed review) — menghitungnya dua kali hanya menambah derau.
 */
export default function StatCards({ stats }) {
  if (!stats) return null;
  return (
    <div className="kd-hero" role="group" aria-label="Study statistics">
      <div className="kd-hero-row">
        <div className="kd-stat studied">
          <div className="kd-stat-num">
            {stats.studied}/{stats.total}
          </div>
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
  );
}
