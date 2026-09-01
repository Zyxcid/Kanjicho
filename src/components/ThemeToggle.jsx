import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/useTheme.js";

/**
 * Tombol dark mode — ikon kecil yang serasi dengan estetika genkouyoushi.
 * Logika tema ada di hook useTheme (persist ke localStorage, toggle class
 * `dark` di <html>).
 */
export default function ThemeToggle() {
  const { isDark, toggle } = useTheme();

  // Tampilkan Moon saat light (klik → gelap), Sun saat dark (klik → terang).
  return (
    <button
      type="button"
      className="kd-theme-toggle"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      <span className="kd-theme-toggle-label">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
