import React, { useEffect, useState } from "react";
import { ChevronLeft, CircleX, HelpCircle } from "lucide-react";
import { DONT_KNOW } from "../lib/quizGenerator.js";
import { ReadingList } from "./Readings.jsx";
import { kanaToRomaji } from "../lib/kana.js";

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
}) {
  const current = quiz[qIndex];
  const isKana = current.questionType === "reading" && answerScript === "kana";

  // Konfirmasi sebelum keluar kuis: kalau sesi sudah ada progres (minimal
  // satu jawaban terkumpul — qIndex > 0, atau soal saat ini sudah dijawab),
  // tombol Cancel/q menampilkan dialog dulu. Tanpa progres, keluar langsung.
  const [confirmExit, setConfirmExit] = useState(false);
  const hasProgress = qIndex > 0 || selectedChoice !== null;
  function requestExit() {
    if (hasProgress) setConfirmExit(true);
    else onCancel();
  }

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
          setConfirmExit(false);
          onCancel();
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
  }, [selectedChoice, current, onSubmitAnswer, onContinue, onToggleScript, confirmExit, onCancel]);

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
          lihat global.css): kanji di kiri, soal + pilihan di kanan. */}
      <div className="kd-quiz-layout">
        <div className="kd-quiz-left">
          <div className="kd-genkou">
            <div className="kd-genkou-glyph">{current.kanji}</div>
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

          <div className="kd-choice-grid">
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

          {selectedChoice !== null && (
            <>
              <div className="kd-reveal">
                <div className="kd-reveal-head">
                  <span className="kd-meaning-kanji">{current.kanji}</span>
                  <span className="kd-meaning-text">{current.meanings.join(", ")}</span>
                </div>
                {/* Baris bacaan mengikuti skrip toggle (kana atau romaji);
                    primary tetap di-bold di kedua skrip. */}
                <div className="kd-reveal-yomi">
                  {current.on.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag on">On'yomi</span>
                      <ReadingList readings={current.on} primaryReadings={current.primaryReadings} type="on" script={answerScript} />
                    </div>
                  )}
                  {current.kun.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag kun">Kun'yomi</span>
                      <ReadingList readings={current.kun} primaryReadings={current.primaryReadings} type="kun" script={answerScript} />
                    </div>
                  )}
                </div>
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
              <button
                className="kd-btn primary"
                onClick={() => {
                  setConfirmExit(false);
                  onCancel();
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
