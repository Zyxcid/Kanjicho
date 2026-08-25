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
  components/
    Home.jsx                stats hero + next-review banner + level grid + browse entry
    UnitSelect.jsx           per-level unit cards
    Quiz.jsx                 quiz screen (kanji box + choices + reveal panel)
    Result.jsx               score stamp + breakdown + next-review schedule
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
  build_examples.py         Step 2: JMdict + BCCWJ → n*_examples.json
  rerank_readings.py        Step 3: rank primary_romaji by BCCWJ word frequency (fallback for kanji without qualifying examples)
  build_manifest.py        Step 4: generate manifest.json (level summaries for Home)
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

| Field in JSON | Built from |
|---|---|
| `kanji`, `stroke_count` | KANJIDIC2 |
| `readings.on`, `readings.kun`, `meanings` | KANJIDIC2 |
| `jlpt_level` | `JLPT_kanji_ALL.json` (see note below) |
| `romaji_readings` | Derived — all readings romanized |
| `primary_romaji` | KANJIDIC2 candidates, made consistent with the example word shown for each kanji (see below) |
| `unit`, `order_index` | Pipeline grouping — 15 kanji per unit, ordered by newspaper frequency |
| `examples` | JMdict words containing the kanji, ranked by BCCWJ frequency |

**JLPT levels:** KANJIDIC2 only carries the pre-2010 JLPT system (4 levels,
no N5). `JLPT_kanji_ALL.json` maps each kanji to the modern N1–N5 system and is
included in the project root so the pipeline works out of the box.

**Example words:** for each kanji, `build_examples.py` finds JMdict words
containing it that also appear in the BCCWJ frequency list, cross-verifies
the reading against BCCWJ (to reject archaic/rare alternate readings), and
picks the most frequent on'yomi word and the most frequent kun'yomi word.

**Most common reading (`primary_romaji`):** determined by
`rerank_readings.py`, which ranks candidate readings by BCCWJ corpus
frequency (looking at every word containing the kanji, e.g. 時代, 代わり,
世代 for 代). The most frequent on'yomi becomes `primary_romaji[0]` and the
most frequent kun'yomi becomes `primary_romaji[1]`. This aggregates
frequency across ALL BCCWJ words using each reading, so it correctly
identifies the common readings (e.g. 十 → `too`, not the rare `so`).

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

> `JLPT_kanji_ALL.json` is **not** included in the project — download it
> from the Bluskyo releases page when running the pipeline. The committed
> `src/data/n*.json` already has correct JLPT levels baked in, so you only
> need this file if you're regenerating from raw sources.

### Pipeline

```
kanjidic2.xml.gz  ─┐
                    ├─→ convert_kanji.py  ──→ n5.json ... n1.json
JLPT_kanji_ALL.json  ─┘                      (kanji entries, units, readings)

n*.json           ─┐
JMdict_e.gz       ─┼─→ build_examples.py ──→ n5_examples.json ...
BCCWJ TSV         ─┘                        (example words per kanji)

n*.json           ─┐
BCCWJ TSV         ─┴─→ rerank_readings.py ──→ n*.json (primary_romaji: frequency-ranked default)

n*.json           ───→ build_manifest.py    ──→ manifest.json
                           (small summary: totals + unit ids for Home)
```

```bash
python scripts/convert_kanji.py kanjidic2.xml.gz output JLPT_kanji_ALL.json
python scripts/rerank_readings.py BCCWJ_frequencylist_luw2_ver1_0.tsv output
python scripts/build_examples.py JMdict_e.gz BCCWJ_frequencylist_luw2_ver1_0.tsv output output
python scripts/build_manifest.py output

# then copy into src/data/
cp output/*.json src/data/
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

## Quiz algorithm

`quizGenerator.js` (pure function, no state):

1. For each kanji in the unit, pick a **correct answer** from `primary_romaji`
   (the most common on'yomi or kun'yomi).
2. Build **distractors** from other kanji in the same level, excluding the
   target kanji's full `romaji_readings` — so no distractor is ever a valid
   reading of the asked kanji.
3. Shuffle choices; the UI adds a separate "Don't know" button.

## Browser history / navigation

`useRouter.js` encodes each screen in the URL hash (`#/`, `#/browse`,
`#/level/N5`, `#/quiz/N5-U1`, `#/result/N5-U1`). Forward navigation pushes a
history entry; browser Back/Forward fires `popstate` and restores the screen.
Deep-linking / reload on a quiz/result hash falls back to Unit Select
(in-memory quiz state is lost on reload).

## Progress storage

All progress lives in the browser's IndexedDB via Dexie
(`src/lib/storage.js`), in two tables:
- `unitProgress` — one row per unit (current SRS state, keyed by `unitId`).
- `quizAttempts` — log of every completed quiz (for streak stats).

Local per-device only — no sync (would need a backend).

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
