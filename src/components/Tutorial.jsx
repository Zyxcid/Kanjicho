import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

/**
 * Tutorial (t82) — tur onboarding "hint overlay" untuk user baru.
 *
 * SELURUH UI diredupkan oleh EMPAT bidang shade (atas/bawah/kiri/kanan)
 * yang mengitari "lubang" persis di persegi target langkah — hanya area
 * yang sedang dibahas yang tetap terang DAN tetap bisa diklik (klik
 * "menembus" lubang ke elemen asli, jadi aplikasi bereaksi normal dan
 * tur ikut maju). Ini dipilih daripada menaikkan z-index elemen target
 * (z-index surgery): tidak ada styling user yang disentuh sama sekali.
 *
 * Z-INDEX: shade 55 & ring 56 SENGAJA DI BAWAH modal (60) — modal yang
 * kebetulan terbuka saat tour (mis. dialog practice saat replay oleh
 * user lama) tetap bisa diklik sehingga tour tidak pernah mengunci
 * user di dead-end. Tooltip 72 DI ATAS modal supaya Skip/Got it selalu
 * terjangkau.
 *
 * TIAP LANGKAH maju lewat SALAH SATU:
 *   - waitClick : klik pada selector (listener capture di document —
 *                 handler asli app tetap ikut jalan, tur hanya "menumpang";
 *                 selector boleh berupa daftar koma — mis. pilihan kuis
 *                 ATAU tombol Don't know, mana pun yang diklik user)
 *   - waitAppear: elemen muncul di DOM (poll 120 ms — menutup jalur
 *                 navigasi alternatif, mis. dialog practice → kuis; juga
 *                 daftar koma untuk "unit list ATAU home")
 *   - cta       : tombol "Got it" di tooltip (langkah informasi murni)
 * Semua langkah SELALU punya "Skip tutorial" (kabur total) dan
 * Escape. Double-advance dalam satu langkah dicegah stepRef.
 *
 * (t83) Urutan langkah di KUIS: tur MENJAWAB satu soal sungguhan
 * (langkah "answer") supaya punggung kartu terbuka — animasi goresan
 * KanjiVG kini hidup di sana (RevealGlyph), dan penjelasan "bacaan
 * bold = asal pilihan" diberikan PERSIS di sisi yang menampilkannya.
 *
 * (t84) Tiga langkah penutup di beranda: kartu Due (kalender jadwal),
 * Browse all kanji, lalu penutup terpusat. Esc saat modal terbuka
 * TIDAK lagi mematikan tur (modal yang bersangkutan mengonsumsinya).
 *
 * (t85) Langkah SRS kini membawa user ke beranda lewat TOMBOL HOME DI
 * TOOLTIP itu sendiri (onGoHome dari App: navigate reset) — kalimat
 * panjang "tap Cancel and confirm Leave, then Home..." tidak perlu
 * lagi; seluruh layar diredupkan penuh (target null) sehingga tombol
 * tersebut adalah SATU-SATUNYA jalan pulang. Langkah ber-flag `block`
 * (kalender due & Browse) menutup lubangnya dengan penutup transparan
 * (.kd-tut-cover, + guard Enter/Space): spotlight cukup DILIHAT, klik
 * pada target dicegah — maju hanya lewat tombol Got it.
 *
 * Persistensi di App (localStorage TUTORIAL_KEY = "kanjicho-tutorial"):
 * "done" / "skipped" — tur hanya menyala OTOMATIS untuk user baru
 * (belum ada riwayat/progress); replay dari Help kapan pun.
 */

// Nilai localStorage: "done" | "skipped". Diekspor supaya App (pemilik
// keputusan auto-start/replay/finish) tidak hard-code string di dua file.
export const TUTORIAL_KEY = "kanjicho-tutorial";

// Padding lubang di sekeliling target (px) — cincin spotlight sedikit
// longgar supaya elemen tidak menempel garis.
const HOLE_PAD = 6;
// Interval ukur ulang target (ms): menangkap elemen yang baru ter-mount,
// pergantian soal kuis, resize, dan scroll — murah (satu getBoundingClientRect).
const POLL_MS = 400;

