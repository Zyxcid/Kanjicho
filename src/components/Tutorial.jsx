import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { t, getLang, LANGS } from "../lib/i18n.js";

/**
 * Tutorial (t82, direvisi t83) — tur onboarding "hint overlay" untuk
 * user baru.
 *
 * SELURUH UI diredupkan oleh EMPAT bidang shade (atas/bawah/kiri/kanan)
 * yang mengitari "lubang" persis di persegi target langkah — hanya area
 * yang sedang dibahas yang tetap terang DAN tetap bisa diklik (klik
 * "menembus" lubang ke elemen asli, jadi aplikasi bereaksi normal dan
 * tur ikut maju). Ini dipilih daripada menaikkan z-index elemen target
 * (z-index surgery): tidak ada styling user yang disentuh sama sekali.
 *
 * (t83) LANGKAH "lock": langkah yang hanya MENYEBUT target (kalender
 * review, Browse) tanpa meminta klik — .kd-tut-blocker (z 57, transparan)
 * menutup seluruh viewport termasuk lubang, jadi target TIDAK bisa
 * diinteraksi; satu-satunya jalan maju adalah tombol "Got it".
 *
 * Z-INDEX: shade 55 & ring 56 SENGAJA DI BAWAH modal (60) — modal yang
 * kebetulan terbuka saat tour (mis. dialog practice saat replay oleh
 * user lama) tetap bisa diklik sehingga tour tidak pernah mengunci
 * user di dead-end. Blocker 57 juga di bawah modal. Tooltip 72 DI ATAS
 * modal supaya Skip/Got it selalu terjangkau.
 *
 * TIAP LANGKAH maju lewat SALAH SATU:
 *   - waitClick : klik pada selector (listener capture di document —
 *                 handler asli app tetap ikut jalan, tur hanya "menumpang")
 *   - waitAppear: elemen muncul di DOM (poll 120 ms — menutup jalur
 *                 navigasi alternatif, mis. dialog practice → kuis)
 *   - cta       : tombol "Got it" di tooltip (langkah informasi murni;
 *                 WAJIB untuk langkah lock)
 * Semua langkah SELALU punya "Skip tutorial" (kabur total) dan
 * Escape. Double-advance dalam satu langkah dicegah stepRef.
 *
 * (t83) Navigasi tur kini memakai TOMBOL NYATA app: keluar kuis lewat ✕
 * di kiri brand sesi topbar, pulang dari daftar unit lewat panah back
 * — bukan lagi instruksi teks tentang tombol Cancel/Home (keduanya
 * sudah dihapus dari layar).
 *
 * (t87) Animasi urutan goresan pindah ke PUNGGUNG kartu (RevealGlyph)
 * → alur tengah kuis dirombak: user kini MENJAWAB SATU SOAL NYATA di
 * langkah choices, kartu terbalik sendiri, lalu langkah back menjelaskan
 * punggung kartu (bacaan bold + glyph goresan di pojok).
 *
 * (t88) Keluar kuis saat tur kini SATU KETUKAN (✕ lolos gerbang dialog
 * selama tur aktif), pulang dari daftar unit lewat tombol "< Home"
 * yang dikembalikan di topbar.
 *
 * (t89) Langkah srs: CTA "< Home" DI DALAM TOOLTIP menggantikan instruksi
 * teks "Tap the ✕ next to the quiz title to head back" (permintaan user —
 * tombol pulang yang SUNGUGU, desain sama dengan tombol back topbar app:
 * chevron + label). Seluruh layar diredupkan (target null), tombol itu
 * satu-satunya jalan; klik = keluar kuis demo + navigate home + reset
 * history (prop onGoHome dari App) — tanpa dialog Leave. Langkah "home"
 * (spotlight tombol "< Home" daftar unit) ikut pensiun: tur kini terbang
 * LURUS dari kuis ke beranda, dan tombol berlabel di topbar tidak lagi
 * perlu diajarkan. Langkah tour kini ber-KEY i18n (t89): title/body berupa
 * kunci kamus, diselesaikan saat RENDER (kamus bisa berganti bahasa
 * kapan pun lewat help overlay).
 *
 * (t88) BUG FIX "layar redup tanpa overlay": efek (a) dulu memanggil
 * setRect(null)+setPop(null) saat TIAP pergantian langkah — padahal
 * useLayoutEffect (e) sudah menghitung posisi tooltip SEBELUM efek
 * pasif itu jalan, sehingga reset di (a) SELALU menimpa (clobber)
 * hasilnya. Langkah BERTARGET pulih lewat poll measure() yang
 * memicu ulang (e) lewat perubahan rect — tapi langkah TANPA target
 * (welcome, finale) tidak pernah terpicu: tooltip menggantung
 * visibility:hidden selamanya, yang tersisa hanya layar redup.
 * (Harness t82–t87 lolos karena el.click() sintetis menembus elemen
 * visibility:hidden.) Perbaikan: reset state kini MILIK advance()
 * satu-satunya; efek (a) hanya mengukur, tidak mereset.
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
 *   undefined → langkah praktik murni: hanya aksi nyata yang memajukan
 *               (tidak ada tombol maju — arah sudah ditulis di body).
 * `lock: true` → (t83) target TIDAK interaktif: blocker menutup lubang,
 *               jalan maju HANYA tombol "Got it" (langkah menyebut,
 *               bukan meminta klik).
 */
