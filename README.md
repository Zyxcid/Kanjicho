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

- **JLPT practice (N5–N1)** — multiple-choice reading quizzes, one unit at a time.
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
- **Kanji components (形声 analysis)** — under the stroke animation, the
  kanji is shown as a **component equation** (時 = 日 + 寺, 寺 further split
  into 土・寸) extracted from KanjiVG's `kvg:element` structure
  (1,972 / 2,211 kanji have a decomposition; simple kanji like 食・雨
  show no equation). Each chip shows the component's glyph, meaning and
  (in the Browse modal) its stroke range in the parent kanji; an indigo
  dot marks the **semantic radical** (meaning carrier) and a "phon" label
  the **phonetic component** (reading hint — 寺 gives 時 its ジ). The
  chips light up in sync with the stroke animation (the component being
  drawn gets an indigo ring, drawn components fill in, undrawn ones stay
  dim), and in the Browse library **clicking a chip opens that kanji's
  own detail entry** — follow the structure down the rabbit hole. In the
  quiz, the equation appears under the kanji box after reveal (compact,
  non-clickable so the session keeps focus).
  Data: `components_n*.json` (~250 KB, code-split per level) built by
  `scripts/build_components.py` from the same KanjiVG SVGs; every
  component's stroke range is verified to partition the kanji's strokes
  exactly (build fails otherwise).
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
  N due / studied-of-total / Mastered) instead of a static label.
- **Primary readings are the quiz source** — quiz answers come only from each
  kanji's *primary reading*: the most common reading that is backed by a real
  example word (validated by `scripts/build_examples.py`). Primary readings
  are shown **bold** (in kana *and* in romaji mode) in the quiz answer panel,
  and bold in kana in the kanji library, and the help overlay explains this,
  so you don't waste effort memorizing rarely-used readings.