/**
 * Urutan langkah. `target` = selector yang di-spotlight (null = tooltip
 * terpusat, seluruh layar diredupkan). `cta`:
 *   "start"   → tombol "Start tour" (sambutan)
 *   "got-it"  → tombol "Got it" (langkah informasi; boleh juga maju lewat
 *               waitClick bila ada — mis. toggle skrip)
 *   "home"    → (t85) tombol "Home" di tooltip: memanggil onGoHome()
 *               (navigasi SUNGGUHAN ke beranda oleh App) lalu maju —
 *               dipakai langkah SRS untuk menggantikan penjelasan
 *               panjang jalur pulang (Cancel → Leave → Home).
 *   undefined → langkah praktik murni: hanya aksi nyata yang memajukan
 *               (tidak ada tombol maju — arah sudah ditulis di body).
 * `block` = true → (t85) target di-spotlight tapi DIKUNCI: penutup
 *   transparan + guard keyboard menelan klik/touch/Enter/Space pada
 *   area lubang; satu-satunya jalan maju tombol Got it (langkah
 *   "cukup dilihat": kartu Due, entry Browse).
 */
// (t84) Teks langkah sengaja TANPA em-dash dan dirangkai mengalir
// (permintaan user: tanda baca "—" dikurangi, kalimat lebih luwes).
const STEPS = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Kanjichō",
    body:
      "Learn the JLPT kanji with short quizzes, and let the app bring each one back for review right before you'd forget it. This quick tour takes about half a minute.",
    cta: "start",
  },
  {
    id: "level",
    target: ".kd-level-grid",
    waitClick: ".kd-level-card",
    waitAppear: ".kd-unit-grid",
    title: "Choose a JLPT level",
    body:
      "Each level keeps its own kanji and units, so start with the one you're aiming for. Your progress will show on these cards as you study. Tap any level to continue.",
  },
  {
    // (t84) "Finishing it unlocks the next unit" TIDAK BENAR: semua unit
    // terbuka sejak awal. Yang benar: kuis yang diselesaikan meletakkan
    // kanjinya di jadwal review (SRS).
    id: "unit",
    target: ".kd-unit-grid",
    waitClick: ".kd-unit-main",
    waitAppear: ".kd-card-scene",
    title: "Pick a unit",
    body:
      "A unit is a small set of kanji with one quiz. They're all open from the start, so you can begin wherever you like. Every quiz you finish puts its kanji on your review schedule. Tap one to step inside.",
  },
  {
    id: "script",
    target: ".kd-script-toggle",
    waitClick: ".kd-script-toggle",
    title: "Kana or romaji",
    body:
      "This switch works everywhere. Readings in quizzes and in the kanji library flip between kana and romaji the moment you tap it.",
    cta: "got-it",
  },
  {
    // (t83) Tur kini BENAR-BENAR MENJAWAB satu soal — diperlukan karena
    // animasi goresan KanjiVG pindah ke PUNGGUNG kartu (RevealGlyph):
    // langkah "stroke" lama menunjuk kotak genkō depan yang kini diam
    // (glyph font biasa). Lubang mencakup seluruh kolom kanan supaya
    // tombol Don't know (di bawah grid) tetap bisa diklik.
    id: "answer",
    target: ".kd-quiz-right",
    waitClick: ".kd-choice-btn, .kd-dontknow",
    waitAppear: ".kd-card-face.back",
    title: "How a question works",
    body:
      "Pick the choice that matches the kanji. Tapping Don't know works too, and it's fine to be wrong since you're just touring. The card turns over on its own once you answer, or with a sideways swipe.",
  },
  {
    // Punggung kartu = reading sheet. Lubang sengaja SELURUH badan
    // punggung (bukan cuma glyph) supaya user bisa MEMBACA lembar
    // (bacaan bold yang dijelaskan) di balik tooltip — glyph kecilnya
    // tetap bisa diklik untuk memutar animasi urutan goresan (t83).
    id: "stroke",
    target: ".kd-card-back-body",
    waitClick: ".kd-reveal-glyph",
    title: "The card's back",
    body:
      "This is the reading sheet. The readings in bold are the ones the choices come from. Tap the kanji at the top-left corner to watch its stroke order.",
    cta: "got-it",
  },
  {
    // (t85) Tombol Home kini HIDUP DI TOOLTIP langkah ini (cta "home"):
    // klik = navigasi SUNGGUHAN ke beranda lewat onGoHome dari App
    // (navigate home + reset history, persis tombol Home layar hasil)
    // — kuis tur ditinggalkan tanpa dialog Leave, lalu sisa tur menunggu
    // di beranda. Kalimat panjang "tap Cancel and confirm Leave, then
    // Home on the unit list..." dihapus: tombolnya menggantikan kalimat.
    // target sengaja null → seluruh layar diredupkan PENUH: Cancel kuis
    // tidak bisa diklik (tidak ada lagi dua jalur yang bersaing), dan
    // tombol Home di tooltip menjadi satu-satunya cara maju. waitAppear
    // tetap sebagai katup aman: back gesture/mobile & browser-back yang
    // lolos guard → Leave → mendarat di beranda → langkah maju sendiri.
    id: "srs",
    target: null,
    waitAppear: ".kd-browse-entry",
    title: "The schedule takes care of itself",
    body:
      "After you answer all the questions in a quiz, the app arranges your review schedule with SRS (spaced repetition). That's the whole learning loop. Tap Home to head back and see what it set up for you.",
    cta: "home",
  },
  {
    // (t84) Langkah BARU, informasi murni: kartu "Due now" di beranda
    // adalah pintu kalender jadwal. Cukup disebut, user TIDAK perlu
    // mengkliknya (tombol Got it memajukan).
    // (t85) block: klik pada kartu kini DICEGAL — penutup transparan
    // (.kd-tut-cover) menelan klik/touch di lubang, guard keydown menelan
    // Enter/Space bila user Tab ke kartunya. Spotlight cukup DILIHAT;
    // maju hanya lewat Got it (permintaan user).
    id: "calendar",
    target: ".kd-stat.due",
    block: true,
    title: "Your due calendar",
    body:
      "That schedule lives here. The card counts the units waiting for review, and tapping it opens a calendar of everything that's coming. You never have to manage any of it by hand.",
    cta: "got-it",
  },
  {
    // (t84) Dulu langkah TERAKHIR yang mengharuskan KLIK entry Browse;
    // kini informasi murni (Got it, tanpa klik) — tur ditutup di
    // beranda, bukan di dalam layar Browse.
    // (t85) block: entry Browse juga DIKUNCI selama spotlight (klik/
    // touch/Enter ditelan) — jalur tunggal Got it, senada kartu Due.
    id: "browse",
    target: ".kd-browse-entry",
    block: true,
    title: "Browse all kanji",
    body:
      "The whole library lives here, from N5 to N1. Open it whenever you want to look up a kanji's strokes, readings, components or example words.",
    cta: "got-it",
  },
  {
    // (t84) Penutup baru: terpusat, tanpa target — kalimat "explore all
    // kanji" lama sudah diambil alih langkah browse di atasnya.
    id: "end",
    target: null,
    title: "That's the tour!",
    body:
      "Short quizzes, a schedule that takes care of itself, and a whole library to explore. The rest you'll pick up along the way. がんばろう!",
    cta: "got-it",
  },
];

