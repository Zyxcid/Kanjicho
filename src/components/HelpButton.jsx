import React from "react";
import { HelpCircle, X, Mail, ShieldCheck } from "lucide-react";
import pkg from "../../package.json";
import BackupControls from "./BackupControls";
import { pushOverlayEntry, closeOverlayUI, discardOverlayEntry, isOverlayEntryRegistered } from "../lib/useRouter.js";
import { t, LANGS } from "../lib/i18n.js";

// Kontak resmi app (t74): email kanjicho — mailto membuka aplikasi email
// dengan penerima terisi; tombol Back browser/Android menutup dulu
// aplikasi email itu, bukan app ini.
const CONTACT_EMAIL = "kanjicho.dev@gmail.com";

// (t81) Pilihan jeda auto-flip (ms) — dipakai App (sanitasi nilai
// localStorage "kanji-autoflip-delay") dan deretan pill di bawah sakelar
// auto-flip di help overlay ini. Diekspor dari komponen pemilik UI-nya
// supaya daftar pilihan & state tidak pernah saling basi. Default (nilai
// absen di localStorage) = 1000: keluhan t79 "420 ms terlalu cepat
// dibaca" vs t81 "1500 ms terlalu lama".
export const AUTO_FLIP_DELAYS = [500, 1000, 1500, 2000, 3000];

// 500 → "0.5s", 1000 → "1s", 1500 → "1.5s" (t81)
function delayLabel(ms) {
  return `${ms / 1000}s`;
}

