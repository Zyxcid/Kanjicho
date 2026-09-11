import { useState, useEffect, useCallback, useRef } from "react";

/**
 * useRouter — router minimal berbasis hash untuk SPA ini.
 *
 * Tanpa integrasi history, tombol Back browser malah keluar dari app
 * karena pergantian layar tidak pernah menyentuh URL. Hook ini mengatasinya:
 * tiap layar dienkode ke hash (#/, #/browse, #/level/N5, #/quiz/N5-U1,
 * #/result/N5-U1), navigate() menambah entri history, dan popstate
 * (Back/Forward) membaca ulang layar dari hash — jadi Back berpindah layar
 * DI DALAM app. (Layar Progress #/progress sudah dihapus; hash lama jatuh
 * ke Home lewat fallback "tidak dikenal".)
 *
 * BACK DI MOBILE (t65) — dua keluhan yang diperbaiki:
 *
 * 1. "Setelah selesai kuis dan klik Home, Back malah kembali ke layar
 *    hasil." Penyebab: tombol Home menumpuk entri baru di atas entri
 *    result, jadi Back "membuka kembali" result yang sudah ditinggalkan.
 *    Solusi: navigasi naik (result → home/unit, cancel kuis, back browse/
 *    unitSelect) kini MELIPAT entri (collapse) — mundur ke entri yang sudah
 *    ada di tumpukan lalu menimpanya dengan hash tujuan, bukan menambah
 *    entri baru. Tombol Home dari layar hasil bahkan reset sampai akar
 *    (entri pertama app) → Back dari home keluar dari app, persis seperti
 *    harapan pengguna ponsel.
 *
 * 2. "Menutup overlay dengan Back malah berpindah halaman." Penyebab:
 *    overlay (modal detail Browse / Help / kalender review) tidak pernah
 *    menyentuh history. Solusi: setiap overlay yang dibuka MENAMBAH entri
 *    history sendiri (hash sama dengan layar, ditandai state kdOv). Back
 *    saat overlay terbuka hanya memunculkan popstate yang menutup overlay
 *    — layar tidak berubah; menutup lewat tombol ✕ / Escape / backdrop
 *    mengonsumsi entri itu (history.back()) supaya tumpukan tetap bersih.
 *
 * Kedalaman entri app dilacak di history.state ({ kd: n }): entri pertama
 * app = 0, tiap push +1. Inilah yang membuat collapse tahu seberapa jauh
 * mundur tanpa pernah melampaui entri pertama (di luar sana halaman
 * non-app / awal history milik browser). State entri bertahan lintas
 * reload, jadi hitungan tetap sahih.
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

/* ---------------------------------------------------------------- *
 * Manajemen entri history untuk OVERLAY (modal) — t65.
 *
 * Tumpukan overlay hidup di scope modul (bukan state React) karena
 * listener popstate didaftarkan sekali dan closure-nya basi. Fungsi-fungsi
 * di bawah dipakai komponen overlay (HelpButton, Browse, App/kalender):
 *   pushOverlayEntry(close)     — saat overlay dibuka
 *   closeOverlayUI(close)       — saat ditutup lewat UI (✕/Escape/backdrop)
 *   discardOverlayEntry(close)  — saat ditutup programatik sambil navigasi
 * ---------------------------------------------------------------- */
const overlayStack = []; // LIFO: callback penutup tiap overlay yang hidup
let ovSeq = 0; // penanda unik entri overlay (kdOv) di history.state

function currentDepth() {
  const kd = window.history.state && window.history.state.kd;
  return typeof kd === "number" ? kd : 0;
}

/**
 * Buka overlay: tambahkan entri history yang MEMBAGI hash layar sekarang
 * (ditandai state kdOv). Back saat overlay terbuka memunculkan popstate
 * yang menutup overlay — layar tidak berpindah. Entri ini juga bertindak
 * sebagai "bookmark": kalau overlay ditutup programatik tanpa mengonsumsi
 * entri (mis. klik unit due di kalender → langsung masuk kuis), entri
 * basi itu akan diganti entri layar berikutnya (lihat navigate) — tidak
 * pernah menghalangi Back.
 */
export function pushOverlayEntry(close) {
  if (typeof close !== "function") return;
  window.history.pushState({ kd: currentDepth() + 1, kdOv: ++ovSeq }, "", window.location.hash);
  overlayStack.push(close);
}

/**
 * Tutup overlay lewat UI (tombol ✕, Escape, klik backdrop): jalankan
 * penutupnya lalu KONSUMSI entri overlay dengan history.back() — kalau
 * tidak, pengguna harus menekan Back dua kali (satu untuk entri mati,
 * satu untuk benar-benar berpindah). popstate yang dihasilkan mendarat
 * di hash layar yang sama → sinkronisasi view menjadi no-op.
 */
export function closeOverlayUI(close) {
  if (typeof close !== "function") return;
  const i = overlayStack.lastIndexOf(close);
  if (i === -1) {
    // Overlay sudah ditutup lewat Back (tumpukan sudah membuangnya) —
    // cukup pastikan UI-nya tertutup juga (idempotent).
    close();
    return;
  }
  overlayStack.splice(i, 1);
  close();
  window.history.back();
}

