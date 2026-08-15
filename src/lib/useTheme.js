import { useState, useCallback } from "react";

/**
 * useTheme — minimal light/dark theme hook for the Vite app (no extra deps).
 *
 * - Stores the choice in localStorage under "kanji-theme".
 * - Reflects the active theme by toggling the `dark` class on <html>.
 * - Reads the saved theme via a lazy useState initializer (runs once on
 *   first render), so the theme is correct from the very first paint —
 *   no effect, no mounted guard, no hydration flash (Vite is pure CSR).
 *
 * Returns { theme, isDark, toggle }.
 */
const STORAGE_KEY = "kanji-theme";

function readStoredTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch (_) {
    /* localStorage may be unavailable (private mode) — fall back to light. */
  }
  return "light";
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

function persist(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {
    /* ignore write failures */
  }
}

export function useTheme() {
  // Lazy initializer: read localStorage once on first render. The initial
  // class on <html> is also applied here so the very first paint is correct.
  const [theme, setTheme] = useState(() => {
    const initial = readStoredTheme();
    applyTheme(initial);
    return initial;
  });

  const toggle = useCallback(() => {
    setTheme((cur) => {
      const next = cur === "dark" ? "light" : "dark";
      applyTheme(next);
      persist(next);
      return next;
    });
  }, []);

  return { theme, isDark: theme === "dark", toggle };
}
