import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LEVEL_IDS, getUnitsForLevel, getLevelMeta, loadLevelKanji } from "./lib/dataLoader.js";
import { createInitialUnitState, reviewUnit, migrateUnitState } from "./lib/srs.js";
import { generateQuiz, generateWeakQuiz, scoreQuiz } from "./lib/quizGenerator.js";
import { computeStudyStats } from "./lib/studyStats.js";
import * as storage from "./lib/storage.js";
import { useRouter } from "./lib/useRouter.js";
import { pushOverlayEntry, closeOverlayUI, discardOverlayEntry } from "./lib/useRouter.js";

import Home from "./components/Home.jsx";
import UnitSelect from "./components/UnitSelect.jsx";
import Quiz from "./components/Quiz.jsx";
import Result from "./components/Result.jsx";
import Toast from "./components/Toast.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import Browse from "./components/Browse.jsx";
import CalendarModal from "./components/CalendarModal.jsx";
import { buildScheduleEntries } from "./components/ReviewCalendar.jsx";
import HelpButton from "./components/HelpButton.jsx";

export function unitStatus(state) {
  if (!state || state.stability === null) return "new";
  const daysLeft = daysUntil(state.nextReviewAt);
  if (daysLeft <= 0) return "due";
  if (state.stability >= 30) return "mastered";
  return "scheduled";
}