const STEPS = [
  {
    // (t109) Pilih bahasa SEBELUM materi tur — judul & isi dwibahasa
    // (string sama di kedua kamus) supaya terbaca calon user apa pun
    // bahasa antarmuka sekarang; label tombol memakai nama asli tiap
    // bahasa (konvensi UI bahasa, LANGS di i18n.js). Memilih langsung
    // mengganti bahasa antarmuka (onSetLang dari App) — tooltip dan
    // langkah-langkah berikutnya langsung berganti bahasa.
    id: "language",
    target: null,
    title: "tour.language.title",
    body: "tour.language.body",
    cta: "lang",
  },
  {
    id: "welcome",
    target: null,
    title: "tour.welcome.title",
    body: "tour.welcome.body",
    cta: "start",
  },
  {
    id: "level",
    target: ".kd-level-grid",
    waitClick: ".kd-level-card",
    waitAppear: ".kd-unit-grid",
    title: "tour.level.title",
    body: "tour.level.body",
  },
  {
    id: "unit",
    target: ".kd-unit-grid",
    waitClick: ".kd-unit-main",
    waitAppear: ".kd-card-scene",
    title: "tour.unit.title",
    body: "tour.unit.body",
  },
  {
    id: "script",
    target: ".kd-script-toggle",
    waitClick: ".kd-script-toggle",
    title: "tour.script.title",
    body: "tour.script.body",
    cta: "got-it",
  },
  {
    // (t87) User kini MENJAWAB satu soal NYATA — diperlukan supaya
    // punggung kartu (langkah berikutnya) muncul: kartu terbalik sendiri
    // begitu dijawab. (t109) atas permintaan user, tombol Got-it DIHAPUS
    // dari langkah ini: satu-satunya jalan maju adalah MEMILIH JAWABAN
    // (kartu pun terbalik) — jawaban keliru sama-sama memajukan, tur
    // tidak menghakimi.
    // (t89) waitClick pada pilihan DIHAPUS: maju kini HANYA lewat munculnya
    // punggung kartu (waitAppear .kd-reveal-glyph = soal benar-benar
    // dijawab). Ketukan PERTAMA pada pilihan saat fitur "blur pilihan"
    // (t89, Quiz.jsx) aktif hanya membuka blur — tanpa guard ini tur akan
    // maju ke langkah punggung sebelum kartu terbalik (dead-end).
    id: "choices",
    target: ".kd-choice-grid",
    waitAppear: ".kd-reveal-glyph",
    title: "tour.choices.title",
    body: "tour.choices.body",
  },
  {
    // (t87) Punggung kartu: bacaan BOLD = sumber pilihan kuis; kanji
    // kecil di pojok kiri-atas = animasi urutan goresan (klik = putar,
    // klik kanan = selesaikan). (t88) Spotlight kini SELURUH lembar
    // bacaan (.kd-card-back-body — dulu hanya glyph pojok, bacaan bold
    // tertutup shade), waitClick tetap pada glyph — atau Got it.
    // (t88) Kalimat pengantar "This reading sheet is..." dipangkas.
    id: "back",
    target: ".kd-card-back-body",
    waitClick: ".kd-reveal-glyph",
    title: "tour.back.title",
    body: "tour.back.body",
    cta: "got-it",
  },
  {
    // (t89) CTA "< Home": keluar SATU KETUKAN dari tooltip — sesi kuis
    // tur memang demo sekali pakai (jawaban tur terbuang saat pergi —
    // tidak ada yang hilang), jadi tidak perlu dialog konfirmasi.
    // Target sengaja NULL (seluruh layar diredupkan): tombol ini
    // satu-satunya jalan maju — tidak ada elemen lain yang bisa diklik.
    // Kalimat "Tap the ✕ next to the quiz title to head back" pensiun.
    id: "srs",
    target: null,
    cta: "home",
    title: "tour.srs.title",
    body: "tour.srs.body",
  },
  {
    // (t83) Langkah LOCK: kartu "Due now" hanya DISEBUT (kalender review
    // dibuka-buka nanti sendiri); klik target diblokir, maju = Got it.
    id: "calendar",
    target: ".kd-stat.due",
    lock: true,
    title: "tour.calendar.title",
    body: "tour.calendar.body",
    cta: "got-it",
  },
  {
    // (t83) Langkah LOCK: perpustakaan hanya DISEBUT; klik diblokir.
    id: "browse",
    target: ".kd-browse-entry",
    lock: true,
    title: "tour.browse.title",
    body: "tour.browse.body",
    cta: "got-it",
  },
  {
    // (t89) Penutup diarahkan ulang atas permintaan user: pelajari
    // SEDIKIT DEMI SEDIKIT + jangan lupa me-review kanji yang dijawab
    // salah (mengganti "let the schedule do the remembering").
    id: "finale",
    target: null,
    title: "tour.finale.title",
    body: "tour.finale.body",
    cta: "got-it",
  },
];

