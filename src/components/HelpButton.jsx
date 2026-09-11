import React from "react";
import { HelpCircle, X, Mail, ShieldCheck } from "lucide-react";
import pkg from "../../package.json";
import BackupControls from "./BackupControls";
import { pushOverlayEntry, closeOverlayUI, discardOverlayEntry, isOverlayEntryRegistered } from "../lib/useRouter.js";

// Kontak resmi app (t74): email kanjicho — mailto membuka aplikasi email
// dengan penerima terisi; tombol Back browser/Android menutup dulu
// aplikasi email itu, bukan app ini.
const CONTACT_EMAIL = "kanjicho.dev@gmail.com";

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

            {/* t74: seksi "Keyboard shortcuts" DIHAPUS dari UI — app
                fokus Android, hover/shortcut desktop bukan lagi audiens
                utama. Handler shortcutnya (w/e/s/d/f/r/q/Enter di
                Quiz.jsx + App.jsx) TETAP hidup untuk development. */}

            {/* t76: seksi Quiz & Browse kanji ditulis sebagai PROSA pendek
                (bukan bullet) — mengikuti referensi user: kalimat mengalir
                lebih mengundang dibaca daripada poin-poin; penjelasan
                lengkap untuk user baru hidup DI SINI, layar kuis/browse
                sendiri tetap bersih.
                (t78) Kalimat swipe DIHAPUS dari sini — petunjuk swipe kini
                tampil di layar kuis itu sendiri, hanya sampai user
                melakukan swipe pertama (lihat Quiz.jsx). */}

            <div className="kd-help-section">
              <div className="kd-help-heading">Quiz</div>
              <p className="kd-help-text">
                You can tap the kanji to watch its stroke order. Once you
                answer, the card flips over to a reading sheet, and the
                readings written in <b>bold</b> are the ones the
                multiple-choice options come from.
              </p>
              <p className="kd-help-text">
                The first time you finish a unit, its review is always
                scheduled 1 or 2 days away (8 for a perfect score). The
                app uses that early date as the starting reference for
                your next reviews, so don&apos;t hesitate to answer{" "}
                <b>Don&apos;t know</b>: an honest answer keeps your
                schedule accurate.
              </p>
            </div>

            <div className="kd-help-section">
              <div className="kd-help-heading">Browse kanji</div>
              <p className="kd-help-text">
                Tap any kanji to see its stroke order, readings, and
                example words.
              </p>
              <p className="kd-help-text">
                In a kanji&apos;s components, a{" "}
                <span className="kd-help-dot rad" aria-hidden="true" /> red
                dot marks the <b>radical</b>, the part that carries the
                meaning, and a{" "}
                <span className="kd-help-dot phon" aria-hidden="true" /> blue
                dot marks the <b>phonetic</b>, the part that carries the
                sound. Tap a component to open its own page.
              </p>
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
                {/* t74: kontak = email kanjicho (mailto) — satu klik di
                    Android langsung membuka aplikasi email dengan penerima
                    (dan subjek) terisi. Link GitHub lama dihapus. */}
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=Kanjicho%20app%20feedback`}
                  className="kd-help-link"
                >
                  <Mail size={15} /> {CONTACT_EMAIL}
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
