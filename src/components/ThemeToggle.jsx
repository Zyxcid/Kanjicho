import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/useTheme.js";
import { t } from "../lib/i18n.js";

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
      aria-label={isDark ? t("theme.light.title") : t("theme.dark.title")}
      title={isDark ? t("theme.light.title") : t("theme.dark.title")}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      <span className="kd-theme-toggle-label">{isDark ? t("theme.light.label") : t("theme.dark.label")}</span>
    </button>
  );
}