- **Kana / romaji display toggle** — reading answers carry both their kana
  and romaji form; the **あ / Aa** button on the quiz screen switches which
  one is displayed, instantly, even mid-quiz (scoring is index-based, so
  the script choice never affects grading). The preference persists in
  `localStorage`. The toggle governs the **whole quiz screen**: answer
  choices, the On/Kun reading panel after each answer, and the example
  words' readings all switch together. Non-primary readings and example
  readings are romanized at runtime by `src/lib/kana.js` — a faithful JS
  port of the pipeline's Hepburn converter (verified identical on all
  3,531 primary readings). The kanji Library always shows both scripts.
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
- **Keyboard-friendly quiz** — W/E/S/D select an answer, F = "don't know",
  R toggles kana ↔ romaji (works before and after answering), Q triggers
  the back button (Cancel / Home), Enter **or Space** continues to the next
  question. Leaving a quiz with progress first asks for confirmation
  (Enter = leave, Esc = keep studying — for Q and mouse clicks alike). The
  key layout is only shown in the help overlay (as a 2-row
  grid matching the answer grid), so the quiz screen itself stays clean.
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
    useRouter.js             hash-based router (browser Back/Forward support)
    kana.js                  kana → romaji Hepburn converter (JS port of the pipeline's, powers the romaji display)
    useCopy.js               clipboard hook (navigator.clipboard + execCommand fallback, 1.4s "copied" state) powering click-to-copy on the stroke box
    strokes.js              loads KanjiVG stroke-order data per level (code-split dynamic import, in-memory cache)
    components.js           loads KanjiVG component-decomposition data per level (code-split dynamic import, in-memory cache)
  components/
    Home.jsx                next-review banner (the calendar entry) + stat cards panel + browse entry + level grid
    StatCards.jsx           shared panel of three large read-only stat cards (x/total Studied, Due now, Mastered) used by Home and UnitSelect
    UnitSelect.jsx           per-level stat cards + unit cards (dimmed = free practice; "✕ N" missed-review pill next to the title, hidden once the unit is due)
    Quiz.jsx                 quiz screen (kanji box + choices + reveal panel + weak-review badge); the kanji is always shown as the finished KanjiVG SVG — left-click the box to replay the stroke animation inline, right-click to finish it instantly (no detail entry from inside the quiz — that would leak the answer)
    Readings.jsx             shared On/Kun rendering with primary bolding, kana or romaji
    GenkouGlyph.jsx          quiz kanji box as a button: renders the KanjiVG SVG in its finished state on mount (paths lazy-loaded per level); left-click → replays the stroke animation from the first stroke (1× default), right-click → completes it instantly; reports stroke progress up to Quiz via onStrokeChange (component chips sync)
    ComponentBreakdown.jsx   component equation under the KanjiVG box (quiz after reveal = compact static; Browse below StrokePlayer = full: ranges, sub-parts, click-to-open, animation-synced highlight)
    CopyKanji.jsx            transparent <button> covering the Browse stroke box: click = copy the kanji (faint corner copy icon as affordance, inline "Copied 語" pill, keyboard-accessible)
    StrokePlayer.jsx         animated stroke-order player (two-layer SVG: faint guide + drawn ink via stroke-dashoffset; play/pause/replay/step/speed; live "n / N strokes" label under the controls — old kd-stroke-counter merged into it; the stroke box itself is click-to-copy via the CopyKanji overlay)
    Result.jsx               score stamp + breakdown + mode-aware next-review panel
    Browse.jsx               full kanji library (filter pills, search, modal; the modal's stroke box is click-to-copy — see CopyKanji.jsx)
    ReviewCalendar.jsx       shared month calendar + selected-day panel (used by the banner overlay)
    CalendarModal.jsx        review-calendar overlay opened from the review banner: calendar + day panel
    NextReviewBanner.jsx     one-line schedule banner — a clickable calendar entry in ALL states (empty/due/scheduled); click opens the review-calendar overlay
    ThemeToggle.jsx          Sun/Moon dark-mode switch
    Toast.jsx                transient message
  data/
    manifest.json                    unit ids + kanji counts per level (small, loaded upfront)
    n5.json ... n1.json               full kanji entries per level (loaded on demand)
    n5_examples.json ... n1_examples.json   example words per kanji (loaded on demand)
    strokes_n5.json ... strokes_n1.json     KanjiVG stroke-order paths per kanji (loaded on demand, code-split)
    components_n5.json ... components_n1.json  KanjiVG component decomposition per kanji (loaded on demand, code-split)
  styles/
    global.css               genkouyoushi design system (light + dark tokens)

public/
  icons/                    PWA icons (192, 512, maskable)

vite.config.js              Vite + PWA config (manifest + service worker)

scripts/
  convert_kanji.py          Step 1: raw/kanjidic2.xml.gz + raw/JLPT_kanji_ALL.json
                            → n*.json (kanji data, workspace output/)
  rerank_readings.py        Step 2: rank primary_romaji (pipeline-internal
                            working list) by BCCWJ word frequency —
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
  build_examples.py         Step 3: raw/JMdict + BCCWJ + raw/JLPT_vocab_ALL.json
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
                            POS 固有名詞 BCCWJ. THREE stages: filter_entry
                            (loose heuristic, candidates only) →
                            strict_primary_pass (structural verification;
                            gemination = strict evidence, Fix-8) →
                            freq_backing_pass (P2a natural — primary
                            lemah + kandidat ber-backing ketat + freq
                            korpus ≥4× dan ≥2000 → tukar; aturan umum,
                            bukan special case per kanji). RANKING FIXES:
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
  reading_quality_audit.py  AUDIT KUALITAS MENYELURUH v2 (read-only,
                            jalankan kapan saja): atribusi struktural
                            kata↔bacaan (alignment DP — segmentasi
                            on/stem-kun, okurigana, geminasi, rendaku, 々)
                            untuk memeriksa (a) tipe on/kun tiap contoh,
                            (b) backing primary Level A/B/C, (c) frekuensi
                            BCCWJ per bacaan tanpa substring. Taksonomi v2:
                            HIGH hanya berisi kasus intervensi (contoh-
                            salah-tipe / primary-kalah-kuat ≥4× / primary-
                            valid-kurang-contoh), varian morfologis
                            (morfem sama) jadi kategori 🔵 tersendiri,
                            kandidat lemah jadi 🟡 ambigu. Output:
                            output/reading_quality_report.{md,json} + fix
                            plan per kasus HIGH (usulan contoh BCCWJ/JMdict
                            + apa yang dibuktikan contoh salah-tipe)
  build_strokes.py          Step 5: KanjiVG SVGs → strokes_n*.json (stroke
                            paths per kanji, written to output/); verifies
                            every path count against stroke_count (fails on
                            mismatch). Needs the KanjiVG repo checkout in
                            raw/kanjivg-master/ (default) — pass
                            --kanjivg-dir if it lives elsewhere
  build_components.py       Step 5b: KanjiVG SVGs → components_n*.json
                            (dekomposisi komponen per kanji dari struktur
                            kvg:element — glyph/arti/level + rentang
                            goresan + radikal/fonetik + sub-parts,
                            ditulis ke output/); verifikasi: goresan kanji
                            harus terpartisi utuh oleh rentang komponennya
                            (kanji gagal partisi dibuang — UI menyembunyikan
                            section-nya). Sumber sama: raw/kanjivg-master/
```

## Data sources

The JSON files in `src/data/` are a **static, pre-built snapshot** — at
runtime the app makes no network requests for kanji data, everything is
bundled and loaded from disk. Three public datasets feed the build pipeline:

| Source | Provides | Project page |
|---|---|---|
| **KANJIDIC2** | Kanji, on'yomi/kun'yomi, English meanings, stroke count, newspaper frequency | https://www.edrdg.org/wiki/KANJIDIC_Project.html |
| **BCCWJ** (Balanced Corpus of Contemporary Written Japanese) | Word frequency — which readings and example words are actually common | https://clrd.ninjal.ac.jp/bccwj/en/freq-list.html |
| **JMdict** | English glosses for example words | https://www.edrdg.org/jmdict/edict_doc_depr.html |
| **JLPT vocabulary list** | JLPT level (N1–N5) of each example word — same-level-or-easier words are preferred | [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary) (`data/vocab/results/JLPT_vocab_ALL.json`) |
| **KanjiVG** | Stroke-order animation data (SVG stroke paths) for every kanji in the app | https://github.com/KanjiVG/kanjivg (CC BY-SA 3.0) |


| Field in JSON | Built from |
|---|---|
| `kanji`, `stroke_count` | KANJIDIC2 |
| `readings.on`, `readings.kun`, `meanings` | KANJIDIC2 |
| `jlpt_level` | `JLPT_kanji_ALL.json` (see note below) |
| `romaji_readings` | Derived — all readings romanized |
| `primary_readings` | The primary readings as `{kana, romaji, type}` — ranked by BCCWJ frequency, then filtered to readings backed by an example word (see below). The quiz answer pool and the UI bolding both come from this one field |
| `unit`, `order_index` | Pipeline grouping — 15 kanji per unit, ordered by newspaper frequency |
| `examples` | JMdict words containing the kanji, ranked by BCCWJ frequency with a preference for words at the kanji's JLPT level or easier |

**JLPT levels:** KANJIDIC2 only carries the pre-2010 JLPT system (4 levels,
no N5). `JLPT_kanji_ALL.json` maps each kanji to the modern N1–N5 system.
Like every other raw source, it is not included in the project — see the
note under "Required raw sources" below.

**Example words:** for each kanji, `build_examples.py` finds JMdict words
containing it that also appear in the BCCWJ frequency list, cross-verifies
the reading against BCCWJ (to reject archaic/rare alternate readings), and
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

Frequency attribution is also guarded: a BCCWJ frequency is only used when
the BCCWJ reading matches one of the term's JMdict readings (BCCWJ stores
貴方 with the reading あなた, but the kanji entry is 貴方【きほう】 — without
this guard a rare reading would inherit あなた's big frequency), and the
by-reading fallback only accepts the same word (or a spelling variant with
the same kanji sequence, like 現れる/現われる) — otherwise 本盗【ほんとう】
would inherit 本当's frequency.

**Most common readings (`primary_readings`):** ranked by
`rerank_readings.py`, which scores candidate readings by BCCWJ corpus
frequency — but only through **structural attribution** (Fix-5): a
word containing the kanji credits the reading whose segment the DP
alignment proves (looking at every word containing the kanji, e.g.
時代, 代わり, 世代 for 代; 入る【はいる】 credits はい.る, never い.る —
the old substring matching let いる steal 57030 from はいる). The most
frequent on'yomi and kun'yomi win; the dictionary-default seed only
falls when the corpus winner beats it by more than the margin guard.
This aggregates frequency across ALL BCCWJ words using each reading,
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
  stay conservatively `unknown`. Ported identically into
  `reading_quality_audit.py` (producer ↔ verifier invariant).
- Pool rule (Surgery 2, "Tahap B"): a candidate may only enter the
  on-pool or kun-pool of ITS OWN attributed type — 活性化【かっせいか】
  goes to 活's ON pool (かつ, via gemination), never to the kun pool
  of い.かす no matter what its reading happens to contain.
- Dictionary fallback (kept, but attributed): slots the corpus cannot
  fill get JMdict alternate spellings (活かす is the 2nd keb of
  生かす【いかす】; BCCWJ only has the 生 spelling) — same attribution,
  plus an entry-reading gate and an exact-okurigana preference
  (活かす beats 活き for primary い.かす).
- Proper-noun filter: BCCWJ rows with POS 固有名詞 (names of people /
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

The read-only verifier for ALL of this is still
`scripts/reading_quality_audit.py` (it keeps its own independent copy
of the attribution engine — pipeline is producer, audit is verifier):

```bash
python scripts/reading_quality_audit.py   # → output/reading_quality_report.{md,json}
```

It reports per kanji: mislabeled examples, primary backing level
(A strict / B loose / C unbacked), BCCWJ frequency re-attributed
per reading (no substring credit-stealing), a **decision taxonomy**
per primary and a fix plan for every HIGH case (candidate replacement
examples from BCCWJ — proper nouns filtered, JMdict glosses attached,
plus a dictionary-source fallback when the corpus has no common word,
e.g. いかす is normally spelled 生かす so 活かす only exists in JMdict).

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
| `BCCWJ_frequencylist_luw2_ver1_0.tsv` | https://clrd.ninjal.ac.jp/bccwj/en/freq-list.html ("Long Unit Word list data (v2)") |
| `JLPT_kanji_ALL.json` | [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary/releases) — modern N1–N5 levels |
| `JLPT_vocab_ALL.json` | [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary) — `data/vocab/results/JLPT_vocab_ALL.json` (vocabulary levels; required — `build_examples.py` exits with an error when it's missing, rather than silently falling back to frequency-only ranking) |
| KanjiVG `kanji/` SVGs | https://github.com/KanjiVG/kanjivg (clone or download ZIP; only needed for `build_strokes.py`) |

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
raw/BCCWJ TSV     ─┴─→ rerank_readings.py ──→ n*.json (primary_romaji working list:
                                           frequency-ranked default)

n*.json               ─┐
raw/JMdict_e.gz       ─┼─→ build_examples.py ──→ n*_examples.json (example words per kanji,
raw/BCCWJ TSV         ─┤   │                    type per structural attribution)
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
```

```bash
python scripts/convert_kanji.py raw/kanjidic2.xml.gz output raw/JLPT_kanji_ALL.json
# 3rd arg (optional, default raw/kanjidic2.xml.gz) = candidate table
# for Fix-5 DP attribution credit — omit it and the step falls back
# to the legacy substring matching with a warning
python scripts/rerank_readings.py raw/BCCWJ_frequencylist_luw2_ver1_0.tsv output raw/kanjidic2.xml.gz
# JLPT vocab levels are passed EXPLICITLY as the 5th arg — same
# convention as JLPT_kanji_ALL.json above (no auto-detect);
# build_examples.py fails fast if the file is missing
python scripts/build_examples.py raw/JMdict_e.gz raw/BCCWJ_frequencylist_luw2_ver1_0.tsv output output raw/JLPT_vocab_ALL.json raw/kanjidic2.xml.gz
python scripts/build_manifest.py output

# stroke-order data (KanjiVG): clone/download the repo into raw/ first
# (the default expects raw/kanjivg-master/)
python scripts/build_strokes.py

# promote: everything the app imports goes from output/ into src/data/
# in ONE copy. Steps 1–5 all read & write output/ (the build workspace),
# so you can wipe src/data/ and rebuild from raw sources; src/data/ is
# only ever written by this cp (all_kanji.json is a convert-stage
# intermediate the app never imports)
cp output/n[1-5].json output/n[1-5]_examples.json output/manifest.json output/strokes_n[1-5].json src/data/

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

Test PWA features with `npm run build && npm run preview` (PWA behavior is
limited in `npm run dev`).

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
