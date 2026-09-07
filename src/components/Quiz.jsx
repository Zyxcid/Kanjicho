import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, CircleX, HelpCircle } from "lucide-react";
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

export default function Quiz({
  quiz,
  qIndex,
  selectedChoice, // indeks pilihan (number) | DONT_KNOW | null
  mode,
  answerScript = "romaji",
  onToggleScript,
  onSubmitAnswer,
  onContinue,
  onCancel,
  registerGuard, // dari useRouter — menahan Back browser saat sesi berproses
}) {
  const current = quiz[qIndex];
  const isKana = current.questionType === "reading" && answerScript === "kana";

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
  // hasProgress berubah; lepas otomatis saat layar unmount.
  useEffect(() => {
    if (!registerGuard) return;
    registerGuard({
      canLeave: () => leavingRef.current || !hasProgress,
      onBlocked: () => {
        setExitSource("browser");
        setConfirmExit(true);
      },
    });
    return () => registerGuard(null);
  }, [registerGuard, hasProgress]);

  // Dekomposisi komponen soal aktif (KanjiVG stroke-group) — dimuat
  // sejak soal muncul (chunk per level, di-cache; level biasanya sudah
  // termuat untuk data kuis), tapi baru DIRENDER setelah dijawab sebagai
  // baris "Components" di panel reveal: persamaan bentuk kanji adalah
  // alat bantu mengingat ("明 = sun + moon"), bukan petunjuk jawaban.
  // Varian plain: TEKS BIASA glyph saja (t64: jumlah goresan dihapus;
  // t63: tanpa kotak chip) — detail penuh tetap di modal Browse.
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

  // Transisi buka panel reveal (setelah menjawab): tinggi panel
  // dianimasikan 0 → tinggi konten penuh + fade. Panel kembali DI DALAM
  // kolom kanan, di bawah grid pilihan (t64: "seperti semula" — t63
  // sempat memindahkannya jadi baris lebar di bawah baris dua-kolom).
  // Genkō tetap DIAM: kolom kiri dijangkar di atas (align-self
  // flex-start, ≥900px) sehingga pertumbuhan kolom kanan tidak
  // menggesernya. void el.offsetHeight memaksa browser menghitung
  // state AWAL dulu — tanpa flush, kedua perubahan style dicampur dalam
  // satu frame dan transisi tidak pernah berjalan. Setelah selesai (atau
  // lewat timer pengaman), height/overflow/opacity dilepas lagi supaya
  // konten live (toggle kana/romaji, arti panjang) bebas berubah tinggi.
  // Hormati prefers-reduced-motion: tanpa animasi.
  const revealRef = useRef(null);
  useEffect(() => {
    if (selectedChoice === null) return;
    const el = revealRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const h = el.scrollHeight;
    if (h <= 0) return;
    el.style.height = "0px";
    el.style.overflow = "hidden";
    el.style.opacity = "0";
    void el.offsetHeight; // flush: state awal dihitung sebelum transisi
    el.style.transition =
      "height 340ms cubic-bezier(0.2, 0.8, 0.3, 1), opacity 280ms ease 60ms";
    el.style.height = h + "px";
    el.style.opacity = "1";
    function cleanup() {
      el.style.height = "";
      el.style.overflow = "";
      el.style.opacity = "";
      el.style.transition = "";
      el.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
    }
    function onEnd(e) {
      if (e.propertyName !== "height") return;
      cleanup();
    }
    el.addEventListener("transitionend", onEnd);
    // Pengaman 900ms: apa pun yang terjadi (transisi terpotong, tab
    // background), style inline pasti lepas — overflow:hidden yang
    // tertinggal akan memotong konten live.
    const timer = setTimeout(cleanup, 900);
    return () => {
      el.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
    };
  }, [selectedChoice, current.kanji]);

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
      // menjawab (reveal panel ikut berganti live), jadi dicek dulu.
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

      <div className="kd-progress-dots">
        {quiz.map((_, i) => (
          <div key={i} className={`kd-dot ${i < qIndex ? "filled" : ""} ${i === qIndex ? "current" : ""}`} />
        ))}
      </div>

      {/* Mobile: kanji dan soal ditumpuk vertikal. Desktop (>=900px,
          lihat global.css): kanji di kiri ATAS (posisi statis — tidak
          pernah bergeser saat panel reveal membuka), soal + pilihan +
          panel reveal + Continue di kanan (t64: reveal kembali DI DALAM
          kolom kanan seperti semula, di bawah pilihan). */}
      <div className="kd-quiz-layout">
        {/* Kolom kiri: kotak genkō SAJA. Di desktop kotak ini DIJANGKAR
            DI ATAS kolom (align-items flex-start pada layout) — genkō
            tidak ikut bergerak saat panel reveal membuka di kolom kanan
            (t62: genkō "turun" saat reveal membuka, dinilai jelek —
            jangkaran atas dipertahankan di t64 walau reveal kembali ke
            kolom kanan). Persamaan komponen dirender sebagai
            baris "Components" DI DALAM panel reveal di kolom kanan
            (bukan blok terpisah di sini). */}
        <div className="kd-quiz-left">
          {/* Glyph selalu dirender sebagai SVG KanjiVG keadaan SELESAI
              sejak soal muncul (bentuk konsisten, tidak ada pergantian
              font). KLIK KIRI glyph → animasi urutan goresan diputar
              LANGSUNG di kotak genkō-yōshi ini (default 1x, tanpa
              kontrol — lihat GenkouGlyph.jsx); KLIK KANAN → animasi
              langsung diselesaikan (semua goresan muncul seketika).
              Shortcut kuis tetap hidup karena tidak ada overlay. Tidak
              ada lagi tombol detail dari dalam kuis: sheet detail
              (bacaan, arti, contoh kata) membocorkan jawaban soal —
              info lengkap tersedia di modal Browse SETELAH kuis. */}
          <div className="kd-genkou">
            <GenkouGlyph key={current.kanji} kanji={current.kanji} level={current.level} />
          </div>
        </div>

        <div className="kd-quiz-right">
          {/* Badge hanya untuk sesi missed-kanji review — jelas beda dari
              kuis unit. Latihan bebas dari unit dim TIDAK diberi badge. */}
          {mode === "weak" && (
            <div className="kd-mode-badge weak">
              <CircleX size={13} strokeWidth={2.25} /> Missed kanji review
            </div>
          )}

          <div className="kd-question-row">
            <div className="kd-question-label">
              Question {qIndex + 1} of {quiz.length}
            </div>
            {/* Toggle skrip kana ↔ romaji (shortcut: r). Mengatur seluruh
                layar kuis: label pilihan, bacaan On/Kun di panel reveal, dan
                reading contoh kata — semua berganti live karena kedua bentuk
                tersedia (lihat lib/kana.js). */}
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
          </div>

          {/* Grid pilihan: setelah dijawab kelas "answered" melipat
              tombol (padding mengecil, pilihan netral meredup) — kuis
              "mundur", perhatian berpindah ke panel reveal. Warna
              correct/wrong tetap penuh supaya hasil tetap terbaca. */}
          <div className={`kd-choice-grid ${selectedChoice !== null ? "answered" : ""}`}>
            {current.choices.map((choice, idx) => {
              let cls = "kd-choice-btn";
              if (isKana) cls += " kana";
              if (selectedChoice !== null) {
                if (idx === current.correctIndex) cls += " correct";
                else if (idx === selectedChoice) cls += " wrong";
              }
              return (
                <button
                  key={idx}
                  className={cls}
                  disabled={selectedChoice !== null}
                  onClick={() => onSubmitAnswer(idx)}
                >
                  {choiceLabel(choice, current.questionType, answerScript)}
                </button>
              );
            })}
          </div>

          {selectedChoice === null && (
            <button className="kd-dontknow" onClick={() => onSubmitAnswer(DONT_KNOW)}>
              <HelpCircle size={15} /> Don't know
            </button>
          )}

          {/* Panel reveal + tombol Continue: DI DALAM kolom kanan, di
              bawah grid pilihan — penempatan asalnya (t64: "seperti
              semula"; t63 sempat menjadikannya baris lebar di bawah
              baris dua-kolom). Genkō tetap diam — kolom kiri dijangkar
              di atas; di mobile urutan tampil juga sama: genkō → soal →
              pilihan → reveal → Continue. */}
          {selectedChoice !== null && (
            <>
              <div className="kd-reveal" ref={revealRef}>
                <div className="kd-reveal-head">
                  <span className="kd-meaning-kanji">{current.kanji}</span>
                  <span className="kd-meaning-text">{current.meanings.join(", ")}</span>
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
                {/* Baris komponen (varian plain) di DALAM panel reveal:
                    persamaan bentuk kanji yang baru dijawab sebagai TEKS
                    BIASA (glyph + "+") — senada dan sekalem baris yomi di
                    atasnya, tanpa kotak chip (t63) dan tanpa jumlah goresan
                    (t64). Tanpa arti & tanpa navigasi: detail penuh + chip
                    ber-link tetap di modal Browse. */}
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
              <button className="kd-btn primary kd-continue-btn" onClick={onContinue}>
                {qIndex + 1 < quiz.length ? "Continue" : "See Results"}
              </button>
            </>
          )}
        </div>
      </div>

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
