import { useState, useEffect, useCallback } from "react";

/**
 * useRouter — minimal hash-based router for the Vite SPA.
 *
 * The app is a single page whose "screens" are just a `view` state variable.
 * Without history integration, the browser Back button exits the app because
 * no screen change ever touches the URL. This hook fixes that by:
 *
 *   1. Encoding each screen in the URL hash:
 *        #/                       → home
 *        #/browse                 → browse library
 *        #/level/N5               → unit select for a level
 *        #/quiz/N5-U1             → quiz for a unit
 *        #/result/N5-U1           → result screen for a unit
 *   2. Pushing a history entry on every navigate() (so the URL reflects
 *      where the user actually is).
 *   3. Listening to `popstate` (browser Back / Forward) and re-deriving the
 *      view from the new hash — so Back navigates WITHIN the app instead of
 *      leaving it.
 *
 * No dependencies; native History API + hashchange/popstate.
 */

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

/**
 * Parse the current URL hash into a router location.
 * Returns { view, level, unit }.
 */
export function parseHash(hash) {
  // hash looks like "#/level/N5" — strip the leading "#/".
  const path = (hash || "").replace(/^#\/?/, "");
  const parts = path.split("/").filter(Boolean); // e.g. ["level","N5"] / ["quiz","N5-U1"]

  if (parts.length === 0) return { view: "home", level: null, unit: null };

  const [seg, arg] = parts;

  if (seg === "browse") return { view: "browse", level: null, unit: null };

  if (seg === "level" && arg && LEVELS.includes(arg)) {
    return { view: "unitSelect", level: arg, unit: null };
  }

  if (seg === "quiz" && arg) {
    // Derive the level from the unit id (e.g. "N5-U1" → "N5").
    const lv = arg.split("-")[0];
    const level = LEVELS.includes(lv) ? lv : null;
    return { view: "quiz", level, unit: arg };
  }

  if (seg === "result" && arg) {
    const lv = arg.split("-")[0];
    const level = LEVELS.includes(lv) ? lv : null;
    return { view: "result", level, unit: arg };
  }

  // Unknown hash → home (safe fallback).
  return { view: "home", level: null, unit: null };
}

/** Build a URL hash for a given screen. */
export function buildHash(view, level, unit) {
  switch (view) {
    case "browse":
      return "#/browse";
    case "unitSelect":
      return level ? `#/level/${level}` : "#/";
    case "quiz":
      return unit ? `#/quiz/${unit}` : "#/";
    case "result":
      return unit ? `#/result/${unit}` : "#/";
    case "home":
    default:
      return "#/";
  }
}

export function useRouter() {
  // Read the initial location from the hash so a deep link / reload lands on
  // the right screen, and so the first paint matches the URL.
  const initial = parseHash(typeof window !== "undefined" ? window.location.hash : "");
  const [view, setView] = useState(initial.view);
  const [level, setLevel] = useState(initial.level);
  const [unit, setUnit] = useState(initial.unit);

  // On mount, if there's no hash at all, seed one for the home screen so the
  // very first Back has somewhere to go (history starts at home).
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/");
    }
  }, []);

  // React to browser Back/Forward (popstate) by re-deriving the screen from
  // the new hash. This is what makes Back navigate within the app.
  useEffect(() => {
    function onPop() {
      const loc = parseHash(window.location.hash);
      setView(loc.view);
      setLevel(loc.level);
      setUnit(loc.unit);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /**
   * Navigate to a screen. Pushes a history entry (so Back returns to the
   * previous screen) and updates the URL hash.
   */
  const navigate = useCallback((nextView, opts = {}) => {
    const nextLevel = opts.level !== undefined ? opts.level : null;
    const nextUnit = opts.unit !== undefined ? opts.unit : null;
    const hash = buildHash(nextView, nextLevel, nextUnit);

    // Only push a new entry if the hash actually changes (avoids stacking
    // duplicate home entries, e.g. when navigating home from home).
    if (window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }

    setView(nextView);
    setLevel(nextLevel);
    setUnit(nextUnit);
  }, []);

  return { view, level, unit, navigate };
}
