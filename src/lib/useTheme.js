import { useState, useCallback } from "react";

/**
 * useTheme — hook tema terang/gelap tanpa dependensi tambahan.
 *
 * Pilihan disimpan di localStorage ("kanji-theme") dan diterapkan dengan
 * men-toggle class `dark` di <html>. Nilai awal dibaca lewat lazy
 * initializer useState (jalan sekali di render pertama) supaya paint
 * pertama sudah memakai tema yang benar — tanpa efek kedip.
 *
 * Return { theme, isDark, toggle }.
 */
const STORAGE_KEY = "kanji-theme";

function readStoredTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch (_) {
    // localStorage bisa tidak tersedia (mode privat) — fallback ke light.
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
    // Abaikan kegagalan tulis.
  }
}

export function useTheme() {
  // Class di <html> langsung diterapkan di initializer supaya paint
  // pertama sudah benar.
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
