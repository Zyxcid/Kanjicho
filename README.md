# Kanjichō (漢字帳) — JLPT Kanji Practice PWA

A JLPT kanji practice app (N5–N1) with an FSRS-6 spaced
repetition scheduler, a reading quiz, a full kanji library, light & dark
themes, and proper browser back-button navigation. Works fully offline as an
installable PWA.

## Run the app

```bash
npm install
npm run dev       # dev server → http://localhost:5173
npm run build     # production build → dist/
npm run preview   # preview the production build locally
```

## Features

- **JLPT practice (N5–N1)** — multiple-choice reading quizzes, one unit at
  a time. The quiz is a **physical flip card** (t77): the front holds the
  question and choices (the genkō-yōshi kanji box, tappable for stroke
  order), the back is the reading sheet (readings, components, example
  words). The card never rotates on its own (t79: the old ~0.4 s
  auto-flip left no time to read the correct answer) — after answering it
  stays on the front, marking the choices, for as long as you like; a
  horizontal swipe turns it over and back, and it is the **only** flip
  trigger (the Flip button was removed, t79). Flipping is locked until
  you answer, since the back contains the answer. A one-time hint under
  the card teaches the swipe and disappears for good after the first
  real swipe (t78, localStorage flag; the swipe sentence was removed
  from the Help overlay). Both card faces sit 1 px apart on the Z axis
  (t78) so the face pointing at you always wins depth sorting —
  `backface-visibility` alone proved unreliable on some Android devices.
  Answered choices keep their size (the old shrink animation was
  removed, t78); only the neutral ones dim. The action row below the
  card (outside the rotation) holds just **Continue** (t79). The row of
  dots above the card is a **live scoreboard**
  (t76): correct answers collect at the far left in full indigo, wrong
  (or "don't know") answers dim, and the enlarged dark dot marks the
  running question — a dot's position encodes its status (correct /
  current / wrong / unanswered), not the question's original number.
- **Stroke-order animations (KanjiVG)** — the quiz kanji is **always
  rendered as the KanjiVG stroke SVG, fully drawn** (same shape before,
  during and after the animation — no font swap). **Left-click** (tap) the
  kanji in the quiz box and it **writes itself stroke by stroke right in
  the genkō-yōshi square** (default 1× speed, no controls — click again to
  replay; quiz keyboard shortcuts stay live because no overlay opens).
  **Right-click** the box to **finish the animation instantly** — the
  remaining strokes appear at once and the browser context menu is
  suppressed, so mid-animation impatience never costs a wait.
  The Kanji Library (Browse) modal shows the same kanji with a full
  player (play/pause, replay, step forward/back one stroke, 0.5×/1×/2×
  speed) and a live `3 / 7` stroke label right under it (the counter and
  the old static "N strokes" caption merged into one). **Click the stroke
  box to copy the kanji** — a faint copy icon in the box corner marks the
  affordance, an inline `Copied 語` pill confirms it right in the box (no
  popup), and the transparent overlay button is keyboard-focusable
  (Enter/Space); the box stays clickable in its loading/fallback state
  too. Next to it: meanings, readings (primary in bold) and example
  words — detail is deliberately **quiz-external**: a detail sheet inside
  the quiz would leak the answer (readings).
  Data: SVG stroke paths from **KanjiVG** (CC BY-SA 3.0, attributed in
  the Help overlay), bundled per level (1.9 MB total,
  code-split per level — N1 loads only when N1 is opened). Every kanji's path count is
  verified against the data's `stroke_count` at build time (0 mismatches
  across all 2,211 kanji).
