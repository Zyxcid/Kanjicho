import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/useTheme.js";

/**
 * Dark mode switch. A compact icon button that matches the genkouyoushi
 * aesthetic (surface card with paper-line border). Uses the useTheme hook,
 * which persists the choice to localStorage and toggles the `dark` class
 * on <html>.
 *
 * `mounted` guards the rendered icon so server/first-paint and client agree
 * (avoids a hydration-style icon flash).
 */
export default function ThemeToggle() {
  const { isDark, mounted, toggle } = useTheme();

  return (
    <button
      type="button"
      className="kd-theme-toggle"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Show Moon in light mode (click → go dark), Sun in dark mode (click → go light).
          Before mount, render a neutral Moon so layout is stable. */}
      {mounted ? (isDark ? <Sun size={15} /> : <Moon size={15} />) : <Moon size={15} />}
      <span className="kd-theme-toggle-label">{mounted ? (isDark ? "Light" : "Dark") : "Dark"}</span>
    </button>
  );
}
