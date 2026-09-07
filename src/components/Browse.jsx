import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Search, X, BookOpen } from "lucide-react";
import { LEVEL_IDS, loadLevelKanji, loadAllKanji } from "../lib/dataLoader.js";
import { ReadingList } from "./Readings.jsx";
import StrokePlayer from "./StrokePlayer.jsx";
import CopyKanji from "./CopyKanji.jsx";
import ComponentBreakdown from "./ComponentBreakdown.jsx";
import { loadStrokes } from "../lib/strokes.js";

// "All" + N5..N1. Default N5 supaya paint pertama ringan (N1 sendiri
// berisi 1.232 entri; N5 lebih ramah sebagai halaman mula).
const LEVELS = ["All", ...LEVEL_IDS];

// Batas render per step supaya grid 1000+ kartu tetap mulus saat scroll.
// "Show more" menaikkan batas bertahap.
const VISIBLE_STEP = 400;

export default function Browse({ onBack }) {
  const [activeLevel, setActiveLevel] = useState("N5");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP);
  const [selected, setSelected] = useState(null); // kanji yang ditampilkan di modal

  // Riwayat navigasi komponen di modal (t60): klik chip komponen
  // (mis. 時 → 寺) menumpuk kanji asal; tombol "← 時" memunculkan
  // kembali isi modal sebelumnya — sebelum t60 tukar kanji bersifat
  // satu arah, kanji yang sedang dilihat hilang tanpa jejak. Entri
  // disimpan utuh (sudah termuat), jadi kembali = instan tanpa load.
  const [navHistory, setNavHistory] = useState([]);

  // Data urutan goresan untuk kanji di modal (KanjiVG, per level —
  // loader di lib/strokes.js meng-cache chunk per level). null = dimuat.
  const [strokePaths, setStrokePaths] = useState(null);

  // Progres animasi goresan (dilaporkan StrokePlayer) — men-highlight
  // chip komponen yang goresannya sedang digambar (ComponentBreakdown).
  const [activeStroke, setActiveStroke] = useState(null);

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

  // Tutup modal detail dengan Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Setiap modal dibuka untuk kanji baru → muat path goresannya. "All"
  // memuat level entri TERSEBUT (bukan semua level sekaligus).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setStrokePaths(null);
    setActiveStroke(null);
    loadStrokes(selected.jlpt_level).then((map) => {
      if (!cancelled) setStrokePaths(map[selected.kanji] || []);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Ganti isi modal (klik komponen / kembali) → gulir modal ke atas —
  // tanpa ini pengguna pindah kanji sambil modal terscroll di contoh
  // kata panjang dan mendarat di tengah konten kanji baru.
  const modalRef = useRef(null);
  useEffect(() => {
    modalRef.current?.scrollTo({ top: 0 });
  }, [selected]);

  // Buka kanji langsung dari grid → mulai riwayat baru (t60).
  const openKanji = useCallback((k) => {
    setNavHistory([]);
    setSelected(k);
  }, []);

  // Klik chip komponen (yang komponennya adalah kanji di DB) → tukar
  // isi modal ke detail komponen itu, kanji asal ditumpuk ke riwayat
  // supaya bisa kembali (tombol "←" di modal, t60). Level tersimpan di
  // data komponen (field lv) — loadLevelKanji cache per level, jadi
  // bolak-balik antar kanji ringan.
  function openComponent(comp) {
    if (!comp || !comp.lv) return;
    const from = selected;
    loadLevelKanji(comp.lv).then((list) => {
      const entry = list.find((k) => k.kanji === comp.e);
      if (entry && (!from || entry.kanji !== from.kanji)) {
        setNavHistory((h) => (from ? [...h, from] : h));
        setSelected(entry);
      }
    });
  }

  // Satu langkah kembali di riwayat navigasi komponen (t60).
  const goBack = useCallback(() => {
    if (navHistory.length === 0) return;
    setSelected(navHistory[navHistory.length - 1]);
    setNavHistory(navHistory.slice(0, -1));
  }, [navHistory]);

  const visible = list.slice(0, visibleCount);
  const hasMore = list.length > visibleCount;

  return (
    <>
      <button className="kd-back" onClick={onBack}>
        <ChevronLeft size={16} /> Home
      </button>

      <div className="kd-section-title kd-section-title-row">
        <span>kanji Library</span>
        <small className="kd-browse-count-inline">
          {pool === null ? "Loading…" : `${list.length} kanji${activeLevel !== "All" ? ` in ${activeLevel}` : ""}`}
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
            placeholder="Search kanji, meaning, reading…"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            aria-label="Search kanji"
          />
          {query && (
            <button
              className="kd-search-clear"
              onClick={() => updateQuery("")}
              aria-label="Clear search"
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

      {pool === null && <div className="kd-empty-note">Loading {activeLevel}…</div>}

      {pool !== null && list.length === 0 && (
        <div className="kd-empty-note">No kanji match “{query}”.</div>
      )}

      {hasMore && (
        <div className="kd-showmore-row">
          <button
            className="kd-btn secondary kd-showmore-btn"
            onClick={() => setVisibleCount((c) => c + VISIBLE_STEP)}
          >
            Show more ({list.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {/* Modal detail — layout dua kolom (mobile: bertumpuk): animasi
          urutan goresan KanjiVG di kiri, info (arti, bacaan, contoh) di
          kanan. Estetika elemen info tetap memakai kd-reveal. */}
      {selected && (
        <div className="kd-modal-overlay" onClick={() => setSelected(null)}>
          <div className="kd-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
            <button
              className="kd-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            {/* Kembali ke kanji sebelumnya (t60) — hanya muncul setelah
                navigasi komponen; glyph + arti kanji tujuan, bukan panah
                kosong. */}
            {navHistory.length > 0 && (
              <button
                className="kd-modal-back"
                onClick={goBack}
                aria-label={`Back to ${navHistory[navHistory.length - 1].kanji}`}
                title={`Back to ${navHistory[navHistory.length - 1].kanji}`}
              >
                <ChevronLeft size={14} />
                <span className="kd-modal-back-glyph">
                  {navHistory[navHistory.length - 1].kanji}
                </span>
                {navHistory[navHistory.length - 1].meanings?.[0] && (
                  <span className="kd-modal-back-mean">
                    {navHistory[navHistory.length - 1].meanings[0]}
                  </span>
                )}
              </button>
            )}
            <div className="kd-detail-grid">
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
                    onStrokeChange={setActiveStroke}
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
                      {selected.stroke_count} {selected.stroke_count === 1 ? "stroke" : "strokes"}
                    </div>
                  </>
                )}
                {/* Persamaan komponen kanji (t59) — di bawah player:
                    struktur kvg:element KanjiVG (radikal semantik
                    bertitik indigo, komponen fonetik berlabel "phon",
                    sub-parts di strip mini). Chip yang goresannya
                    sedang digambar animasi diberi ring indigo; klik
                    chip (komponen yang ada di DB) → modal menampilkan
                    detail kanji komponen itu. */}
                <ComponentBreakdown
                  kanji={selected.kanji}
                  level={selected.jlpt_level}
                  variant="browse"
                  revealed={activeStroke}
                  onSelect={openComponent}
                />
              </div>
              <div className="kd-detail-info">
                {/* Head cukup MEANING saja — kanji sudah tampil besar (dan
                    dianimasikan) di kolom kiri, tampilkan lagi di head hanya
                    duplikat. */}
                <div className="kd-detail-head">
                  <span className="kd-detail-meaning">{selected.meanings.join(", ")}</span>
                </div>
                <div className="kd-reveal-yomi">
                  {selected.readings.on.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag on">On&apos;yomi</span>
                      <ReadingList readings={selected.readings.on} primaryReadings={selected.primary_readings} type="on" />
                    </div>
                  )}
                  {selected.readings.kun.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag kun">Kun&apos;yomi</span>
                      <ReadingList readings={selected.readings.kun} primaryReadings={selected.primary_readings} type="kun" />
                    </div>
                  )}
                  {selected.romaji_readings.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag kd-yomi-tag-neutral">Romaji</span>
                      <span className="kd-yomi-value">{selected.romaji_readings.join(", ")}</span>
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
                        <span className="kd-example-reading">{ex.reading}</span>
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