export default function Tutorial({ onFinish, onGoHome }) {
  const [step, setStep] = useState(0);
  // Persegi lubang (viewport coords) — null = mode terpusat (tanpa target,
  // seluruh layar diredupkan; dipakai sambutan & langkah menunggu target).
  const [rect, setRect] = useState(null);
  // (t82-fix) Target terukur ABSEN (tidak ada di DOM / display:none, mis.
  // tombol Cancel di layar <900px) — berbeda dari "belum selesai mengukur":
  // absent=true memasang tooltip TERPUSAT supaya langkah tetap terbaca,
  // bukan layar gelap tanpa teks. Tanpa ini, langkah tanpa target/tersembunyi
  // tidak pernah menampilkan tooltip-nya (efek pasif yang mereset posisi
  // menimpa efek layout di mount, dan rect yang tak pernah berubah tidak
  // pernah memicu penempatan ulang).
  const [absent, setAbsent] = useState(false);
  // Ukuran viewport — ikut dide-trace supaya shade/lubang mengikuti resize.
  const [vp, setVp] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  // Posisi tooltip (dihitung useLayoutEffect SETELAH render — butuh
  // offsetWidth/Height nyata). null = belum dihitung → tooltip disembunyikan
  // satu frame supaya tidak berkedip di pojok (0,0).
  const [pop, setPop] = useState(null);
  const popRef = useRef(null);
  // Cermin `step` untuk guard double-advance: dua pemicu (klik + muncul)
  // boleh kebakaran beruntun dalam satu langkah, tapi hanya boleh maju SEKALI.
  const stepRef = useRef(0);
  stepRef.current = step;

  const current = STEPS[step];

  function advance(from) {
    if (stepRef.current !== from) return;
    if (from + 1 >= STEPS.length) {
      onFinish("done");
      return;
    }
    // Reset perseki & posisi SEBELUM naik langkah (satu batch render): tanpa
    // ini ada satu render dengan rect LAMA + langkah BARU — tooltip berkedip
    // di posisi langkah sebelumnya sebelum target baru terukur.
    setRect(null);
    setPop(null);
    setStep(from + 1);
  }

  // ---- (a) Temukan & ukur target, lalu IKUTI (mount/scroll/resize) ----
  useEffect(() => {
    let cancelled = false;
    setRect(null);
    setPop(null);
    setAbsent(false);
    const sel = STEPS[step].target;

    function measure() {
      if (cancelled) return;
      setVp((prev) =>
        prev.w === window.innerWidth && prev.h === window.innerHeight
          ? prev
          : { w: window.innerWidth, h: window.innerHeight }
      );
      const el = sel ? document.querySelector(sel) : null;
      // Elemen display:none (mis. .kd-back di layar <900px) melaporkan
      // perseki 0×0 — perlakukan sama seperti absen (tooltip terpusat,
      // seluruh layar diredupkan), bukan ring ciut di pojok (0,0).
      if (!el) {
        setAbsent(true);
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        setAbsent(true);
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      setAbsent(false);
      setRect((prev) =>
        prev &&
        prev.x === r.left &&
        prev.y === r.top &&
        prev.w === r.width &&
        prev.h === r.height
          ? prev
          : { x: r.left, y: r.top, w: r.width, h: r.height }
      );
    }

    // Gulir target ke viewport SEKALI per langkah — hanya bila memang di
    // luar layar (topbar yang sudah terlihat tidak boleh "melompat" ke
    // tengah; block:'center' dipakai karena sebagian besar target memang
    // di bawah lipatan: grid level, grid unit, tombol Browse).
    if (sel) {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const el = document.querySelector(sel);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ block: "center", behavior: "auto" });
        }
      });
    }

    measure();
    const poll = setInterval(measure, POLL_MS);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // ---- (b) Tunggu KLIK target (fase capture — handler asli tetap jalan) ----
  useEffect(() => {
    const sel = STEPS[step].waitClick;
    if (!sel) return;
    function onClick(e) {
      // Klik tombol tooltip sendiri bukan aksi target ( tombol punya
      // onClick-nya sendiri; tanpa guard ini klik CTA pada langkah yang
      // juga waitClick bisa terhitung dua jalur ).
      if (popRef.current && popRef.current.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest(sel)) {
        advance(step);
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step]);

  // ---- (c) Tunggu elemen MUNCUL (jalur navigasi alternatif) ----
  useEffect(() => {
    const sel = STEPS[step].waitAppear;
    if (!sel) return;
    const t = setInterval(() => {
      if (document.querySelector(sel)) advance(step);
    }, 120);
    return () => clearInterval(t);
  }, [step]);

  // ---- (d) Escape = menyerah pada tur (sama seperti tombol Skip) ----
  // (t84) GUARD: bila ada modal yang terbuka (dialog Leave, kalender,
  // help), Esc MILIK modal itu — biarkan modal mengonsumsinya. Tanpa
  // guard ini, Esc yang user maksudkan untuk menutup dialog Leave
  // ("Keep studying") atau kalender juga MEMATIKAN tur begitu saja.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".kd-modal-overlay")) return;
      onFinish("skipped");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  // ---- (f) (t85) Langkah ber-block: keyboard juga DIKUNCI ----
  // Penutup transparan (.kd-tut-cover) sudah menelan klik/touch pada
  // lubang; jalur yang tersisa untuk mengaktifkan tombol yang di-
  // spotlight adalah keyboard (Tab lalu Enter/Space). Listener CAPTURE di
  // window menelan aktivasi itu SEBELUM handler React-nya — tooltip
  // tetap memegang fokus (CTA-nya di-fokus otomatis), jadi guard ini
  // hanya menyempurnakan celah Tab, bukan jalur utama.
  useEffect(() => {
    const sel = STEPS[step].target;
    if (!STEPS[step].block || !sel) return;
    function onKey(e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = document.activeElement;
      if (el && el.closest && el.closest(sel)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step]);

  // ---- (e) Letakkan tooltip di dekat lubang (ukur nyata post-render) ----
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    // Masih mengukur (rect belum ada, target belum dipastikan absen) →
    // tooltip tetap disembunyikan dulu — mencegah kedip "muncul di tengah
    // lalu melompat" pada langkah ber-target (dan menahan penempatan
    // SEBELUM reset efek (a) berjalan — urutan layout-efek vs pasif-efek
    // di mount dulunya saling menimpa).
    if (!rect && !absent) return;
    const { w: vw, h: vh } = vp;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let x;
    let y;
    if (!rect) {
      // Target absen / langkah tanpa target → TERPUSAT.
      x = (vw - tw) / 2;
      y = (vh - th) / 2;
    } else {
      // Utamakan DI BAWAH target; naik ke atas bila tidak muat.
      y = rect.y + rect.h + HOLE_PAD + 8;
      if (y + th > vh - 12) y = Math.max(12, rect.y - th - HOLE_PAD - 8);
      x = rect.x + rect.w / 2 - tw / 2;
      x = Math.max(12, Math.min(x, vw - tw - 12));
    }
    const next = { x: Math.round(x), y: Math.round(y) };
    setPop((prev) => (prev && prev.x === next.x && prev.y === next.y ? prev : next));
    // Fokus tombol utama untuk pengguna keyboard — TANPA menggulir. Langkah
    // praktik (tanpa CTA) sengaja tidak memfokuskan apa pun: Enter pada
    // "Skip tutorial" akan mengakhiri tur tanpa sengaja.
    el.querySelector(".kd-tut-cta")?.focus({ preventScroll: true });
  }, [rect, step, vp, absent]);

  // ---- Render: 4 shade + cincin + tooltip ----
  // Lubang = persegi target dipadatkan HOLE_PAD; mode terpusat = lubang
  // 0×0 di tengah (shade atas+bawah menutup seluruh layar).
  const hole = rect
    ? {
        x: rect.x - HOLE_PAD,
        y: rect.y - HOLE_PAD,
        w: rect.w + HOLE_PAD * 2,
        h: rect.h + HOLE_PAD * 2,
      }
    : { x: vp.w / 2, y: vp.h / 2, w: 0, h: 0 };

  return (
    <>
      {/* pointer-events:none di wadah + auto di tiap shade: shade memblokir
          interaksi UI yang diredupkan, sementara area lubang bebas (tidak
          tertutup elemen mana pun → klik jatuh ke target asli). */}
      <div className="kd-tut-shades" aria-hidden="true">
        <div
          className="kd-tut-shade"
          style={{ top: 0, left: 0, width: vp.w, height: Math.max(0, hole.y) }}
        />
        <div
          className="kd-tut-shade"
          style={{
            top: hole.y + hole.h,
            left: 0,
            width: vp.w,
            height: Math.max(0, vp.h - hole.y - hole.h),
          }}
        />
        <div
          className="kd-tut-shade"
          style={{ top: hole.y, left: 0, width: Math.max(0, hole.x), height: hole.h }}
        />
        <div
          className="kd-tut-shade"
          style={{
            top: hole.y,
            left: hole.x + hole.w,
            width: Math.max(0, vp.w - hole.x - hole.w),
            height: hole.h,
          }}
        />
      </div>

      {rect && (
        <div
          className="kd-tut-ring"
          aria-hidden="true"
          style={{ top: hole.y, left: hole.x, width: hole.w, height: hole.h }}
        />
      )}

      {/* (t85) Langkah ber-block: penutup transparan PERSIS di lubang —
          target tetap terang & bercincin (cukup DILIHAT), tapi klik/touch
          jatuh ke penutup ini, bukan ke elemen asli. Satu-satunya jalan
          maju tombol "Got it" di tooltip. z 57: di atas cincin (56),
          tetap di bawah modal (60) & tooltip (72). */}
      {rect && current.block && (
        <div
          className="kd-tut-cover"
          aria-hidden="true"
          style={{ top: hole.y, left: hole.x, width: hole.w, height: hole.h }}
        />
      )}

      <div
        ref={popRef}
        className="kd-tut-pop"
        role="dialog"
        aria-modal="false"
        aria-label={`Tutorial: ${current.title}`}
        style={pop ? { left: pop.x, top: pop.y } : { visibility: "hidden" }}
      >
        <div className="kd-tut-title">{current.title}</div>
        <p className="kd-tut-body">{current.body}</p>
        {current.cta && (
          <button
            className={`kd-btn primary kd-tut-cta${current.cta === "home" ? " kd-tut-cta-home" : ""}`}
            onClick={() => {
              // (t85) cta "home" (langkah SRS): tombol ini MEMBAWA user
              // pulang lewat navigasi SUNGGUHAN (onGoHome dari App —
              // navigate home + reset history, kuis tur ditinggalkan
              // tanpa dialog Leave) SEBELUM langkah maju; sisa tur
              // (kalender, Browse, penutup) menunggu di beranda.
              if (current.cta === "home" && onGoHome) onGoHome();
              advance(step);
            }}
          >
            {current.cta === "start" ? (
              "Start tour"
            ) : current.cta === "home" ? (
              <>
                <ChevronLeft size={16} aria-hidden="true" />
                Home
              </>
            ) : (
              "Got it"
            )}
          </button>
        )}
        <div className="kd-tut-foot">
          <button className="kd-tut-skip" onClick={() => onFinish("skipped")}>
            Skip tutorial
          </button>
          <span className="kd-tut-count" aria-hidden="true">
            {step + 1} / {STEPS.length}
          </span>
        </div>
      </div>
    </>
  );
}