export default function Tutorial({ onFinish, onGoHome, onSetLang }) {
  const [step, setStep] = useState(0);
  // Persegi lubang (viewport coords) — null = mode terpusat (tanpa target,
  // seluruh layar diredupkan; dipakai sambutan & langkah menunggu target).
  const [rect, setRect] = useState(null);
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
  // (t88) TANPA reset rect/pop di sini! Reset state kini milik advance()
  // (dan state awal memang null saat mount). Efek pasif ini jalan
  // SETELAH useLayoutEffect (e); reset di sini sebelumnya menimpa posisi
  // tooltip yang barusan dihitung (e) — langkah tanpa target (welcome,
  // finale) tidak pernah terpicu ulang → tooltip tersembunyi selamanya
  // → "layar redup tanpa overlay". Ketika target hilang di tengah
  // langkah (navigasi), measure() sudah mengembalikan rect ke null dan
  // (e) ikut menempatkan ulang tooltip ke mode terpusat.
  useEffect(() => {
    let cancelled = false;
    const sel = STEPS[step].target;

    function measure() {
      if (cancelled) return;
      setVp((prev) =>
        prev.w === window.innerWidth && prev.h === window.innerHeight
          ? prev
          : { w: window.innerWidth, h: window.innerHeight }
      );
      const el = sel ? document.querySelector(sel) : null;
      // Elemen display:none (mis. elemen yang disembunyikan media query)
      // melaporkan perseki 0×0 — perlakukan sama seperti absen (tooltip
      // terpusat, seluruh layar diredupkan), bukan ring ciut di pojok (0,0).
      if (!el) {
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
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
  // (t87) GUARD MODAL: saat ada modal terbuka (dialog konfirmasi Leave,
  // kalender, help), Escape milik modal itu dulu — tanpa guard ini satu
  // tekan Escape menutup modal DAN membunuh tur sekaligus.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".kd-modal-overlay")) return;
      onFinish("skipped");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  // ---- (d2) (t87) Langkah "lock": keyboard ikut diblokir ----
  // Blocker pointer-events sudah menelan klik/touch pada target, tapi
  // keyboard TIDAK tertutup pointer-events: Enter/Space pada tombol yang
  // sedang fokus (kartu Due, entry Browse) tetap bisa mengaktifkannya.
  // Listener capture di window menelan Enter/Space selama langkah lock
  // aktif; tombol Got it di tooltip tetap bisa diklik mouse, dan tombol
  // CTA maju lewat onClick (bukan keydown), jadi tidak terkena blok.
  useEffect(() => {
    if (!STEPS[step].lock) return;
    function onLockKey(e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      // Enter/Space di DALAM tooltip (tombol Got it sedang fokus otomatis)
      // tetap sah — hanya aktivasi keyboard ELEMEN DI LUAR tooltip yang
      // ditelan (termasuk target spotlight yang terkunci).
      if (popRef.current && popRef.current.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onLockKey, true);
    return () => window.removeEventListener("keydown", onLockKey, true);
  }, [step]);

  // ---- (e) Letakkan tooltip di dekat lubang (ukur nyata post-render) ----
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const { w: vw, h: vh } = vp;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let x;
    let y;
    if (!rect) {
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
  }, [rect, step, vp]);

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

      {/* (t83) Langkah "lock": transparan di atas lubang — target terlihat
          (cincin di bawahnya) tapi TIDAK bisa diklik; Got it satu-satunya
          jalan maju. */}
      {current.lock && <div className="kd-tut-blocker" aria-hidden="true" />}

      <div
        ref={popRef}
        className="kd-tut-pop"
        role="dialog"
        aria-modal="false"
        aria-label={t("tour.aria", { title: t(current.title) })}
        style={pop ? { left: pop.x, top: pop.y } : { visibility: "hidden" }}
      >
        <div className="kd-tut-title">{t(current.title)}</div>
        <p className="kd-tut-body">{t(current.body)}</p>
        {current.cta === "lang" ? (
          /* (t109) Dua tombol pilih bahasa — nama asli tiap bahasa
             (konvensi UI bahasa); bahasa yang sedang aktif diberi
             pewarnaan primer supaya terbaca sebagai posisi sekarang.
             Memilih = mengganti bahasa antarmuka LANGSUNG (seluruh tur
             berlanjut dalam bahasa itu) lalu maju. */
          <div className="kd-tut-lang">
            {LANGS.map((l) => (
              <button
                key={l.id}
                className={`kd-btn kd-tut-cta kd-tut-lang-btn ${
                  l.id === getLang() ? "primary" : "secondary"
                }`}
                onClick={() => {
                  if (onSetLang) onSetLang(l.id);
                  advance(step);
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        ) : current.cta === "home" ? (
          /* (t89) CTA "< Home" — tombol pulang SUNGGUH di dalam tooltip:
             desain chevron + label (bahasa ikon tombol back topbar app),
             pewarnaan tombol primer supaya terbaca sebagai satu-satunya
             jalan saat seluruh layar diredupkan. Klik = keluar kuis demo
             + pulang (onGoHome dari App: navigate home + reset history)
             DAN memajukan tur — langkah berikutnya (kalender beranda)
             mem-poll targetnya sampai render. */
          <button
            className="kd-btn primary kd-tut-cta kd-tut-cta-home"
            onClick={() => {
              if (onGoHome) onGoHome();
              advance(step);
            }}
          >
            <ChevronLeft size={15} strokeWidth={2.25} /> {t("common.home")}
          </button>
        ) : (
          current.cta && (
            <button className="kd-btn primary kd-tut-cta" onClick={() => advance(step)}>
              {current.cta === "start" ? t("tour.start") : t("tour.gotIt")}
            </button>
          )
        )}
        <div className="kd-tut-foot">
          <button className="kd-tut-skip" onClick={() => onFinish("skipped")}>
            {t("tour.skip")}
          </button>
          <span className="kd-tut-count" aria-hidden="true">
            {step + 1} / {STEPS.length}
          </span>
        </div>
      </div>
    </>
  );
}
