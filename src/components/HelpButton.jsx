import React from "react";
import { HelpCircle, X, Github } from "lucide-react";
import pkg from "../../package.json";

const GITHUB_URL = "https://github.com/Zyxcid/Kanjicho";

export default function HelpButton() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button className="kd-icon-btn" onClick={() => setOpen(true)} aria-label="Help & about">
        <HelpCircle size={18} />
      </button>

      {open && (
        <div className="kd-modal-overlay" onClick={() => setOpen(false)}>
          <div className="kd-modal kd-help-modal" onClick={(e) => e.stopPropagation()}>
            <button className="kd-modal-close" onClick={() => setOpen(false)} aria-label="Close">
              <X size={18} />
            </button>

            <div className="kd-help-title">漢字帳 Kanjichō</div>
            <div className="kd-help-version">v{pkg.version}</div>

            <div className="kd-help-section">
              <div className="kd-help-heading">Keyboard shortcuts</div>
              <div className="kd-help-shortcut-row">
                <span className="kd-key-cluster">
                  <span className="kd-key-row">
                    <span className="kd-key-hint muted">w</span>
                    <span className="kd-key-hint muted">e</span>
                  </span>
                  <span className="kd-key-row">
                    <span className="kd-key-hint muted">s</span>
                    <span className="kd-key-hint muted">d</span>
                  </span>
                </span>
                Select an answer
              </div>
              <div className="kd-help-shortcut-row">
                <span className="kd-key-hint muted">f</span> Don't know
              </div>
              <div className="kd-help-shortcut-row">
                <span className="kd-key-hint muted">r</span> Toggle kana / romaji
              </div>
              <div className="kd-help-shortcut-row">
                <span className="kd-key-hint muted">q</span> Back — Cancel / Home
              </div>
              <div className="kd-help-shortcut-row">
                <span className="kd-key-hint muted wide">↵ / Space</span> Continue to next question
              </div>
            </div>

            <div className="kd-help-section">
              <div className="kd-help-heading">Data sources</div>
              <p className="kd-help-text">
                Kanji readings and meanings from{" "}
                <a href="https://www.edrdg.org/wiki/KANJIDIC_Project.html" target="_blank" rel="noreferrer">
                  KANJIDIC2
                </a>
                . Example word glosses from{" "}
                <a href="https://www.edrdg.org/jmdict/edict_doc_depr.html" target="_blank" rel="noreferrer">
                  JMdict
                </a>
                . Both © Electronic Dictionary Research and Development Group, used under{" "}
                <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
                  CC BY-SA 4.0
                </a>
                . Reading and word frequency from{" "}
                <a href="https://clrd.ninjal.ac.jp/bccwj/en/freq-list.html" target="_blank" rel="noreferrer">
                  BCCWJ
                </a>{" "}
                © NINJAL. JLPT kanji and vocabulary levels from{" "}
                <a href="https://github.com/Bluskyo/JLPT_Vocabulary" target="_blank" rel="noreferrer">
                  Bluskyo/JLPT_Vocabulary
                </a>
                .
              </p>
            </div>

            <div className="kd-help-section">
              <div className="kd-help-heading">Contact</div>
              <div className="kd-help-links">
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="kd-help-link">
                  <Github size={15} /> GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