/**
 * Buang penutup overlay dari tumpukan TANPA menyentuh history — untuk
 * penutupan programatik yang langsung disusul navigasi layar (entri basi
 * digantikan oleh navigate; lihat komentar pushOverlayEntry).
 */
export function discardOverlayEntry(close) {
  if (typeof close !== "function") return;
  const i = overlayStack.lastIndexOf(close);
  if (i !== -1) overlayStack.splice(i, 1);
}

/**
 * useDialogOverlay — state dialog/confirm kecil yang terintegrasi dengan
 * history Back (t65). Pemakaian:
 *   const [value, openDialog, closeDialogUI, dismissDialog] = useDialogOverlay();
 *   - openDialog(v)    : buka dialog (value = v, default true) + entri overlay.
 *   - closeDialogUI()  : tutup lewat UI (tombol Cancel / ✕ / backdrop) —
 *                        KONSUMSI entri overlay (Back setelahnya benar-benar
 *                        berpindah layar).
 *   - dismissDialog()  : tutup programatik TANPA konsumsi — untuk jalur yang
 *                        langsung disusul navigate() (aksi utama dialog);
 *                        entri basi digantikan entri layar berikutnya.
 *   - Back saat dialog terbuka → popstate menutup dialog, layar tidak
 *     berpindah (persis overlay lain).
 * value null = tertutup; nilai lain (true / unitId / …) = terbuka.
 */
export function useDialogOverlay(initialValue = null) {
  const [value, setValue] = useState(initialValue);
  const closeRef = useRef(null);

  const openDialog = useCallback((v = true) => {
    setValue(v);
    // Hanya push kalau belum ada entri HIDUP: setelah ditutup lewat Back
    // (popstate membuang penutup dari tumpukan) ref lama jadi basi —
    // tanpa cek keanggotaan tumpukan, membuka ulang tidak mendapat entri
    // dan Back berikutnya malah berpindah layar.
    if (!isOverlayEntryRegistered(closeRef.current)) {
      closeRef.current = () => setValue(null);
      pushOverlayEntry(closeRef.current);
    }
  }, []);

  const closeDialogUI = useCallback(() => {
    const close = closeRef.current;
    closeRef.current = null;
    closeOverlayUI(close);
  }, []);

  const dismissDialog = useCallback(() => {
    const close = closeRef.current;
    closeRef.current = null;
    discardOverlayEntry(close);
    setValue(null);
  }, []);

  // Bersih-bersih defensif saat komponen pemilik dialog unmount.
  useEffect(() => () => {
    discardOverlayEntry(closeRef.current);
    closeRef.current = null;
  }, []);

  return [value, openDialog, closeDialogUI, dismissDialog];
}

/**
 * Apakah penutup ini MASIH terdaftar di tumpukan overlay (entri overlay
 * masih hidup)? Dipakai komponen untuk memutuskan perlu push entri baru
 * saat membuka ulang: penutup yang sudah dibuang popstate (Back) atau
 * closeOverlayUI tertinggal sebagai referensi basi di ref komponen.
 */
