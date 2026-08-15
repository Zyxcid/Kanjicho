# Kanji Drill — JLPT Kanji Practice PWA

A JLPT kanji practice app (N5–N1) with a forgetting-curve-based spaced
repetition scheduler, a reading/meaning quiz, a full kanji library, light &
dark themes, and proper browser back-button navigation. Works fully offline as
an installable PWA.

## Run the app

```bash
npm install
npm run dev       # dev server → http://localhost:5173
npm run build     # production build → dist/
npm run preview   # preview the production build locally
```

## Features

- **JLPT drill (N5–N1)** — multiple-choice reading quizzes, one unit at a time.
- **Spaced repetition** — a decay-based forgetting curve schedules each unit's
  next review (see `src/lib/srs.js`). Home shows studied / due / mastered counts
  and a "next review in N days" banner.
- **Per-level progress badges** — each level card shows live status (New /
  N due / studied-of-total / Mastered) instead of a static label.
- **Kanji Library** — browse all 2,211 kanji across every level with filter
  pills, live search, and a detail modal (readings, romaji, strokes, examples).
- **Dark mode** — a Sun/Moon toggle; persists to `localStorage`.
- **History-aware navigation** — the browser Back button navigates within the
  app (Home ↔ Browse ↔ Unit Select ↔ Quiz ↔ Result) instead of exiting.
- **Offline PWA** — installable, caches all data + assets, auto-updates.

## Project structure

```
src/
  main.jsx                 entry point
  App.jsx                  state machine + router wiring + SRS flow
  lib/
    dataLoader.js          loads JSON, merges examples, re-derives primary_romaji
    quizGenerator.js       generates multiple-choice questions (pure function)
    srs.js                 spaced-repetition engine (pure function)
    storage.js             IndexedDB persistence via Dexie (the only storage module)
    useTheme.js            light/dark theme hook (localStorage)
    useRouter.js           hash-based router (browser Back/Forward support)
  components/
    Home.jsx               stats hero + next-review banner + level grid + browse entry
    UnitSelect.jsx         per-level unit cards
    Quiz.jsx               quiz screen (kanji box + choices + reveal panel)
    Result.jsx             score stamp + breakdown + next-review schedule
    Browse.jsx             full kanji library (filter pills, search, modal)
    NextReviewBanner.jsx   "next review in N days / N due" banner
    ThemeToggle.jsx        Sun/Moon dark-mode switch
    Toast.jsx              transient message
  data/
    n5.json ... n1.json              kanji entries per JLPT level
    n5_examples.json ... n1_examples.json  example words per kanji
  styles/
    global.css             genkouyoushi design system (light + dark tokens)

public/
  icons/                   PWA icons (192, 512, maskable)

vite.config.js             Vite + PWA config (manifest + service worker)
```

## Data sources

The 10 JSON files in `src/data/` are a **static, pre-built snapshot**. At
runtime the app makes **no network requests** for kanji data — everything is
bundled. Three public datasets contributed to the snapshot (via the build
pipeline described below):

| Field in JSON | Source | What it is |
|---------------|--------|------------|
| `kanji`, `jlpt_level`, `stroke_count` | **KANJIDIC2** (via kanjiapi.dev) | The kanji, its JLPT level, stroke count |
| `readings.on`, `readings.kun` | **KANJIDIC2** | On'yomi and kun'yomi as kana, in frequency order (most common first) |
| `meanings` | **KANJIDIC2** | English meanings |
| `romaji_readings` | Derived (kana→romaji) | All readings romanized |
| `primary_romaji` | Derived — **overridden at runtime** (see below) | Originally a pipeline heuristic; now re-derived in `dataLoader.js` |
| `unit`, `order_index` | Pipeline grouping | Kanji grouped into units of 15, ordered by Mainichi newspaper frequency |
| `examples` (merged from `*_examples.json`) | **JMdict** (words) + **BCCWJ** (frequency) | Real example words using the kanji, ranked by corpus frequency |

### Where "most common reading" comes from

Two layers:

1. **KANJIDIC2 reading order (what the app relies on)** — KANJIDIC2 lists each
   kanji's readings with the most common/important first. So `readings.on[0]`
   is the common on'yomi and `readings.kun[0]` is the common kun'yomi. No
   separate frequency file is needed for this.
2. **BCCWJ corpus frequency (used by the pipeline, for examples)** — ranks
   which real *words* are most common, so example words aren't obscure.

### Why `primary_romaji` is overridden at runtime

The pipeline pre-computed a `primary_romaji` field using a heuristic that
turned out to be unreliable — it often dropped the kun'yomi (e.g. 言 had
`["gen","gon"]` but was missing `iu`, its most common reading). Rather than
regenerate the JSON, `dataLoader.js` now **re-derives** it at load time:

```
primary_romaji = [ romaji(readings.on[0]), romaji(readings.kun[0]) ]
```

i.e. the most common on'yomi **and** the most common kun'yomi. The quiz
accepts either as a correct answer. (See `derivePrimaryRomaji()` in
`dataLoader.js`.)

## Data build pipeline (regenerating the JSON)

