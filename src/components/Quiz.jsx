import React, { useEffect, useRef, useState } from "react";
import { CircleX, HelpCircle, MoveHorizontal } from "lucide-react";
import { DONT_KNOW } from "../lib/quizGenerator.js";
import { ReadingList } from "./Readings.jsx";
// (t96) Arti & gloss contoh mengikuti bahasa UI (overlay id_gloss).
import { useIdData, localizedMeanings } from "../lib/idData.jsx";
import { t } from "../lib/i18n.js";
import RevealGlyph from "./RevealGlyph.jsx";
import ComponentBreakdown from "./ComponentBreakdown.jsx";
// (t107) Daftar contoh kata + kalimat — komponen bersama 3 layar.
import ExampleList from "./ExampleList.jsx";
import { loadComponents } from "../lib/components.js";
import { loadStrokePaths } from "../lib/strokes.js";

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

/* (t80) AUTO-FLIP KEMBALI — default ON (permintaan user). (t81) JEDA
   kini DIPILIH USER: keluhan "flip kartu terlalu lama" atas 1500 ms →
   default 1000 ms (tengah antara 420 ms yang dulu "terlalu cepat
   dibaca" — t79 — dan 1500 ms), plus deretan pilihan durasi di help
   overlay (prop `autoFlipDelay` dari App; state + localStorage
   "kanji-autoflip-delay" dikelola App, daftar pilihan di
   HelpButton.jsx). Auto-flip tetap bisa dimatikan total dari toggle
   help overlay ("kanji-autoflip"). Swipe manual MEMBATALKAN timer
   yang masih menggantung — kartu tidak boleh "direbut" kembali dari
   tangan user. t79 sempat menghapus auto-flip total; ini
   komprominya. */
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

