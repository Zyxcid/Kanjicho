import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, CircleX, HelpCircle, MoveHorizontal } from "lucide-react";
import { DONT_KNOW } from "../lib/quizGenerator.js";
import { ReadingList } from "./Readings.jsx";
import { kanaToRomaji } from "../lib/kana.js";
import GenkouGlyph from "./GenkouGlyph.jsx";
import ComponentBreakdown from "./ComponentBreakdown.jsx";
import { loadComponents } from "../lib/components.js";

/**
 * Label satu pilihan sesuai skrip aktif: soal arti → teks biasa; soal
 * bacaan → kana atau romaji dari pasangan {kana, romaji} (keduanya
 * tersimpan di soal, jadi toggle bisa live).
 */
function choiceLabel(choice, questionType, answerScript) {
  if (questionType !== "reading") return choice;
  return answerScript === "kana" ? choice.kana : choice.romaji;
}

/**
 * Tombol keyboard tiap pilihan jawaban, urut sesuai grid 2×2 di layar
 * (baris atas w/e, baris bawah s/d) — posisi tombol keyboard MIRROR posisi
 * tombol di layar, jari menetap di home row. Tata letak hanya ditampilkan
 * di help overlay (supaya layar kuis bersih).
 */
const CHOICE_KEYS = ["w", "e", "s", "d"];
const DONT_KNOW_KEY = "f"; // sebelah d — masih dalam jangkauan satu tangan

/* (t79) AUTO-FLIP DIHAPUS — laporan user: kartu berputar sendiri 420 ms
   setelah dijawab, terlalu cepat, jawaban yang benar belum sempat
   terbaca. Kartu kini DIAM di depan (pilihan terwarna) selama user
   mau; satu-satunya cara membalik = swipe horizontal. */
/* Geseran horizontal minimum (px) agar dihitung gerakan "balik kartu" —
   cukup jauh supaya tap biasa (getar beberapa piksel) tidak ikut;
   harus dominan horizontal supaya scroll vertikal tidak tersangkut. */
const SWIPE_MIN_DX = 56;
const SWIPE_AXIS_MARGIN = 24;
/* (t78) Flag localStorage "kanji-swipe-learned": petunjuk swipe tampil
   sampai user melakukan swipe PERTAMA kali — setelah itu gerakan
   dianggap dikenal selamanya (hint tidak muncul lagi di sesi mana pun).
   Kalimatnya dihapus dari help overlay: mengajar gerakan paling efektif
   saat kartunya sendiri sedang di tangan user. */
const SWIPE_LEARNED_KEY = "kanji-swipe-learned";

/**
 * Toggle skrip kana ↔ romaji (shortcut: r). Diangkat jadi komponen kecil
 * karena t77 menaruhnya di DUA sisi kartu — pojok kanan-atas sisi DEPAN
 * (absolut) dan ujung kanan baris kepala sisi BELAKANG — kontrol utilitas
 * yang selalu ada di pojok kanan, di sisi mana pun yang sedang menghadap
 * user. Mengatur seluruh layar kuis: label pilihan, bacaan On/Kun di
 * panel reveal, dan reading contoh kata — semuanya berganti live karena
 * kedua bentuk tersimpan (lihat lib/kana.js).
 */
function ScriptToggle({ answerScript, onToggleScript }) {
  return (
    <button
      className={`kd-script-toggle ${answerScript === "kana" ? "kana" : ""}`}
      onClick={onToggleScript}
      title={
        answerScript === "kana"
          ? "Show readings in romaji (r)"
          : "Show readings in kana (r)"
      }
      aria-pressed={answerScript === "kana"}
    >
      {answerScript === "kana" ? "あ" : "Aa"}
    </button>
  );
}

