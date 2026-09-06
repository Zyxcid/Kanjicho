import { useState, useEffect, useCallback, useRef } from "react";

/**
 * useRouter — router minimal berbasis hash untuk SPA ini.
 *
 * Tanpa integrasi history, tombol Back browser malah keluar dari app
 * karena pergantian layar tidak pernah menyentuh URL. Hook ini mengatasinya:
 * tiap layar dienkode ke hash (#/, #/browse, #/level/N5, #/quiz/N5-U1,
 * #/result/N5-U1), navigate() menambah entri history, dan popstate
 * (Back/Forward) membaca ulang layar dari hash — jadi Back berpindah
 * layar DI DALAM app. (Layar Progress #/progress sudah dihapus; hash
 * lama jatuh ke Home lewat fallback "tidak dikenal".)
 *
 * Layar bisa memasang GUARD navigasi (registerGuard) untuk menahan Back
 * browser: popstate memang tak bisa dibatalkan, tapi URL bisa dikembalikan
 * dengan pushState lalu layar menampilkan dialog konfirmasinya sendiri
 * (dipakai Quiz: keluar saat sesi berprogres harus lewat konfirmasi,
 * sama seperti tombol Cancel).
 */
const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

/**
 * Parse hash URL menjadi lokasi router: { view, level, unit }.
 */
export function parseHash(hash) {
  // Hash berbentuk "#/level/N5" — buang prefix "#/".
  const path = (hash || "").replace(/^#\/?/, "");
  const parts = path.split("/").filter(Boolean); // mis. ["level","N5"]

  if (parts.length === 0) return { view: "home", level: null, unit: null };

  const [seg, arg] = parts;

  if (seg === "browse") return { view: "browse", level: null, unit: null };

  if (seg === "level" && arg && LEVELS.includes(arg)) {
    return { view: "unitSelect", level: arg, unit: null };
  }

  if (seg === "quiz" && arg) {
    // Level diderive dari unit id ("N5-U1" → "N5").
    const lv = arg.split("-")[0];
    const level = LEVELS.includes(lv) ? lv : null;
    return { view: "quiz", level, unit: arg };
  }

  if (seg === "result" && arg) {
    const lv = arg.split("-")[0];
    const level = LEVELS.includes(lv) ? lv : null;
    return { view: "result", level, unit: arg };
  }

  // Hash tidak dikenal → pulang ke Home (fallback aman).
  return { view: "home", level: null, unit: null };
}

/** Susun hash URL untuk satu layar. */
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
  // Lokasi awal dibaca dari hash supaya deep link / reload mendarat di
  // layar yang tepat.
  const initial = parseHash(typeof window !== "undefined" ? window.location.hash : "");
  const [view, setView] = useState(initial.view);
  const [level, setLevel] = useState(initial.level);
  const [unit, setUnit] = useState(initial.unit);

  // Lokasi sekarang + guard aktif disimpan di ref: listener popstate
  // didaftarkan sekali saat mount, jadi closure state-nya akan basi —
  // keduanya harus dibaca lewat ref yang terus diperbarui.
  const locRef = useRef({ ...initial });
  const guardRef = useRef(null);

  // Kalau belum ada hash sama sekali, isi dengan home supaya Back pertama
  // punya tujuan (history dimulai dari home).
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/" );
    }
  }, []);

  // Back/Forward browser → turunkan ulang layar dari hash baru.
  useEffect(() => {
    function onPop() {
      const next = parseHash(window.location.hash);
      const guard = guardRef.current;
      const currentHash = buildHash(
        locRef.current.view,
        locRef.current.level,
        locRef.current.unit
      );
      // Guard aktif melarang keluar (layar kuis berprogres): popstate tak
      // bisa dibatalkan, tapi pushState mengembalikan URL ke layar
      // sekarang tanpa menambah popstate — lalu layar menampilkan dialog
      // konfirmasinya. Leave pada dialog memanggil history.back() lagi
      // (guard sengaja diloloskan lewat leavingRef, lihat Quiz.jsx).
      if (guard && window.location.hash !== currentHash && !guard.canLeave()) {
        window.history.pushState(null, "", currentHash);
        guard.onBlocked();
        return;
      }
      locRef.current = next;
      setView(next.view);
      setLevel(next.level);
      setUnit(next.unit);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /**
   * Pindah layar: tambah entri history (Back kembali ke layar sebelumnya)
   * dan perbarui hash URL.
   */
  const navigate = useCallback((nextView, opts = {}) => {
    const nextLevel = opts.level !== undefined ? opts.level : null;
    const nextUnit = opts.unit !== undefined ? opts.unit : null;
    const hash = buildHash(nextView, nextLevel, nextUnit);

    // Hanya push kalau hash benar-benar berubah (hindari entri home
    // bertumpuk saat navigate home dari home).
    if (window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }

    locRef.current = { view: nextView, level: nextLevel, unit: nextUnit };
    setView(nextView);
    setLevel(nextLevel);
    setUnit(nextUnit);
  }, []);

  /**
   * Pasang/lepas guard Back browser untuk layar yang sedang aktif
   * (null = lepas). Guard = { canLeave: () => boolean, onBlocked: fn };
   * dipasang lewat useEffect layar tsb. supaya otomatis lepas saat unmount.
   */
  const registerGuard = useCallback((guard) => {
    guardRef.current = guard;
  }, []);

  return { view, level, unit, navigate, registerGuard };
}
