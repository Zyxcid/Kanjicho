import React from "react";
import { HelpCircle, X, Github, ShieldCheck } from "lucide-react";
import pkg from "../../package.json";
import BackupControls from "./BackupControls";
import { pushOverlayEntry, closeOverlayUI, discardOverlayEntry, isOverlayEntryRegistered } from "../lib/useRouter.js";

const GITHUB_URL = "https://github.com/Zyxcid/Kanjicho";

export default function HelpButton({ showReset, onToggleShowReset }) {
  const [open, setOpen] = React.useState(false);
  // Penutup overlay yang terdaftar di tumpukan overlay router (t65):
  // membuka modal menambah entri history sendiri → tombol Back di mobile
  // menutup modal ini alih-alih berpindah halaman; menutup lewat UI
  // (✕/Escape/backdrop) mengonsumsi entri itu kembali.
  const closeRef = React.useRef(null);

  function openHelp() {
    setOpen(true);
    // Push hanya kalau belum ada entri HIDUP — ref bisa basi setelah modal
    // ditutup lewat Back (popstate membuang penutup dari tumpukan).
    if (!isOverlayEntryRegistered(closeRef.current)) {
      closeRef.current = () => setOpen(false);
      pushOverlayEntry(closeRef.current);
    }
  }

  function closeHelp() {
    const close = closeRef.current;
    closeRef.current = null;
    closeOverlayUI(close);
  }

  // Escape menutup modal help — konsisten dengan modal lain (kalender,
  // detail Browse).
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") closeHelp();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Bersih-bersih defensif: kalau komponen unmount saat modal terbuka
  // (navigasi layar lewat popstate), buang penutupnya dari tumpukan
  // overlay supaya tidak menutup overlay lain secara salah.
  React.useEffect(() => () => {
    discardOverlayEntry(closeRef.current);
    closeRef.current = null;
  }, []);

  return (
    <>
      <button className="kd-icon-btn" onClick={openHelp} aria-label="Help & about">
        <HelpCircle size={18} />
      </button>

      {open && (
        <div className="kd-modal-overlay" onClick={closeHelp}>
          <div className="kd-modal kd-help-modal" onClick={(e) => e.stopPropagation()}>
            <button className="kd-modal-close" onClick={closeHelp} aria-label="Close">
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
                . Reading and word frequency signals from{" "}
                <a href="https://jiten.moe/frequency-dictionaries" target="_blank" rel="noreferrer">
                  Jiten frequency lists
                </a>{" "}
                © Jiten, and common-word markers from JMdict, used under{" "}
                <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
                  CC BY-SA 4.0
                </a>
                . JLPT kanji and vocabulary levels from{" "}
                <a href="https://github.com/Bluskyo/JLPT_Vocabulary" target="_blank" rel="noreferrer">
                  Bluskyo/JLPT_Vocabulary
                </a>
                <span className="kd-help-license"> (MIT)</span>. Stroke order animations (tap any kanji in a quiz) from{" "}
                <a href="http://kanjivg.tagaini.net/" target="_blank" rel="noreferrer">
                  KanjiVG
                </a>{" "}
                © Ulrich Apel, used under{" "}
                <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">
                  CC BY-SA 3.0
                </a>
                .
              </p>
              {/* Disclaimer merek JLPT (JEES) + repo data terbuka + kredit
                  pustaka OSS — kebersihan publish (Play Store): semua muatan
                  legal Help kini satu tempat, tanpa baris vertikal baru yang
                  berlebih (paragraf kecil di bawah kredit data). */}
              <p className="kd-help-text kd-help-legal">
                Kanjichō is an independent study tool and is not affiliated
                with, authorized by, or endorsed by the Japan Educational
                Exchanges and Services (JEES) or the organizers of the JLPT.
              </p>
              <p className="kd-help-text kd-help-legal">
                The derived data files are published at{" "}
                <a href="https://github.com/Zyxcid/kanjicho-data" target="_blank" rel="noreferrer">
                  github.com/Zyxcid/kanjicho-data
                </a>{" "}
                under the same licenses (CC&nbsp;BY-SA). Built on open-source
                libraries: React, Dexie, ts-fsrs, and lucide-react
                (MIT / Apache-2.0 / ISC).
              </p>
            </div>

            <div className="kd-help-section">
              <div className="kd-help-heading">Progress</div>
              <BackupControls />
              {/* Toggle visibilitas tombol "Reset progress" per level —
                  destruktif, jadi disembunyikan dari layar utama dan hanya
                  diaktifkan dari sini. */}
              <div className="kd-help-toggle-row">
                <div>
                  <div className="kd-help-toggle-name">Reset progress button</div>
                  <div className="kd-help-toggle-desc">Show reset button</div>
                </div>
                <button
                  className={`kd-toggle ${showReset ? "on" : ""}`}
                  role="switch"
                  aria-checked={showReset}
                  aria-label="Show reset button"
                  onClick={onToggleShowReset}
                >
                  <span className="kd-toggle-knob" />
                </button>
              </div>
            </div>

            <div className="kd-help-section">
              <div className="kd-help-heading">Contact</div>
              <div className="kd-help-links">
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="kd-help-link">
                  <Github size={15} /> GitHub
                </a>
                {/* Privacy policy wajib untuk listing Play Console — halaman
                    statis di-served dari origin yang sama dengan app (relatif,
                    ikut domain hosting apa pun + ikut build PWA). */}
                <a
                  href="privacy-policy.html"
                  target="_blank"
                  rel="noreferrer"
                  className="kd-help-link"
                >
                  <ShieldCheck size={15} /> Privacy policy
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