export function isOverlayEntryRegistered(close) {
  return typeof close === "function" && overlayStack.lastIndexOf(close) !== -1;
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
  // Navigasi "collapse" yang sedang menunggu popstate pendaratan
  // (history.go asinkron): { targetDepth, apply } — apply menimpa entri
  // tujuan dengan hash target lalu menyinkronkan view.
  const pendingCollapseRef = useRef(null);

  // Tandai entri pertama app dengan kedalaman 0 (kd) — dasar perhitungan
  // collapse. Kalau belum ada hash sama sekali, isi dengan home supaya
  // Back pertama punya tujuan (history dimulai dari home). history.state
  // bertahan lintas reload, jadi penandaan ini hanya terjadi sekali.
  useEffect(() => {
    const st = window.history.state;
    if (!window.location.hash) {
      window.history.replaceState({ kd: 0 }, "", "#/");
    } else if (!st || typeof st.kd !== "number") {
      window.history.replaceState({ kd: 0 }, "", window.location.hash);
    }
  }, []);

  // Back/Forward browser → turunkan ulang layar dari hash baru.
  useEffect(() => {
    function syncFromHash() {
      const next = parseHash(window.location.hash);
      locRef.current = next;
      setView(next.view);
      setLevel(next.level);
      setUnit(next.unit);
    }

    function onPop() {
      const st = window.history.state || {};

      // (1) Mendarat di entri overlay BASI (overlay sudah ditutup
      //     programatik, entri history tertinggal di tumpukan) → lompati
      //     dengan mundur sekali lagi; popstate berikutnya menangani
      //     entri layar yang sebenarnya jadi tujuan Back.
      if (st.kdOv) {
        window.history.back();
        return;
      }

      // (2) Overlay hidup + Back → tutup overlay TERATAS dan tetap di
      //     layar ini (entri overlay membagi hash layar, jadi hash tidak
      //     berubah). Defensif: kalau hash ternyata berubah (kasus
      //     bertingkat yang tidak terjadi di app ini), sinkronkan view.
      if (overlayStack.length > 0) {
        const close = overlayStack.pop();
        close();
        const currentHash = buildHash(
          locRef.current.view,
          locRef.current.level,
          locRef.current.unit
        );
        if (window.location.hash === currentHash) return;
        syncFromHash();
        return;
      }

      // (3) Navigasi "collapse" yang sedang berjalan (lihat navigate):
      //     go() asinkron baru saja mendarat di entri tujuan — timpa
      //     dengan hash target dan sinkronkan view. Kedalaman diperiksa
      //     supaya popstate lain (mis. traversal yang dibatalkan oleh
      //     pushState berikutnya) tidak salah menjalankan collapse lama.
      const pending = pendingCollapseRef.current;
      if (pending && st.kd === pending.targetDepth) {
        pendingCollapseRef.current = null;
        pending.apply();
        return;
      }
      if (pending) pendingCollapseRef.current = null; // traversal batal — buang

      // (4) Jalur normal: guard kuis (Back browser saat sesi berprogres)
      //     atau pergantian layar biasa.
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
        window.history.pushState({ kd: currentDepth() + 1 }, "", currentHash);
        guard.onBlocked();
        return;
      }
      syncFromHash();
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /**
   * Pindah layar. Opsi:
   *   - { level, unit }   : parameter route.
   *   - { replace: true } : timpa entri sekarang (tidak menambah history).
   *   - { collapse: n }   : MELIPAT n entri — mundur n langkah lalu timpa
   *                         entri tujuan dengan hash baru (untuk navigasi
   *                         "naik": cancel kuis → unit, result → unit).
   *   - { reset: true }   : lipat sampai ENTRI PERTAMA app (kd 0) — dipakai
   *                         tombol Home di layar hasil: Back dari home
   *                         keluar dari app, bukan menghidupkan result lagi.
   *
   * Push biasa juga menangani satu kasus: kalau entri teratas adalah entri
   * overlay basi (overlay ditutup programatik tanpa mengonsumsinya — mis.
   * klik unit due di kalender langsung masuk kuis), entri layar baru
   * MENGGANTIKAN entri basi itu (replace), bukan menimbunnya.
   */
  const navigate = useCallback((nextView, opts = {}) => {
    const nextLevel = opts.level !== undefined ? opts.level : null;
    const nextUnit = opts.unit !== undefined ? opts.unit : null;
    const hash = buildHash(nextView, nextLevel, nextUnit);

    // Navigasi baru selalu membatalkan collapse yang belum mendarat
    // (traversal go() yang masih antre bisa dibatalkan oleh pushState).
    pendingCollapseRef.current = null;

    const d = currentDepth();
    const back = opts.reset
      ? d // reset: lipat sampai entri pertama app
      : Math.min(typeof opts.collapse === "number" ? opts.collapse : 0, d);

    const applyAt = (depth) => {
      window.history.replaceState({ kd: depth }, "", hash);
      locRef.current = { view: nextView, level: nextLevel, unit: nextUnit };
      setView(nextView);
      setLevel(nextLevel);
      setUnit(nextUnit);
    };

    if (back > 0) {
      // Lipat: mundur `back` entri (satu popstate di ujung), lalu popstate
      // handler menjalankan applyAt(targetDepth) — lihat onPop (3).
      const targetDepth = d - back;
      pendingCollapseRef.current = { targetDepth, apply: () => applyAt(targetDepth) };
      // OPTIMISTIK (t74): view/level/unit dipindahkan SEKARANG, sebelum
      // popstate mendarat. Tanpa ini ada satu siklus render penuh yang
      // masih memakai view LAMA — dan efek pembersih sesi di App.jsx
      // ("view !== quiz → setQuiz(null)") MENYAPU kuis yang baru saja
      // dipasang (navigate dipanggil SETELAH setQuiz di startWeakReview),
      // sehingga tombol "Review again" hasilnya jatuh ke Home (quiz null
      // → route "weak" tidak punya sesi → fallback Home). Dengan sinkron
      // view, setQuiz + setView masuk SATU batch render — efek pembersih
      // melihat view quiz yang sudah benar. popstate kemudian hanya
      // menimpa entri history tujuan (applyAt no-op untuk state view).
      locRef.current = { view: nextView, level: nextLevel, unit: nextUnit };
      setView(nextView);
      setLevel(nextLevel);
      setUnit(nextUnit);
      window.history.go(-back);
      return;
    }

    if (opts.replace) {
      applyAt(d);
      return;
    }

    // Hanya push kalau hash benar-benar berubah (hindari entri home
    // bertumpuk saat navigate home dari home).
    if (window.location.hash !== hash) {
      const st = window.history.state || {};
      if (st.kdOv) {
        // Entri teratas = overlay basi → ganti, jangan timbun.
        window.history.replaceState({ kd: st.kd }, "", hash);
      } else {
        window.history.pushState({ kd: d + 1 }, "", hash);
      }
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
