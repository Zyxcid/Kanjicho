import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/useTheme.js";

/**
 * Dark mode switch. A compact icon button that matches the genkouyoushi
 * aesthetic (surface card with paper-line border). Uses the useTheme hook,
 * which persists the choice to localStorage and toggles the `dark` class
 * on <html>.
 */
export default function ThemeToggle() {
  const { isDark, toggle } = useTheme();

  // Show Moon in light mode (click → go dark), Sun in dark mode (click → go light).
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