export default function HelpButton({
  showReset,
  onToggleShowReset,
  autoFlip = true,
  onToggleAutoFlip,
  autoFlipDelay = 1000, // (t81) ms — satu dari AUTO_FLIP_DELAYS
  onChangeAutoFlipDelay, // (t81) (ms) => void — dikelola App + localStorage
  onReplayTutorial, // (t82) () => void — putar ulang tur onboarding dari Help
  // (t89) Blur pilihan jawaban — state + localStorage dikelola App
  // (kunci "kanji-blur-choices", default OFF; dua-ketukan di Quiz.jsx).
  blurChoices = false,
  onToggleBlurChoices,
  // (t89) Bahasa antarmuka — pill EN / Bahasa Indonesia; App memegang
  // state (localStorage "kanji-lang" via lib/i18n.js) supaya pergantian
  // bahasa me-render ulang SELURUH pohon (semua t() ikut berganti).
  lang = "en",
  onChangeLang,
  // (t86) Pengingat review (local notification) — hanya shell Capacitor
  // Android; App mengirim showReminders=false di web/PWA sehingga seksi
  // ini tidak pernah dirender di browser (web tidak punya local
  // notification yang bisa diandalkan).
  showReminders = false,
  reminders = true,
  onToggleReminders,
}) {
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

  // (t82) Replay tur onboarding. Help ditutup TANPA mengonsumsi entri
  // history (discard, bukan closeOverlayUI): App akan navigate("home",
  // {reset}) seketika setelah ini, dan history.back() asinkron dari
  // konsumsi akan bertabrakan dengan pushState navigate — pola yang sama
  // dengan jumpFromCalendar di App.jsx (entri overlay basi digantikan
  // entri navigasi baru).
  function replayTour() {
    setOpen(false);
    discardOverlayEntry(closeRef.current);
    closeRef.current = null;
    onReplayTutorial();
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
      <button className="kd-icon-btn" onClick={openHelp} aria-label={t("help.aria")}>
        <HelpCircle size={18} />
      </button>

      {open && (
        <div className="kd-modal-overlay" onClick={closeHelp}>
          <div className="kd-modal kd-help-modal" onClick={(e) => e.stopPropagation()}>
            <button className="kd-modal-close" onClick={closeHelp} aria-label={t("common.close")}>
              <X size={18} />
            </button>

            {/* (t90) Kepala: judul + chip versi SATU BARIS (dulu versi di
                baris sendiri di bawah judul). */}
            <div className="kd-help-header">
              <div className="kd-help-title">漢字帳 Kanjichō</div>
              <span className="kd-help-version">v{pkg.version}</span>
            </div>

            {/* ============ (t90) BAB 1 — PENGATURAN ============
                Semua sakelar/pilihan dikumpulkan DI ATAS. Urutan seksi
                lama (teks referensi berselang-seling dengan pengaturan:
                Language → Getting → Quiz → ... → Data sources → Progress)
                membuat modal terasa kacau; kini pengaturan dulu, panduan
                di tengah, tentang di bawah — pola umum modal "Settings".
                Seksi: Bahasa → Kuis → Pengingat (native) → Progres. */}
            <section className="kd-help-group">
              <div className="kd-help-group-label">{t("help.groupSettings")}</div>

              {/* (t89) BAHASA — memilih bahasa di sini seketika
                  menerjemahkan seluruh UI (App re-render penuh; t()
                  membaca bahasa aktif). Pill memakai pola deretan durasi
                  auto-flip di bawah; label = NAMA ASLI tiap bahasa
                  (konvensi UI bahasa — "English", "Bahasa Indonesia").
                  Tersimpan di localStorage "kanji-lang" (default en).
                  Seksi Data sources sengaja tetap Inggris di semua bahasa
                  (teks legal/kredit lisensi — konvensi aplikasi). */}
              <div className="kd-help-section">
                <div className="kd-help-heading">{t("help.language")}</div>
                <div
                  className="kd-help-delay-pills kd-lang-pills"
                  role="group"
                  aria-label={t("help.language")}
                >
                  {LANGS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={`kd-delay-pill ${lang === l.id ? "active" : ""}`}
                      aria-pressed={lang === l.id}
                      onClick={() => onChangeLang && onChangeLang(l.id)}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <p className="kd-help-text">{t("help.languageHint")}</p>
              </div>

              {/* t76: seksi Quiz & Browse kanji ditulis sebagai PROSA pendek
                  (bukan bullet) — mengikuti referensi user: kalimat mengalir
                  lebih mengundang dibaca daripada poin-poin. Penjelasan
                  lengkap untuk user baru kini hidup di TUR ONBOARDING (t82)
                  dan petunjuk di tempat (hint swipe di layar kuis), bukan
                  di sini — help menjadi referensi ringkas.
                  (t80) Toggle auto-flip hidup di seksi ini (pola row yang
                  sama dengan toggle "Reset progress button").
                  (t81) JEDA-nya kini bisa dipilih (deretan pill di bawah
                  sakelar) — default 1 dtk.
                  (t87) Dipangkas lagi atas permintaan user: paragraf
                  pengantar seksi Quiz DIHAPUS dan deskripsi kecil di bawah
                  label auto-flip & jeda ikut dihapus — labelnya sudah
                  cukup jelas. Yang tersisa: kontrol + nasihat jujur
                  "Don't know".
                  (t90) Baris jeda kini kolom (label atas, pill bawah) —
                  lihat komentar CSS .kd-help-delay-row. */}
              <div className="kd-help-section">
                <div className="kd-help-heading">{t("help.quiz")}</div>
                {/* (t89) Toggle blur pilihan — diletakkan SEBELUM auto-flip
                    (urutan kronologi kuis: ingat dulu → jawab → baru kartu
                    terbalik). Deskripsi kecil DIPERTAHANKAN untuk toggle ini
                    (pengecualian kebijakan t87 "tanpa deskripsi"): perilaku
                    dua-ketukannya tidak terbaca dari label saja. */}
                <div className="kd-help-toggle-row">
                  <div>
                    <div className="kd-help-toggle-name">{t("help.blur")}</div>
                    <div className="kd-help-toggle-desc">{t("help.blurDesc")}</div>
                  </div>
                  <button
                    className={`kd-toggle ${blurChoices ? "on" : ""}`}
                    role="switch"
                    aria-checked={blurChoices}
                    aria-label={t("help.blur")}
                    onClick={onToggleBlurChoices}
                  >
                    <span className="kd-toggle-knob" />
                  </button>
                </div>
                {/* (t80) Toggle auto-flip — pola row switch yang sama dengan
                    toggle reset button di seksi Progress. (t87) tanpa
                    deskripsi: label "Auto-flip the card" sudah cukup. */}
                <div className="kd-help-toggle-row">
                  <div className="kd-help-toggle-name">{t("help.autoflip")}</div>
                  <button
                    className={`kd-toggle ${autoFlip ? "on" : ""}`}
                    role="switch"
                    aria-checked={autoFlip}
                    aria-label={t("help.autoflip")}
                    onClick={onToggleAutoFlip}
                  >
                    <span className="kd-toggle-knob" />
                  </button>
                </div>
                {/* (t81) Jeda auto-flip — deretan pill durasi; row meredup
                    saat auto-flip off (pilihan tetap tersimpan, timer Quiz
                    membaca nilai terbaru begitu toggle menyala lagi).
                    (t87) tanpa deskripsi: label + deretan pill sudah
                    cukup. */}
                <div className={`kd-help-delay-row ${autoFlip ? "" : "off"}`}>
                  <div className="kd-help-toggle-name">{t("help.autoflipDelay")}</div>
                  <div
                    className="kd-help-delay-pills"
                    role="group"
                    aria-label={t("help.autoflipDelay")}
                  >
                    {AUTO_FLIP_DELAYS.map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        className={`kd-delay-pill ${ms === autoFlipDelay ? "active" : ""}`}
                        aria-pressed={ms === autoFlipDelay}
                        onClick={() => onChangeAutoFlipDelay && onChangeAutoFlipDelay(ms)}
                      >
                        {delayLabel(ms)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="kd-help-text">
                  {t("help.quizText.a")}
                  <b>{t("quiz.dontKnow")}</b>
                  {t("help.quizText.b")}
                </p>
              </div>

              {/* (t86) Seksi Reminders — hanya di shell Android. Sakelar
                  memakai pola row switch yang sama dengan auto-flip/reset.
                  Notifikasi lokal murni (tidak ada data yang meninggalkan
                  perangkat) — konsisten dengan privacy policy app. */}
              {showReminders && (
                <div className="kd-help-section">
                  <div className="kd-help-heading">{t("help.reminders")}</div>
                  <div className="kd-help-toggle-row">
                    <div>
                      <div className="kd-help-toggle-name">{t("help.remindersToggle")}</div>
                      <div className="kd-help-toggle-desc">
                        {t("help.remindersDesc")}
                      </div>
                    </div>
                    <button
                      className={`kd-toggle ${reminders ? "on" : ""}`}
                      role="switch"
                      aria-checked={reminders}
                      aria-label={t("help.remindersToggle")}
                      onClick={onToggleReminders}
                    >
                      <span className="kd-toggle-knob" />
                    </button>
                  </div>
                  <p className="kd-help-text">{t("help.remindersText")}</p>
                </div>
              )}

              <div className="kd-help-section">
                <div className="kd-help-heading">{t("help.progress")}</div>
                <BackupControls />
                {/* Toggle visibilitas tombol "Reset progress" per level —
                    destruktif, jadi disembunyikan dari layar utama dan hanya
                    diaktifkan dari sini. */}
                <div className="kd-help-toggle-row">
                  <div>
                    <div className="kd-help-toggle-name">{t("help.resetToggle")}</div>
                    <div className="kd-help-toggle-desc">{t("help.resetDesc")}</div>
                  </div>
                  <button
                    className={`kd-toggle ${showReset ? "on" : ""}`}
                    role="switch"
                    aria-checked={showReset}
                    aria-label={t("help.resetDesc")}
                    onClick={onToggleShowReset}
                  >
                    <span className="kd-toggle-knob" />
                  </button>
                </div>
              </div>
            </section>

            {/* ============ (t90) BAB 2 — PANDUAN ============
                Cara pakai (tur) + legenda membaca komponen kanji. */}
            <section className="kd-help-group">
              <div className="kd-help-group-label">{t("help.groupGuide")}</div>

              {/* (t82) Tur onboarding (Tutorial.jsx) kini menjelaskan alur
                  dasar LANGSUNG DI TEMPATNYA (level → unit → kuis → Browse),
                  jadi Help dipangkas: kalimat-kalimat pengantar untuk user
                  baru pensiun; yang tinggal adalah REFERENSI cepat + kontrol.
                  Seksi ini satu-satunya pintu replay tur (auto-start hanya
                  untuk user baru — lihat App.jsx). */}
              <div className="kd-help-section">
                <div className="kd-help-heading">{t("help.getting")}</div>
                <p className="kd-help-text">{t("help.intro")}</p>
                <button
                  className="kd-btn secondary kd-help-replay"
                  onClick={replayTour}
                >
                  {t("help.replay")}
                </button>
              </div>

              <div className="kd-help-section">
                <div className="kd-help-heading">{t("help.browse")}</div>
                <p className="kd-help-text">
                  {t("help.browseText.a")}{" "}
                  <span className="kd-help-dot rad" aria-hidden="true" />{" "}
                  {t("help.browseText.b")} <b>{t("help.browseText.radical")}</b>
                  {t("help.browseText.c")}{" "}
                  <span className="kd-help-dot phon" aria-hidden="true" />{" "}
                  {t("help.browseText.d")} <b>{t("help.browseText.phonetic")}</b>
                  {t("help.browseText.e")}
                </p>
              </div>
            </section>

            {/* ============ (t90) BAB 3 — TENTANG ============
                Kredit sumber data (kini daftar per-sumber, bukan dinding
                teks) + kontak. */}
            <section className="kd-help-group">
              <div className="kd-help-group-label">{t("help.groupAbout")}</div>

              {/* (t90) Data sources — dulu SATU paragraf panjang penuh link
                  inline (dinding teks, sulit dipindai); kini tiap sumber
                  satu baris sendiri: nama (link) — keterangan + pemegang
                  hak + lisensi. Semua atribusi & tautan lisensi tetap
                  utuh. Sengaja tetap Inggris di semua bahasa (teks
                  legal/kredit — konvensi aplikasi). */}
              <div className="kd-help-section">
                <div className="kd-help-heading">Data sources</div>
                <ul className="kd-help-sources">
                  <li>
                    <a href="https://www.edrdg.org/wiki/KANJIDIC_Project.html" target="_blank" rel="noreferrer">
                      KANJIDIC2
                    </a>
                    {" "}— kanji readings and meanings, © Electronic Dictionary
                    Research and Development Group, used under{" "}
                    <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
                      CC BY-SA 4.0
                    </a>
                    .
                  </li>
                  <li>
                    <a href="https://www.edrdg.org/jmdict/edict_doc_depr.html" target="_blank" rel="noreferrer">
                      JMdict
                    </a>
                    {" "}— example word glosses and common-word markers, ©
                    Electronic Dictionary Research and Development Group,
                    used under{" "}
                    <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
                      CC BY-SA 4.0
                    </a>
                    .
                  </li>
                  <li>
                    <a href="https://jiten.moe/frequency-dictionaries" target="_blank" rel="noreferrer">
                      Jiten frequency lists
                    </a>
                    {" "}— reading and word frequency signals, © Jiten, used
                    under{" "}
                    <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
                      CC BY-SA 4.0
                    </a>
                    .
                  </li>
                  <li>
                    <a href="https://github.com/Bluskyo/JLPT_Vocabulary" target="_blank" rel="noreferrer">
                      Bluskyo/JLPT_Vocabulary
                    </a>
                    {" "}— JLPT kanji and vocabulary levels
                    <span className="kd-help-license"> (MIT)</span>.
                  </li>
                  <li>
                    <a href="http://kanjivg.tagaini.net/" target="_blank" rel="noreferrer">
                      KanjiVG
                    </a>
                    {" "}— stroke order animations (tap the kanji on a
                    card&apos;s back, or open one in Browse), © Ulrich Apel,
                    used under{" "}
                    <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">
                      CC BY-SA 3.0
                    </a>
                    .
                  </li>
                </ul>
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
                {/* (t81) Kredit font — dibundel dari npm @fontsource saat
                    build (origin sama, tanpa request pihak ketiga). OFL 1.1
                    memperbolehkan pembundelan & distribusi (termasuk app
                    Play Store); menyebut lisensinya di sini menjaga listing
                    tetap bersih & jujur. */}
                <p className="kd-help-text kd-help-legal">
                  Typefaces Shippori Mincho, Zen Kaku Gothic New, and DM
                  Mono are bundled from Fontsource under the{" "}
                  <a
                    href="https://openfontlicense.org/open-font-license-official-text/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    SIL Open Font License 1.1
                  </a>
                  .
                </p>
              </div>

              <div className="kd-help-section">
                <div className="kd-help-heading">{t("help.contact")}</div>
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
                    <ShieldCheck size={15} /> {t("help.privacy")}
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
