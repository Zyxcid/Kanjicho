# Kanjichō (漢字帳) — JLPT Kanji Practice PWA

A JLPT kanji practice app (N5–N1) with a forgetting-curve-based spaced
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
- **Free practice on non-due units** — scheduled units appear slightly
  **dimmed** in the unit list. Clicking one shows a short confirm ("practice
  won't change your review schedule") and then runs freely — nothing
  is written: no schedule, streak or stats changes. The result screen
  still shows the unit's next review date, with a small "schedule
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
  a compact **✕-icon badge with the missed count** next to the unit title
  (hover for an explanation); the quiz
  covers ALL of that unit's missed kanji (no artificial cap). A kanji
  leaves the missed list after ONE correct answer — the result screen
  shows how many are still missed ("N kanji missed"). Missed sessions
  update kanji stats (and the streak) but never unit schedules, and "Back
  to Units" returns to the level the session started from.
- **Spaced repetition** — a decay-based forgetting curve schedules each unit's
  next review (see `src/lib/srs.js`). Home shows studied / due / mastered counts
  and a "next review in N days" banner. Only reviews of due units (and
  first-time quizzes) touch the schedule — opening a not-yet-due unit is a
  free practice session that writes nothing, so mastery can't be rushed by repetition.
  (The scheduler also dampens early reviews — growth bonus scaled by elapsed
  time — as a defensive measure.)
- **Per-level progress reset** — a quiet "Reset progress" action at the
  right of the "{level} Units" title deletes that level's SRS schedule,
  quiz history, and missed-kanji stats in one IndexedDB transaction
  (confirmation dialog first; streak contributions from that level's
  quizzes disappear with the history). Other levels are untouched — the
  escape hatch for cleaning up after trying a level above your current
  one. Destructive and rarely needed, so it is **opt-in**: the toggle
  lives in the help modal's Progress section ("Show \"Reset progress\"
  buttons", persisted in localStorage, included in backups). The button
  only appears when the toggle is on and the level has progress.
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
  pills, live search, and a detail modal (readings, romaji, strokes, examples).
- **Dark mode** — a Sun/Moon toggle; persists to `localStorage`.
- **Daily streak** — a flame + number on Home (no label text; gold border
  when today's quiz is done, red when the streak is at risk). Hover for the
  full status in a tooltip.
- **Progress backup** — Export/Import progress buttons in the help modal
  (`src/lib/backup.js`): a full snapshot of the three IndexedDB tables plus
  the two localStorage settings, saved as one versioned JSON file. Import
  replaces all current progress (after a confirmation dialog) — the only
  way to survive clearing site data or move progress to another
  device/browser.
- **History-aware navigation** — the browser Back button navigates within the
  app (Home ↔ Browse ↔ Unit Select ↔ Quiz ↔ Result) instead of exiting.
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
    srs.js                  spaced-repetition engine (pure function)
    storage.js               IndexedDB persistence via Dexie (the only storage module)
    useTheme.js              light/dark theme hook (localStorage)
    useRouter.js             hash-based router (browser Back/Forward support)
    kana.js                  kana → romaji Hepburn converter (JS port of the pipeline's, powers the romaji display)
  components/
    Home.jsx                stats hero + next-review banner + weak-review & browse entries + level grid
    UnitSelect.jsx           per-level unit cards (dimmed = free practice) + weak review entry
    Quiz.jsx                 quiz screen (kanji box + choices + reveal panel + weak-review badge)
    Readings.jsx             shared On/Kun rendering with primary bolding, kana or romaji
    Result.jsx               score stamp + breakdown + mode-aware next-review panel
    Browse.jsx               full kanji library (filter pills, search, modal)
    NextReviewBanner.jsx     "next review in N days / N due" banner
    ThemeToggle.jsx          Sun/Moon dark-mode switch
    Toast.jsx                transient message
  data/
    manifest.json                    unit ids + kanji counts per level (small, loaded upfront)
    n5.json ... n1.json               full kanji entries per level (loaded on demand)
    n5_examples.json ... n1_examples.json   example words per kanji (loaded on demand)
  styles/
    global.css               genkouyoushi design system (light + dark tokens)

public/
  icons/                    PWA icons (192, 512, maskable)

vite.config.js              Vite + PWA config (manifest + service worker)

scripts/
  convert_kanji.py          Step 1: kanjidic2.xml.gz → n*.json (kanji data)
  rerank_readings.py        Step 2: rank primary_romaji (pipeline-internal
                            working list) by BCCWJ word frequency
  build_examples.py         Step 3: JMdict + BCCWJ → n*_examples.json; also
                            filters the primaries to example-backed readings
                            and writes them as `primary_readings`
                            (kana + romaji + type) — the only primary field
                            in the final data
  build_manifest.py         Step 4: generate manifest.json (level summaries for Home)
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
frequency (looking at every word containing the kanji, e.g. 時代, 代わり,
世代 for 代). The most frequent on'yomi and kun'yomi win. This aggregates
frequency across ALL BCCWJ words using each reading, so it correctly
identifies the common readings (e.g. 十 → `too`, not the rare `so`).
`primary_romaji` — a plain romaji list of the same information — exists only
as the pipeline's internal working field (seeded by convert_kanji.py, ranked
by rerank_readings.py); `build_examples.py` drops it from the final files
because each `primary_readings` item already carries the romaji.

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

> Raw sources are **not** included in the project — download them when
> running the pipeline. In particular, grab the two Bluskyo JSON files:
> `JLPT_kanji_ALL.json` from the releases page and `JLPT_vocab_ALL.json`
> from `data/vocab/results/`. The committed `src/data/n*.json` already has
> correct JLPT levels baked in, so you only need these files when
> regenerating from raw sources.

### Pipeline

```
kanjidic2.xml.gz  ─┐
                    ├─→ convert_kanji.py  ──→ n5.json ... n1.json
JLPT_kanji_ALL.json  ─┘                      (kanji entries, units, readings)

n*.json           ─┐
BCCWJ TSV         ─┴─→ rerank_readings.py ──→ n*.json (primary_romaji working list:
                                           frequency-ranked default)

n*.json           ─┐
JMdict_e.gz       ─┼─→ build_examples.py ──→ n*_examples.json (example words per kanji)
BCCWJ TSV         ─┤   │                    + n*.json updated (primaries filtered to
JLPT_vocab_ALL.json ┘   └→                     example-backed readings, written as
                                                primary_readings {kana, romaji, type};
                                                the primary_romaji working field is
                                                dropped from the final files)

n*.json           ───→ build_manifest.py    ──→ manifest.json
                           (small summary: totals + unit ids for Home)
```

```bash
python scripts/convert_kanji.py kanjidic2.xml.gz output JLPT_kanji_ALL.json
python scripts/rerank_readings.py BCCWJ_frequencylist_luw2_ver1_0.tsv output
# JLPT_vocab_ALL.json is required — auto-detected next to JMdict_e.gz
# (or pass it explicitly as a 5th arg); build_examples.py errors out if
# it can't be found
python scripts/build_examples.py JMdict_e.gz BCCWJ_frequencylist_luw2_ver1_0.tsv output output
python scripts/build_manifest.py output

# then copy the files the app actually imports into src/data/
# (all_kanji.json is a convert-stage intermediate — the app doesn't use it)
cp output/n[1-5].json output/n[1-5]_examples.json output/manifest.json src/data/
```

All scripts take paths as CLI args (with sensible defaults relative to the
project root). Run `python scripts/<script>.py` with no args for usage.

## Spaced repetition model

`srs.js` uses a forgetting-curve model:

```
retention(t) = target_retention ^ (t / stability)
```

`stability` = days until retention drops to the target (default 85%). On each
quiz, stability is updated from the score (0–1): high scores extend the
interval, low scores reset it (`reviewUnit()`). `next_review_at =
last_reviewed_at + stability days`. Pure function — all state lives in
IndexedDB via `storage.js`.

**Early-review dampening:** when a unit is re-taken long before its
schedule (elapsed < 50% of the current stability), the growth bonus is
scaled down proportionally — an instant perfect re-take leaves stability
almost unchanged, a review at/after half the interval gets the full bonus.
Penalties (score < 0.5) are never dampened. The UI no longer offers early
SRS reviews at all — opening a not-yet-due unit is a free practice session
that writes nothing — so this stays purely as a defensive property of the scheduler
(and keeps the "grind one unit until Mastered" loophole closed).

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