- **Component breakdown (KanjiVG stroke groups)** — kanji are shown as
  component equations: `時 = 日 + 寺`, `全 = 人 + 王`. After you answer a
  quiz question, the card's back (reading sheet) includes a quiet
  "Components" row —
  the equation as plain text (glyphs only, no stroke counts, no chip
  boxes: a memory aid, not an answer hint; the choice grid on the front
  folds up after answering). In the Kanji
  Library modal, the same equation sits **directly below the running
  stroke animation** (column width matches the 180px stroke box) and
  **follows it live**: the chip whose strokes are currently being drawn
  lights up (indigo border + tint), undrawn components stay dimmed,
  finished ones settle back — the equation "inks in" as the kanji
  writes itself (replay, pause and single-stroke stepping keep the
  sync). Each component chip is **clickable**: it opens that component
  as its own kanji (cross-level — `空`'s 穴 lives in N1), with a
  **← Back** button walking you back through the chain
  (`時 → 寺 → 土 → …`). Long equations (up to 6 components, e.g. `爾`)
  wrap neatly in the narrow column. Chips show **glyphs only** — hover
  a chip (desktop) and the tooltip explains its role: *radical* (seal dot, the
  meaning component) or *phonetic* (indigo dot, the sound component); on
  touch (no hover) the help overlay's **Browse kanji** section explains
  the red/blue dots in plain prose (t76);
  a muted `+N` chip counts strokes that belong to no named component
  (keeps every equation stroke-accurate).
  Data: first-level stroke groups from the same **KanjiVG** SVGs,
  extracted by `scripts/build_components.py` (see *Data build pipeline*),
  2,148 of 2,211 kanji decomposed, every equation's stroke sum verified
  at build time (the stroke ranges powering the live sync come from the
  same order-preserving data). KanjiVG also tags historical/
  etymological forms (`王` originally `玉`) — the app shows the
  **written form** (stroke-consistent); it may differ from other
  sources (see the note under *Component decomposition* below).
- **Free practice on non-due units** — scheduled units appear slightly
  **dimmed** in the unit list. Clicking one shows a short confirm ("practice
  won't change your review schedule") and then runs freely — nothing
  is written: no schedule, streak or stats changes. The result screen
  still shows the unit's next review panel — interval and exact time
  (`next review in 6 hours (Sat, Sep 6 · 14:30)`), with a small "schedule
  unchanged" note so it can't be mistaken for a real
  schedule change. Mastered units open directly. New/due units stay fully
  visible because they're the ones to work on, and due reviews stay the
  only thing that moves progress. **Practice is gated behind the missed
  review**: a scheduled/mastered unit that still has missed kanji opens a
  two-line dialog instead ("This unit still has N missed kanji" /
  "practice opens again once they're cleared") with a single Review
  action — practice unlocks once the missed list is clear, so mistakes
  get fixed before extra practice.
- **Missed kanji review (per unit)** — every wrong / "don't know" answer is
  tracked per kanji (IndexedDB `kanjiStats`). Units with missed kanji show
  a small **red "✕ N" pill next to the unit title** — a single, clickable
  element (click = start the missed review; hover for an explanation; no
  status stamps/hanko on the cards — status reads from the card label and
  border color). The quiz
  covers ALL of that unit's missed kanji (no artificial cap). A kanji
  leaves the missed list after ONE correct answer — the result screen
  shows how many are still missed ("N kanji still missed") and, while any
  remain, a **Review again** button restarts the remedial session right
  away (the restarted quiz only contains the kanji that are still missed).
  Missed sessions
  update kanji stats (and the streak) but never unit schedules, and "Back
  to Units" returns to the level the session started from.
  **The missed list resets when the unit comes due** (on app open,
  `resetMissedForDueUnits` in `App.jsx` + `clearKanjiStats` in
  `storage.js`): the scheduled review re-tests the whole unit, so it
  measures recall cleanly instead of carrying remedial work the learner
  never did — and the pill only ever appears on units that are *not* due.
- **Spaced repetition (FSRS-6)** — each unit is scheduled by the FSRS-6
  algorithm via the official `ts-fsrs` engine, version-pinned at 5.4.2 with
  the 21 default weights pinned explicitly (stability + difficulty per unit,
  power forgetting curve with trained decay; see `src/lib/srs.js`). The quiz
  score is mapped to the
  FSRS rating by a **binomial-surprise adapter** (graded relative to the
  scheduler's own predicted retention) instead of manual grading. Home
  leads with the "next review" banner — a clickable calendar entry with
  hour-precision labels (a relearning unit due in six hours reads
  "in 6 hours", not "tomorrow" — `src/lib/dueFormat.js`); clicking the
  banner opens a review
  **calendar overlay** (month calendar + today's due list with exact times)
  so you pick the unit yourself instead of being dropped into an unknown one.
  Only reviews of due units (and
  first-time quizzes) touch the schedule — opening a not-yet-due unit is a
  free practice session that writes nothing, so mastery can't be rushed by repetition.
  (Same-day re-reviews — only possible for weak units that lapse back to a
  sub-day interval — use FSRS-6's short-term rule, whose growth converges as
  a defensive measure.)
- **Per-level progress reset** — a quiet "Reset progress" action at the
  right of the "{level} Units" title deletes that level's SRS schedule,
  quiz history, and missed-kanji stats in one IndexedDB transaction
  (confirmation dialog first; streak contributions from that level's
  quizzes disappear with the history). Other levels are untouched — the
  escape hatch for cleaning up after trying a level above your current
  one. Destructive and rarely needed, so the button is hidden by default
  and turned on via the Progress section of the help modal; it only
  appears on a level that has progress.
- **Per-level progress badges** — each level card shows live status (New /
  N due / studied-of-total / Mastered) instead of a static label. On small
  screens (≤640px) the level chooser becomes a vertical list of full-width
  cards — the level name large on the left, badge + "N kanji · N units"
  right-aligned on the right (one structure, CSS-only switch); wider
  screens keep the grid.
- **Primary readings are the quiz source** — quiz answers come only from each
  kanji's *primary reading*: the most common reading that is backed by a real
  example word (validated by `scripts/build_examples.py`). Primary readings
  are shown **bold** (in kana *and* in romaji mode) on the card's back,
  and bold in kana in the kanji library, and the help overlay explains this,
  so you don't waste effort memorizing rarely-used readings. A promoted kun
  reading additionally needs **real backing** — the example word that proves
  it must be attested in the Jiten global frequency list (rank ≤ 10,000)
  or be marked common by JMdict (ke_pri/re_pri), and
  rare kanji spellings (JMdict rK/oK/iK/sK) never enter the candidate pool,
  so a dictionary-ghost word like 対い can never make a reading like 対
  むか.う primary (t67 rule; removed 64 such artifacts, e.g. 歓 よろこ.ぶ via
  the rare spelling 歓ぶ), while legitimate variant spellings of common
  words (治る, 撃つ — ichi1-marked) still back their readings (t68).
- **No junk example words** — dictionary-fallback examples (words without
  Jiten corpus frequency) pass a quality gate (t68): they must be
  multi-character (a single-kanji "word" like 験【しるし】 is tautological —
  it is the kanji itself), marked common by JMdict (ke_pri/re_pri — 馬験,
  地士, 是者-style archaic dictionary remnants are rejected; 治る, 活かす,
  撃つ pass), must not start with kana (ひと条) and must not contain the
  particle を (身を護る). Corpus words (hybrid-attested) are not gated —
  frequency is the stronger backing. When a slot stays empty after the
  gates (e.g. 験 has no common kun word at all), it is **backfilled** with
  the best unused corpus candidate of any type — 験 now shows 経験 + 試験
  instead of the archaic 馬験【うまじるし】; 565 kanji gained a second
  example this way (2-ex: 1,534 → 2,099; only 49 N1 literary kanji keep a
  single example where genuinely only one common word exists, and 63 N1
  name-only kanji — 之, 亮, 楠 … — now show no example at all rather than
  a junk one).
- **Kana / romaji display toggle** — reading answers carry both their kana
  and romaji form; the **あ / Aa** button on the quiz screen switches which
  one is displayed, instantly, even mid-quiz (scoring is index-based, so
  the script choice never affects grading). The preference persists in
  `localStorage`. The toggle governs the **whole quiz screen**: answer
  choices, the On/Kun reading panel after each answer, and the example
  words' readings all switch together. Non-primary readings and example
  readings are romanized at runtime by `src/lib/kana.js` — a faithful JS
  port of the pipeline's Hepburn converter (verified identical on all
  3,686 primary readings). The kanji Library always shows both scripts.
- **Level-appropriate example words** — each kanji's example words are
  matched against a JLPT vocabulary list (same source as the kanji levels):
  a word at the kanji's own level or easier always wins over harder/unlisted
  words, so an N3 kanji like 平 shows 平和/平ら (both N3) instead of 平成
  (not a JLPT word) or 平たい (N1). When no easier word exists for a reading,
  the most frequent word is still used.
- **Kanji Library** — browse all 2,211 kanji across every level with filter
  pills, live search, and a detail modal (readings, romaji, strokes,
  examples). Click the stroke box in the modal to copy the kanji to the
  clipboard (inline `Copied 語` confirmation).
- **Dark mode** — a Sun/Moon toggle; persists to `localStorage`.
- **Simple stats on Home & every level page** — a panel of three large,
  non-interactive stat cards right under the review banner, in the style
  of the original stat row: **"9/151" Studied** (units ever quizzed, out
  of the total — Home shows all levels, each level's Unit Select shows
  that level, e.g. "1/6"), **Due now**, and **Mastered**. Zero values are
  shown ("0 Mastered"), so the shape of the progress is readable at a
  glance from day one. No missed-kanji card — the count already lives on
  each unit's "✕ N" pill — and no streak card. There is **no separate
  progress screen** anymore (the old `#/progress` screen was removed) —
  the month calendar lives in the review-banner overlay.
- **Review banner = the calendar entry** — the banner under the top bar is
  a button in **all** states ("Review calendar · start a unit to schedule
  your first review" when nothing is studied yet, "N units ready to review
  now" when due, "Next review … · in N hours/days" otherwise). Chevron +
  hover lift + calendar icon make it obviously clickable; clicking opens
  the review-calendar overlay (month calendar + day panel with exact due
  times; overdue rows jump straight into the quiz). The stat cards below
  it are plain read-only information, not buttons.
- **Progress backup** — Export/Import progress buttons in the help modal
  (`src/lib/backup.js`): a full snapshot of the three IndexedDB tables plus
  the localStorage settings, saved as one versioned JSON file. Import
  replaces all current progress (after a confirmation dialog) — the only
  way to survive clearing site data or move progress to another
  device/browser. The Progress section of the help modal also hosts the
  toggle for the per-level reset button.
- **History-aware navigation** — the browser Back button navigates within the
  app (Home ↔ Browse ↔ Unit Select ↔ Quiz ↔ Result) instead of exiting,
  and is guarded like the Cancel button: going Back during a quiz with
  progress opens the same leave-confirmation dialog (the URL snaps back
  until you choose). Leaving a finished or abandoned quiz can't be
  re-entered via Back — its in-memory session is discarded, which also
  prevents double-saving answers.
- **Keyboard-friendly quiz (kept for development)** — W/E/S/D select an
  answer, F = "don't know", R toggles kana ↔ romaji (works before and
  after answering), Q triggers the back button (Cancel / Home), Enter
  **or Space** continues to the next question. Leaving a quiz with
  progress first asks for confirmation (Enter = leave, Esc = keep
  studying — for Q and mouse clicks alike). The shortcuts still work,
  but their help-overlay section was removed (t74: the app targets
  Android where there is no keyboard) — the help overlay now teaches
  the touch flows instead (Quiz / Browse kanji sections).
- **Offline PWA** — installable, caches all data + assets, auto-updates.
- **Lazy-loaded kanji data** — each JLPT level's full data (readings,
  meanings, example words) loads on demand the first time it's opened, not
  upfront. Keeps the initial bundle small on slower connections.

## Project structure

```
src/
  main.jsx                 entry point
  App.jsx                  state machine + router wiring + SRS flow
  lib/
    dataLoader.js           loads level data on demand, merges examples
    quizGenerator.js        generates multiple-choice questions (pure function)
    dueFormat.js            humanized due-interval labels ("6 hours" / "3 days") +
                            exact due time strings — one source for result
                            screen, banner, and unit cards (pure)
    srs.js                  FSRS-6 scheduling: facade over pinned ts-fsrs 5.4.2 + Kanjichō score→rating adapter + unit↔Card mapping
    studyStats.js           study-history stats from quiz attempts (current/longest streak, days studied; pure)
    storage.js               IndexedDB persistence via Dexie (the only storage module)
    useTheme.js              light/dark theme hook (localStorage)
    useRouter.js             hash-based router (browser Back/Forward support); collapse navigation ("fold" entries when going up) updates the view optimistically before the popstate lands — otherwise React's quiz-session cleanup effect wipes a freshly-installed quiz during the gap and "Review again" fell through to Home (t74)
    kana.js                  kana → romaji Hepburn converter (JS port of the pipeline's, powers the romaji display)
    useCopy.js               clipboard hook (navigator.clipboard + execCommand fallback, 1.4s "copied" state) powering click-to-copy on the stroke box
    strokes.js              loads KanjiVG stroke-order data per level (code-split dynamic import, in-memory cache)
    components.js           loads KanjiVG component decompositions per level (same code-split + cache pattern)
  components/
    Home.jsx                next-review banner (the calendar entry) + stat cards panel + browse entry + level grid
    StatCards.jsx           shared panel of three large read-only stat cards (x/total Studied, Due now, Mastered) used by Home and UnitSelect
    UnitSelect.jsx           per-level stat cards + unit cards (dimmed = free practice; "✕ N" missed-review pill next to the title, hidden once the unit is due)
    Quiz.jsx                 quiz screen as a FLIP CARD (t77): front = kanji box + choices, back = reading sheet (readings, components, examples) + weak-review badge on the front. CSS 3D (perspective on .kd-card-scene, preserve-3d + rotateY on .kd-card-inner, backface-visibility on both faces + 1 px translateZ depth separation, t78); never auto-flips (t79 — the card stays on the front after answering so the correct/wrong marking can be read at leisure); a horizontal swipe (pointer events, ≥56 px, only after answering) is the only flip trigger — the Flip button was removed (t79); a one-time swipe hint (t78) shows under the card after answering until the user's first registered swipe (localStorage "kanji-swipe-learned"); the hidden face is inert; key=qIndex remounts a fresh card per question. The kanji is always shown as the finished KanjiVG SVG — left-click the box to replay the stroke animation inline, right-click to finish it instantly (no detail entry from inside the quiz before answering — that would leak the answer); the script toggle (kana/romaji) sits in the card's top-right corner on the front and in the reading-sheet header on the back; the dots above the card are a live scoreboard (t76): answers prop + correctIndex comparison sorts them into [correct (full indigo, leftmost)] [current] [wrong (dimmed)] [unanswered]
    Readings.jsx             shared On/Kun rendering with primary bolding, kana or romaji
    GenkouGlyph.jsx          quiz kanji box as a button: renders the KanjiVG SVG in its finished state on mount (paths lazy-loaded per level); left-click → replays the stroke animation from the first stroke (1× default), right-click → completes it instantly
    ComponentBreakdown.jsx   component equation (時 = 日 + 寺): plain-text variant inside the quiz answer panel's "Components" row (after answering, glyphs only, no interaction, no chip boxes); full chip variant in the Browse modal directly below the stroke animation (no "kanji =" lead) — glyph-only chips with radical/phonetic role tooltips (radical = meaning carrier, phonetic = sound carrier) and radical/phonetic dots (their meaning is explained in the help overlay's Browse section — t76 removed the in-modal mini-legend again to keep the screen clean); the `progress` prop keeps the chips in sync with the running stroke animation (future → active → done); clickable chips navigate to the component kanji (← Back button from Browse's navHistory); +N loose-stroke chip; long equations wrap as "+ chip" terms in the 180px animation column
    CopyKanji.jsx            transparent <button> covering the Browse stroke box: click = copy the kanji (faint corner copy icon as affordance, inline "Copied 語" pill, keyboard-accessible)
    StrokePlayer.jsx         animated stroke-order player (two-layer SVG: faint guide + drawn ink via stroke-dashoffset; play/pause/replay/step/speed; live "n / N strokes" label under the controls — old kd-stroke-counter merged into it; `onProgress(revealed)` reports the live stroke count so the Browse component chips can highlight in sync; the stroke box itself is click-to-copy via the CopyKanji overlay)
    Result.jsx               score stamp + breakdown + mode-aware next-review panel. (t78) The "Why the same review date?" note was removed — the first-quiz schedule explanation lives in the Help overlay's Quiz section; the numbers are still verified by scripts/t74_srs_first_schedule.mjs
    Browse.jsx               full kanji library (filter pills, search, modal; the modal's stroke box is click-to-copy — see CopyKanji.jsx)
    ReviewCalendar.jsx       shared month calendar + selected-day panel (used by the banner overlay); buildScheduleEntries filters per level via state.jlptLevel with a unitId-prefix fallback ("N1-U3" → "N1", t78) so freshly scheduled units are never hidden from the level-scoped calendar; days the user actually studied on (≥ 1 completed quiz) are gold — same color story as the lit streak card (t76: the marker is on activity days, not on "today"; today keeps its indigo border); the study dot under the day number is gold too
    CalendarModal.jsx        review-calendar overlay opened from the review banner: calendar + day panel
    NextReviewBanner.jsx     one-line schedule banner — a clickable calendar entry in ALL states (empty/due/scheduled); click opens the review-calendar overlay
    ThemeToggle.jsx          Sun/Moon dark-mode switch
    Toast.jsx                transient message
  data/
    manifest.json                    unit ids + kanji counts per level (small, loaded upfront)
    n5.json ... n1.json               full kanji entries per level (loaded on demand)
    n5_examples.json ... n1_examples.json   example words per kanji (loaded on demand)
    strokes_n5.json ... strokes_n1.json     KanjiVG stroke-order paths per kanji (loaded on demand, code-split)
    components_n5.json ... components_n1.json   KanjiVG component decompositions per kanji (loaded on demand, code-split)
  styles/
    global.css               genkouyoushi design system (light + dark tokens)

public/
  icons/                    PWA icons (192, 512, maskable)

vite.config.js              Vite + PWA config (manifest + service worker)

scripts/
  convert_kanji.py          Step 1: raw/kanjidic2.xml.gz + raw/JLPT_kanji_ALL.json
                            → n*.json (kanji data, workspace output/)
  rerank_readings.py        Step 2: rank primary_romaji (pipeline-internal
                            working list) by hybrid frequency (Jiten
                            global list utama + penanda pri JMdict
                            fallback — scripts/hybrid_freq.py; t72) —
                            credit via STRUCTURAL ATTRIBUTION (Fix-5):
                            a word only credits the reading whose
                            segment the DP alignment actually proves
                            (gemination returns to base がっ→がく;
                            れっ of 列車 proves レツ, not レ); credit is
                            indexed by CLEAN form so KANJIDIC2 dot
                            variants of one reading (終 お.わる/おわ.る)
                            do not split their credit; POS 固有名詞 rows
                            credit nothing; the dictionary-default seed
                            is only overturned when the corpus winner
                            beats it by > 100 (margin guard). Optional
                            3rd arg = kanjidic2.xml.gz (default raw/;
                            without it the old substring matching runs
                            and a warning is printed)
  build_examples.py         Step 3: raw/JMdict + raw/frequency_list_global.csv
                            (Jiten, CC BY-SA 4.0 — sinyal hybrid t72) +
                            raw/JLPT_vocab_ALL.json
                            (arg ke-5 eksplisit) + raw/kanjidic2.xml.gz
                            (arg ke-6 opsional, default raw/) →
                            n*_examples.json; also filters the primaries
                            to example-backed readings and writes them as
                            `primary_readings` (kana + romaji + type) —
                            the only primary field in the final data.
                            ATTRIBUTION-FIRST: tipe contoh (on/kun)
                            ditentukan attribute_example_reading (alignment
                            DP kata↔bacaan — Surgery 1) bukan bentuk
                            kata/substring; kandidat hanya masuk pool
                            se-tipenya (Surgery 2); slot kosong diisi
                            fallback kamus JMdict (ejaan alternatif
                            seperti 活かす, keb kedua entri 生かす) MELALUI
                            atribusi yang sama; nama diri disaring via
                            POS 固有名詞 hybrid. THREE stages: filter_entry
                            (loose heuristic, candidates only) →
                            strict_primary_pass (structural verification;
                            gemination = strict evidence, Fix-8) →
                            freq_backing_pass (P2a natural — primary
                            lemah + kandidat ber-backing ketat + freq
                            korpus ≥4× dan ≥2000 → tukar; aturan umum,
                            bukan special case per kanji). t67: (a)
                            rare-form spellings (ke_inf rK/oK/iK/sK)
                            excluded per-spelling from both pools — the
                            old RK hint string never matched JMdict's
                            "rarely used kanji form", so ghost spellings
                            like 対い/歓ぶ leaked in; (b) corpus-backing
                            gate: a kun reading may only be DERIVED or
                            PROMOTED to primary when the example word
                            proving it has hybrid corpus frequency
                            (KUN_DERIVE_MIN_FREQ) — dictionary ghosts
                            can no longer create kun primaries (64
                            removed, e.g. 対 むか.う, 歓 よろこ.ぶ,
                            随 したが.う); (c) homophone guard: a
                            segment credited as both on and kun (摩擦
                            credits マ and stem ま) feeds the ON bucket
                            only, so P2a can no longer swap primaries
                            using on-frequency leaking into a kun stem;
                            t68: (d) example-quality gate — dictionary
                            fallback words must be multi-char + JMdict
                            common-marked (ke_pri/re_pri → alt_common)
                            + not kana-initial + particle-free を,
                            closing the 馬験【うまじるし】 (archaic
                            remnant) and 験【しるし】 (tautological
                            single-kanji fallback, the hole behind the
                            user's failed manual fix) classes; (e) the
                            t67 kun-promotion gate now also accepts
                            JMdict common-marked examples as backing —
                            治る (ichi1) can prove 治 なお.る from a
                            fresh chain run (previously it only
                            survived via state recovery from a previous
                            build run — a determinism bug); (f) backfill:
                            a slot still empty after the gates is filled
                            with the best unused corpus candidate of
                            any type (験 → 経験 + 試験; 565 kanji gained
                            a second example, 2-ex 1534 → 2099).
                            RANKING FIXES:
                            single-kanji words that read EXACTLY the
                            primary (蚕【かいこ】, 館【やかた】) are no
                            longer demoted behind rare compounds (Fix-6,
                            double guard: they still lose to same-level
                            multi-char words that match primary + exact
                            okurigana); corpus ranking prefers the
                            dictionary form over stem/te-forms at equal
                            frequency (Fix-7: 笑う beats 笑い, 極める
                            beats 極めて)
  build_manifest.py         Step 4: generate manifest.json (level summaries for Home)
  audit_primary_readings.mjs  VERIFIER (jalankan SETELAH cp promosi): re-checks
                            every primary reading against the same strict
                            rules the pipeline already applied — a fresh
                            rebuild + promotion must report GANTI (0);
                            --fix only patches legacy pre-strictness data.
                            Gemination counts as STRICT backing (Fix-8,
                            mirroring on_strict_score + the DP engine):
                            がっ proves がく, れっ proves レツ — a short
                            1-mora reading that only substring-matches
                            inside a longer geminated segment (レ ⊂ れっしゃ)
                            is a pattern-coincidence, not proof, and can
                            no longer displace the gemination-backed
                            primary (列 レツ was exactly that false
                            positive; 颯 ソウ was stealing 爽's segment そう)
  build_strokes.py          Step 5: KanjiVG SVGs → strokes_n*.json (stroke
                            paths per kanji, written to output/); verifies
                            every path count against stroke_count (fails on
                            mismatch). Needs the KanjiVG repo checkout in
                            raw/kanjivg-master/ (default) — pass
                            --kanjivg-dir if it lives elsewhere
  build_components.py       Step 6: KanjiVG SVGs → components_n*.json
                            (component equation per kanji: first-level
                            stroke groups; unlabeled containers promote
                            their labeled children, part-split components
                            re-merge, non-Unicode CDP groups fold into a
                            loose-stroke count; written to output/).
                            Every equation's stroke sum + the kanji's
                            stroke_count are verified (fails on mismatch).
                            Same KanjiVG checkout requirement as Step 5;
                            see "Component decomposition" below for the
                            extraction rules and the written-vs-original
                            form policy
  hybrid_freq.py            Sinyal frekuensi HYBRID: jiten.moe global
                            (raw/frequency_list_global.csv, CC BY-SA 4.0)
                            UTAMA + penanda pri JMdict fallback — satu
                            titik injeksi apply_hybrid()/attach() yang
                            dipakai Step 2 DAN Step 3 (fail-fast bila
                            CSV jiten hilang); standalone: python
                            scripts/hybrid_freq.py (laporan distribusi)
  fetch_fonts.py            Regenerasi public/fonts/ (woff2 subset) +
                            src/styles/fonts.css — self-host Google
                            Fonts (OFL 1.1), zero third-party request
  test_logic.mjs            Unit test logika app (FSRS adapter, quiz,
                            histori) — node scripts/test_logic.mjs
  differential_tsfsrs.mjs, srs_oracle.mjs, experiment_adapters.mjs,
  experiment_slope_full.mjs  Bukti validasi mesin SRS (differential
                            test 2.600 kasus vs engine manual; oracle;
                            eksperimen adapter/slope — lihat seksi
                            SRS design)
```

## Data sources

The JSON files in `src/data/` are a **static, pre-built snapshot** — at
runtime the app makes no network requests for kanji data, everything is
bundled and loaded from disk. Three public datasets feed the build pipeline:

| Source | Provides | Project page |
|---|---|---|
| **KANJIDIC2** | Kanji, on'yomi/kun'yomi, English meanings, stroke count, newspaper frequency | https://www.edrdg.org/wiki/KANJIDIC_Project.html |
| **Jiten global frequency list** | Word frequency (media corpus, 3.18 B chars) — which readings and example words are actually common; primary layer of the hybrid build signal | https://jiten.moe/frequency-dictionaries |
| **JMdict** | English glosses for example words | https://www.edrdg.org/jmdict/edict_doc_depr.html |
| **JLPT vocabulary list** | JLPT level (N1–N5) of each example word — same-level-or-easier words are preferred | [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary) (`data/vocab/results/JLPT_vocab_ALL.json`, MIT) |
| **KanjiVG** | Stroke-order animation data (SVG stroke paths) for every kanji in the app | https://github.com/KanjiVG/kanjivg (CC BY-SA 3.0) |

Licences and ShareAlike compliance: KANJIDIC2 & JMdict are © EDRDG (CC
BY-SA 4.0), KanjiVG is © Ulrich Apel (CC BY-SA 3.0), the Jiten global
frequency list is © Jiten (CC BY-SA 4.0; build-time hybrid signal only —
no frequency values ship in `src/data/`),
JLPT levels are MIT. The derived data files are published at
[Zyxcid/kanjicho-data](https://github.com/Zyxcid/kanjicho-data) under the
same licences — see `NOTICE.md` (repo root) and the "Privacy & Google
Play readiness" section below.


| Field in JSON | Built from |
|---|---|
| `kanji`, `stroke_count` | KANJIDIC2 |
| `readings.on`, `readings.kun`, `meanings` | KANJIDIC2 |
| `jlpt_level` | `JLPT_kanji_ALL.json` (see note below) |
| `romaji_readings` | Derived — all readings romanized |
| `primary_readings` | The primary readings as `{kana, romaji, type}` — ranked by hybrid frequency (Jiten global list primary, JMdict `ke_pri`/`re_pri` fallback; t72), then filtered to readings backed by an example word (see below). The quiz answer pool and the UI bolding both come from this one field |
| `unit`, `order_index` | Pipeline grouping — 15 kanji per unit, ordered by newspaper frequency |
| `examples` | JMdict words containing the kanji, ranked by hybrid frequency with a preference for words at the kanji's JLPT level or easier |

**JLPT levels:** KANJIDIC2 only carries the pre-2010 JLPT system (4 levels,
no N5). `JLPT_kanji_ALL.json` maps each kanji to the modern N1–N5 system.
Like every other raw source, it is not included in the project — see the
note under "Required raw sources" below.

**Example words:** for each kanji, `build_examples.py` finds JMdict words
containing it that are attested in the hybrid corpus signal, cross-verifies
the reading against corpus frequency (to reject archaic/rare alternate readings), and
picks the most frequent on'yomi word and the most frequent kun'yomi word.
Words are first matched by JLPT level (via the required `JLPT_vocab_ALL.json`):
a word listed at the kanji's own level **or easier** is preferred
over everything else (multi-char words first, then the level tier, then
primary-reading match, then frequency). 平 (N3) therefore shows 平和 and
平ら (both N3 vocabulary) instead of 平成 (not a JLPT word — era name) or
平たい (N1 — two levels above the kanji). Harder and unlisted words keep
the plain primary-match + frequency order, so common easy words that
simply aren't in the vocabulary list (何度, 東京, 三人) are not displaced by
rarer harder "listed" words. Example level is a preference, never a filter
— when nothing easier exists for a reading, the most frequent word wins.

Words whose kanji spelling is not the normal written form are never picked:
  - JMdict sense flagged "usually written using kana alone" (e.g. 平仮名 is
    normally written ひらがな — it used to be picked as THE kun example for
    平), and
  - kanji forms flagged "rare kanji form" (`ke_inf &rK;`).

Dictionary-fallback words (no corpus frequency) additionally pass the t68
quality gate: multi-character, JMdict common-marked (ke_pri on the spelling
or re_pri on the entry's first reading — this is what separates legitimate
variant spellings like 治る/活かす/撃つ from dictionary ghosts like 馬験),
not kana-initial, and free of the particle を. Single-kanji words are only
ever picked through the corpus path (蚕【かいこ】, 姿【すがた】 — real
standalone words), never as dictionary fallback. An empty slot after the
gates is backfilled with the best unused corpus candidate of any type
(験 → 経験 + 試験), so a kanji either shows two good examples or honest
fewer — never a junk word.

Frequency attribution is also guarded: a corpus frequency is only used when
the corpus reading matches one of the term's JMdict readings (the Jiten list stores
貴方 with the reading あなた, but the kanji entry is 貴方【きほう】 — without
this guard a rare reading would inherit あなた's big frequency), and the
by-reading fallback only accepts the same word (or a spelling variant with
the same kanji sequence, like 現れる/現われる) — otherwise 本盗【ほんとう】
would inherit 本当's frequency.

**Most common readings (`primary_readings`):** ranked by
`rerank_readings.py`, which scores candidate readings by hybrid corpus
frequency — but only through **structural attribution** (Fix-5): a
word containing the kanji credits the reading whose segment the DP
alignment proves (looking at every word containing the kanji, e.g.
時代, 代わり, 世代 for 代; 入る【はいる】 credits はい.る, never い.る —
the old substring matching let いる steal 57030 from はいる). The most
frequent on'yomi and kun'yomi win; the dictionary-default seed only
falls when the corpus winner beats it by more than the margin guard.
This aggregates frequency across ALL hybrid corpus words using each reading,
so it correctly identifies the common readings (e.g. 十 → `too`, not
the rare `so`). `primary_romaji` — a plain romaji list of the same
information — exists only as the pipeline's internal working field
(seeded by convert_kanji.py, ranked by rerank_readings.py);
`build_examples.py` drops it from the final files because each
`primary_readings` item already carries the romaji.

**Example-backed primaries:** `build_examples.py` (after picking examples)
drops any primary reading that is not exercised by one of the kanji's
example words (matched type-aware: on-examples back on-readings,
kun-examples back kun-readings via their stem) and writes the survivors
as `primary_readings`. Rationale: quizzing readings the learner
never sees in a real word trains memorization of trivia. Example: 対 has
primary readings `tai`/`aite` but only the on-example に対する — so `aite`
is dropped and only `tai` is ever quizzed. Kanji with no example words at
all keep their primary readings unchanged (the quiz would otherwise fall
back to the full reading list). When a type's primary reading is not backed
but that type's example word exercises another reading of the same type,
the primary is re-derived from the example — e.g. 平's kun example 平ら【たいら】
backs たいら, so the kun primary is `taira` (not the unbacked `hira`): the
quiz and the shown example always agree.

**Primary↔example consistency (strict, in-pipeline):** the heuristic
filter above matches kun readings loosely (stem containment), which
historically let a few short readings sneak through as substring
false-positives (助's kun `suke` sits inside たすける, so it survived
while the actual reading たす.ける was not primary — the bolded
reading and the shown example disagreed). Since the strict pass moved
INTO `build_examples.py` (`strict_primary_pass`, stage 2), a fresh
rebuild can no longer produce such primaries: the stem must be a
PREFIX of the example reading, and the okurigana after the stem must
match the word's kana suffix (たす.ける ↔ 助ける, not たす.かる);
dash-marked readings (産 うぶ-, suffixes like 日 -び) are positional
markers and are stripped first. The heuristics remain only as
CANDIDATE ORDERING (which examples to prefer) — structure decides
truth; the filter's on-side backing also recognizes gemination
(セツ → せっしゅ), mirroring the strict scorer. Loose-but-valid cases
(人 ひと backed by 一人 ひとり, where the kanji is not word-initial)
are kept, not replaced. `scripts/audit_primary_readings.mjs`
re-verifies the same rules against the promoted data — run it after
promotion and expect **GANTI (0)**; `--fix` only patches legacy
pre-strictness data.

**Structural attribution (pipeline surgery — the known gap is CLOSED):**
the type (on/kun) of every example used to come from substring checks
+ `classify_word_shape` ("all-kanji → on, any kana → kun"), which
mislabels mixed-script and geminated words: 総トン数【そうトンすう】
was labeled kun for 総 but is an on word (そう); 血糖値【けっとうち】
was labeled kun for 血 but is on (けっ); conversely 白雪姫【しらゆきひめ】
was labeled on for 姫 but is kun (ひめ). As of the pipeline surgery,
example typing lives in `build_examples.py` itself:

- `attribute_example_reading(kanji, word, reading, on, kun, cand_table)`
  — ONE central function (Surgery 1): alignment DP of word↔reading
  proves which segment the target kanji actually reads (okurigana,
  gemination がく→がっ, rendaku, 々, katakana chunks); words that
  cannot be attributed (or stay ambiguous) back NO slot.
  **On/kun homophone tie-break (Fix-2, class R2):** when a segment
  matches an on AND a kun reading with the same kana (キ/き, クン/くん),
  the word is no longer discarded — the conflict is resolved with
  structural evidence: kana right after the kanji that matches the
  okurigana of a dotted kun reading → KUN (死ぬ し+ぬ ↔ し.ぬ;
  医する い+する ↔ い.する); compound position (kanji followed by a
  kanji, or word-final in a multi-char word) → ON (病気 キ, 訓練 クン,
  放送 ホウ, 必死 シ); single-kanji words / non-matching okurigana
  stay conservatively `unknown`.
- Pool rule (Surgery 2, "Tahap B"): a candidate may only enter the
  on-pool or kun-pool of ITS OWN attributed type — 活性化【かっせいか】
  goes to 活's ON pool (かつ, via gemination), never to the kun pool
  of い.かす no matter what its reading happens to contain.
- Dictionary fallback (kept, but attributed): slots the corpus cannot
  fill get JMdict alternate spellings (活かす is the 2nd keb of
  生かす【いかす】; the corpus list only has the 生 spelling) — same attribution,
  plus an entry-reading gate and an exact-okurigana preference
  (活かす beats 活き for primary い.かす).
- Proper-noun filter: corpus rows with POS 固有名詞 (names of people /
  places / TV shows — 篤姫, 川崎) never become examples.
- **Rendaku-aware loose backing (Fix-1, class R1):**
  `filter_entry.contained()` accepts the voiced variant of a reading
  segment (は→ば/ぱ, た→だ, か→が, さ→ざ …) as loose-stage backing
  when it appears at a NON-initial position (kanji not word-initial,
  variant not reading-initial — mirrors the DP's loose rendaku path).
- **Seed via attribution (Fix-5, root of the 入 い.れる chain):**
  rerank credit no longer uses substring first-match. A short reading
  can no longer steal the frequency of a longer reading that contains
  it (いる⊂はいる), and stem-form words no longer credit the shortest
  reading (栄え【さかえ】 → え). Unattributable words credit nothing
  (UNKNOWN is not evidence) — same policy as the audit engine.
- **Single-kanji exact-form guard (Fix-6):** corpus/dictionary words
  that consist of the kanji alone and read EXACTLY the primary
  (蚕【かいこ】 for primary かいこ) are treated as proper examples —
  previously the multi-character preference demoted them and let a
  rare compound flip the primary (夏蚕【なつご】 freq 3 "proved" こ).
  Double guard: they still lose to same-level multi-character words
  that match the primary with exact okurigana (目【め】 loses to 目薬).
- **Dictionary-form ranking (Fix-7):** corpus candidates now rank by
  exact-okurigana-match BEFORE frequency, so the dictionary form
  beats stem/te-forms of the same verb at equal frequency (笑う over
  笑い, 極める over 極めて, 続ける over 続け).
- **Gemination = strict evidence (Fix-8, found by the R6 gate):**
  on_strict_score and the JS verifier used to score gemination as 1,
  which let a 1-mora reading that only substring-matches inside a
  longer geminated segment displace the real reading (列 レ was
  "backed" by れ⊂れっしゃ while レツ — actually proven by れっ — scored
  1; 颯 ソウ was stealing 爽's segment そう in 颯爽【さっそう】).
  Gemination now scores 2 in both mirrors, matching the DP engine
  that always treated がっ as proof of がく.
  出口【でぐち】 proves くち, 木箱【きばこ】 proves はこ, 満足【まんぞく】
  proves ソク, 南北【なんぼく】 proves ホク — symmetric with the on
  gemination rule (セツ → せっしゅ) and for on/kun alike. Without it,
  the candidate stage silently dropped primaries whose only proof was
  voiced (84 v2-OK primaries in the diff review), and the strict
  truth stage has no path to add them back.
- P2a natural ("Tahap C", `freq_backing_pass`): a weak primary whose
  same-type candidate is strictly backed AND wins corpus frequency
  ≥ 4× (≥ 2000) is swapped — a general rule, no kanji names in code;
  morphological variants and frequency-winning primaries are never
  swapped. 摂 セツ and 列 レツ and 代 か.わり emerge from the pipeline
  themselves.

The read-only verifier for ALL of this is
`scripts/audit_primary_readings.mjs` — it re-checks every promoted
primary against the same strict rules (run it after promotion, expect
**GANTI (0)**):

```bash
node scripts/audit_primary_readings.mjs
```

The decision taxonomy below is the historical record of the full
reading-quality audit run during the attribution surgery. That audit
script was bound to the retired pre-hybrid frequency list and was
removed together with it; `audit_primary_readings.mjs` is the living
verifier.

**Taxonomy v2** (after reviewing the v1 report, HIGH only contains
cases that truly need intervention). Post-surgery state on a fresh
rebuild (the pipeline now fixes P1 itself and resolves 3 of 5 P2a
naturally — 摂 セツ / 列 レツ / 代 か.わり; 由・形 stay coherent with
their seeded primary and remain flagged as frequency signals):

- 🔴 **P1 example-misclassified** (was 31 → **0** on a fresh rebuild)
  — closed at the root by the attribution-first pipeline above.
- 🔴 **P2a primary-likely-wrong** (was 5: 摂 列 由 形 代 → **0**;
  3 emerged naturally, 2 locked-in-coherent) — candidate has strict
  backing AND corpus frequency ≥ 4× primary (≥ 2000). The margin
  threshold separates cleanly: all P2a cases were ≥ 6× or ∞,
  everything below 3.95× stays ambiguous.
- 🔴 **P2b primary-valid-example-missing** (was 4 → 2: 我 わ、刺 さ.し)
  — primary is the frequency *winner* vs its candidate: keep primary,
  add a proving example (proposals included).
- 🔵 **morphological-variant** (9) — candidate is an inflectional
  variant of the primary (same stem, okurigana extends: た.れ /
  た.れる, こま.か / こま.かい, or same-base voiced pair on/kun like
  は.れ / -ば.れ). A 1-vs-3 score inside one family only means
  representation inconsistency, not a wrong primary — no data action.
- 🟡 **primary-ambiguous** (8 ex-HIGH: 巌 透 颯 鷹 合 太 夫 右) —
  candidate exists but evidence is below the strong bar: verify
  manually, never auto-swap. (颯 was since resolved by Fix-8: primary
  ソウ was a substring steal of the second kanji's segment in 颯爽 —
  the gemination rule now proves サツ, Level A.)

Current totals on the PROMOTED rebuild (post-surgery + Fix-1/2 +
Fix-5/6/7/8): 🔴 2 · 🔵 2 · 🟡 117 · 🟢 2079 · ⚪ 11 (no examples, was
62 → 20 after surgery → 11 after fixes), **0 mislabeled examples**
(was 31). The 2 HIGH are both P2b-class "keep primary, add a proving
example" (刺 さ.し + 卸 おろし — 我 棚 殻 所 resolved naturally by
Fix-5/6/7: the seed fix and the exact-form guard let their standalone
single-kanji corpus words back the primary). A fresh rebuild is
byte-reproducible (verified across different PYTHONHASHSEED runs).
**The promoted `src/data/` IS this fresh rebuild** — promoted after
the full acceptance gate (audit + diff review + R6 verifier GANTI(0)
+ app tests), so no manual tweaks remain anywhere.

## Data build pipeline (regenerating the JSON)

Only needed if you want to regenerate the data (change unit size, pull fresh
dictionary updates, etc.) — the committed JSON in `src/data/` is already
built.

### Required raw sources

| File | Get it from |
|---|---|
| `kanjidic2.xml.gz` | https://www.edrdg.org/wiki/KANJIDIC_Project.html (see "download" link) |
| `JMdict_e.gz` | https://www.edrdg.org/jmdict/edict_doc_depr.html (see "CURRENT VERSION & DOWNLOAD") |
| `frequency_list_global.csv` | https://jiten.moe/frequency-dictionaries → "Global" → CSV (CC BY-SA 4.0; MD5 b36652e9fb36873dc25676d52f7cac50) |
| `JLPT_kanji_ALL.json` | [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary/releases) — modern N1–N5 levels |
| `JLPT_vocab_ALL.json` | [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary) — `data/vocab/results/JLPT_vocab_ALL.json` (vocabulary levels; required — `build_examples.py` exits with an error when it's missing, rather than silently falling back to frequency-only ranking) |
| KanjiVG `kanji/` SVGs | https://github.com/KanjiVG/kanjivg (clone or download ZIP; needed for `build_strokes.py` **and** `build_components.py`) |

> Raw sources are **not** included in the project — download them into
> `raw/` at the app root (the single home for raw downloads) when running
> the pipeline. In particular, grab the two Bluskyo JSON files:
> `JLPT_kanji_ALL.json` from the releases page and `JLPT_vocab_ALL.json`
> from `data/vocab/results/`. The committed `src/data/n*.json` already has
> correct JLPT levels baked in, so you only need these files when
> regenerating from raw sources.

### Pipeline

```
raw/kanjidic2.xml.gz    ─┐
                          ├─→ convert_kanji.py  ──→ n5.json ... n1.json
raw/JLPT_kanji_ALL.json ─┘                      (kanji entries, units, readings)

n*.json           ─┐
raw/Jiten CSV     ─┴─→ rerank_readings.py ──→ n*.json (primary_romaji working list:
                                           frequency-ranked default)

n*.json               ─┐
raw/JMdict_e.gz       ─┼─→ build_examples.py ──→ n*_examples.json (example words per kanji,
raw/Jiten CSV         ─┤   │                    type per structural attribution)
raw/JLPT_vocab_ALL.json ┤   └→                   + n*.json updated (primaries filtered to
raw/kanjidic2.xml.gz  ─┘                        example-backed readings, written as
                                                primary_readings {kana, romaji, type};
                                                strict verification + P2a frequency
                                                resolution in-pipeline; the
                                                primary_romaji working field is
                                                dropped from the final files)

n*.json               ───→ build_manifest.py    ──→ manifest.json
                           (small summary: totals + unit ids for Home)

raw/KanjiVG kanji/*.svg ─→ build_strokes.py    ──→ strokes_n*.json
                           (stroke-order paths per kanji; path count
                           verified against stroke_count, build fails
                           on any mismatch)

raw/KanjiVG kanji/*.svg ─→ build_components.py  ──→ components_n*.json
                           (component equation per kanji from first-level
                           stroke groups; stroke sum + stroke_count
                           verified, build fails on any mismatch)
```

```bash
python scripts/convert_kanji.py raw/kanjidic2.xml.gz output raw/JLPT_kanji_ALL.json
# 3rd arg (optional, default raw/kanjidic2.xml.gz) = candidate table
# for Fix-5 DP attribution credit — omit it and the step falls back
# to the legacy substring matching with a warning
python scripts/rerank_readings.py raw/JMdict_e.gz output raw/kanjidic2.xml.gz
# JLPT vocab levels are passed EXPLICITLY as the 5th arg — same
# convention as JLPT_kanji_ALL.json above (no auto-detect);
# build_examples.py fails fast if the file is missing
python scripts/build_examples.py raw/JMdict_e.gz output output raw/JLPT_vocab_ALL.json raw/kanjidic2.xml.gz
python scripts/build_manifest.py output

# stroke-order data (KanjiVG): clone/download the repo into raw/ first
# (the default expects raw/kanjivg-master/)
python scripts/build_strokes.py

# component decomposition data — SAME KanjiVG checkout, no extra
# downloads. Extracts first-level stroke groups → components_n*.json
# (see "Component decomposition" below for the rules & format)
python scripts/build_components.py

# promote: everything the app imports goes from output/ into src/data/
# in ONE copy. Steps 1–6 all read & write output/ (the build workspace),
# so you can wipe src/data/ and rebuild from raw sources; src/data/ is
# only ever written by this cp (all_kanji.json is a convert-stage
# intermediate the app never imports)
cp output/n[1-5].json output/n[1-5]_examples.json output/manifest.json output/strokes_n[1-5].json output/components_n[1-5].json src/data/

# post-promotion verifier: re-checks the strict backing rules the
# pipeline already applied — expect "GANTI (0)" (non-zero = data was
# produced by a pre-strictness pipeline or hand-edited; --fix patches)
node scripts/audit_primary_readings.mjs
```

Every raw download lives in **`raw/` at the app root** — the single
home for third-party sources (re-download from the table below; not
committed). `scripts/` holds code only, `output/` is the build
workspace, `src/data/` the promoted copy — nothing else reads or
writes those folders, so data never gets scattered.

All scripts take paths as CLI args; input defaults point into `raw/`,
workspace defaults into `output/` (like the invocations above), never
into `src/data/` — the promoted copy. Run `python
scripts/<script>.py` with no args for usage.

Rebuild determinism: re-running the whole pipeline from `raw/`
reproduces every promoted file — `strokes_n*.json`, `manifest.json`,
all `n*_examples.json` AND all `n*.json` — **byte-identically**. The
shipped `src/data/` snapshot was itself produced by exactly this
pipeline (promoted after the full acceptance gate: audit + diff
review + R6 verifier GANTI(0) + app tests), so the historical 4
manual tweaks (生 即 煩 透) are gone: fresh rebuild and shipped data
no longer diverge at all. The strict verification now runs inside
step 3 (`strict_primary_pass`, with gemination as strict evidence —
Fix-8), so a fresh rebuild applies the same corrections the old
post-hoc audit did, automatically — the verifier after promotion is
expected to report **GANTI (0)**.

## Component decomposition (build_components.py)

KanjiVG's SVGs don't just carry stroke paths — each `<g>` stroke group is
tagged with the component it draws (`kvg:element`). `build_components.py`
reads that structure and turns it into the per-kanji equation the app
displays. It shares the Step-5 KanjiVG checkout (`raw/kanjivg-master/`)
and the same CLI conventions (`--kanjivg-dir`, `--data-dir`, `--out-dir`;
workspace contract `output/` → promote with one `cp`).

### Extraction rules

1. **First level only** — components are the stroke groups that are direct
   children of the kanji's root group. Nested groups belong to their parent
   component (語's 吾 contains 五・二・口, but the equation stays `言 + 吾` —
   the nested view appears when you *click* 吾 and open its own page).
2. **Unlabeled containers are transparent** — a group without
   `kvg:element` is pure layout; its labeled children are promoted
   (recursively). 前's top/bottom containers have no labels, so the
   equation becomes `八 + 月 + 刂`.
3. **Part-split components re-merge** — KanjiVG sometimes splits one
   component into `kvg:part="1"`/`"2"` groups (武's frame); they merge back
   into a single part with summed strokes.
4. **Written form, original as tooltip** — the chip shows `kvg:element`
   (what your hand actually writes: 亻, 刂, 飠, 王), while `kvg:original`
   (the base/etymological kanji: 人, 刀, 食, 玉) is kept in the tooltip and
   used as the click target when the written form isn't a standalone kanji
   in the app's data.
5. **Loose strokes stay honest** — strokes that belong to no named group
   (本's final horizontal, 電's tail, unlabeled leaves like 行's right
   side) become a muted `+N` chip, so every equation's stroke count adds
   up. Non-Unicode KanjiVG ids (`CDP-*`, no codepoint) are treated the
   same way: promoted if they contain labeled children, otherwise folded
   into `+N`.

### Data format

```json
"全": { "t": 6, "p": [
  { "e": "人", "s": 2, "lv": "N5", "r": 1 },
  { "e": "王", "s": 4, "lv": "N3", "o": "玉" } ] }
```

`e` glyph as written · `s` its stroke count · `lv` the level whose data
contains the click target (missing = chip is static, e.g. 吾) · `k` the
link target when it differs from `e` (亻 → 人) · `o` the original form for
the tooltip · `r`/`ph` radical/phonetic flags (the seal/indigo dots) · `m`
a built-in gloss for radical *forms* that are no kanji at all (艹 "grass",
⻌ "road", 宀 "crown"…) · `{ "u": N }` loose strokes. `t` is the kanji's
total stroke count. Kanji with no labeled parts (primitives like 雨, 金)
are simply absent — the app shows no equation for them.

Build output (2,148 of 2,211 kanji decomposed, ~209 KB total): each
equation's part strokes (+ loose) are verified to sum to `t`, and `t` to
the app's `stroke_count` — the build fails on any mismatch, same contract
as `build_strokes.py`.

### Why other sources may disagree

There is **no single standard** for decomposition. The Kanji Map shows
semantic tree splits with variant-glyph notation (全 = 𠆢 + 王); Jisho
lists a *radical + parts* classification (radical 入, parts 个 ハ 王 — the
入/人 split is a famous classifier ambiguity). This app follows KanjiVG's
stroke grouping and always prefers the **written form**: 全's bottom group
is tagged `element="王" original="玉"` — 王 (4 strokes) is what you write
and what makes 2 + 4 = 6 add up, so the equation shows 王 and the tooltip
carries "originally 玉". All three views are defensible; the app's choice
is the one that stays consistent with its own stroke data.

## Spaced repetition model

`srs.js` is a thin **facade over the official `ts-fsrs` engine** (npm
`ts-fsrs`, **version pinned exact `5.4.2`** — the FSRS-6 generation, 21
parameters, zero-dependency) with a unit-as-memory-item adaptation. Sources:
Ye (2022, KDD '22) for the FSRS lineage; the algorithm spec and default **21
parameters** from the
[awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm).
The split of responsibilities is deliberate and thesis-defensible:

```
Kanjichō  quiz (15 soal) → score
   │
   ├── score → rating adapter      ← Kanjichō contribution (below)
   ├── unit state ↔ Card mapping   ← Kanjichō contribution
   └── scheduler policies          ← MAX_INTERVAL 365, learning_steps [], relearning "6h"
   │
   ▼
 ts-fsrs 5.4.2 (w + version pinned)  ← the official FSRS-6 engine
   │
   ▼
 next review (S, D, due)
```

The 21 FSRS-6 default weights are pinned **explicitly** in `srs.js`
(`FSRS6_WEIGHTS`) and verified against the library's effective parameters at
module load (`assertWeights` — a silent semantic drift from a library update
fails loudly instead of changing schedules). Equivalence with the previous
hand-written engine is proven by a **differential test**
(`scripts/differential_tsfsrs.mjs` vs the frozen manual engine in
`scripts/srs_oracle.mjs`): 2,600 forced-rating update cases match to 1e-6,
same-day rules are identical, migrated states keep their `nextReviewAt`
**exactly**, and 3,200 simulated continuation steps drift only by day
rounding (p50 0.53d, p95 2.0d). Report:
`download/tsfsrs-differential-report.json`.

A first-time unit quiz always lands on a **fixed starting interval** (the
absolute anchor of the adapter has no model expectation to compare
against): ≤80% → 1 day, 87–99% → 2 days, 100% → 8 days — so two units
with different first scores can share the same review date, and the app
explains this in the Help overlay's Quiz section (t78: the result-screen
note was removed at the user's request to keep results clean). Adaptation
begins with the
second review (1 → 5 → 13 days… for good results). The per-score table
is verified by `scripts/t74_srs_first_schedule.mjs`.

```
R(t, S) = (1 + FACTOR · t/S) ^ -w20        # forgetting curve, decay TRAINED from data
FACTOR   = 0.9^(1/-w20) - 1                # chosen so R(S, S) = 0.90 exactly
I(r, S)  = (S / FACTOR) · (r ^ -1/w20 - 1) # interval at target retention r
```

With the FSRS-6 defaults `w20 = 0.1542`, `FACTOR ≈ 0.9803`; at the default
0.9 target the interval still equals `S` exactly. The curve is flatter than
FSRS-4.5's fixed `-0.5` decay — overdue units lose retention more slowly,
and the shape was fitted on a much larger review dataset.

Each unit's memory is two variables: `stability` (days until predicted
retention drops to 90%) and `difficulty` (1–10, updated with linear damping
+ mean reversion per FSRS-5/6). Successful reviews grow `S` (with hard
penalty / easy bonus and a spacing effect via retrievability at review
time); a lapse applies the post-lapse formula (capped at `S/e^(w17·w18)`)
and bumps the `lapses` counter. **Same-calendar-day re-reviews** use
FSRS-6's short-term rule `S' = S·e^(w17·(G-3+w18))·S^-w19` with
`SInc ≥ 1` for Hard/Good/Easy. All of that is computed by the official
ts-fsrs engine; Kanjichō only maps its `Card` in/out of the unit state
(persisted in IndexedDB via `storage.js`, plus two optional fields:
`fsrsState` 0–3 and `learningSteps`).

Engine scheduling semantics accepted as-is (documented because they differ
from the previous hand-written engine — see the differential report):
intervals are **whole days** (`round(S)`, min 1 day; the old engine allowed
fractional-day intervals), elapsed time is quantized to **UTC calendar
days** (for UTC+5..+10 study hours this equals the local calendar day), and
a lapsed active unit enters the **Relearning loop**: due again after a
`"6h"` step, graduating back to day-scheduling on a Good/Easy re-quiz
(Kanjichō sets the step to 6h instead of the ts-fsrs default 10m because a
15-question unit quiz is not a cheap card flip; the 6-hour cadence also
continues the old engine's ≈5h same-day remedial rhythm). New units have no
learning steps at all — the first quiz writes `S0(G)` and schedules at day
granularity directly. Escaping the relearn loop under the binomial adapter
at R≈1 demands a near-perfect re-quiz (14/15 grades Hard and stays in the
loop) — "practice until perfect" is the intended remedial bar, and the
loop degrades gracefully if ignored until the next day.

**Score → rating adapter** (the Kanjichō-specific part, not FSRS itself):
instead of Anki's manual Again/Hard/Good/Easy buttons, the quiz score is
graded **relative to the scheduler's own prediction** — a 15-question quiz
is treated as 15 Bernoulli trials on the unit's memory:

```
μ = 15·R,  σ = √(15·R·(1-R)),  z = (correct − μ)/σ

score = 100%                                 → Easy  (perfect run — the quiz's only maximal evidence)
score ≤ 30%                                  → Again (catastrophic safety net, ~never reached in normal operation)
z ≤ −2 and score ≤ 80%                       → Again (far below expectation)
z ≥ +2.5 and score ≥ 13/15                   → Easy  (far above expectation)
z < −0.5                                     → Hard
otherwise                                    → Good
```

The 60% absolute floor of the first FSRS-6 implementation was **removed**:
9/15 after a long unscheduled gap (R ≈ 0.3) is *positive* evidence about the
unit's memory, not a lapse — forcing Again on it contradicts the adapter's
own relative philosophy. Only two absolute bookends remain (perfect → Easy,
catastrophic ≤30% → Again). First quizzes (no prior state) use an absolute
anchor: ≤60% Again · ≤80% Hard · <100% Good · 100% Easy.

The timing evidence ("survived 20 days" vs "reviewed tomorrow") does NOT go
through the adapter — it enters via retrievability `R` in the update
formulas. The adapter only carries the surprise signal. Under a calibrated
scheduler this yields an Anki-like rating distribution (≈ 61% Good, 21%
Easy, 13% Hard, 5% Again); a raw-percentage table (≥0.9 Easy · ≥0.7 Good ·
≥0.5 Hard) instead grades ~55% of reviews as Easy and almost never triggers
Again before retention has already collapsed — the miscalibration this
adapter fixes. Four adapter modes ship in `srs.js`
(`SCORE_RATING_ADAPTER`: `binomial` default, `continuous` a smooth
z → grade mapping, `absolute` corrected lookup, `naive` the raw-percentage
baseline) as ablation conditions for the thesis experiment, and `reviewUnit`
also accepts a custom `(score, R, n) => rating` function for further
ablations. Each attempt log row records the derived `rating` alongside
S/D, ready for future per-user parameter optimization.

**Adapter experiment** (`scripts/experiment_adapters.mjs`, re-run on the final
ts-fsrs engine — same scheduler the app ships): 24,000 simulated 180-day unit
histories — 4 adapters × 4 user scenarios × 2 ground-truth forgetting rates ×
600 seeds — plus a full cross-scenario slope sweep for the continuous mode
(`scripts/experiment_slope_full.mjs`, 19,200 histories, block-SEM error bars).
The truth simulator is a per-kanji memory model that
deliberately violates the adapter's Bernoulli-iid assumption (heterogeneous
kanji difficulty, correlated within-quiz errors, harsh forget-resets).
Results, averaged across scenarios (`fast/slow` = the two truth conditions):

| Adapter                     | MAE            | Retention  | Reviews/180d | Heavy failures (≤60%) |
|-----------------------------|----------------|------------|--------------|------------------------|
| **C binomial** (default)    | **0.158/0.133**| **76%/81%**| 98/39        | **24%/16%**            |
| B absolute                  | 0.192/0.160    | 71%/77%    | 84/29        | 29%/20%                |
| D continuous                | 0.236/0.192    | 67%/73%    | 62/21        | 42%/32%                |
| A naive (baseline)          | 0.277/0.215    | 62%/71%    | 60/17        | 56%/38%                |

The binomial adapter wins calibration in **4/4 scenarios under BOTH truth
conditions** — winning in both the "model overconfident" and "model
underconfident" worlds is evidence of genuine self-correction rather than a
punishment bias — and it achieves the highest retention with the fewest heavy
failures, at the price of more reviews (reviews are how it pays for
retention). The ranking is identical to the pre-swap run on the manual
engine, so the adapter conclusion is not an artifact of either
implementation. Rating distributions now include the Relearning loop (the
simulator reviews at the 6h remedial mark; a real user who waits until the
next day auto-graduates the step — see the differential test), which shifts
binomial's Again share upward in harsh scenarios.

**Slope sweep, the honest nuance** (`scripts/experiment_slope_full.mjs`):
the earlier claim "no continuous slope beats the discrete bands" does not
survive the full sweep. At slope 1.0 — where rounding the continuous grade
effectively degenerates it into *symmetric* z-bands (±0.5 / ±1.5) — it edges
out binomial in 8/8 scenario × truth cells (ΔMAE ≤ 0.011, typically 3–4σ by
block-SEM) at essentially the same review load. That is not dominance; it
locates the real value of the design: *evaluating the score relative to the
model's prediction R* (both binomial and continuous do this; naive/absolute
don't), while the band shape is a small calibration-vs-safety trade.
Binomial stays the default because its asymmetric guards are deliberate
safety rails: Easy requires proof (z ≥ 2.5 **and** ≥13/15) so one lucky quiz
cannot inflate intervals (the SM-2 failure mode), and Again requires
corroboration (z ≤ −2 or a catastrophic ≤30%) so one bad day cannot force a
lapse cycle. The strongest challenger (symmetric bands at ±0.5/±1.5) is
documented for future validation on real user logs — every attempt row
already records score, rating and S/D. Caveat: the simulator does
not model Weak Kanji remedial drills, so absolute workload numbers are
pessimistic for units with stuck hard kanji; the cross-adapter comparison
stays fair (identical truth for all conditions). Charts:
`download/kanjicho-adapter-exp-*.png`; raw numbers:
`download/adapter-experiment-results.json` and
`download/slope-sweep-results.json`.

**Early reviews** are naturally small: the long-term growth term
`(e^(w10·(1-R)) - 1)` is ~0 when R is still ~1, and same-day re-reviews use
the converging short-term rule instead. The UI doesn't offer early SRS
reviews at all — opening a not-yet-due unit is a free practice session that
writes nothing — so this stays purely as a defensive property of the
scheduler. Intentional simplifications vs reference FSRS: default parameters
without per-user optimization, no interval fuzz/load balancing
(deterministic schedules), and the **scheduled interval** is capped at 365
days (`MAX_INTERVAL` → ts-fsrs' `maximum_interval`; the memory state `S`
itself is unbounded).

**Why FSRS-6?** The long-term D/S/R machinery is shared across FSRS
versions; what FSRS-5/6 add is same-day (short-term) modeling and a decay
fitted on the largest benchmark dataset. Kanjichō picks FSRS-6 because
its weak-unit flow (lapse → Relearning step → same-day redeem) is exactly
the domain FSRS-6's short-term parameters were built for, and because
newer defaults are calibrated on a bigger, more diverse review corpus.
Running the engine through the official `ts-fsrs` package (version + weights
pinned, adapter and unit-level scheduling kept as Kanjichō code) keeps the
thesis claim clean: the FSRS core is the reference implementation, and the
research contribution is the unit-level mapping, the score→rating adapter,
and its empirical evaluation. The adapter experiment runs on the *same*
engine as production, so simulation conclusions transfer to app behavior.
FSRS-4.5 / legacy states migrate losslessly (S and D keep their definitions;
running schedules don't jump — proven exactly in the differential test).

**Quiz modes** (derived from the unit's status in `startUnit()`, never chosen
by the user): a **new** or **due** unit runs an `srs` session (updates unit
SRS + per-kanji stats + streak — the only thing that moves progress); a
**scheduled/mastered** unit runs a `practice` session (updates nothing, no
badge in the UI; the result screen shows the unit's current next-review
date with an explicit "schedule unchanged" note); `weak` sessions re-quiz
missed kanji (updates per-kanji stats + streak, never unit SRS). Per-kanji
stats live in the `kanjiStats` table: `wrongCount`, `correctCount`,
`correctSinceWrong`, `lastWrongAt`. A kanji is missed while `wrongCount > 0`
and `correctSinceWrong < 1` — i.e. ONE correct answer since the last miss
clears it. Missed review is offered per unit (the ✕-count badge on
the unit card) and covers all of that unit's missed kanji.

## Quiz algorithm

`quizGenerator.js` (pure function, no state):

1. For each kanji in the unit, pick a **correct answer** from its primary
   readings (`primary_readings` — the most common on'yomi or kun'yomi,
   filtered to example-backed readings by the data pipeline, so rare
   readings are never asked). Reading choices carry BOTH scripts
   (`{kana, romaji}`); the あ/Aa toggle on the quiz screen only changes
   which one is displayed, live, even mid-quiz. Scoring compares the
   chosen **index**, so the display script can never affect grading.
2. Build **distractors** from other kanji in the same level, excluding the
   target kanji's full readings — in **both kana and romaji** — so no
   distractor is ever a valid reading of the asked kanji, in either
   display script.
3. Shuffle choices; the UI adds a separate "Don't know" button.

For missed-kanji review, `generateWeakQuiz()` applies the same per-question
logic; sessions are scoped to a single unit, so the distractor pool is that
unit's level.

## Browser history / navigation

`useRouter.js` encodes each screen in the URL hash (`#/`, `#/browse`,
`#/level/N5`, `#/quiz/N5-U1`, `#/result/N5-U1`). Forward navigation pushes a
history entry; browser Back/Forward fires `popstate` and restores the screen.
Deep-linking / reload on a quiz/result hash falls back to Unit Select
(in-memory quiz state is lost on reload).

Mobile Back button behaves like a native app (t65):

- **Overlays own a history entry.** Opening a modal (kanji detail in Browse,
  help, review calendar, unit practice/reset confirm dialogs) pushes an extra
  entry that shares the screen's hash; pressing Back while a modal is open
  just closes the modal — the screen underneath does not change. Closing a
  modal via its own UI (✕ / Escape / backdrop / Cancel) consumes that entry
  (`history.back()`), so Back afterwards navigates for real instead of
  hitting a dead entry.
- **"Up" navigation folds entries instead of stacking.** Cancel quiz, Browse
  Home, Unit Select Home collapse one entry (`collapse: 1`); "Back to Units"
  on the result screen folds quiz + result (`collapse: 2`). Back after these
  never resurrects a dead quiz/result screen.
- **Home from the result screen resets to the app root** (`reset: true`), so
  Back exits the app instead of reopening the finished quiz's result.
- Entry depth is tracked in `history.state` (`{ kd: n }`, root = 0) so folds
  never travel past the app's first entry; a leftover overlay entry from a
  programmatic close (e.g. jumping from the calendar straight into a quiz) is
  replaced by the next navigation instead of burying a dead entry.
- The in-progress quiz guard still intercepts Back (confirm dialog); pressing
  Back again while the "Leave this session?" dialog is open dismisses it
  (same close-on-Back behavior as other overlays).

## Progress storage

All progress lives in the browser's IndexedDB via Dexie
(`src/lib/storage.js`), in three tables:
- `unitProgress` — one row per unit (current SRS state, keyed by `unitId`).
- `quizAttempts` — log of every completed graded quiz (for streak stats).
  Free practice (not-due units) logs nothing.
- `kanjiStats` — per-kanji right/wrong tallies powering weak review.

Local per-device only — no sync (would need a backend). Because of that,
the help modal offers **Export / Import progress** (`src/lib/backup.js`):
a full snapshot of the three tables (plus the two localStorage display
settings) as one versioned JSON file. Import is replace-all behind a
confirmation dialog; the backup format carries a version number with a
step-by-step migration chain, so backups made by older app versions keep
importing after the storage format changes.

## Progressive Web App

Configured via `vite-plugin-pwa`:
- Installable to the home screen (Android/iOS/desktop).
- Runs offline after first load (all data + assets precached).
- Auto-updates the service worker on new deploys.

### Fonts are self-hosted (zero third-party requests)

`public/fonts/` holds 854 subset woff2 files (16.2 MB on disk; browsers
fetch only the unicode-range subsets they actually render) for Shippori
Mincho, Zen Kaku Gothic New, and DM Mono — all **SIL Open Font License
1.1**, regenerated by `python scripts/fetch_fonts.py` into
`src/styles/fonts.css`. There is **no `<link>` to fonts.googleapis.com**:
every request the app ever makes stays on its own origin, which is what
makes the privacy policy's "no data collected / no data shared" honest
(Google Play Data Safety). The woff2 subsets are deliberately **not**
precached — with unicode-range, the browser only downloads the subsets
needed for the glyphs actually shown; used subsets are cached by the
service worker (CacheFirst, `app-fonts-cache`) and stay available offline.

Test PWA features with `npm run build && npm run preview` (PWA behavior is
limited in `npm run dev`).

## Privacy & Google Play readiness

The app is a zero-collection, no-account, offline-first PWA, and ships with
the paperwork that Play submission needs:

- **`public/privacy-policy.html`** — standalone policy page served from the
  same origin as the app (linked from Help → "Privacy policy"); fill in the
  developer name / email / country placeholders marked in the page before
  submitting. Play Console requires a privacy policy URL for **every** app.
- **`NOTICE.md`** (repo root) — data licensing map, font licensing, npm
  licenses, trademark note.
- **Open data repository** — the exact `src/data/` files are published at
  [Zyxcid/kanjicho-data](https://github.com/Zyxcid/kanjicho-data) under the
  same licences (CC BY-SA 4.0 / CC BY-SA 3.0), which satisfies the
  ShareAlike obligations of KANJIDIC2, JMdict, and KanjiVG while the app
  code stays proprietary. Sync it whenever `src/data/` changes.
- **JLPT trademark disclaimer** — shown in Help ("not affiliated with…
  JEES or the organizers of the JLPT").
- **Frequency signal licensing** — the Jiten global list is CC BY-SA 4.0
  (build-time signal; no frequency values ship in `src/data/`), credited in
  Help → Data sources, the privacy policy, and the data repo NOTICE.

Still on you before release: host the app + policy on your domain, push
`kanjicho-data` to GitHub, review the filled privacy policy contact
section, and (when the time comes) implement purchases exclusively via
Google Play Billing — including for a TWA-wrapped PWA — and never paywall
the CC BY-SA data itself (features only).

### Notifications (or lack thereof)

There is **no push notification system** — no background reminders, no OS
notifications when a review becomes due while the app is closed. This is a
frontend-only PWA with no backend, and real push notifications need a server
to trigger them (or the still-experimental Notification Triggers API,
Chromium-only, not a broad standard yet).

What *is* implemented: the app icon shows a badge with the current "due"
count via the [Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API)
(`navigator.setAppBadge()`), for installed PWAs on browsers that support it
(Chromium-based; not Safari/iOS). This only updates **while the app is open**
— it reflects the due count as of the last time it ran, not a live
background count. All "you have N due" signals (the badge, the Home stats,
`NextReviewBanner`) are pull-based: you have to open the app to see them.
