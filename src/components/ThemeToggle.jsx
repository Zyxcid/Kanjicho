import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/useTheme.js";
import { t } from "../lib/i18n.js";

/**
 * Tombol dark mode — ikon lingkaran 36px, satu keluarga bentuk dengan
 * tombol Help dan toggle skrip あ/Aa di topbar (t90; dulu pill berlabel
 * yang bentuk dan lebarnya beda dari tetangganya — topbar terasa kacau).
 * Label teks pensiun: ikon bulan/matahari sudah umum terbaca, nama mode
 * tetap tersedia lewat title/aria-label (screen reader + tooltip).
 *
 * Logika tema ada di hook useTheme (persist ke localStorage, toggle class
 * `dark` di <html>; sinkron warna ikon status bar Android — t91).
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
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
