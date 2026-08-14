import { useEffect, useState, useCallback } from "react";

/**
 * useTheme — minimal light/dark theme hook for the Vite app (no extra deps).
 *
 * - Stores the choice in localStorage under "kanji-theme".
 * - Reflects the active theme by toggling the `dark` class on <html>.
 * - Reads the saved theme on mount (defaults to "light") and applies it.
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

export function useTheme() {
  const [theme, setTheme] = useState("light");
  const [mounted, setMounted] = useState(false);

  // Read + apply on mount.
  useEffect(() => {
    const initial = readStoredTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const setAndPersist = useCallback((next) => {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {
      /* ignore write failures */
    }
  }, []);

  const toggle = useCallback(() => {
    setAndPersist(theme === "dark" ? "light" : "dark");
  }, [theme, setAndPersist]);

  return { theme, isDark: theme === "dark", mounted, toggle };
}
