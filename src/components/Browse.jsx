import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Search, X, BookOpen, SlidersHorizontal } from "lucide-react";
import { LEVEL_IDS, loadLevelKanji, loadAllKanji } from "../lib/dataLoader.js";
import { ReadingList } from "./Readings.jsx";
import StrokePlayer from "./StrokePlayer.jsx";
import CopyKanji from "./CopyKanji.jsx";
import ComponentBreakdown from "./ComponentBreakdown.jsx";
import { loadStrokePaths } from "../lib/strokes.js";
import { loadComponents } from "../lib/components.js";
import { pushOverlayEntry, closeOverlayUI, discardOverlayEntry } from "../lib/useRouter.js";
import { t } from "../lib/i18n.js";
// (t96) Arti & gloss contoh mengikuti bahasa UI (overlay id_gloss).
import { useIdData, localizedMeanings } from "../lib/idData.jsx";
// (t107) Daftar contoh kata + kalimat — komponen bersama 3 layar.
import ExampleList from "./ExampleList.jsx";

// "All" + N5..N1. Default "All" (t96): pustaka adalah alat referensi —
// user datang mencari kanji, bukan level; batas render 400 kartu +
// pencarian tetap menjaga kecepatan pertama bahkan dengan 2.211 kanji
// (level JSON dimuat on-demand, jadi "All" hanya sekali muat 5 file).
const LEVELS = ["All", ...LEVEL_IDS];

// Batas render per step supaya grid 1000+ kartu tetap mulus saat scroll.
// "Show more" menaikkan batas bertahap.
const VISIBLE_STEP = 400;

// (t111) Lingkup pencarian pustaka — menggantikan bucket jumlah goresan
// (t110): user menilai filter berdasarkan goresan tidak perlu, yang
// bermanfaat adalah MEMPERSEMPIT KOLOM yang dicocokkan. "all" (bawaan)
// = perilaku lama: cocokkan kanji, arti (EN+ID), dan bacaan sekaligus;
// tiga pilihan lain membatasi ke satu kolom supaya hasil lebih presisi
// (mis. "mizu" di bacaan menemukan 水 tanpa derau arti "future" dsb.).
const SEARCH_SCOPES = ["all", "kanji", "meaning", "reading"];

