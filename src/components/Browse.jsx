import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ChevronLeft, Search, X, BookOpen } from "lucide-react";
import { LEVEL_IDS, getKanjiForLevel } from "../lib/dataLoader.js";

// "All" + N5..N1. Default selection is N5 so the first paint stays light
// (N1 alone has 1232 entries — fine, but N5 is a friendlier landing).
const LEVELS = ["All", ...LEVEL_IDS];

// Render cap so grids of 1000+ cards stay smooth on scroll. "Show more"
// increases the cap in steps.
const VISIBLE_STEP = 400;

export default function Browse({ onBack }) {
  const [activeLevel, setActiveLevel] = useState("N5");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP);
  const [selected, setSelected] = useState(null); // kanji entry shown in modal

  // Build the list for the active level (+ optional search filter).
  const list = useMemo(() => {
    let pool;
    if (activeLevel === "All") {
      pool = LEVEL_IDS.flatMap((l) => getKanjiForLevel(l));
    } else {
      pool = getKanjiForLevel(activeLevel);
    }
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
  }, [activeLevel, query]);

  // Handlers that also reset the render cap, so changing the filter always
  // starts from the top of the new result set (no effect / no ref-in-render).
  const selectLevel = useCallback((lv) => {
    setActiveLevel(lv);
    setVisibleCount(VISIBLE_STEP);
  }, []);

  const updateQuery = useCallback((val) => {
    setQuery(val);
    setVisibleCount(VISIBLE_STEP);
  }, []);

  // Close the detail modal on Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          {list.length} kanji{activeLevel !== "All" ? ` in ${activeLevel}` : ""}
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
            onClick={() => setSelected(k)}
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

      {list.length === 0 && (
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

      {/* Detail modal — reuses the kd-reveal aesthetic from the quiz screen. */}
      {selected && (
        <div className="kd-modal-overlay" onClick={() => setSelected(null)}>
          <div className="kd-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="kd-modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="kd-reveal-head">
              <span className="kd-meaning-kanji">{selected.kanji}</span>
              <span className="kd-meaning-text">
                {selected.meanings.join(", ")}
              </span>
            </div>
            <div className="kd-reveal-yomi">
              {selected.readings.on.length > 0 && (
                <div className="kd-yomi-row">
                  <span className="kd-yomi-tag on">On&apos;yomi</span>{" "}
                  {selected.readings.on.join("、")}
                </div>
              )}
              {selected.readings.kun.length > 0 && (
                <div className="kd-yomi-row">
                  <span className="kd-yomi-tag kun">Kun&apos;yomi</span>{" "}
                  {selected.readings.kun.join("、")}
                </div>
              )}
              {selected.romaji_readings.length > 0 && (
                <div className="kd-yomi-row">
                  <span className="kd-yomi-tag kd-yomi-tag-neutral">Romaji</span>{" "}
                  {selected.romaji_readings.join("、")}
                </div>
              )}
            </div>
            <div className="kd-browse-modal-meta">
              <span className="kd-yomi-tag kd-yomi-tag-indigo">
                {selected.jlpt_level}
              </span>
              <span>{selected.unit}</span>
              <span>· {selected.stroke_count} strokes</span>
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
      )}
    </>
  );
}
