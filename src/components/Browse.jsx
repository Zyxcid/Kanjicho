import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Search, X, BookOpen } from "lucide-react";
import { LEVEL_IDS, loadLevelKanji, loadAllKanji } from "../lib/dataLoader.js";
import { ReadingList } from "./Readings.jsx";
import StrokePlayer from "./StrokePlayer.jsx";
import CopyKanji from "./CopyKanji.jsx";
import ComponentBreakdown from "./ComponentBreakdown.jsx";
import { loadStrokes } from "../lib/strokes.js";
import { loadComponents } from "../lib/components.js";
import { pushOverlayEntry, closeOverlayUI, discardOverlayEntry } from "../lib/useRouter.js";
import { kanaToRomaji } from "../lib/kana.js";
import { t } from "../lib/i18n.js";

// "All" + N5..N1. Default N5 supaya paint pertama ringan (N1 sendiri
// berisi 1.232 entri; N5 lebih ramah sebagai halaman mula).
const LEVELS = ["All", ...LEVEL_IDS];

// Batas render per step supaya grid 1000+ kartu tetap mulus saat scroll.
// "Show more" menaikkan batas bertahap.
const VISIBLE_STEP = 400;

export default function Browse({ script = "kana" }) {
  const [activeLevel, setActiveLevel] = useState("N5");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP);
  const [selected, setSelected] = useState(null); // kanji yang ditampilkan di modal

  // Navigasi komponen: klik chip komponen di modal → tampilkan kanji
  // komponen itu; entri yang ditinggalkan ditumpuk di navHistory supaya
  // tombol ← (back) bisa kembali langkah demi langkah (mis. 時 → 寺 → 土).
  // Membuka kanji baru dari GRID mengosongkan histori (sesi jelajah baru).
  const [navHistory, setNavHistory] = useState([]);
  // Scroll modal reset ke atas setiap kanji berganti (termasuk saat
  // menavigasi komponen — panel bacaan/contoh panjang bisa tersisa di
  // posisi scroll lama).
  const modalRef = useRef(null);

  // Data urutan goresan untuk kanji di modal (KanjiVG, per level —
  // loader di lib/strokes.js meng-cache chunk per level). null = dimuat.
  const [strokePaths, setStrokePaths] = useState(null);
  // Dekomposisi komponen kanji di modal (KanjiVG stroke-group, per
  // level — lib/components.js). null = dimuat.
  const [compEntry, setCompEntry] = useState(null);
  // Kemajuan animasi goresan (jumlah goresan tergambar) — dipantau agar
  // persamaan komponen MENGIKUTI animasi: chip komponen yang goresannya
  // sedang digambar menyala, yang belum redup, yang selesai normal
  // (sinkronisasi via StrokePlayer.onProgress + ComponentBreakdown
  // progress). null = tidak ada animasi aktif (loading/fallback) → chip
  // netral. Reset saat kanji berganti.
  const [strokeProgress, setStrokeProgress] = useState(null);
  const handleStrokeProgress = useCallback((n) => setStrokeProgress(n), []);

  // Data level aktif (atau semua level untuk "All") dimuat on-demand —
  // null selagi proses. "All" memuat 5 level sekaligus (satu-satunya kasus
  // yang memang butuh semuanya); selain itu hanya JSON level itu.
  const [pool, setPool] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPool(null);
    const loader = activeLevel === "All" ? loadAllKanji() : loadLevelKanji(activeLevel);
    loader.then((data) => {
      if (!cancelled) setPool(data);
    });
    return () => {
      cancelled = true;
    };
  }, [activeLevel]);

  // Susun daftar level aktif (+ filter pencarian bila ada).
  const list = useMemo(() => {
    if (!pool) return [];
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (k) =>
        k.kanji.includes(q) ||
        k.meanings.some((m) => m.toLowerCase().includes(q)) ||
        k.romaji_readings.some((r) => r.toLowerCase().includes(q)) ||
        k.readings.on.some((r) => r.includes(q)) ||
        k.readings.kun.some((r) => r.includes(q))
    );
  }, [pool, query]);

  // Ganti level/query sekaligus reset batas render supaya selalu mulai
  // dari awal hasil baru.
  const selectLevel = useCallback((lv) => {
    setActiveLevel(lv);
    setVisibleCount(VISIBLE_STEP);
  }, []);

  const updateQuery = useCallback((val) => {
    setQuery(val);
    setVisibleCount(VISIBLE_STEP);
  }, []);

  // Tutup modal (tombol ✕ / klik overlay / Escape) — histori ikut
  // dikosongkan.
  const closeModal = useCallback(() => {
    setSelected(null);
    setNavHistory([]);
  }, []);

  // Tutup lewat UI: selain menutup state modal, KONSUMSI entri overlay
  // di history yang ditambahkan saat modal dibuka (t65) — tanpa itu
  // pengguna harus menekan Back dua kali untuk benar-benar berpindah.
  const closeModalUI = useCallback(() => {
    closeOverlayUI(closeModal);
  }, [closeModal]);

  // Tutup modal detail dengan Escape (ikut mengosongkan histori
  // navigasi komponen — modal ditutup berarti sesi jelajah selesai).
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        closeModalUI();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModalUI]);

  // Bersih-bersih defensif: modal terbuka saat layar Browse unmount
  // (navigasi lewat popstate) → buang penutupnya dari tumpukan overlay.
  useEffect(() => () => discardOverlayEntry(closeModal), [closeModal]);

  // Setiap modal dibuka untuk kanji baru → muat path goresannya DAN
  // dekomposisi komponennya, lalu reset scroll ke atas. "All"
  // memuat level entri TERSEBUT (bukan semua level sekaligus); komponen
  // bisa ber-link ke level lain — level itu dimuat terpisah saat chip
  // diklik (lihat openComponent).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setStrokePaths(null);
    setCompEntry(null);
    setStrokeProgress(null);
    Promise.all([
      loadStrokes(selected.jlpt_level),
      loadComponents(selected.jlpt_level),
    ]).then(([strokesMap, compsMap]) => {
      if (cancelled) return;
      setStrokePaths(strokesMap[selected.kanji] || []);
      setCompEntry(compsMap[selected.kanji] || null);
    });
    if (modalRef.current) modalRef.current.scrollTop = 0;
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const visible = list.slice(0, visibleCount);
  const hasMore = list.length > visibleCount;

  // Buka kanji dari grid → sesi jelajah baru: histori komponen kosong.
  // Modal membuka ENTRI OVERLAY history sendiri (t65): tombol Back di
  // mobile saat modal terbuka menutup modal — layar tidak berpindah.
  // Navigasi chip komponen (openComponent/goBack) TIDAK menambah entri:
  // Back tetap berarti "tutup modal" di kedalaman jelajah mana pun.
  const openKanji = useCallback(
    (k) => {
      setNavHistory([]);
      setSelected(k);
      pushOverlayEntry(closeModal);
    },
    [closeModal]
  );

  // Klik chip komponen → navigasi modal ke kanji komponen itu (target
  // link = k bila bentuk tertulisnya bukan kanji DB, mis. 亻 → 人).
  // Level target dimuat on-demand via loadLevelKanji (di-cache; saat
  // browsing "All" biasanya sudah termuat).
  const openComponent = useCallback(
    (part) => {
      const target = part.k || part.e;
      if (!part.lv || !target || !selected) return;
      let cancelled = false;
      loadLevelKanji(part.lv).then((list) => {
        if (cancelled) return;
        const entry = list.find((x) => x.kanji === target);
        if (!entry) return;
        setNavHistory((h) => [...h, selected]);
        setSelected(entry);
      });
      return () => {
        cancelled = true;
      };
    },
    [selected]
  );

  // Kembali satu langkah ke kanji sebelumnya (pop histori).
  const goBack = useCallback(() => {
    setNavHistory((h) => {
      if (h.length === 0) return h;
      setSelected(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  return (
    <>
      {/* (t88) Navigasi pulang: tombol "< Home" BERLABEL di TOPBAR
          (App.jsx, kiri) — dikembalikan dari panah polos t83. ChevronLeft
          tetap dipakai modal detail untuk navigasi komponen (navHistory)
          di bawah. */}

      <div className="kd-section-title kd-section-title-row">
        <span>{t("browse.title")}</span>
        <small className="kd-browse-count-inline">
          {pool === null
            ? t("common.loading")
            : activeLevel !== "All"
              ? t("browse.countIn", { n: list.length, lv: activeLevel })
              : t("browse.count", { n: list.length })}
        </small>
      </div>

      <div className="kd-browse-controls">
        <div className="kd-level-pills">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              className={`kd-pill ${activeLevel === lv ? "active" : ""}`}
              onClick={() => selectLevel(lv)}
            >
              {lv}
            </button>
          ))}
        </div>

        <div className="kd-search">
          <Search size={15} />
          <input
            type="text"
            placeholder={t("browse.search")}
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            aria-label={t("browse.search.aria")}
          />
          {query && (
            <button
              className="kd-search-clear"
              onClick={() => updateQuery("")}
              aria-label={t("browse.clear")}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="kd-browse-grid">
        {visible.map((k) => (
          <button
            key={k.kanji + k.unit}
            className="kd-browse-card"
            onClick={() => openKanji(k)}
          >
            <div className="kd-browse-glyph">{k.kanji}</div>
            <div className="kd-browse-meaning">
              {k.meanings.slice(0, 2).join(", ")}
            </div>
            <div className="kd-browse-meta">
              {k.jlpt_level} · {k.unit}
            </div>
          </button>
        ))}
      </div>

      {pool === null && <div className="kd-empty-note">{t("browse.loadingLevel", { lv: activeLevel })}</div>}

      {pool !== null && list.length === 0 && (
        <div className="kd-empty-note">{t("browse.noMatch", { q: query })}</div>
      )}

      {hasMore && (
        <div className="kd-showmore-row">
          <button
            className="kd-btn secondary kd-showmore-btn"
            onClick={() => setVisibleCount((c) => c + VISIBLE_STEP)}
          >
            {t("browse.showMore", { n: list.length - visibleCount })}
          </button>
        </div>
      )}

      {/* Modal detail — layout dua kolom (mobile: bertumpuk): animasi
          urutan goresan KanjiVG di kiri, info (arti, bacaan, contoh) di
          kanan. Estetika elemen info tetap memakai kd-reveal. Tombol ←
          muncul hanya setelah navigasi komponen (navHistory terisi). */}
      {selected && (
        <div className="kd-modal-overlay" onClick={closeModalUI}>
          <div className="kd-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
            <button
              className="kd-modal-close"
              onClick={closeModalUI}
              aria-label={t("common.close")}
            >
              <X size={18} />
            </button>
            {navHistory.length > 0 && (
              /* Back: kembali ke kanji sebelumnya di tumpukan navigasi
                 komponen — glyph + arti pertamanya jadi konteks tujuan
                 ("Back to 時 — time"), selaras bahasa UI tombol ✕. */
              <button
                className="kd-modal-back"
                onClick={goBack}
                aria-label={t("browse.back", { kanji: navHistory[navHistory.length - 1].kanji })}
              >
                <ChevronLeft size={16} />
                <span className="kd-modal-back-glyph">
                  {navHistory[navHistory.length - 1].kanji}
                </span>
                <span className="kd-modal-back-mean">
                  {(navHistory[navHistory.length - 1].meanings || [])[0] || ""}
                </span>
              </button>
            )}
            <div className="kd-detail-grid">
              {/* Kolom kiri: animasi urutan goresan KanjiVG (lebar kolom
                  180px — sama dengan kotak goresan, t64), lalu — tepat DI
                  BAWAH animasi yang sedang berjalan (t63) — persamaan
                  komponen kanji itu. onProgress → strokeProgress → prop
                  progress ComponentBreakdown: chip MENGIKUTI animasi
                  (menyala saat goresannya digambar — t64). Chip tetap
                  ber-link (openComponent + navHistory + ← Back). */}
              <div className="kd-detail-stroke">
                {/* StrokePlayer merender penghitung live sendiri
                    ("n / N strokes" — lihat komponen itu); label statis
                    hanya untuk state loading/fallback tanpa data goresan.
                    Kedua state kotak sama-sama bisa diKLIK untuk menyalin
                    kanji (CopyKanji — konsisten dengan kotak animasi). */}
                {strokePaths && strokePaths.length > 0 ? (
                  <StrokePlayer
                    paths={strokePaths}
                    kanji={selected.kanji}
                    onProgress={handleStrokeProgress}
                  />
                ) : (
                  <>
                    <div className="kd-stroke-box">
                      {strokePaths === null ? (
                        <div className="kd-stroke-loading">…</div>
                      ) : (
                        <div className="kd-stroke-fallback">{selected.kanji}</div>
                      )}
                      <CopyKanji kanji={selected.kanji} />
                    </div>
                    <div className="kd-detail-strokes">
                      {selected.stroke_count === 1
                        ? t("browse.strokeOne")
                        : t("browse.strokes", { n: selected.stroke_count })}
                    </div>
                  </>
                )}
                {/* Persamaan komponen (KanjiVG stroke-group) — chip
                    glyph-saja (t64) ber-link bisa diklik untuk menjelajah
                    kanji komponen itu; navHistory + tombol ← di atas
                    modal. progress = sinkron dengan animasi di atasnya. */}
                {compEntry && (
                  <ComponentBreakdown
                    kanji={selected.kanji}
                    parts={compEntry.p}
                    progress={
                      strokePaths && strokePaths.length > 0
                        ? strokeProgress ?? 0
                        : null
                    }
                    onOpenPart={openComponent}
                  />
                )}
              </div>
              <div className="kd-detail-info">
                {/* Head cukup MEANING saja — kanji sudah tampil besar (dan
                    dianimasikan) di kolom kiri, tampilkan lagi di head hanya
                    duplikat. */}
                <div className="kd-detail-head">
                  <span className="kd-detail-meaning">{selected.meanings.join(", ")}</span>
                </div>
                <div className="kd-reveal-yomi">
                  {/* (t80) Skrip mengikuti toggle universal あ/Aa di topbar
                      (prop `script` dari App) — bacaan On/Kun dan reading
                      contoh kata berganti live seperti di kuis. Baris
                      "Romaji" terpisah DIHAPUS: tumpang tindih dengan
                      fungsi toggle. */}
                  {selected.readings.on.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag on">On&apos;yomi</span>
                      <ReadingList readings={selected.readings.on} primaryReadings={selected.primary_readings} type="on" script={script} />
                    </div>
                  )}
                  {selected.readings.kun.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag kun">Kun&apos;yomi</span>
                      <ReadingList readings={selected.readings.kun} primaryReadings={selected.primary_readings} type="kun" script={script} />
                    </div>
                  )}
                </div>
                <div className="kd-browse-modal-meta">
                  <span className="kd-yomi-tag kd-yomi-tag-indigo">
                    {selected.jlpt_level}
                  </span>
                  <span>{selected.unit}</span>
                </div>
                {selected.examples.length > 0 && (
                  <div className="kd-examples">
                    {selected.examples.map((ex) => (
                      <div key={ex.word} className="kd-example-item">
                        <span className={`kd-yomi-tag ${ex.type} small`}>
                          {ex.type === "on" ? "On" : "Kun"}
                        </span>
                        <span className="kd-example-word">{ex.word}</span>
                        {/* (t80) Reading contoh kata ikut skrip toggle
                            universal — romaji dikonversi runtime. */}
                        <span className="kd-example-reading">
                          {script === "romaji" ? kanaToRomaji(ex.reading) : ex.reading}
                        </span>
                        <span className="kd-example-meaning">{ex.meaning}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
