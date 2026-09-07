import React, { useEffect, useState } from "react";
import { loadComponents } from "../lib/components.js";

/**
 * ComponentBreakdown — "persamaan komponen" satu kanji, dari struktur
 * kvg:element KanjiVG (scripts/build_components.py, t59).
 *
 * Ditampilkan DI BAWAH kotak KanjiVG: di layar kuis setelah reveal
 * (variant="quiz") dan di modal Browse di bawah StrokePlayer
 * (variant="browse"). Kanji tanpa dekomposisi di data KanjiVG
 * (~11%, mis. 食・雨・行) → section tidak dirender sama sekali.
 *
 * Susunan: baris chip komponen level-1 yang dipisah operator "+"
 * (時 = 日 + 寺); tiap chip = kolom dengan glyph (Shippori Mincho,
 * sama dengan tampilan kanji app), arti (bila komponen adalah kanji
 * di DB), dan — mode browse — rentang goresannya di kanji induk
 * ("1–4"). Sub-komponen (寺 = 土・寸) tampil sebagai strip mini di
 * bawah chip induknya (mode browse saja).
 *
 * Penanda:
 *  - RADIKAL SEMANTIK (kvg:radical — bagian pembawa ARTI kanji itu):
 *    titik indigo di pojok chip + tooltip.
 *  - KOMPONEN FONETIK (kvg:phon — pembawa BACAAN, mis. 寺 → ジ di 時):
 *    akhiran "phon" di baris rentang + tooltip.
 *
 * Sinkron animasi (prop revealed = jumlah goresan yang sudah
 * tergambar): chip goresannya BELUM tergambar tampak redup; chip yang
 * goresannya SEDANG digambar diberi ring indigo — persamaan
 * "terisi" mengikuti animasi KanjiVG di atasnya. revealed = null →
 * semua chip tampil penuh (keadaan selesai/idle).
 *
 * Klik chip (hanya mode browse, hanya komponen yang ada di DB —
 * prop onSelect dipasang) → pemanggil membuka modal detail kanji
 * komponen itu. Mode kuis: chip statis (tanpa navigasi — fokus tetap
 * di sesi kuis).
 */
export default function ComponentBreakdown({
  kanji,
  level,
  variant = "browse",
  revealed = null,
  onSelect,
}) {
  // undefined = chunk masih dimuat, null = tidak ada dekomposisi,
  // array = siap dirender.
  const [comps, setComps] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    setComps(undefined);
    loadComponents(level).then((map) => {
      if (cancelled) return;
      const c = map[kanji];
      // 1 komponen sendirian tidak memberi informasi struktur.
      setComps(Array.isArray(c) && c.length > 1 ? c : null);
    });
    return () => {
      cancelled = true;
    };
  }, [kanji, level]);

  if (!Array.isArray(comps)) return null;

  const compact = variant === "quiz";

  return (
    <section className={`kd-comp${compact ? " compact" : ""}`} aria-label={`Components of ${kanji}`}>
      <div className="kd-comp-title">Components</div>
      <div className="kd-comp-row">
        {comps.map((c, i) => {
          // Keadaan chip relatif progres animasi (revealed = jumlah
          // goresan selesai; goresan yang SEDANG digambar = revealed+1).
          const complete = revealed === null || revealed >= c.r[1];
          const active =
            !complete && revealed + 1 >= c.r[0] && revealed + 1 <= c.r[1];
          const clickable = !compact && c.m !== undefined && onSelect !== undefined;
          const cls =
            "kd-comp-chip" +
            (complete ? "" : " pending") +
            (active ? " active" : "") +
            (clickable ? " clickable" : "");
          const label =
            `${c.e}${c.m !== undefined ? `, ${c.m}` : ""}, strokes ${c.r[0]}–${c.r[1]}` +
            (c.rad ? ", semantic radical" : "") +
            (c.ph ? ", phonetic component" : "");
          const Chip = clickable ? "button" : "div";
          return (
            <React.Fragment key={`${c.e}-${c.r[0]}`}>
              {i > 0 && (
                <span className="kd-comp-op" aria-hidden="true">
                  +
                </span>
              )}
              <div className="kd-comp-col">
                <Chip
                  type={clickable ? "button" : undefined}
                  className={cls}
                  onClick={clickable ? () => onSelect(c) : undefined}
                  aria-label={label}
                  title={
                    (c.rad ? "Semantic radical — carries the meaning. " : "") +
                    (c.ph ? "Phonetic component — hints the reading. " : "") +
                    (clickable ? "Click to open this kanji." : "")
                  }
                >
                  {c.rad && <span className="kd-comp-dot" aria-hidden="true" />}
                  <span className="kd-comp-glyph" aria-hidden="true">
                    {c.e}
                  </span>
                  {c.m !== undefined && <span className="kd-comp-mean">{c.m}</span>}
                  {!compact && (
                    <span className="kd-comp-range">
                      {c.r[0]}–{c.r[1]}
                      {c.ph ? " · phon" : ""}
                    </span>
                  )}
                </Chip>
                {!compact && c.p && c.p.length > 0 && (
                  <div className="kd-comp-parts" aria-label={`Parts: ${c.p.join(", ")}`}>
                    {c.p.map((ch, j) => (
                      <React.Fragment key={`${ch}-${j}`}>
                        {j > 0 && (
                          <span className="kd-comp-part-sep" aria-hidden="true">
                            ·
                          </span>
                        )}
                        <span className="kd-comp-part">{ch}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
