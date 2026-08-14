import React from "react";
import { Clock } from "lucide-react";

export default function Result({ result, activeUnit, onBackToUnits, onHome }) {
  return (
    <>
      <div className={`kd-result-stamp ${result.score < 0.7 ? "low" : ""}`}>
        <div className="kd-result-stamp-num">{Math.round(result.score * 100)}%</div>
        <div className="kd-result-stamp-label">{activeUnit}</div>
      </div>

      <div className="kd-result-breakdown">
        <div className="kd-rb-item">
          <div className="kd-rb-num" style={{ color: "var(--indigo)" }}>{result.correctCount}</div>
          <div className="kd-rb-label">Correct</div>
        </div>
        <div className="kd-rb-item">
          <div className="kd-rb-num" style={{ color: "var(--seal)" }}>{result.wrongCount}</div>
          <div className="kd-rb-label">Wrong</div>
        </div>
        <div className="kd-rb-item">
          <div className="kd-rb-num" style={{ color: "var(--ink-soft)" }}>{result.dontKnowCount}</div>
          <div className="kd-rb-label">Don't know</div>
        </div>
      </div>

      <div className="kd-next-review">
        <Clock size={14} style={{ marginBottom: 4 }} />
        <div>Next review in</div>
        <div className="kd-next-review-num">{result.newState.stability.toFixed(1)} days</div>
        <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
          ({new Date(result.newState.nextReviewAt).toLocaleDateString("en-US", { day: "numeric", month: "long" })})
        </div>
      </div>

      <div className="kd-btn-row">
        <button className="kd-btn primary" onClick={onBackToUnits}>Back to Units</button>
        <button className="kd-btn secondary" onClick={onHome}>Home</button>
      </div>
    </>
  );
}