The pipeline scripts live **outside** this project (they're build-time tools).
To regenerate the data, place them alongside the raw sources and run:

```
convert_kanji.py   →  output/n5.json ... n1.json, all_kanji.json
build_examples.py  →  output/n5_examples.json ... (per level)
```

Then copy the `output/*.json` files into `src/data/`.

### Required inputs (raw sources)

| File | Used by | What it is |
|------|---------|------------|
| `kanji_jlpt_only.json` | `convert_kanji.py` | kanjiapi.dev export: kanji + JLPT level + readings + meanings + stroke count + Mainichi freq |
| `term_meta_bank_1.json` | both scripts | Yomichan-format BCCWJ frequency bank: `[term, tag, {reading, frequency}]` |
| `jmdict_legacy/term_bank_*.json` | `build_examples.py` | Yomichan-format JMdict (52 bank files): Japanese→English dictionary entries |
| `overrides.json` (optional) | `convert_kanji.py` | Manual `primary_romaji` corrections: `{ "言": ["gen","iu"], ... }` |

### `convert_kanji.py` — how it works

1. Loads `kanji_jlpt_only.json` and groups kanji by JLPT level.
2. **Sorts each level** by `freq_mainichi_shinun` (newspaper frequency), then
   stroke count, then the kanji itself — so common kanji are taught first.
3. **Groups into units of 15** (`UNIT_SIZE`), giving each a `{level}-U{n}` id.
4. For each kanji, builds `romaji_readings` (all readings, romanized via
   `pykakasi`) and `primary_romaji` (the "common readings" set — see the
   priority below).
5. Writes one JSON per level + an `all_kanji.json` combined file.

`primary_romaji` priority (in `determine_primary_romaji()`):
1. **`overrides.json`** — if the kanji has a manual correction, use it.
2. **BCCWJ corpus** — if the kanji appears as a single-character word in the
   corpus, rank its readings by real-world frequency and take the top 2.
3. **Fallback** — `on_readings[0]` + `kun_readings[0]` (KANJIDIC2's order).

It also prints a per-level summary: how many kanji came from each source
(override / corpus / fallback).

### `build_examples.py` — how it works

For each kanji (currently N5), it finds up to 2 example words:

1. Loads all JMdict `term_bank_*.json` files, keeping words of length 1–4 with
   at least one English gloss.
2. Loads the BCCWJ frequency index (all word lengths this time).
3. For each kanji, finds JMdict words **containing** that kanji **and** present
   in the BCCWJ frequency index.
4. **Cross-verifies the reading** — the word's JMdict reading must match the
   BCCWJ reading (so an archaic/rare reading of a common word is rejected).
5. **Classifies as on or kun** by checking whether the word's reading contains
   one of the kanji's real on'yomi or kun'yomi (not just by word shape — this
   correctly handles cases like 母 = はは, a single-kanji kun'yomi word).
6. Prefers multi-character words over single-kanji words (showing just "日" as
   an example for 日 feels circular), then sorts by frequency.
7. Picks the top on'yomi word + top kun'yomi word (filling the second slot
   from either category if one is empty).
8. Writes `{ kanji: [{word, reading, meaning, type}, ...] }` per level.

## Spaced repetition model

`srs.js` uses a forgetting-curve model:

```
retention(t) = target_retention ^ (t / stability)
```

`stability` = days until retention drops to the target (default 85%). On each
quiz, stability is updated from the score (0–1): high scores extend the
interval, low scores reset it (`reviewUnit()`). `next_review_at =
last_reviewed_at + stability days`. This is a pure function — all state lives
in IndexedDB via `storage.js`.

## Quiz algorithm

`quizGenerator.js` (pure function, no state):

1. For each kanji in the unit, pick a **correct answer** from `primary_romaji`
   (so it's either the most common on'yomi or kun'yomi).
2. Build **distractors** from other kanji in the same level, **excluding** the
   target kanji's full `romaji_readings` — so no distractor is ever a valid
   reading of the asked kanji (prevents "right answer marked wrong").
3. Shuffle choices; the UI adds a separate "Don't know" button.

## Browser history / navigation

`useRouter.js` encodes each screen in the URL hash (`#/`, `#/browse`,
`#/level/N5`, `#/quiz/N5-U1`, `#/result/N5-U1`). Forward navigation pushes a
history entry; browser Back/Forward fires `popstate` and restores the screen —
so Back navigates within the app. Deep-linking / reload on a quiz/result hash
gracefully falls back to the Unit Select (in-memory quiz state is lost on
reload).

## Progress storage

All progress lives in the browser's IndexedDB via Dexie
(`src/lib/storage.js`), in two tables:
- `unitProgress` — one row per unit (current SRS state, keyed by `unitId`).
- `quizAttempts` — log of every completed quiz (for streak stats).

Data is local per-device — no sync (would need a backend).

## Progressive Web App

Configured via `vite-plugin-pwa`:
- Installable to the home screen (Android/iOS/desktop).
- Runs offline after first load (all data + assets precached).
- Auto-updates the service worker on new deploys.

Test PWA features with `npm run build && npm run preview` (PWA behavior is
limited in `npm run dev`).