export default function Quiz({
  quiz,
  qIndex,
  answers = [],
  selectedChoice, // indeks pilihan (number) | DONT_KNOW | null
  mode,
  answerScript = "romaji",
  onToggleScript,
  onSubmitAnswer,
  onContinue,
  onCancel,
  registerGuard, // dari useRouter — menahan Back browser saat sesi berprogres
}) {
  const current = quiz[qIndex];
  const isKana = current.questionType === "reading" && answerScript === "kana";

  // Papan skor dot (t76): jumlah benar/salah dari jawaban yang SUDAH
  // dimasukkan (answers bertambah tiap Continue; panjangnya = qIndex).
  // DONT_KNOW adalah string, bukan indeks, jadi !== correctIndex → salah.
  const correctSoFar = answers.reduce(
    (n, a, j) => (a === quiz[j].correctIndex ? n + 1 : n),
    0
  );
  const wrongSoFar = qIndex - correctSoFar;

  // (t77) Kartu kuis = KARTU FISIK: depan = soal + pilihan, belakang =
  // reading sheet. `flipped` adalah keinginan user — sejak t79 murni
  // swipe (tombol Flip dihapus, auto-flip pensiun); `answered` dari App
  // mengunci flip — sisi belakang memuat JAWABAN, jadi sebelum menjawab
  // kartu tidak boleh bisa dibalik.
  const answered = selectedChoice !== null;
  const [flipped, setFlipped] = useState(false);
  // (t78) Petunjuk swipe sekali-lihat — lihat SWIPE_LEARNED_KEY di atas.
  // try/catch: mode privat browser bisa melempar saat membaca localStorage
  // (hint lalu tampil tiap sesi — aman, hanya redundan).
  const [swipeLearned, setSwipeLearned] = useState(() => {
    try {
      return localStorage.getItem(SWIPE_LEARNED_KEY) === "1";
    } catch {
      return false;
    }
  });
  function markSwipeLearned() {
    setSwipeLearned(true);
    try {
      localStorage.setItem(SWIPE_LEARNED_KEY, "1");
    } catch {
      /* abaikan — penyimpanan tak tersedia, hint cuma tampil lagi nanti */
    }
  }
  // Gerbang `answered`: saat Continue, selectedChoice kembali null dalam
  // render yang SAMA dengan naiknya qIndex (kartu baru via key) — state
  // `flipped` mentah belum sempat direset efek di bawah. Tanpa gerbang
  // ini kartu baru ter-mount dalam pose terbalik lalu "berputar pulang".
  const showBack = answered && flipped;

  // (t79) Reset saja — auto-flip pensiun: kartu berputar HANYA atas
  // perintah user (swipe), jadi user punya waktu tak terbatas membaca
  // jawaban yang benar di sisi depan. Saat soal berganti (selectedChoice
  // null), `flipped` dikembalikan false supaya swipe PERTAMA pada soal
  // baru menghadapkan belakang (bukan memutar balik ke depan).
  useEffect(() => {
    if (selectedChoice === null) setFlipped(false);
  }, [selectedChoice, current.kanji]);

  // Swipe horizontal = balik kartu (HANYA setelah menjawab) — sejak t79
  // SATU-SATUNYA jalur membalik (tombol Flip dihapus, auto-flip pensiun;
  // pointer events menangkap sentuhan maupun drag mouse di desktop).
  // Threshold
  // dx + dominasi horizontal memisahkan swipe dari tap dan dari scroll
  // vertikal (touch-action: pan-y di CSS menjaga scroll halaman tetap
  // hidup). Swipe kiri/kanan dua-duanya membalik — arah tidak bermakna,
  // konsisten dengan rotasi di sumbu Y.
  const swipeStartRef = useRef(null);
  function handlePointerDown(e) {
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  }
  function handlePointerUp(e) {
    const s = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!s || selectedChoice === null) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_MIN_DX && Math.abs(dx) > Math.abs(dy) + SWIPE_AXIS_MARGIN) {
      setFlipped((f) => !f);
      // Swipe pertama yang TERDAFTAR = user sudah mengenal gerakannya.
      markSwipeLearned();
    }
  }
  function clearSwipe() {
    swipeStartRef.current = null;
  }

  // Konfirmasi sebelum keluar kuis: kalau sesi sudah ada progres (minimal
  // satu jawaban terkumpul — qIndex > 0, atau soal saat ini sudah dijawab),
  // tombol Cancel/q menampilkan dialog dulu. Tanpa progres, keluar langsung.
  const [confirmExit, setConfirmExit] = useState(false);
  // Sumber dialog: "ui" (tombol Cancel / shortcut q) atau "browser"
  // (Back browser ditahan guard) — menentukan aksi tombol Leave.
  const [exitSource, setExitSource] = useState("ui");
  // Leave dari Back browser: loloskan popstate BERIKUTNYA dari guard —
  // history.back() di confirmLeave memicu popstate itu.
  const leavingRef = useRef(false);
  const hasProgress = qIndex > 0 || selectedChoice !== null;
  function requestExit() {
    if (hasProgress) {
      setExitSource("ui");
      setConfirmExit(true);
    } else {
      onCancel();
    }
  }

  // "Leave": dari Back browser → lanjutkan Back yang tadi ditahan
  // (tujuan asli Alt+← dihormati); dari tombol Cancel → navigate biasa.
  function confirmLeave() {
    setConfirmExit(false);
    if (exitSource === "browser") {
      leavingRef.current = true;
      window.history.back();
    } else {
      onCancel();
    }
  }

  // Guard Back browser (Alt+← / tombol Back): saat sesi berprogres,
  // router menahan popstate (URL dikembalikan ke kuis) lalu dialog ini
  // dibuka — jalur keluar sama dengan tombol Cancel. Dipasang ulang saat
  // hasProgress/confirmExit berubah; lepas otomatis saat layar unmount.
  useEffect(() => {
    if (!registerGuard) return;
    registerGuard({
      canLeave: () => leavingRef.current || !hasProgress,
      onBlocked: () => {
        // Dialog sudah terbuka + Back ditekan LAGI (t65) → tutup dialognya
        // (= "tetap belajar"), seperti Back menutup overlay lain; router
        // sudah mengembalikan URL ke layar kuis sebelum callback ini.
        if (confirmExit) {
          setConfirmExit(false);
          return;
        }
        setExitSource("browser");
        setConfirmExit(true);
      },
    });
    return () => registerGuard(null);
  }, [registerGuard, hasProgress, confirmExit]);

  // Dekomposisi komponen soal aktif (KanjiVG stroke-group) — dimuat
  // sejak soal muncul (chunk per level, di-cache; level biasanya sudah
  // termuat untuk data kuis), tapi baru DIRENDER setelah dijawab sebagai
  // baris "Components" di sisi belakang kartu: persamaan bentuk kanji
  // adalah alat bantu mengingat ("明 = sun + moon"), bukan petunjuk
  // jawaban. Varian plain: TEKS BIASA glyph saja (t64: jumlah goresan
  // dihapus; t63: tanpa kotak chip) — detail penuh tetap di modal Browse.
  const [compEntry, setCompEntry] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setCompEntry(null);
    loadComponents(current.level).then((map) => {
      if (!cancelled) setCompEntry(map[current.kanji] || null);
    });
    return () => {
      cancelled = true;
    };
  }, [current.kanji, current.level]);

  // (t62) Animasi tinggi panel reveal DIHAPUS (t77): panel kini sisi
  // BELAKANG kartu — pergantian depan/belakang dianimasikan rotasi
  // transform murni di compositor (GPU), tanpa reflow per frame, jauh
  // lebih murah daripada animasi height dulu.

  // Shortcut keyboard: w/e/s/d pilih jawaban (mirror grid 2×2), f =
  // "Don't know", r = toggle kana/romaji, Enter/Space = lanjut. (q = tombol
  // Cancel ditangani global di App.jsx — dia meng-KLIK tombol ini, jadi
  // ikut alur konfirmasi yang sama dengan klik mouse.) Listener di window
  // supaya jalan tanpa fokus ke elemen tertentu.
  useEffect(() => {
    function handleKeyDown(e) {
      // Modifier + huruf = shortcut browser/OS (Ctrl+S, Cmd+R) — jangan
      // sampai ikut menjawab/toggle.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // Dialog konfirmasi keluar terbuka: Enter = Leave, Esc = Keep
      // studying. Dicek SEBELUM guard modal umum karena dialog ini sendiri
      // adalah .kd-modal-overlay (guard itu akan langsung return).
      if (confirmExit) {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmLeave();
        } else if (e.key === "Escape") {
          setConfirmExit(false);
        }
        return;
      }
      // Modal terbuka (help overlay) — shortcut tidak boleh menembus modal.
      if (document.querySelector(".kd-modal-overlay")) return;
      // r = toggle kana/romaji — bekerja baik sebelum maupun sesudah
      // menjawab (reading sheet di belakang kartu ikut berganti live),
      // jadi dicek dulu.
      if (key === "r") {
        onToggleScript();
        return;
      }
      if (selectedChoice !== null) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault(); // Space juga mencegah scroll halaman
          onContinue();
        }
        return;
      }
      // toLowerCase() supaya CapsLock/Shift tetap kepilih.
      const idx = CHOICE_KEYS.indexOf(key);
      if (idx !== -1) {
        if (idx < current.choices.length) onSubmitAnswer(idx);
      } else if (key === DONT_KNOW_KEY) {
        onSubmitAnswer(DONT_KNOW);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedChoice, current, onSubmitAnswer, onContinue, onToggleScript, confirmExit, exitSource, onCancel]);

  return (
    <>
      <button className="kd-back" onClick={requestExit}>
        <ChevronLeft size={16} /> Cancel
      </button>

      <div className="kd-progress-dots" aria-hidden="true">
        {/* t76: titik = papan skor LIVE, bukan nomor soal — urutan dot adalah
            STATUS: [benar (indigo penuh, terkumpul KIRI)] [soal berjalan
            (penanda besar)] [salah (indigo redup)] [belum dijawab (netral)].
            `answers` diisi App per soal saat Continue, jadi panjangnya
            selalu = qIndex; penilaian benar membandingkan INDEKS pilihan
            dengan correctIndex soal itu (DONT_KNOW != indeks → otomatis
            dihitung salah, sama seperti skor akhir). */}
        {[
          ...Array.from({ length: correctSoFar }, () => "kd-dot correct"),
          "kd-dot current",
          ...Array.from({ length: wrongSoFar }, () => "kd-dot wrong"),
          ...Array.from({ length: quiz.length - qIndex - 1 }, () => "kd-dot"),
        ].map((cls, i) => (
          <div key={i} className={cls} />
        ))}
      </div>

      {/* (t77) KARTU KUIS — satu kartu fisik dengan dua sisi. DEPAN:
          soal + pilihan (tata letak lama utuh: mobile ditumpuk vertikal,
          desktop ≥900px genkō kiri + kolom soal kanan). BELAKANG:
          reading sheet. Rotasi di sumbu Y (perspective di .kd-card-scene);
          key=qIndex membuat soal baru = kartu BARU yang ter-mount polos
          (tanpa bekas rotasi), masuk dengan animasi kartu segar. Sisi
          yang tidak menghadap user diberi atribut inert supaya tombolnya
          tidak bisa di-Tab/klik buta dari sisi tersembunyi. */}
      <div
        className="kd-card-scene"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={clearSwipe}
        onPointerLeave={clearSwipe}
      >
        <div key={qIndex} className={`kd-card-inner ${showBack ? "flipped" : ""}`}>
          {/* ============ DEPAN: soal + pilihan ============ */}
          <div className="kd-card-face front" inert={showBack ? "true" : undefined}>
            <ScriptToggle answerScript={answerScript} onToggleScript={onToggleScript} />

            {/* Mobile: kanji dan soal ditumpuk vertikal. Desktop (>=900px,
                lihat global.css): kanji di kiri ATAS (posisi statis —
                tidak pernah bergeser saat kartu dibalik), soal + pilihan
                di kanan. */}
            <div className="kd-quiz-layout">
              {/* Kolom kiri: kotak genkō SAJA. Di desktop kotak ini DIJANGKAR
                  DI ATAS kolom (align-items flex-start pada layout) — genkō
                  tidak ikut bergerak. Persamaan komponen dirender sebagai
                  baris "Components" DI SISI BELAKANG KARTU setelah
                  dijawab (bukan blok terpisah di sini). */}
              <div className="kd-quiz-left">
                {/* Glyph selalu dirender sebagai SVG KanjiVG keadaan SELESAI
                    sejak soal muncul (bentuk konsisten, tidak ada pergantian
                    font). KLIK KIRI glyph → animasi urutan goresan diputar
                    LANGSUNG di kotak genkō-yōshi ini (default 1x, tanpa
                    kontrol — lihat GenkouGlyph.jsx); KLIK KANAN → animasi
                    langsung diselesaikan (semua goresan muncul seketika).
                    Shortcut kuis tetap hidup karena tidak ada overlay. Sheet
                    detail (bacaan, arti, contoh kata) ada di sisi BELAKANG
                    kartu SETELAH menjawab — sebelum itu memang tersembunyi
                    karena membocorkan jawaban soal. */}
                <div className="kd-genkou">
                  <GenkouGlyph key={current.kanji} kanji={current.kanji} level={current.level} />
                </div>
              </div>

              <div className="kd-quiz-right">
                {/* Badge hanya untuk sesi missed-kanji review — jelas beda
                    dari kuis unit. Latihan bebas dari unit dim TIDAK
                    diberi badge. */}
                {mode === "weak" && (
                  <div className="kd-mode-badge weak">
                    <CircleX size={13} strokeWidth={2.25} /> Missed kanji review
                  </div>
                )}

                <div className="kd-question-row">
                  <div className="kd-question-label">
                    Question {qIndex + 1} of {quiz.length}
                  </div>
                </div>

                {/* Grid pilihan: setelah dijawab UKURANNYA TETAP (t78:
                  animasi menciut dihapus) — hanya pilihan netral yang
                  meredup; correct/wrong tetap penuh supaya hasil masih
                  terbaca ketika user membalik kartu kembali ke depan. */}
                <div className={`kd-choice-grid ${answered ? "answered" : ""}`}>
                  {current.choices.map((choice, idx) => {
                    let cls = "kd-choice-btn";
                    if (isKana) cls += " kana";
                    if (answered) {
                      if (idx === current.correctIndex) cls += " correct";
                      else if (idx === selectedChoice) cls += " wrong";
                    }
                    return (
                      <button
                        key={idx}
                        className={cls}
                        disabled={answered}
                        onClick={() => onSubmitAnswer(idx)}
                      >
                        {choiceLabel(choice, current.questionType, answerScript)}
                      </button>
                    );
                  })}
                </div>

                {!answered && (
                  <button className="kd-dontknow" onClick={() => onSubmitAnswer(DONT_KNOW)}>
                    <HelpCircle size={15} /> Don't know
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ============ BELAKANG: reading sheet ============
              Baru dirender setelah menjawab (sebelum itu kartu memang
              tidak punya sisi belakang yang berarti — dan tidak boleh
              ada: jawaban harus tersembunyi). Struktur kelas dalam
              (kd-reveal-head/yomi/comp/examples) sama dengan versi
              panel dulu — CSS-nya dipakai bersama modal Browse. */}
          {answered && (
            <div className="kd-card-face back" inert={showBack ? undefined : "true"}>
              <div className="kd-card-back-body">
                <div className="kd-reveal-head">
                  <span className="kd-meaning-kanji">{current.kanji}</span>
                  <span className="kd-meaning-text">{current.meanings.join(", ")}</span>
                  <ScriptToggle answerScript={answerScript} onToggleScript={onToggleScript} />
                </div>
                {/* Baris bacaan mengikuti skrip toggle (kana atau romaji);
                    primary tetap di-bold di kedua skrip. */}
                <div className="kd-reveal-yomi">
                  {current.on.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag on">On&apos;yomi</span>
                      <ReadingList readings={current.on} primaryReadings={current.primaryReadings} type="on" script={answerScript} />
                    </div>
                  )}
                  {current.kun.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag kun">Kun&apos;yomi</span>
                      <ReadingList readings={current.kun} primaryReadings={current.primaryReadings} type="kun" script={answerScript} />
                    </div>
                  )}
                </div>
                {/* Baris komponen (varian plain): persamaan bentuk kanji
                    yang baru dijawab sebagai TEKS BIASA (glyph + "+") —
                    senada dan sekalem baris yomi di atasnya, tanpa kotak
                    chip (t63) dan tanpa jumlah goresan (t64). Tanpa arti
                    & tanpa navigasi: detail penuh + chip ber-link tetap di
                    modal Browse. */}
                {compEntry && (
                  <div className="kd-reveal-comp">
                    <span className="kd-yomi-tag comp">Components</span>
                    <ComponentBreakdown
                      kanji={current.kanji}
                      parts={compEntry.p}
                      plain
                    />
                  </div>
                )}
                {/* Reading contoh kata juga ikut skrip toggle (romaji
                    dikonversi runtime — converter port pipeline, lihat
                    lib/kana.js). */}
                {current.examples.length > 0 && (
                  <div className="kd-examples">
                    {current.examples.map((ex) => (
                      <div key={ex.word} className="kd-example-item">
                        <span className={`kd-yomi-tag ${ex.type} small`}>{ex.type === "on" ? "On" : "Kun"}</span>
                        <span className="kd-example-word">{ex.word}</span>
                        <span className="kd-example-reading">
                          {answerScript === "romaji" ? kanaToRomaji(ex.reading) : ex.reading}
                        </span>
                        <span className="kd-example-meaning">{ex.meaning}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* (t78) Petunjuk swipe — baris kecil di antara kartu dan bar aksi.
          Tampil hanya setelah menjawab (sebelum itu swipe memang belum
          berfungsi — kartu terkunci) dan hanya sampai swipe PERTAMA
          user terdaftar (flag localStorage, lihat SWIPE_LEARNED_KEY).
          Sejak t79 petunjuk ini jadi satu-satunya jalan menuju sisi
          belakang (auto-flip & tombol Flip sama-sama pensiun) — teksnya
          menjanjikan ISINYA, bukan cuma gerakannya. Dekoratif
          (aria-hidden): makna gerakannya dijelaskan teksnya sendiri;
          layar tetap bersih setelah gerakan dikenal. */}
      {answered && !swipeLearned && (
        <div className="kd-swipe-hint" aria-hidden="true">
          <MoveHorizontal size={14} />
          <span>Swipe the card sideways to see its readings</span>
        </div>
      )}

      {/* Bar aksi KARTU — DI LUAR kartu (tidak ikut berputar), supaya
          tombol selalu di tempat yang sama di sisi mana pun. (t79) tombol
          Flip DIHAPUS per permintaan user — swipe sudah menutup fungsi itu
          (satu gerakan, satu makna; bar juga lebih ringkas); kini hanya
          Continue (primary, lebar penuh). Hanya muncul setelah menjawab:
          sebelum itu tidak ada aksi kartu yang tersedia (membalik belum
          boleh — jawaban ada di belakang). Enter/Space tetap melanjutkan
          tanpa perlu fokus tombol. */}
      {answered && (
        <div className="kd-card-actions">
          <button className="kd-btn primary kd-continue-btn" onClick={onContinue}>
            {qIndex + 1 < quiz.length ? "Continue" : "See Results"}
          </button>
        </div>
      )}

      {/* Dialog konfirmasi keluar sesi — hanya muncul kalau ada progres
          yang akan hilang. */}
      {confirmExit && (
        <div className="kd-modal-overlay">
          <div className="kd-modal kd-drill-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="kd-drill-confirm-text">
              Leave this session? Your answers so far won&apos;t be saved.
            </p>
            <div className="kd-btn-row">
              <button className="kd-btn secondary" onClick={() => setConfirmExit(false)}>
                Keep studying
              </button>
              <button className="kd-btn primary" onClick={confirmLeave}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