export default function Quiz({
  quiz,
  qIndex,
  answers = [],
  selectedChoice, // indeks pilihan (number) | DONT_KNOW | null
  mode,
  answerScript = "romaji",
  onToggleScript,
  // (t108) Furigana kalimat contoh dari gerbang global App — diteruskan
  // ke ExampleList (panel reveal). Default ON bila prop tak diberikan.
  furigana = true,
  autoFlip = true, // (t80) dari toggle help overlay — default ON
  autoFlipDelay = 1000, // (t81) jeda auto-flip (ms) — dari deretan pill help overlay
  // (t89) Blur pilihan dari toggle help overlay — default OFF (opt-in:
  // blur di kuis pertama tanpa penjelasan akan terasa seperti bug; sakelar
  // di Help menjelaskan perilakunya dua-ketukan sebelum diaktifkan).
  blurChoices = false,
  onSubmitAnswer,
  onContinue,
}) {
  const current = quiz[qIndex];
  const isKana = current.questionType === "reading" && answerScript === "kana";
  // (t96) Peta gloss Indonesia aktif — null bila bahasa UI bukan id.
  const idData = useIdData();

  // Papan skor dot (t76): jumlah benar/salah dari jawaban yang SUDAH
  // dimasukkan (answers bertambah tiap Continue; panjangnya = qIndex).
  // DONT_KNOW adalah string, bukan indeks, jadi !== correctIndex → salah.
  const correctSoFar = answers.reduce(
    (n, a, j) => (a === quiz[j].correctIndex ? n + 1 : n),
    0
  );
  const wrongSoFar = qIndex - correctSoFar;

  // (t77) Kartu kuis = KARTU FISIK: depan = soal + pilihan, belakang =
  // reading sheet. (t80) `rot` = rotasi KUMULATIF di sumbu Y (derajat):
  // tiap pergantian sisi menambah/mengurangi 180 SESUAI ARAH GERAKAN —
  // swipe ke kanan menyapu wajah ke kanan (+180), ke kiri menyapu ke
  // kiri (−180), auto-flip memakai −180 (lipatan halaman maju). Genap
  // (0, ±360, …) = depan; ganjil (±180, ±540, …) = belakang. `answered`
  // dari App mengunci flip — sisi belakang memuat JAWABAN, jadi sebelum
  // menjawab kartu tidak boleh bisa dibalik.
  const answered = selectedChoice !== null;
  const [rot, setRot] = useState(0);
  const flipped = Math.abs(rot % 360) === 180;

  // (t89) BLUR PILIHAN: pilihan kabur sampai diketuk sekali — user dipaksa
  // mengingat bacaan kanji DULU sebelum membaca pilihan (active recall,
  // atas usulan user). Dua keputusan desain:
  //  (a) ketukan PERTAMA membuka blur SEMUA pilihan sekaligus — begitu satu
  //      pilihan terbaca, momen "murni mengingat" sudah lewat, jadi
  //      membandingkan keempatnya kini adil; ketukan KEDUA menjawab.
  //  (b) "Don't know" TIDAK ikut blur dan tetap menjawab langsung — jalur
  //      kabur dari kejujuran tidak boleh hilang (menjawab tidak-tahu tidak
  //      membocorkan apa pun).
  // `choicesRevealed` reset per soal: tiap kanji baru harus diingat ulang.
  // Setelah dijawab (answered) blur otomatis tidak relevan — state
  // correct/wrong harus terbaca jelas.
  const [choicesRevealed, setChoicesRevealed] = useState(false);
  useEffect(() => {
    setChoicesRevealed(false);
  }, [qIndex, current.kanji]);
  const blurActive = blurChoices && !answered && !choicesRevealed;

  // Ketukan pilihan: saat masih blur, ketukan hanya MEMBUKA blur (tidak
  // menjawab) — klik "menembus" tur onboarding tetap tidak masalah karena
  // langkah choices tur kini maju lewat waitAppear punggung kartu (t89,
  // lihat Tutorial.jsx), bukan lewat klik pilihan.
  function handleChoiceClick(idx) {
    if (blurActive) {
      setChoicesRevealed(true);
      return;
    }
    onSubmitAnswer(idx);
  }

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
  // `rot` mentah belum sempat direset efek di bawah. Tanpa gerbang ini
  // transform kartu baru memuat rotasi bekas soal lama. Gerbang yang sama
  // diterapkan pada style inline di bawah: rotateY(answered ? rot : 0).
  const showBack = answered && flipped;

  // (t80) Auto-flip + reset: jawab → tunggu `autoFlipDelay` → putar
  // sendiri ke belakang (guard `r === 0`: hanya bila masih di depan —
  // user yang sudah membalik manual tidak diganggu). Soal berganti
  // (selectedChoice null) → rot kembali 0: soal baru selalu mulai dari
  // depan DAN swipe pertamanya mengarah ke BELAKANG (bukan memutar balik).
  // Bila autoFlip dimatikan (toggle help overlay) tidak ada timer sama
  // sekali — kartu sepenuhnya manual (perilaku t79). (t81) ganti jeda
  // saat sesi berjalan juga aman: efek ini bergantung `autoFlipDelay`,
  // timer lama dibersihkan cleanup lalu dipasang ulang dengan durasi
  // baru sebelum sempat terpicu.
  const autoFlipTimer = useRef(null);
  useEffect(() => {
    if (selectedChoice === null) {
      setRot(0);
      return;
    }
    if (!autoFlip) return;
    const t = setTimeout(() => {
      setRot((r) => (r === 0 ? r - 180 : r));
    }, autoFlipDelay);
    autoFlipTimer.current = t;
    return () => clearTimeout(t);
  }, [selectedChoice, current.kanji, autoFlip, autoFlipDelay]);

  // Swipe horizontal = balik kartu (HANYA setelah menjawab) — sejak t79
  // satu-satunya jalur manual (tombol Flip dihapus; pointer events
  // menangkap sentuhan maupun drag mouse di desktop). (t80) ARAH swipe
  // menentukan ARAH putaran: geser ke kanan = wajah menyapu ke kanan
  // (+180), ke kiri = −180 — kartu mengikuti tangan, bukan mengulang
  // animasi yang sama dua kali. Threshold dx + dominasi horizontal
  // memisahkan swipe dari tap dan dari scroll vertikal (touch-action:
  // pan-y di CSS menjaga scroll halaman tetap hidup). Swipe juga
  // MEMBATALKAN timer auto-flip yang belum jalan.
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
      setRot((r) => r + (dx > 0 ? 180 : -180));
      clearTimeout(autoFlipTimer.current);
      // Swipe pertama yang TERDAFTAR = user sudah mengenal gerakannya.
      markSwipeLearned();
    }
  }
  function clearSwipe() {
    swipeStartRef.current = null;
  }

  // (t83) Keluar sesi (tombol ✕ topbar, dialog konfirmasi, guard Back
  // browser, shortcut q) kini sepenuhnya dikelola App.jsx — Quiz murni
  // isi sesi. Shortcut keyboard dialog (Enter/Esc) juga sudah di App.

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
    // Panaskan dua chunk sekaligus (keduanya di-cache — pemanggilan
    // ganda tetap satu unduhan): komponen untuk baris "Components",
    // goresan KanjiVG untuk glyph kecil di KEPALA punggung kartu
    // (RevealGlyph) — memuat sejak soal muncul membuat punggung
    // langsung memunculkan SVG selesai begitu kartu terbalik, tanpa kedip
    // placeholder font. (t96) loadStrokePaths per-kanji: N1 terpecah,
    // prefetch hanya satu sub-chunk ~300 kB.
    loadStrokePaths(current.level, current.kanji);
    loadComponents(current.level).then((map) => {
      if (!cancelled) setCompEntry(map[current.kanji] || null);
    });
    return () => {
      cancelled = true;
    };
  }, [current.kanji, current.level]);

  // Shortcut keyboard: w/e/s/d pilih jawaban (mirror grid 2×2), f =
  // "Don't know", r = toggle kana/romaji (kini toggle global di topbar,
  // state yang sama — r tetap hanya hidup di layar kuis), Enter/Space =
  // lanjut. (q = tombol ✕ topbar ditangani global di App.jsx — dia
  // meng-KLIK tombol itu, jadi ikut alur konfirmasi yang sama dengan
  // klik mouse.) Listener di window supaya jalan tanpa fokus ke elemen
  // tertentu.
  useEffect(() => {
    function handleKeyDown(e) {
      // Modifier + huruf = shortcut browser/OS (Ctrl+S, Cmd+R) — jangan
      // sampai ikut menjawab/toggle.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // Modal terbuka (help overlay / dialog konfirmasi keluar milik App)
      // — shortcut tidak boleh menembus modal.
      if (document.querySelector(".kd-modal-overlay")) return;
      // (t82) Tur onboarding aktif — shortcut kuis (w/e/s/d/f/r/Enter)
      // menunggu tur selesai: kartu & pilihan sedang diredupkan oleh
      // shade-nya; menjawab lewat keyboard di balik overlay akan mendesink
      // alur tur (tooltip hanya menunggu klik nyata pada UI).
      if (document.querySelector(".kd-tut-shades")) return;
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
        if (idx < current.choices.length) {
          // (t89) Blur aktif = tekanan PERTAMA membuka blur (konsisten dengan
          // ketukan mouse — dua langkah: ingat dulu, baru jawab); tekanan
          // KEDUA menjawab. blurActive HARUS masuk deps efek ini (anti
          // stale closure: efek lama masih memegang blurActive basi).
          if (blurActive) {
            setChoicesRevealed(true);
            return;
          }
          onSubmitAnswer(idx);
        }
      } else if (key === DONT_KNOW_KEY) {
        // "Don't know" lolos tanpa membuka blur (lihat catatan desain di
        // atas): jawaban jujur tetap satu ketukan.
        onSubmitAnswer(DONT_KNOW);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedChoice, current, onSubmitAnswer, onContinue, onToggleScript, blurActive]);

  return (
    <>
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
          soal + pilihan, tata letak VERTIKAL (genkō di atas, pilihan di
          bawahnya) di SEMUA ukuran layar (t83 — dulu desktop ≥900px memakai
          2 kolom genkō-kiri/pilihan-kanan; kartu 780px landscape terlalu
          besar & canggung saat diflip, pilihan kini selalu di bawah kanji).
          BELAKANG: reading sheet. Rotasi di sumbu Y (perspektif di
          .kd-card-scene); (t80) transform di-set INLINE dari state kumulatif `rot` supaya
          ARAH transisi mengikuti arah swipe — bukan kelas statis .flipped.
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
        <div
          key={qIndex}
          className="kd-card-inner"
          style={{ transform: `rotateY(${answered ? rot : 0}deg)` }}
        >
          {/* ============ DEPAN: soal + pilihan ============ */}
          <div className="kd-card-face front" inert={showBack ? "true" : undefined}>
            {/* Kartu portrait: kanji genkō di ATAS (terpusat), soal dan
                pilihan di BAWAHnya — konsisten di mobile dan desktop
                (t83). */}
            <div className="kd-quiz-layout">
              {/* Kotak genkō — elemen pertama tumpukan vertikal (terpusat).
                  Persamaan komponen dirender sebagai
                  baris "Components" DI SISI BELAKANG KARTU setelah
                  dijawab (bukan blok terpisah di sini). */}
              <div className="kd-quiz-left">
                {/* (t87, dari t86) Kotak genkō kini menampilkan KANJI FONT
                    Shippori Mincho biasa — animasi urutan goresan KanjiVG
                    PINDAH ke glyph kecil di KEPALA reading sheet sisi
                    BELAKANG kartu (RevealGlyph): bentuk yang sedang
                    dipelajari baru layak dilihat SETELAH menjawab, bersama
                    bacaannya, dan animasi tidak pernah membocorkan bentuk
                    "sedang digambar" sebelum user berkomitmen pada jawaban.
                    Tidak ada interaksi di kotak ini — diam menempel di atas
                    tumpukan. Sheet detail (bacaan, arti, contoh kata) tetap
                    di sisi belakang SETELAH dijawab. */}
                <div className="kd-genkou">
                  <div className="kd-genkou-glyph">{current.kanji}</div>
                </div>
              </div>

              <div className="kd-quiz-right">
                {/* Badge hanya untuk sesi missed-kanji review — jelas beda
                    dari kuis unit. Latihan bebas dari unit dim TIDAK
                    diberi badge. */}
                {mode === "weak" && (
                  <div className="kd-mode-badge weak">
                    <CircleX size={13} strokeWidth={2.25} /> {t("quiz.modeBadge.weak")}
                  </div>
                )}

                <div className="kd-question-row">
                  <div className="kd-question-label">
                    {t("quiz.question", { n: qIndex + 1, m: quiz.length })}
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
                    // (t89) Blur pilihan aktif → kelas .blurred (CSS:
                    // filter blur + user-select none); ketukan pertama
                    // membuka semua (handleChoiceClick).
                    if (blurActive) cls += " blurred";
                    return (
                      <button
                        key={idx}
                        className={cls}
                        disabled={answered}
                        onClick={() => handleChoiceClick(idx)}
                      >
                        {choiceLabel(choice, current.questionType, answerScript)}
                      </button>
                    );
                  })}
                </div>

                {!answered && (
                  <button className="kd-dontknow" onClick={() => onSubmitAnswer(DONT_KNOW)}>
                    <HelpCircle size={15} /> {t("quiz.dontKnow")}
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
              panel dulu — CSS-nya dipakai bersama modal Browse.
              (t87, dari t86) Kepala sheet: kanji kini GLYPH KanjiVG KECIL
              (RevealGlyph, pojok kiri-atas) — KLIK = putar animasi urutan
              goresan, klik kanan = selesaikan seketika; arti mengalir DI
              SAMPINGNYA, bukan didorong ke tepi kanan lembar. */}
          {answered && (
            <div className="kd-card-face back" inert={showBack ? undefined : "true"}>
              <div className="kd-card-back-body">
                <div className="kd-reveal-head">
                  <RevealGlyph kanji={current.kanji} level={current.level} />
                  {/* (t96) Arti punggung kartu mengikuti bahasa UI. */}
                  <span className="kd-meaning-text">{localizedMeanings(current, idData).join(", ")}</span>
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
                    lib/kana.js). (t107) Render lewat ExampleList — kini
                    juga membawa kalimat contoh Tatoeba (highlight kata
                    target) di bawah tiap kata. */}
                <ExampleList examples={current.examples} script={answerScript} furigana={furigana} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* (t78) Petunjuk swipe — baris kecil di antara kartu dan bar aksi.
          Tampil hanya setelah menjawab (sebelum itu swipe memang belum
          berfungsi — kartu terkunci) dan hanya sampai swipe PERTAMA
          user terdaftar (flag localStorage, lihat SWIPE_LEARNED_KEY).
          (t80) auto-flip default ON memperlihatkan sisi belakang dengan
          sendirinya — petunjuk ini mengajarkan KONTROL manual (bolak-balik kapan pun), teksnya netral terhadap mode.
          Dekoratif (aria-hidden): makna gerakannya dijelaskan teksnya
          sendiri; layar tetap bersih setelah gerakan dikenal. */}
      {answered && !swipeLearned && (
        <div className="kd-swipe-hint" aria-hidden="true">
          <MoveHorizontal size={14} />
          <span>{t("quiz.swipeHint")}</span>
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
            {qIndex + 1 < quiz.length ? t("quiz.continue") : t("quiz.seeResults")}
          </button>
        </div>
      )}
    </>
  );
}