export function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function App() {
  // Navigasi layar lewat hash URL (useRouter) supaya tombol Back browser
  // berpindah layar di dalam app, bukan keluar. registerGuard dipakai
  // layar kuis untuk menahan Back browser saat sesi masih berprogres.
  const { view, level: routeLevel, unit: routeUnit, navigate, registerGuard } = useRouter();

  // Skrip tampilan kana/romaji: "romaji" (default, ramah pemula) atau
  // "kana" (autentik — melatih baca kana langsung). Mengatur seluruh layar
  // kuis: label pilihan jawaban, bacaan On/Kun di panel reveal, dan reading
  // contoh kata. Disimpan di localStorage supaya bertahan lintas sesi;
  // toggle berlaku LIVE (pilihan soal menyimpan kana+romaji sekaligus,
  // reveal dikonversi runtime — lihat lib/kana.js).
  const [answerScript, setAnswerScript] = useState(
    () => localStorage.getItem("kanji-answer-script") || "romaji"
  );

  // Tombol "Reset progress" per level (UnitSelect) disembunyikan secara
  // default — destruktif dan jarang dipakai. Toggle-nya ada di modal Help
  // (seksi Progress, sebelah tombol backup) supaya layar utama bersih.
  const [showReset, setShowReset] = useState(
    () => localStorage.getItem("kanji-show-reset") === "1"
  );

  function toggleShowReset() {
    setShowReset((v) => {
      const next = !v;
      localStorage.setItem("kanji-show-reset", next ? "1" : "0");
      return next;
    });
  }

  function toggleAnswerScript() {
    setAnswerScript((s) => {
      const next = s === "kana" ? "romaji" : "kana";
      localStorage.setItem("kanji-answer-script", next);
      return next;
    });
  }

  // activeLevel/activeUnit tertinggal dari route supaya UnitSelect tetap
  // menampilkan level yang benar saat kita sempat route home (mis. Cancel
  // kuis kembali ke level asal kuisnya).
  const [activeLevel, setActiveLevel] = useState(routeLevel || "N5");
  const [activeUnit, setActiveUnit] = useState(routeUnit);

  const [progress, setProgress] = useState({}); // unitId -> srsState
  // Log seluruh kuis (quizAttempts) — sumber streak, hari belajar, dan
  // titik aktivitas kalender overlay (semua via computeStudyStats).
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState(null);
  // Mode sesi kuis yang sedang berjalan:
  //   "srs"      — kuis sungguhan: update jadwal SRS + kanjiStats + streak
  //   "practice" — latihan bebas: tidak mengubah apa pun
  //   "weak"     — missed kanji review: update kanjiStats + streak, tanpa SRS
  const [quizMode, setQuizMode] = useState("srs");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);
  // Unit yang dimiliki sesi kuis/hasil DI MEMORI — dipakai mendeteksi hash
  // yang tidak lagi sesuai (mis. Back browser mendarat di hash kuis unit
  // lain): state kuis hidup di memori, bukan di URL, jadi hash dan sesi
  // bisa berbeda setelah navigasi history.
  const [quizRouteUnit, setQuizRouteUnit] = useState(null);
  const [resultRouteUnit, setResultRouteUnit] = useState(null);
  // Kanji yang sedang "missed" (pernah salah, belum ditebus) — untuk pill
  // "✕ N" di sebelah judul kartu unit (UnitSelect). Daftar ini sudah
  // disaring dari kanji milik unit yang jatuh tempo (lihat
  // resetMissedForDueUnits di bawah).
  const [weakKanji, setWeakKanji] = useState([]);
  // Level & unit asal sesi missed review — untuk tombol "Back to Units"
  // (kembali ke daftar unit level itu) DAN tombol "Review again" di layar
  // Result (mengulang sesi remedial unit yang sama tanpa pulang dulu).
  const [weakOriginLevel, setWeakOriginLevel] = useState(null);
  const [weakOriginUnit, setWeakOriginUnit] = useState(null);

  // Overlay kalender review (CalendarModal), dibuka dari klik kartu "Due
  // now" di panel statistik. `calendarLevel` null = semua level (Home),
  // "N5" dsb. = ter-filter level itu (UnitSelect, sejalan dengan angka
  // kartunya).
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLevel, setCalendarLevel] = useState(null);
  // Penutup overlay kalender yang terdaftar di tumpukan overlay router
  // (t65): identitasnya disimpan supaya penutupan UI vs programatik bisa
  // membuang entri yang tepat dari tumpukan.
  const calCloseRef = useRef(null);

  // Streak & riwayat belajar (current/longest streak, hari unik, aktivitas
  // per hari) diderive dari attempts — streak & doneToday mengisi KARTU
  // STREAK (api + angka, satu baris sama ukuran dengan kartu statistik
  // lain — StatCards), aktivitas per hari mengisi titik kalender overlay.
  const studyStats = useMemo(() => computeStudyStats(attempts), [attempts]);

  // Lookup cepat kanji → "sedang missed" (Set of chars) untuk UnitSelect.
  const weakChars = useMemo(() => new Set(weakKanji.map((r) => r.kanji)), [weakKanji]);

  // Sinkronkan activeLevel/activeUnit dengan route saat user navigasi.
  useEffect(() => {
    if (routeLevel) setActiveLevel(routeLevel);
    if (routeUnit) setActiveUnit(routeUnit);
  }, [routeLevel, routeUnit]);

  /**
   * Reset missed-kanji milik unit yang sedang DUE (usulan user): begitu
   * kartu unit jatuh tempo, daftar missed unit itu dikosongkan — kuis
   * review yang jatuh tempo menguji ulang SELURUH unit sebagai pengukuran
   * ingatan yang bersih, tanpa "bantuan" sesi remedial missed yang belum
   * dikerjakan ikut menumpuk di pill / menggelembungkan wrongCount.
   * Dilakukan SEKALI saat data dimuat (buka app / reset level) karena
   * momen "menjadi due" selalu terjadi saat app tertutup — interval
   * review minimal 6 jam (Relearning), jauh melampaui satu sesi.
   *
   * @param {Array} records - record unitProgress mentah dari IndexedDB
   *   (punya unitId, jlptLevel, nextReviewAt).
   * @param {Array} weak - daftar weak kanji terkini (record kanjiStats).
   * @returns {Array} daftar weak yang tersisa setelah reset.
   */
  async function resetMissedForDueUnits(records, weak) {
    if (!weak || weak.length === 0) return weak;
    const now = Date.now();
    // Kumpulkan unit yang jatuh tempo, dikelompokkan per level.
    const dueByLevel = {};
    records.forEach((r) => {
      if (
        r.jlptLevel &&
        r.nextReviewAt &&
        new Date(r.nextReviewAt).getTime() <= now
      ) {
        if (!dueByLevel[r.jlptLevel]) dueByLevel[r.jlptLevel] = [];
        dueByLevel[r.jlptLevel].push(r.unitId);
      }
    });
    // Hanya level yang benar-benar punya kanji missed yang perlu dibaca
    // (loadLevelKanji di-cache, tapi tidak ada gunanya memuat level lain).
    const weakLevels = new Set(
      weak.map((w) => w.level).filter(Boolean)
    );
    const levels = Object.keys(dueByLevel).filter((l) => weakLevels.has(l));
    if (levels.length === 0) return weak;

    // Kanji mana pun yang termasuk unit due → baris kanjiStats-nya dihapus.
    const toClear = new Set();
    for (const level of levels) {
      const pool = await loadLevelKanji(level);
      const dueUnits = dueByLevel[level];
      pool.forEach((k) => {
        if (dueUnits.includes(k.unit)) toClear.add(k.kanji);
      });
    }
    if (toClear.size === 0) return weak;
    await storage.clearKanjiStats([...toClear]);
    return weak.filter((w) => !toClear.has(w.kanji));
  }

  // Muat ulang seluruh data dari IndexedDB ke state React. Dipakai saat
  // app dibuka dan setelah progress satu level dihapus (Reset progress di
  // UnitSelect) — semua layar yang bergantung state ini (Home, kartu unit,
  // streak, pill missed, badge PWA) otomatis ikut bersih tanpa reload.
  // Record unitProgress lawas (model kurva lupa lama, tanpa field
  // difficulty) dimigrasikan ke FSRS-6 saat dimuat — S dipertahankan
  // sebagai jangkar kontinuitas supaya jadwal yang sedang berjalan
  // tidak melompat (lihat migrateUnitState di srs.js).
  function loadAllData() {
    return Promise.all([
      storage.getAllProgress(),
      storage.getAllQuizAttempts(),
      storage.getWeakKanji(),
    ]).then(async ([records, attempts, weak]) => {
      const map = {};
      records.forEach((r) => {
        map[r.unitId] = migrateUnitState(r);
      });
      // Missed-kanji unit yang jatuh tempo direset dulu (pengukuran
      // bersih saat review due — lihat resetMissedForDueUnits).
      const weakAfterReset = await resetMissedForDueUnits(records, weak);
      setProgress(map);
      setAttempts(attempts);
      setWeakKanji(weakAfterReset);
    });
  }

  useEffect(() => {
    loadAllData().finally(() => setLoading(false));
  }, []);

  // Buang state kuis begitu sesinya tidak lagi dipakai: layar kuis
  // ditinggalkan (selesai, Cancel, atau Leave dari dialog Back browser),
  // ATAU route kuis menunjuk unit lain. Hash #/quiz tanpa state kuis yang
  // cocok jatuh ke daftar unit (lihat effectiveView), jadi Back browser
  // tidak bisa menghidupkan kembali sesi yang sudah ditinggalkan/selesai
  // — sekaligus mencegah jawaban tercatat dua kali lewat tombol Continue
  // di sesi zombi tersebut.
  useEffect(() => {
    if (view !== "quiz" || (quiz && routeUnit !== quizRouteUnit)) setQuiz(null);
  }, [view, routeUnit, quizRouteUnit, quiz]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // Shortcut global: q = klik tombol back (".kd-back") di layar yang punya
  // tombol itu. Diimplementasikan dengan meng-KLIK tombolnya (bukan
  // navigasi langsung) supaya shortcut menempuh alur yang sama dengan klik
  // mouse — termasuk dialog konfirmasi keluar kuis di Quiz.jsx.
  useEffect(() => {
    function handleBackKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+Q/Cmd+Q = OS/browser
      if (e.key.toLowerCase() !== "q") return;
      // User sedang mengetik (search box Browse) — jangan direbut.
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      // Modal terbuka (help / detail Browse / konfirmasi) — shortcut tidak
      // menembus modal.
      if (document.querySelector(".kd-modal-overlay")) return;
      // Home & Result tidak punya tombol back → q tidak melakukan apa-apa.
      document.querySelector(".kd-back")?.click();
    }
    window.addEventListener("keydown", handleBackKey);
    return () => window.removeEventListener("keydown", handleBackKey);
  }, []);

  // Statistik satu set unit: berapa yang pernah dikuiskan ("studied"),
  // jatuh tempo ("due"), dikuasai ("mastered"), + review terdekat
  // (unit + hari).
  function computeStats(units) {
    let studied = 0, due = 0, mastered = 0;
    let soonestAt = null, soonestUnit = null;
    units.forEach((u) => {
      const state = progress[u];
      const status = unitStatus(state);
      if (status === "due") due++;
      else if (status === "mastered") mastered++;
      // "Studied" = pernah dikerjakan minimal sekali.
      if (state && state.stability !== null) studied++;
      // Cari nextReviewAt terdekat di antara unit yang sudah dipelajari.
      if (state && state.nextReviewAt) {
        const at = new Date(state.nextReviewAt).getTime();
        if (soonestAt === null || at < soonestAt) {
          soonestAt = at;
          soonestUnit = u;
        }
      }
    });
    let nextReviewDays = null;
    if (soonestAt !== null) {
      nextReviewDays = Math.ceil((soonestAt - Date.now()) / (1000 * 60 * 60 * 24));
    }
    return {
      studied,
      due,
      mastered,
      total: units.length,
      nextReviewDays,
      nextReviewUnit: soonestUnit,
      // Timestamp jatuh tempo terdekat — kartu "Due now" memakai ini untuk
      // sufiks presisi jam ("next 6h" untuk unit Relearning, bukan "tomorrow").
      nextReviewAt: soonestAt,
    };
  }

  // Stats agregat semua level (Home, sebelum user pilih level tertentu).
  const allLevelsStats = useMemo(
    () => computeStats(LEVEL_IDS.flatMap((l) => getUnitsForLevel(l))),
    [progress]
  );

  // Stats per level untuk badge tiap kartu level di Home.
  const levelStatsMap = useMemo(() => {
    const map = {};
    LEVEL_IDS.forEach((l) => {
      map[l] = computeStats(getUnitsForLevel(l));
    });
    return map;
  }, [progress]);

  // Badge angka "due" di ikon app (PWA ter-install & browser dukung).
  // Hanya ter-update saat app terbuka — bukan push notification
  // (lihat catatan di README). Feature-detect untuk browser yang belum
  // dukung (mis. Safari/iOS).
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const due = allLevelsStats.due;
    if (due > 0) {
      navigator.setAppBadge(due).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [allLevelsStats.due]);

  // Stats level yang sedang dibuka (layar pilih unit).
  const levelStats = useMemo(
    () => computeStats(getUnitsForLevel(activeLevel)),
    [progress, activeLevel]
  );

  function openLevel(level) {
    setActiveLevel(level);
    navigate("unitSelect", { level });
  }

  // Buka overlay kalender review dari kartu "Due now". Bukan route/hash —
  // overlay memang ephemeral; tapi SEJAK t65 tiap overlay membuka entri
  // history sendiri (pushOverlayEntry) sehingga tombol Back di mobile
  // menutup overlay-nya alih-alih berpindah halaman. Penutupan lewat UI
  // (✕ / Escape / backdrop) mengonsumsi entri itu kembali.
  function openCalendar(level = null) {
    setCalendarLevel(level);
    if (!calendarOpen) {
      calCloseRef.current = () => setCalendarOpen(false);
      pushOverlayEntry(calCloseRef.current);
    }
    setCalendarOpen(true);
  }

  // Tutup kalender lewat UI (✕ / Escape / backdrop dari CalendarModal) —
  // konsumsi entri overlay supaya tumpukan history tetap bersih.
  function closeCalendarUI() {
    const close = calCloseRef.current;
    calCloseRef.current = null;
    closeOverlayUI(close);
  }

  // Jadwal review untuk overlay kalender, ter-filter sesuai konteks kartu
  // yang membukanya (Home = semua level, UnitSelect = level aktif).
  const calendarEntries = useMemo(
    () => (calendarOpen ? buildScheduleEntries(progress, calendarLevel) : []),
    [calendarOpen, progress, calendarLevel]
  );

  // Klik unit overdue di overlay: tutup overlay dulu, baru buka kuisnya —
  // supaya overlay tidak menutupi layar kuis. Entri overlay ditinggalkan
  // "basi" di history (tanpa konsumsi — history.back() asinkron akan
  // bertabrakan dengan pushState kuis); entri basi itu otomatis DIGANTI
  // entri kuis oleh navigate() — lihat useRouter.navigate.
  function jumpFromCalendar(unitId) {
    setCalendarOpen(false);
    discardOverlayEntry(calCloseRef.current);
    calCloseRef.current = null;
    jumpToNextReview(unitId);
  }

  // Navigasi apa pun (termasuk Back browser yang mengubah layar di belakang
  // overlay) menutup overlay kalender — overlay tidak boleh bertahan lintas
  // layar. Klik unit overdue sudah menutup eksplisit; ini menutup jalur lain.
  // (Back saat overlay terbuka TIDAK lewat sini — popstate menutup overlay
  // tanpa mengubah layar, lihat useRouter.onPop (2).)
  useEffect(() => {
    setCalendarOpen(false);
    discardOverlayEntry(calCloseRef.current);
    calCloseRef.current = null;
  }, [view]);

  // Parameter kedua (level) dipakai kalau unit yang dibuka BUKAN dari
  // activeLevel — mis. klik unit di overlay kalender (yang bisa menunjuk
  // unit level mana pun). Tanpa itu, fallback ke activeLevel.
  //
  // Mode kuis DIDERIVE dari status unit, bukan dipilih user:
  //   - "new" / "due" → kuis SRS: satu-satunya yang menggerakkan jadwal
  //     SRS, streak, dan statistik.
  //   - lainnya (scheduled/mastered) → latihan bebas: kuis yang sama tapi
  //     tidak menulis apa pun. Unit scheduled tampak redup + popup
  //     konfirmasi singkat saat diklik; tanpa label "practice" di UI.
  async function startUnit(unitId, level = activeLevel) {
    const status = unitStatus(progress[unitId]);
    const mode = status === "new" || status === "due" ? "srs" : "practice";
    // loadLevelKanji() sudah di-cache — kalau UnitSelect lebih dulu load
    // level ini (biasanya sudah, untuk preview strip), baris ini langsung
    // resolve dari cache.
    const pool = await loadLevelKanji(level);
    if (pool.length < 4) {
      showToast("This level doesn't have enough kanji to generate distractors.");
      return;
    }
    const kanjiInUnit = pool.filter((k) => k.unit === unitId);
    setActiveLevel(level);
    setActiveUnit(unitId);
    setQuizMode(mode);
    setQuizRouteUnit(unitId);
    setQuiz(generateQuiz(kanjiInUnit, pool));
    setQIndex(0);
    setAnswers([]);
    setSelectedChoice(null);
    navigate("quiz", { level, unit: unitId });
  }

  // Missed-kanji review per unit: kumpulkan kanji unit itu yang pernah
  // dijawab salah dan belum ditebus (lihat WEAK_REDEEM_CORRECT_STREAK di
  // storage.js), lalu buat kuis darinya. Panjang sesi = semua missed kanji
  // unit itu (tanpa batas).
  // navOpts diteruskan ke navigate() — "Review again" dari layar hasil
  // memakai { collapse: 1 } supaya entri hasil LAMA diganti entri kuis
  // baru (Back saat keluar sesi tidak menghidupkan hasil basi).
  async function startWeakReview(unitId, navOpts) {
    const pool = await loadLevelKanji(activeLevel);
    if (pool.length < 4) {
      showToast("This level doesn't have enough kanji to generate distractors.");
      return;
    }
    const entries = pool.filter((k) => k.unit === unitId && weakChars.has(k.kanji));

    if (entries.length === 0) {
      showToast("No missed kanji in this unit right now.");
      return;
    }

    setWeakOriginLevel(activeLevel);
    setWeakOriginUnit(unitId);
    setQuizMode("weak");
    setQuizRouteUnit("weak");
    setQuiz(generateWeakQuiz(entries, { [activeLevel]: pool }));
    setQIndex(0);
    setAnswers([]);
    setSelectedChoice(null);
    navigate("quiz", { unit: "weak", ...(navOpts || {}) });
  }

  // Tombol "Reset progress" di UnitSelect: hapus seluruh progress level
  // itu (deleteLevelProgress di storage.js — dialog konfirmasinya ada di
  // UnitSelect), lalu muat ulang state. Kontribusi streak dari kuis level
  // itu ikut hilang karena streak dihitung ulang dari sisa attempts.
  async function resetLevelProgress(level) {
    await storage.deleteLevelProgress(level);
    await loadAllData();
    showToast(`${level} progress deleted`);
  }

  // Dipanggil dari baris overdue di layar Progress (panel hari & chip
  // prakiraan) — level unit di-derive dari progress-nya sendiri
  // (jlptLevel tersimpan per record; fallback prefix unitId untuk
  // state in-memory lama yang belum membawanya), tidak diasumsikan sama
  // dengan activeLevel.
  function jumpToNextReview(unitId) {
    if (!unitId) return;
    const state = progress[unitId];
    const dash = unitId.indexOf("-");
    const level =
      state?.jlptLevel || (dash > 0 ? unitId.slice(0, dash) : null);
    if (!level) return;
    startUnit(unitId, level);
  }

  function submitAnswer(choice) {
    // `choice` = indeks pilihan (number) atau DONT_KNOW. Indeks 0 valid,
    // jadi guard-nya `!== null`, bukan truthiness.
    if (selectedChoice !== null) return;
    setSelectedChoice(choice);
  }

  async function handleContinue() {
    const newAnswers = [...answers, selectedChoice];
    if (qIndex + 1 < quiz.length) {
      setAnswers(newAnswers);
      setQIndex(qIndex + 1);
      setSelectedChoice(null);
      return;
    }

    const finalResult = scoreQuiz(quiz, newAnswers);
    const finishedAt = new Date();
    let extra = { mode: quizMode };

    if (quizMode === "srs") {
      const prevState = progress[activeUnit] || createInitialUnitState();
      // Jumlah soal ikut dikirim supaya adapter binomial menghitung z-score
      // dengan ukuran sampel yang benar (unit hampir selalu 15, tapi tidak
      // di-hardcode).
      // (t78) jlptLevel DILEKATKAN ke state in-memory: reviewUnit()
      // mengembalikan objek segar tanpa field itu — tanpa dilekatkan,
      // state in-memory pasca-kuis kehilangan levelnya sampai reload,
      // sehingga kalender review per-level (buildScheduleEntries)
      // menyaringnya keluar: jadwal "besok" unit N1 tidak ditandai di
      // kalender N1 padahal muncul di kalender semua level. Bentuk
      // in-memory kini identik dengan record IndexedDB
      // (saveUnitProgress menulis jlptLevel sebagai kolomnya sendiri).
      const newState = {
        ...reviewUnit(prevState, finalResult.score, finishedAt, finalResult.total),
        jlptLevel: activeLevel,
      };

      setProgress((p) => ({ ...p, [activeUnit]: newState }));
      // (t78) firstCompletion TIDAK lagi dilampirkan — kartu "Why the same
      // review date?" di layar Result dihapus; penjelasan jadwal awal
      // cukup dibawa help overlay (seksi Quiz).
      extra = { ...extra, newState };
    } else if (quizMode === "practice") {
      // Latihan bebas: lampirkan state SRS SAAT INI (tidak diubah sesi ini)
      // supaya layar Result tetap bisa menampilkan "next review" seperti
      // biasa.
      extra = { ...extra, existingState: progress[activeUnit] || null };
    }

    setResult({ ...finalResult, ...extra });
    setResultRouteUnit(quizMode === "weak" ? "weak" : activeUnit);
    navigate("result", quizMode === "weak" ? { unit: "weak" } : { level: activeLevel, unit: activeUnit });

    // Persist ke IndexedDB — tidak perlu ditunggu sebelum ganti layar
    // (UI sudah update optimistically dari state React di atas)
    if (quizMode === "srs") {
      await storage.saveUnitProgress(activeUnit, activeLevel, extra.newState);
      // Rating hasil adapter ikut dicatat di log attempt — bekal data
      // optimisasi parameter FSRS per pengguna di masa depan.
      await storage.logQuizAttempt(activeUnit, {
        ...finalResult,
        rating: extra.newState.lastRating,
      });
    } else if (quizMode === "weak") {
      // Weak review dihitung sebagai aktivitas belajar (streak) tapi tidak
      // mengubah jadwal SRS unit mana pun.
      await storage.logQuizAttempt("weak-review", finalResult);
    }
    // mode "practice": sengaja tidak menyimpan apa pun.

    if (quizMode === "srs" || quizMode === "weak") {
      await storage.updateKanjiStats(finalResult.details);

      // Berapa kanji yang MASIH missed setelah sesi ini (salah/"don't
      // know" lagi, atau belum ditebus). Dipakai Result untuk baris
      // "N kanji missed". generateWeakQuiz membuat tepat satu soal per
      // kanji, jadi details 1:1 dengan missed kanji unit.
      if (quizMode === "weak") {
        const statsNow = await storage.getKanjiStats(finalResult.details.map((d) => d.kanji));
        const remaining = finalResult.details.filter(
          (d) => !d.isCorrect || (statsNow[d.kanji]?.correctSinceWrong || 0) < storage.WEAK_REDEEM_CORRECT_STREAK
        ).length;
        setResult((r) => (r ? { ...r, remainingMissed: remaining } : r));
      }

      // Refresh daftar weak untuk pill "✕ N" di kartu unit + chip statistik.
      setWeakKanji(await storage.getWeakKanji());
    }

    if (quizMode !== "practice") {
      // Muat ulang log kuis SEKARANG, bukan hanya saat app dibuka — supaya
      // kuis pertama hari itu langsung menambah streak (dan titik aktivitas
      // kalender overlay) tanpa reload.
      setAttempts(await storage.getAllQuizAttempts());
    }
  }

  if (loading) {
    return <div className="kd-root kd-loading">Loading your progress…</div>;
  }

  // Kalau route menunjuk quiz/result tapi state in-memory untuk LAYAR ITU
  // tidak ada / tidak cocok (mis. setelah reload, atau Back mendarat di
  // hash kuis unit lain), jatuh ke daftar unit supaya tidak menampilkan
  // layar kosong / sesi yang bukan milik hash itu. Route "weak" jatuh ke
  // Home karena tidak terikat daftar unit level mana pun.
  const routeSessionValid =
    (view === "quiz" && quiz && routeUnit === quizRouteUnit) ||
    (view === "result" && result && routeUnit === resultRouteUnit);
  const effectiveView =
    (view === "quiz" || view === "result") && !routeSessionValid
      ? routeUnit === "weak"
        ? "home"
        : "unitSelect"
      : view;

  // Info sesi di topbar SELAMA KUIS (t63): level + unit yang sedang
  // dikerjakan menggantikan brand 漢字帳 Kanjichō — posisi topbar selalu
  // terlihat, jadi user selalu tahu konteks sesinya tanpa tombol/menu
  // tambahan. Sesi weak review menunjuk unit asalnya; sesi berakhir
  // (layar hasil/home) → brand kembali. UnitId berbentuk "N5-U3" →
  // cukup tampilkan "Unit 3" (levelnya sudah tampil di sebelah).
  const sessionLevel =
    effectiveView === "quiz"
      ? quizMode === "weak"
        ? weakOriginLevel || activeLevel
        : activeLevel
      : null;
  let sessionUnitLabel = null;
  if (effectiveView === "quiz") {
    if (quizMode === "weak") {
      const m = weakOriginUnit && /-U(\d+)$/.exec(weakOriginUnit);
      sessionUnitLabel = m ? `Unit ${m[1]} · review` : "Missed review";
    } else {
      const m = activeUnit && /-U(\d+)$/.exec(activeUnit);
      sessionUnitLabel = m ? `Unit ${m[1]}` : activeUnit || "";
    }
  }

  return (
    <div className="kd-root">
      <div className="kd-topbar">
        {sessionLevel ? (
          <div className="kd-brand" aria-label={`Studying ${sessionLevel} ${sessionUnitLabel}`}>
            <span>{sessionLevel}</span>
            <small>{sessionUnitLabel}</small>
          </div>
        ) : (
          <div className="kd-brand">
            漢字帳 <small>Kanjichō</small>
          </div>
        )}
        <div className="kd-topbar-right">
          <HelpButton showReset={showReset} onToggleShowReset={toggleShowReset} />
          <ThemeToggle />
        </div>
      </div>

      {effectiveView === "home" && <Home levelIds={LEVEL_IDS} getLevelMeta={getLevelMeta} getLevelStats={(level) => levelStatsMap[level]} onOpenLevel={openLevel} onBrowse={() => navigate("browse")} stats={allLevelsStats} studyStats={studyStats} onOpenCalendar={() => openCalendar(null)} />}

      {/* Back dari Browse MELIPAT entri browse (collapse 1) — mundur ke
          entri home yang sudah ada di tumpukan; tanpa ini Back setelah
          "Home" akan membuka ulang Browse. */}
      {effectiveView === "browse" && <Browse onBack={() => navigate("home", { collapse: 1 })} />}

      {effectiveView === "unitSelect" && (
        <UnitSelect
          level={activeLevel}
          units={getUnitsForLevel(activeLevel)}
          progress={progress}
          stats={levelStats}
          studyStats={studyStats}
          onBack={() => navigate("home", { collapse: 1 })}
          onStartUnit={startUnit}
          onOpenCalendar={() => openCalendar(activeLevel)}
          onResetProgress={resetLevelProgress}
          showReset={showReset}
          weakChars={weakChars}
          onStartWeakReview={startWeakReview}
        />
      )}

      {effectiveView === "quiz" && quiz && (
        <Quiz
          quiz={quiz}
          qIndex={qIndex}
          // t76: jawaban terkumpul (diisi per soal saat Continue) — dipakai
          // Quiz untuk papan skor titik: benar terkumpul kiri, salah redup.
          answers={answers}
          selectedChoice={selectedChoice}
          mode={quizMode}
          answerScript={answerScript}
          onToggleScript={toggleAnswerScript}
          onSubmitAnswer={submitAnswer}
          onContinue={handleContinue}
          registerGuard={registerGuard}
          // Cancel kuis = semantics Back browser: kembali ke daftar unit
          // asal kuis (missed review → daftar unit level asalnya).
          // collapse 1: lipat entri kuis — entri di bawahnya memang layar
          // sebelum kuis, jadi Back setelahnya tidak menghidupkan kuis mati.
          onCancel={() =>
            quizMode === "weak"
              ? navigate("unitSelect", { level: weakOriginLevel || activeLevel, collapse: 1 })
              : navigate("unitSelect", { level: activeLevel, collapse: 1 })
          }
        />
      )}

      {effectiveView === "result" && result && (
        <Result
          result={result}
          mode={result.mode || "srs"}
          activeUnit={activeUnit}
          // "Back to Units" melipat entri kuis + hasil (collapse 2) →
          // mendarat di layar sebelum kuis (biasanya daftar unit):
          // Back berikutnya pulang ke home, bukan ke layar hasil.
          onBackToUnits={() =>
            result.mode === "weak"
              ? navigate("unitSelect", { level: weakOriginLevel || activeLevel, collapse: 2 })
              : navigate("unitSelect", { level: activeLevel, collapse: 2 })
          }
          // Home dari layar hasil RESET tumpukan sampai entri pertama app
          // (t65): Back dari home keluar dari app — tidak lagi membuka
          // ulang layar hasil yang sudah ditinggalkan.
          onHome={() => navigate("home", { reset: true })}
          // Hanya relevan untuk weak review yang masih menyisakan kanji
          // missed — mengulang sesi remedial unit yang sama. startWeakReview
          // membaca daftar missed TERKINI (weakKanji sudah di-refresh App
          // setelah sesi selesai), jadi kuis ulang otomatis hanya berisi
          // kanji yang masih perlu ditebus. collapse 1: entri hasil lama
          // diganti entri kuis baru.
          onReviewAgain={() => weakOriginUnit && startWeakReview(weakOriginUnit, { collapse: 1 })}
        />
      )}

      {/* Overlay kalender review (dari klik kartu "Due now"): kalender +
          panel hari (default hari ini) dengan jam due per unit — baris
          overdue klik → kuis. Statistik ringkas tampil sebagai tiga kartu
          (Studied / Due now / Mastered) di Home/UnitSelect — layar Progress
          sudah dihapus. */}
      {calendarOpen && (
        <CalendarModal
          level={calendarLevel}
          entries={calendarEntries}
          activity={studyStats.activity}
          onClose={closeCalendarUI}
          onJump={jumpFromCalendar}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
