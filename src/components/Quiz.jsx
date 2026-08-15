import React, { useEffect } from "react";
import { ChevronLeft, HelpCircle } from "lucide-react";
import { DONT_KNOW } from "../lib/quizGenerator.js";

export default function Quiz({ quiz, qIndex, selectedChoice, onSubmitAnswer, onContinue, onCancel }) {
  const current = quiz[qIndex];

  // Keyboard shortcuts: 1-4 pilih jawaban, 5 = "Don't know", Enter = lanjut.
  // Pakai keydown di window supaya jalan dari mana saja di layar ini tanpa
  // perlu klik/fokus ke elemen tertentu dulu.
  useEffect(() => {
    function handleKeyDown(e) {
      if (selectedChoice) {
        if (e.key === "Enter") {
          e.preventDefault();
          onContinue();
        }
        return;
      }
      if (e.key >= "1" && e.key <= "4") {
        const idx = Number(e.key) - 1;
        if (idx < current.choices.length) onSubmitAnswer(current.choices[idx]);
      } else if (e.key === "5") {
        onSubmitAnswer(DONT_KNOW);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedChoice, current, onSubmitAnswer, onContinue]);

  return (
    <>
      <button className="kd-back" onClick={onCancel}>
        <ChevronLeft size={16} /> Cancel
      </button>

      <div className="kd-progress-dots">
        {quiz.map((_, i) => (
          <div key={i} className={`kd-dot ${i < qIndex ? "filled" : ""} ${i === qIndex ? "current" : ""}`} />
        ))}
      </div>

      {/* Mobile: kanji lalu soal ditumpuk vertikal (default).
          Desktop (>=900px, lihat global.css): kanji di kiri, soal+pilihan di kanan. */}
      <div className="kd-quiz-layout">
        <div className="kd-quiz-left">
          <div className="kd-genkou">
            <div className="kd-genkou-glyph">{current.kanji}</div>
          </div>
        </div>

        <div className="kd-quiz-right">
          <div className="kd-question-label">
            Question {qIndex + 1} of {quiz.length}
          </div>

          <div className="kd-choice-grid">
            {current.choices.map((choice, i) => {
              let cls = "kd-choice-btn";
              if (selectedChoice) {
                if (choice === current.correctAnswer) cls += " correct";
                else if (choice === selectedChoice) cls += " wrong";
              }
              return (
                <button key={choice} className={cls} disabled={!!selectedChoice} onClick={() => onSubmitAnswer(choice)}>
                  <span className="kd-key-hint">{i + 1}</span>
                  {choice}
                </button>
              );
            })}
          </div>

          {!selectedChoice && (
            <button className="kd-dontknow" onClick={() => onSubmitAnswer(DONT_KNOW)}>
              <span className="kd-key-hint muted">5</span>
              <HelpCircle size={15} /> Don't know
            </button>
          )}

          {selectedChoice && (
            <>
              <div className="kd-reveal">
                <div className="kd-reveal-head">
                  <span className="kd-meaning-kanji">{current.kanji}</span>
                  <span className="kd-meaning-text">{current.meanings.join(", ")}</span>
                </div>
                <div className="kd-reveal-yomi">
                  {current.on.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag on">On'yomi</span> {current.on.join("、")}
                    </div>
                  )}
                  {current.kun.length > 0 && (
                    <div className="kd-yomi-row">
                      <span className="kd-yomi-tag kun">Kun'yomi</span> {current.kun.join("、")}
                    </div>
                  )}
                </div>
                {current.examples.length > 0 && (
                  <div className="kd-examples">
                    {current.examples.map((ex) => (
                      <div key={ex.word} className="kd-example-item">
                        <span className={`kd-yomi-tag ${ex.type} small`}>{ex.type === "on" ? "On" : "Kun"}</span>
                        <span className="kd-example-word">{ex.word}</span>
                        <span className="kd-example-reading">{ex.reading}</span>
                        <span className="kd-example-meaning">{ex.meaning}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="kd-btn primary kd-continue-btn" onClick={onContinue}>
                {qIndex + 1 < quiz.length ? "Continue" : "See Results"}
                <span className="kd-key-hint on-primary">↵</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
