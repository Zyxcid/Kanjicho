import React from "react";
import { t } from "../lib/i18n.js";

/**
 * Tooltip satu bagian — cukup menjelaskan APA ITU radikal/fonetik
 * (t64: jumlah goresan, arti, bentuk asli ditarik dari chip — tooltip
 * hanya definisi peran bagian). Bagian tanpa peran tidak punya tooltip.
 * (t89) Teks tooltip mengikuti bahasa aktif (kunci comp.*).
 */
function partTitle(part) {
  if (part.r) return t("comp.radical");
  if (part.ph) return t("comp.phonetic");
  return null;
}

/**
 * ComponentBreakdown — persamaan dekomposisi kanji (KanjiVG
 * stroke-group): 日 + 寺. Presentational murni; data (parts) dimuat
 * pemanggil via lib/components.js.
 *
 * Varian:
 *  - plain (kuis, di panel reveal): TEKS BIASA — glyph + pemisah "+",
 *    tanpa kotak/border/latar (t63) dan tanpa jumlah goresan (t64).
 *    Tanpa navigasi: detail penuh tetap di modal Browse.
 *  - full (modal Browse, DI BAWAH animasi goresan): chip GLYPY-SAJA
 *    (t64: jumlah goresan + arti dihapus — chip jadi kompak; tooltip
 *    menjelaskan peran radikal/fonetik). Bagian yang punya "lv" jadi
 *    TOMBOL (onOpenPart) — klik menavigasi modal ke kanji komponen itu
 *    (navHistory di Browse.jsx menyediakan tombol back).
 *
 * Sinkron animasi (t64, varian full): prop `progress` = jumlah goresan
 * yang sudah tergambar (dari StrokePlayer.onProgress). Bagian diberi
 * rentang goresan kumulatif (parts memang urut goresan — build script
 * menjamin jumlah goresan cocok): chip "menyala" saat goresan yang
 * sedang digambar berada di rentangnya, redup sebelumnya, normal
 * (selesai "ditinta") setelahnya — persamaan MENGIKUTI animasi kanji.
 * progress null/undefined (kuis, fallback tanpa data goresan) = semua
 * chip netral.
 *
 * Bagian {u} (goresan tanpa grup berlabel) dirender "+N" — jujur soal
 * jumlah goresan yang tidak termasuk komponen bernama. Titik kecil di
 * pojok chip (varian full): seal = radikal (komponen makna), indigo =
 * fonetik (komponen bunyi).
 */
export default function ComponentBreakdown({
  kanji,
  parts,
  plain = false,
  progress,
  onOpenPart,
}) {
  // Persamaan hanya bermakna dengan >= 2 keping visual (bagian bernama
  // +/atau goresan lepas); satu bagian tunggal bukan persamaan.
  const visible = parts.filter((p) => p.e || p.u);
  if (visible.length < 2) return null;

  // Rentang goresan kumulatif tiap bagian (urutan parts = urutan
  // goresan KanjiVG). Dipakai mencari bagian yang sedang digambar.
  let acc = 0;
  const ranges = visible.map((p) => {
    const n = p.s || p.u || 0;
    const r = { start: acc, end: acc + n };
    acc += n;
    return r;
  });

  // Goresan yang AKAN digambar berikutnya = progress + 1 (1-based);
  // bagian aktif = bagian yang memuat goresan itu. Bagian dengan
  // end <= progress sudah selesai digambar.
  const hasProgress = typeof progress === "number";
  const activeIndex = hasProgress
    ? ranges.findIndex((r) => progress + 1 > r.start && progress + 1 <= r.end)
    : -1;

  // Kelas sinkron animasi: future (redup) / active (menyala) / done
  // (normal). Tanpa progress → string kosong (netral).
  function syncClass(i) {
    if (!hasProgress) return "";
    if (i === activeIndex) return " active";
    if (ranges[i].end <= progress) return " done";
    return " future";
  }

  // Persamaan utuh tetap dibacakan screen reader (kanji = bagian-bagian)
  // walau lead visualnya tidak dirender — konteks tanpa melihat layar.
  const ariaLabel = t("comp.aria", {
    eq: `${kanji} = ${visible.map((p) => p.e || `+${p.u}`).join(" + ")}`,
  });

  // ---- Varian plain (panel reveal kuis): baris teks tenang ----------
  if (plain) {
    return (
      <div className="kd-comp plain">
        <div className="kd-comp-row" role="group" aria-label={ariaLabel}>
          {visible.map((p, i) => {
            const title = p.u
              ? p.u === 1
                ? t("comp.looseOne")
                : t("comp.loose", { n: p.u })
              : partTitle(p);
            return (
              <span
                className="kd-comp-pt"
                key={`${p.e || "u"}${i}`}
                title={title || undefined}
              >
                {i > 0 && (
                  <span className="kd-comp-plus" aria-hidden="true">
                    +
                  </span>
                )}
                {p.u ? (
                  <span className="kd-comp-loose">+{p.u}</span>
                ) : (
                  <span className="kd-comp-glyph" aria-hidden="true">
                    {p.e}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Varian full (modal Browse, di bawah animasi goresan) ----------
  return (
    <div className="kd-comp">
      <div className="kd-comp-label">{t("comp.label")}</div>
      <div className="kd-comp-row" role="group" aria-label={ariaLabel}>
        {visible.map((p, i) => (
          /* Term = "+" MENEMPEL pada chip sesudahnya: baris baru selalu
             dimulai dengan "+ chip" (operator pembuka suku), tidak pernah
             ada plus yatim menggantung di ujung baris. */
          <span className="kd-comp-term" key={`${p.e || "u"}${i}`}>
            {i > 0 && (
              <span className="kd-comp-plus" aria-hidden="true">
                +
              </span>
            )}
            {p.u ? (
              <span
                className={`kd-comp-chip static ungrouped${syncClass(i)}`}
                title={p.u === 1 ? t("comp.looseOne") : t("comp.loose", { n: p.u })}
              >
                <span className="kd-comp-glyph">+{p.u}</span>
              </span>
            ) : p.lv && onOpenPart ? (
              <button
                type="button"
                className={`kd-comp-chip ${p.r ? "rad" : p.ph ? "phon" : ""}${syncClass(i)}`}
                onClick={() => onOpenPart(p)}
                title={partTitle(p) || undefined}
                aria-label={t("comp.show", { k: p.e })}
              >
                <span className="kd-comp-glyph" aria-hidden="true">
                  {p.e}
                </span>
              </button>
            ) : (
              <span
                className={`kd-comp-chip static ${p.r ? "rad" : p.ph ? "phon" : ""}${syncClass(i)}`}
                title={partTitle(p) || undefined}
              >
                <span className="kd-comp-glyph" aria-hidden="true">
                  {p.e}
                </span>
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