export default function Browse({ script = "kana", furigana = true }) {
  // (t96) Peta gloss Indonesia aktif (null bila bahasa en / belum termuat).
  const idData = useIdData();
  const [activeLevel, setActiveLevel] = useState("All");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP);
  const [selected, setSelected] = useState(null); // kanji yang ditampilkan di modal

  // (t111) Filter pustaka: lingkup pencarian + urutan + popover
  // terbuka/risau. "all" = cari semua kolom; "default" = urutan data
  // (level lalu unit — urutan alami pustaka).
  const [searchScope, setSearchScope] = useState("all");
  const [sortMode, setSortMode] = useState("default");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef(null);
  const filterPopRef = useRef(null);
  const filtersActive = searchScope !== "all" || sortMode !== "default";

  // Placeholder kotak pencarian MENGIKUTI lingkup aktif (t111) — cara
  // paling murah menunjukkan bahwa filter sedang membatasi pencarian
  // tanpa memakai ruang layar tambahan. Lingkup "all" memakai teks
  // gabungan lama ("Cari kanji, arti, bacaan…").
  const searchPlaceholder =
    searchScope === "all" ? t("browse.search") : t(`browse.search.${searchScope}`);

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
  // loader di lib/strokes.js meng-cache chunk per level; N1 terpecah
  // jadi sub-chunk per ~400 kanji, t96). null = dimuat.
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

  // Susun daftar level aktif (+ filter pencarian bila ada). Pencarian
  // mencocokkan arti INGGRIS maupun terjemahannya (t96): user berbahasa
  // Indonesia mengetik "air" tetap menemukan 水 (water) walau kartu
  // menampilkan "air".
  // (t111) Lingkup pencarian diterapkan SEBELUM cocok-matching: "all"
  // = semua kolom sekaligus; "kanji"/"meaning"/"reading" = hanya kolom
  // itu. Urutan tetap hanya mengubah susunan hasil (copy + sort stabil
  // — pool asli tak tersentuh supaya ganti filter tidak memicu muat
  // ulang data).
  const list = useMemo(() => {
    if (!pool) return [];
    const q = query.trim().toLowerCase();
    let out = pool;
    if (q) {
      if (searchScope === "kanji") {
        out = out.filter((k) => k.kanji.includes(q));
      } else if (searchScope === "meaning") {
        out = out.filter(
          (k) =>
            k.meanings.some((m) => m.toLowerCase().includes(q)) ||
            (idData &&
              k.meanings.some((m) => (idData.m[m] || "").toLowerCase().includes(q)))
        );
      } else if (searchScope === "reading") {
        out = out.filter(
          (k) =>
            k.romaji_readings.some((r) => r.toLowerCase().includes(q)) ||
            k.readings.on.some((r) => r.includes(q)) ||
            k.readings.kun.some((r) => r.includes(q))
        );
      } else {
        out = out.filter(
          (k) =>
            k.kanji.includes(q) ||
            k.meanings.some((m) => m.toLowerCase().includes(q)) ||
            (idData &&
              k.meanings.some((m) => (idData.m[m] || "").toLowerCase().includes(q))) ||
            k.romaji_readings.some((r) => r.toLowerCase().includes(q)) ||
            k.readings.on.some((r) => r.includes(q)) ||
            k.readings.kun.some((r) => r.includes(q))
        );
      }
    }
    if (sortMode === "asc" || sortMode === "desc") {
      out = [...out].sort((a, b) =>
        sortMode === "asc"
          ? (a.stroke_count || 0) - (b.stroke_count || 0)
          : (b.stroke_count || 0) - (a.stroke_count || 0)
      );
    }
    return out;
  }, [pool, query, idData, searchScope, sortMode]);

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

  // (t111) Ganti lingkup/urutan → reset batas render (mulai dari awal
  // hasil baru, konsisten dengan selectLevel/updateQuery).
  const applySearchScope = useCallback((id) => {
    setSearchScope(id);
    setVisibleCount(VISIBLE_STEP);
  }, []);
  const applySortMode = useCallback((id) => {
    setSortMode(id);
    setVisibleCount(VISIBLE_STEP);
  }, []);

  // (t110) Popover filter: tutup saat klik DI LUAR tombol+popover
  // (mousedown supaya klik pilihan tidak ikut menutup — onClick pilihan
  // baru jalan sesudahnya) dan saat Escape (ditambahkan terpisah supaya
  // tidak bentrok dengan handler Escape modal detail).
  useEffect(() => {
    if (!filterOpen) return;
    function onDown(e) {
      const btn = filterBtnRef.current;
      const pop = filterPopRef.current;
      if (btn && btn.contains(e.target)) return;
      if (pop && pop.contains(e.target)) return;
      setFilterOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

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
      loadStrokePaths(selected.jlpt_level, selected.kanji),
      loadComponents(selected.jlpt_level),
    ]).then(([paths, compsMap]) => {
      if (cancelled) return;
      setStrokePaths(paths);
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

        {/* (t111) Baris pencarian + tombol filter di KANAN kotak
            pencarian. Tombol membuka popover: lingkup pencarian
            (kanji/arti/bacaan) + urutan. Titik indikator saat filter
            aktif. Placeholder kotak pencarian mengikuti lingkup. */}
        <div className="kd-search-row">
          <div className="kd-search">
            <Search size={15} />
            <input
              type="text"
              placeholder={searchPlaceholder}
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
          <button
            ref={filterBtnRef}
            className={`kd-filter-btn ${filterOpen ? "open" : ""} ${filtersActive ? "active" : ""}`}
            onClick={() => setFilterOpen((v) => !v)}
            aria-label={t("browse.filter.aria")}
            aria-expanded={filterOpen}
            aria-haspopup="true"
          >
            <SlidersHorizontal size={15} />
            {filtersActive && <span className="kd-filter-dot" aria-hidden="true" />}
          </button>
          {filterOpen && (
            <div className="kd-filter-pop" ref={filterPopRef} role="dialog" aria-label={t("browse.filter.aria")}>
              <div className="kd-filter-group">
                <div className="kd-filter-label">{t("browse.filter.scope")}</div>
                <div className="kd-filter-options">
                  {SEARCH_SCOPES.map((s) => (
                    <button
                      key={s}
                      className={`kd-pill ${searchScope === s ? "active" : ""}`}
                      onClick={() => applySearchScope(s)}
                    >
                      {t(`browse.filter.scope.${s}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="kd-filter-group">
                <div className="kd-filter-label">{t("browse.filter.sort")}</div>
                <div className="kd-filter-options">
                  {["default", "asc", "desc"].map((m) => (
                    <button
                      key={m}
                      className={`kd-pill ${sortMode === m ? "active" : ""}`}
                      onClick={() => applySortMode(m)}
                    >
                      {t(`browse.filter.sort.${m}`)}
                    </button>
                  ))}
                </div>
              </div>
              {filtersActive && (
                <button
                  className="kd-filter-reset"
                  onClick={() => {
                    applySearchScope("all");
                    applySortMode("default");
                  }}
                >
                  {t("browse.filter.reset")}
                </button>
              )}
            </div>
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
            {/* (t96) Arti kartu mengikuti bahasa UI. */}
            <div className="kd-browse-meaning">
              {localizedMeanings(k, idData).slice(0, 2).join(", ")}
            </div>
            <div className="kd-browse-meta">
              {k.jlpt_level} · {k.unit}
            </div>
          </button>
        ))}
      </div>

      {pool === null && <div className="kd-empty-note">{t("browse.loadingLevel", { lv: activeLevel })}</div>}

      {pool !== null && list.length === 0 && (
        <div className="kd-empty-note">
          {/* (t111) Lingkup pencarian bukan filter keras — tanpa teks
              kueri daftar selalu penuh, jadi satu-satunya sebab daftar
              kosong adalah kueri tanpa cocok. */}
          {t("browse.noMatch", { q: query })}
        </div>
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
                  {localizedMeanings(navHistory[navHistory.length - 1], idData)[0] || ""}
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
                  <span className="kd-detail-meaning">{localizedMeanings(selected, idData).join(", ")}</span>
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
                {/* (t107) Contoh kata + kalimat lewat ExampleList —
                    sama dengan panel reveal kuis & detail sheet. */}
                <ExampleList examples={selected.examples} script={script} furigana={furigana} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
