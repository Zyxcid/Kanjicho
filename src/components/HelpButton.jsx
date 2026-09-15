import React from "react";
import { HelpCircle, X, ChevronDown, Mail, ShieldCheck } from "lucide-react";
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
// auto-flip di menu help ini. Diekspor dari komponen pemilik UI-nya
// supaya daftar pilihan & state tidak pernah saling basi. Default (nilai
// absen di localStorage) = 1000: keluhan t79 "420 ms terlalu cepat
// dibaca" vs t81 "1500 ms terlalu lama".
export const AUTO_FLIP_DELAYS = [500, 1000, 1500, 2000, 3000];

// 500 → "0.5s", 1000 → "1s", 1500 → "1.5s" (t81)
function delayLabel(ms) {
  return `${ms / 1000}s`;
}

// (t92) Help kini DROPDOWN/POPOVER yang berlabuh di tombol ? topbar,
// bukan lagi modal layar penuh (usulan user: "ubah help overlay jadi
// dropdown atau yang sejenisnya"). Dua penyesuaian bentuk:
//   1. Panel kecil muncul persis di bawah tombol Help (panah kecil
//      menunjuk tombolnya), klik di mana pun di luar panel menutup —
//      backdrop transparan TANPA penggelapan layar: membuka help tidak
//      lagi "mengambil alih" seluruh layar, terasa seperti membuka menu.
//   2. Tiga bab (Pengaturan / Panduan / Tentang) menjadi AKORDEON:
//      header bab bisa dilipat. Default hanya Pengaturan terbuka —
//      tinggi panel jadi pendek & bisa diprediksi; panduan/tentang
//      tinggal dibuka saat memang dicari. (t96: akordeon kini
//      EKSKLUSIF — membuka satu bab melipat bab lain, panel tak
//      pernah tumbuh melebihi tinggi satu bab.)
// Tekanan tetap: Escape, tombol Back Android (entri overlay router t65),
// klik luar, tombol ✕ di kepala panel.
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
  // (t94) Mode + jam pengingat — state App (mirror localStorage via
  // notifications.js) supaya pergantian mode me-render ulang seksi ini:
  // input jam hanya muncul di mode "time", paragraf penjelas ikut mode.
  reminderMode = "due",
  onChangeReminderMode,
  reminderTime = "09:00",
  onChangeReminderTime,
}) {
  const [open, setOpen] = React.useState(false);
  // (t92) Posisi panel: dihitung dari rect tombol ? saat DIBUKA (bukan
  // saat dirender) — topbar bisa lebih tinggi rendahnya tergantung layar
  // (brand sesi kuis / tombol back), jadi jangan menebak lewat CSS saja.
  // {top, right, arrowRight} dalam px; null = fallback posisi CSS default.
  // right = jarak dari tepi KANAN viewport ke tepi kanan panel; nilai ini
  // di-CLAMP supaya panel selebar apa pun tidak pernah keluar layar kiri
  // (tombol ? tidak paling kanan di topbar — help → skrip → tema — jadi
  // panel yang ditempel persis di bawah tombol bisa meluber ke kiri di
  // layar sempit). arrowRight = offset panah dari tepi kanan panel,
  // dihitung supaya panah tetap menunjuk tombol ? WALAUPUN panelnya
  // digeser oleh clamp.
  const [anchor, setAnchor] = React.useState(null);
  // (t92) Bab akordeon mana yang terbuka. Semua TERLIPAT default — panel
  // yang terbuka tampak seperti menu dropdown ringkas (tiga kepala bab);
  // pengaturan/panduan/tentang dibuka sesuai kebutuhan. (t96: EKSKLUSIF —
  // membuka satu bab melipat bab lain yang sedang terbuka; memilih bab
  // yang sudah terbuka melipatnya kembali.)
  const [groups, setGroups] = React.useState({ settings: false, guide: false, about: false });
  const btnRef = React.useRef(null);

  function toggleGroup(key) {
    setGroups((g) =>
      g[key]
        ? { settings: false, guide: false, about: false }
        : { settings: key === "settings", guide: key === "guide", about: key === "about" }
    );
  }

  // Penutup overlay yang terdaftar di tumpukan overlay router (t65):
  // membuka panel menambah entri history sendiri → tombol Back di mobile
  // menutup panel ini alih-alih berpindah halaman; menutup lewat UI
  // (✕/Escape/klik luar) mengonsumsi entri itu kembali.
  const closeRef = React.useRef(null);

  function openHelp() {
    // (t92) Kunci posisi panel ke posisi tombol SAAT INI + clamp supaya
    // tetap di dalam layar (lihat komentar state anchor). Panah kecil
    // panel dihitung mengejar pusat tombol (dibatasi di dalam panel).
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) {
      setAnchor(null);
    } else {
      const vw = window.innerWidth;
      const width = Math.min(400, vw - 32);
      const right = Math.min(
        Math.round(vw - r.right),
        Math.max(16, Math.round(vw - 16 - width))
      );
      // pusat tombol → offset panah dari tepi kanan panel (lebar panah 9px)
      const popRightEdgeX = vw - right;
      const btnCenterX = r.left + r.width / 2;
      const arrowRight = Math.round(
        Math.min(Math.max(popRightEdgeX - btnCenterX - 4.5, 10), width - 19)
      );
      setAnchor({ top: Math.round(r.bottom + 10), right, arrowRight });
    }
    setOpen(true);
    // Push hanya kalau belum ada entri HIDUP — ref bisa basi setelah panel
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

  // Escape menutup panel help — konsisten dengan modal lain (kalender,
  // detail Browse).
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") closeHelp();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Bersih-bersih defensif: kalau komponen unmount saat panel terbuka
  // (navigasi layar lewat popstate), buang penutupnya dari tumpukan
  // overlay supaya tidak menutup overlay lain secara salah.
  React.useEffect(() => () => {
    discardOverlayEntry(closeRef.current);
    closeRef.current = null;
  }, []);

  return (
    <>
      <button ref={btnRef} className="kd-icon-btn" onClick={openHelp} aria-label={t("help.aria")} aria-haspopup="dialog" aria-expanded={open}>
        <HelpCircle size={18} />
      </button>

      {open && (
        <>
          {/* (t92) Klik-luar = tutup. TRANSPARAN murni (tanpa rgba gelap +
              blur seperti modal) — panel kecil tidak boleh terasa
              "mengambil alih" layar. Z-index di bawah panel. */}
          <div className="kd-help-backdrop" onClick={closeHelp} />
          <div
            className="kd-help-pop"
            role="dialog"
            aria-label={t("help.aria")}
            style={anchor ? { top: `${anchor.top}px`, right: `${anchor.right}px` } : undefined}
          >
            {/* Panah kecil menunjuk tombol ? — identitas "dropdown".
                Offset kanan di-inject supaya panah mengikuti tombol WALAU
                panel digeser clamp (default CSS 13px = kasus tanpa
                pergeseran). */}
            <span
              className="kd-help-pop-arrow"
              aria-hidden="true"
              style={anchor ? { right: `${anchor.arrowRight}px` } : undefined}
            />
            {/* Kepala panel tetap tampak saat scroll (di luar area
                scrollable): judul + chip versi + ✕. */}
            <div className="kd-help-pop-head">
              <div className="kd-help-title">漢字帳 Kanjichō</div>
              <span className="kd-help-version">v{pkg.version}</span>
              <button className="kd-help-pop-close" onClick={closeHelp} aria-label={t("common.close")}>
                <X size={15} />
              </button>
            </div>

            <div className="kd-help-pop-scroll">
              {/* ============ (t90) BAB 1 — PENGATURAN ============
                  Semua sakelar/pilihan dikumpulkan DI ATAS (t90). Urutan
                  seksi lama (teks referensi berselang-seling dengan
                  pengaturan) membuat menu terasa kacau; kini pengaturan
                  dulu, panduan di tengah, tentang di bawah — pola umum
                  menu "Settings". Seksi: Bahasa → Kuis → Pengingat
                  (native) → Progres. (t92) bab = akordeon, header-nya
                  tombol lipat. */}
              <section className={`kd-help-group${groups.settings ? " open" : ""}`}>
                <button
                  type="button"
                  className="kd-help-group-toggle"
                  aria-expanded={groups.settings}
                  onClick={() => toggleGroup("settings")}
                >
                  <span>{t("help.groupSettings")}</span>
                  <ChevronDown size={14} className="kd-help-group-chevron" />
                </button>

                {groups.settings && (
                  <div className="kd-help-group-body">
                    {/* (t89) BAHASA — memilih bahasa di sini seketika
                        menerjemahkan seluruh UI (App re-render penuh; t()
                        membaca bahasa aktif). Pill memakai pola deretan
                        durasi auto-flip di bawah; label = NAMA ASLI tiap
                        bahasa (konvensi UI bahasa — "English", "Bahasa
                        Indonesia"). Tersimpan di localStorage "kanji-lang"
                        (default en). (t96: paragraf petunjuk dihapus atas
                        permintaan user — deretan pill sudah menjelaskan
                        dirinya sendiri.) Seksi Data sources sengaja tetap
                        Inggris di semua bahasa (teks legal/kredit lisensi
                        — konvensi aplikasi). */}
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
                    </div>

                    {/* t76: seksi Quiz & Browse kanji ditulis sebagai PROSA
                        pendek (bukan bullet) — mengikuti referensi user:
                        kalimat mengalir lebih mengundang dibaca daripada
                        poin-poin. Penjelasan lengkap untuk user baru kini
                        hidup di TUR ONBOARDING (t82) dan petunjuk di
                        tempat (hint swipe di layar kuis), bukan di sini —
                        help menjadi referensi ringkas.
                        (t80) Toggle auto-flip hidup di seksi ini (pola row
                        yang sama dengan toggle "Reset progress button").
                        (t81) JEDA-nya kini bisa dipilih (deretan pill di
                        bawah sakelar) — default 1 dtk.
                        (t87) Dipangkas lagi atas permintaan user: paragraf
                        pengantar seksi Quiz DIHAPUS dan deskripsi kecil di
                        bawah label auto-flip & jeda ikut dihapus —
                        labelnya sudah cukup jelas. Yang tersisa: kontrol +
                        nasihat jujur "Don't know".
                        (t90) Baris jeda kini kolom (label atas, pill
                        bawah) — lihat komentar CSS .kd-help-delay-row. */}
                    <div className="kd-help-section">
                      <div className="kd-help-heading">{t("help.quiz")}</div>
                      {/* (t89) Toggle blur pilihan — diletakkan SEBELUM
                          auto-flip (urutan kronologi kuis: ingat dulu →
                          jawab → baru kartu terbalik). Deskripsi kecil
                          DIPERTAHANKAN untuk toggle ini (pengecualian
                          kebijakan t87 "tanpa deskripsi"): perilaku
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
                      {/* (t80) Toggle auto-flip — pola row switch yang sama
                          dengan toggle reset button di seksi Progress.
                          (t87) tanpa deskripsi: label "Auto-flip the card"
                          sudah cukup. */}
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
                      {/* (t81) Jeda auto-flip — deretan pill durasi; row
                          meredup saat auto-flip off (pilihan tetap
                          tersimpan, timer Quiz membaca nilai terbaru begitu
                          toggle menyala lagi). (t87) tanpa deskripsi:
                          label + deretan pill sudah cukup. */}
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
                      {/* (t98) Paragraf panjang tentang jadwal review pertama
                          DIPINDAH ke bab Panduan (usulan user: ini penjelasan
                          cara kerja, bukan pengaturan) — seksi Kuis kini
                          murni kontrol. */}
                    </div>

                    {/* (t86) Seksi Reminders — hanya di shell Android.
                        Sakelar memakai pola row switch yang sama dengan
                        auto-flip/reset. Notifikasi lokal murni (tidak ada
                        data yang meninggalkan perangkat) — konsisten
                        dengan privacy policy app.
                        (t94) Di bawah sakelar: PILIHAN MODE — "jam
                        tertentu" (sekali sehari di jam pilihan + input
                        jam) vs "saat jatuh tempo" (begitu unit due).
                        (t98) Paragraf penjelas mode DIHAPUS atas permintaan
                        user ("penjelasan ini tidak diperlukan") — dua pill
                        + input jam sudah menjelaskan dirinya; detail
                        perilaku (merge, resinkron) hidup di README. */}
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
                        {/* Mode pengingat — dua pill bergaya deretan jeda
                            auto-flip / bahasa (kata, bukan angka → font
                            UI lewat .kd-reminder-mode-pills). Row meredup
                            saat pengingat mati; pilihan tetap tersimpan
                            dan berlaku begitu sakelar dinyalakan lagi
                            (pola yang sama dengan jeda auto-flip). */}
                        <div className={`kd-help-delay-row ${reminders ? "" : "off"}`}>
                          <div className="kd-help-toggle-name">{t("help.reminderMode")}</div>
                          <div
                            className="kd-help-delay-pills kd-reminder-mode-pills"
                            role="group"
                            aria-label={t("help.reminderMode")}
                          >
                            <button
                              type="button"
                              className={`kd-delay-pill ${reminderMode === "time" ? "active" : ""}`}
                              aria-pressed={reminderMode === "time"}
                              onClick={() => onChangeReminderMode && onChangeReminderMode("time")}
                            >
                              {t("help.reminderModeTime")}
                            </button>
                            <button
                              type="button"
                              className={`kd-delay-pill ${reminderMode === "due" ? "active" : ""}`}
                              aria-pressed={reminderMode === "due"}
                              onClick={() => onChangeReminderMode && onChangeReminderMode("due")}
                            >
                              {t("help.reminderModeDue")}
                            </button>
                          </div>
                        </div>
                        {/* Jam pilihan — hanya hidup di mode "jam tertentu";
                           input time native (Android memunculkan picker
                           jam sistem). Nilai kosong (dibatalkan) diabaikan
                           agar pilihan lama tidak terhapus. */}
                        {reminderMode === "time" && (
                          <div className="kd-reminder-time-row">
                            <div className="kd-help-toggle-name">{t("help.reminderTime")}</div>
                            <input
                              type="time"
                              className="kd-reminder-time"
                              value={reminderTime}
                              aria-label={t("help.reminderTime")}
                              onChange={(e) => {
                                if (e.target.value && onChangeReminderTime) {
                                  onChangeReminderTime(e.target.value);
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="kd-help-section">
                      <div className="kd-help-heading">{t("help.progress")}</div>
                      <BackupControls />
                      {/* Toggle visibilitas tombol "Reset progress" per
                          level — destruktif, jadi disembunyikan dari layar
                          utama dan hanya diaktifkan dari sini. */}
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
                  </div>
                )}
              </section>

              {/* ============ (t90) BAB 2 — PANDUAN ============
                  Cara pakai (tur) + legenda membaca komponen kanji.
                  (t92) akordeon, terlipat default. */}
              <section className={`kd-help-group${groups.guide ? " open" : ""}`}>
                <button
                  type="button"
                  className="kd-help-group-toggle"
                  aria-expanded={groups.guide}
                  onClick={() => toggleGroup("guide")}
                >
                  <span>{t("help.groupGuide")}</span>
                  <ChevronDown size={14} className="kd-help-group-chevron" />
                </button>

                {groups.guide && (
                  <div className="kd-help-group-body">
                    {/* (t82) Tur onboarding (Tutorial.jsx) kini menjelaskan
                        alur dasar LANGSUNG DI TEMPATNYA (level → unit →
                        kuis → Browse), jadi Help dipangkas: kalimat-kalimat
                        pengantar untuk user baru pensiun; yang tinggal
                        adalah REFERENSI cepat + kontrol. Seksi ini
                        satu-satunya pintu replay tur (auto-start hanya
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

                    {/* (t98) Jadwal review — paragraf SRS yang dulu menempel
                        di seksi Kuis (Pengaturan), dipindah ke sini atas
                        permintaan user: ini penjelasan cara kerja aplikasi
                        (panduan), bukan pengaturan. Nasihat "jangan takut
                        menjawab Tidak tahu" tetap satu kalimat dengan
                        penjelasan jadwalnya. */}
                    <div className="kd-help-section">
                      <div className="kd-help-heading">{t("help.schedule")}</div>
                      <p className="kd-help-text">
                        {t("help.scheduleText.a")}
                        <b>{t("quiz.dontKnow")}</b>
                        {t("help.scheduleText.b")}
                      </p>
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
                  </div>
                )}
              </section>

              {/* ============ (t90) BAB 3 — TENTANG ============
                  Kredit sumber data (daftar per-sumber, t90) + kontak.
                  (t92) akordeon, terlipat default. */}
              <section className={`kd-help-group${groups.about ? " open" : ""}`}>
                <button
                  type="button"
                  className="kd-help-group-toggle"
                  aria-expanded={groups.about}
                  onClick={() => toggleGroup("about")}
                >
                  <span>{t("help.groupAbout")}</span>
                  <ChevronDown size={14} className="kd-help-group-chevron" />
                </button>

                {groups.about && (
                  <div className="kd-help-group-body">
                    {/* (t90) Data sources — tiap sumber satu baris sendiri:
                        nama (link) — keterangan + pemegang hak + lisensi.
                        Semua atribusi & tautan lisensi tetap utuh.
                        Sengaja tetap Inggris di semua bahasa (teks
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
                      {/* Disclaimer merek JLPT (JEES) + repo data terbuka +
                          kredit pustaka OSS — kebersihan publish (Play
                          Store): semua muatan legal Help kini satu tempat. */}
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
                          build (origin sama, tanpa request pihak ketiga). OFL
                          1.1 memperbolehkan pembundelan & distribusi (termasuk
                          app Play Store); menyebut lisensinya di sini menjaga
                          listing tetap bersih & jujur. */}
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
                        {/* t74: kontak = email kanjicho (mailto) — satu klik
                            di Android langsung membuka aplikasi email dengan
                            penerima (dan subjek) terisi. */}
                        <a
                          href={`mailto:${CONTACT_EMAIL}?subject=Kanjicho%20app%20feedback`}
                          className="kd-help-link"
                        >
                          <Mail size={15} /> {CONTACT_EMAIL}
                        </a>
                        {/* Privacy policy wajib untuk listing Play Console —
                            halaman statis di-served dari origin yang sama
                            dengan app (relatif, ikut domain hosting apa pun +
                            ikut build PWA). */}
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
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
