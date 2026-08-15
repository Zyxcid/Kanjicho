# Kanji Drill — JLPT Kanji Practice PWA

A JLPT kanji practice app (N5–N1) with a forgetting-curve-based spaced
repetition scheduler, a reading quiz, a full kanji library, light & dark
themes, and proper browser back-button navigation. Works fully offline as
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
    dataLoader.js          loads JSON, merges examples (primary_romaji trusted from JSON)
    quizGenerator.js       generates multiple-choice questions (pure function)
    srs.js                 spaced-repetition engine (pure function)
    storage.js             IndexedDB persistence via Dexie (the only storage module)
    useTheme.js            light/dark theme hook (localStorage)
    useRouter.js           hash-based router (browser Back/Forward support)
  components/
    Home.jsx, UnitSelect.jsx, Quiz.jsx, Result.jsx, Browse.jsx
    NextReviewBanner.jsx, ThemeToggle.jsx, Toast.jsx
  data/
    n5.json ... n1.json              kanji entries per JLPT level
    n5_examples.json ... n1_examples.json  example words per kanji
  styles/
    global.css             genkouyoushi design system (light + dark tokens)

public/
  icons/                   PWA icons (192, 512, maskable)

vite.config.js             Vite + PWA config (manifest + service worker)

jlpt_levels.json          modern N1-N5 JLPT levels (included, from Bluskyo)

scripts/
  convert_kanji.py        Step 1: kanjidic2.xml.gz → n*.json (kanji data)
  build_examples.py       Step 2: JMdict + BCCWJ → n*_examples.json
  rerank_readings.py      Step 3: re-rank primary_romaji by BCCWJ word freq
```

## Data sources

The 10 JSON files in `src/data/` are a **static, pre-built snapshot**. At
runtime the app makes **no network requests** for kanji data — everything is
bundled. Three public datasets contributed to the snapshot (via the build
pipeline described below):

| Field in JSON | Source | What it is |
|---------------|--------|------------|
| `kanji`, `jlpt_level`, `stroke_count` | **KANJIDIC2** (via kanjidic2.xml.gz) | The kanji, its JLPT level, stroke count |
| `readings.on`, `readings.kun` | **KANJIDIC2** | On'yomi and kun'yomi as kana |
| `meanings` | **KANJIDIC2** | English meanings |
| `romaji_readings` | Derived (kana→romaji) | All readings romanized |
| `primary_romaji` | **BCCWJ corpus** (re-ranked) | The most common on'yomi AND most common kun'yomi |
| `unit`, `order_index` | Pipeline grouping | Kanji grouped into units of 15, ordered by newspaper frequency |
| `examples` (merged from `*_examples.json`) | **JMdict** (words) + **BCCWJ** (frequency) | Real example words using the kanji, ranked by corpus frequency |

### Where "most common reading" comes from

`primary_romaji` is ranked by **real BCCWJ multi-character word frequency**.
For each kanji, `scripts/rerank_readings.py` looks at all BCCWJ corpus
*words* containing that kanji (e.g. 時代, 代わり, 世代 for 代), matches each
word's reading back to one of the kanji's on/kun readings, and sums the word
frequencies per reading. The most frequent on'yomi becomes `primary_romaji[0]`;
the most frequent kun'yomi becomes `primary_romaji[1]`.

**Key results:**
- 代: `["dai","kawari"]` — kawari from 代わり (substitute), very common
- 言: `["gen","iu"]` — iu is the common kun (from 言う = to say)
- 行: `["kou","iku"]` — iku from 行く (the common verb "to go")

## Data build pipeline (regenerating the JSON)

The pipeline scripts are in `scripts/`. They read from three public raw
source files and produce the `src/data/*.json` files. You only need to run
the pipeline if you want to regenerate the data. The committed JSON is
already correct.

### Required raw sources (3 files + 1 included)

| File | What it is | Download from |
|------|------------|---------------|
| `kanjidic2.xml.gz` | KANJIDIC2 — kanji readings, meanings, stroke counts, newspaper frequency | https://www.edrdg.org/kanjidic/kanjidic2.xml.gz |
| `JMdict_e.gz` | JMdict (English) — Japanese→English dictionary entries | https://www.edrdg.org/JMdict/JMdict_e.gz |
| `BCCWJ_frequencylist_luw2_ver1_0.tsv` | BCCWJ word frequency list | https://pj.ninjal.ac.jp/corpus_center/bccwj/ |
| `jlpt_levels.json` **(included)** | Modern N1-N5 JLPT levels | [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary) |

**Note on JLPT levels:** KANJIDIC2 uses the **old** pre-2010 JLPT system
(levels 1-4, no N5). The modern N1-N5 system comes from the
[Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary) repo.
The `jlpt_levels.json` file (2,211 kanji → level 1-5) is **included in the
project root**. `convert_kanji.py` only keeps kanji present in this file,
ensuring the JLPT levels are the modern N1-N5 system.

### Pipeline overview (3 steps)

```
kanjidic2.xml.gz  ─┐
                    ├─→ convert_kanji.py  ──→ output/n5.json ... n1.json
jlpt_levels.json  ─┘                       (kanji entries, units, readings)

output/n*.json    ─┐
JMdict_e.gz       ─┼─→ build_examples.py ──→ output/n5_examples.json ...
BCCWJ TSV         ─┘                        (example words per kanji)

output/n*.json    ─┐
BCCWJ TSV         ─┴─→ rerank_readings.py ──→ output/n*.json (updated)
                         (re-ranks primary_romaji by real word freq)
```

Then copy `output/*.json` into `src/data/`.

### Step 1: `scripts/convert_kanji.py`

Parses `kanjidic2.xml.gz` and builds the per-level kanji JSON files.

1. Parses the KANJIDIC2 XML, extracting each kanji's readings, meanings,
   stroke count, and newspaper frequency.
2. **Only keeps kanji present in `jlpt_levels.json`** (modern N1-N5). This
   filters out kanji with only old KANJIDIC2 JLPT tags.
3. Groups by JLPT level, sorts by newspaper frequency (common first).
4. Groups into units of 15, builds `romaji_readings` and a placeholder
   `primary_romaji` (re-ranked by step 3).
5. Writes `output/n5.json` ... `output/n1.json` + `output/all_kanji.json`.

### Step 2: `scripts/build_examples.py`

Parses `JMdict_e.gz` + BCCWJ TSV and builds example-word lists per kanji.

1. Parses JMdict XML, keeping entries with kanji (length 1-4) + English glosses.
2. Loads the BCCWJ frequency index. For each term, keeps the **highest**
   frequency entry (most common usage).
3. For each kanji, finds JMdict words containing that kanji AND in BCCWJ.
4. Cross-verifies the reading (JMdict reading must match BCCWJ reading).
5. Classifies as on/kun by matching against the kanji's real readings.
6. Sorts by frequency (**highest first** = most common words first).
7. Picks the top on'yomi word + top kun'yomi word.

### Step 3: `scripts/rerank_readings.py`

Re-ranks `primary_romaji` using real BCCWJ multi-character word frequency.

1. Loads the BCCWJ TSV (all words with kanji in their lemma).
2. Indexes words by the kanji they contain.
3. For each kanji, matches each BCCWJ word's reading against the kanji's
   on/kun readings and sums word frequencies per reading.
4. The most frequent on'yomi → `primary_romaji[0]`; most frequent kun'yomi →
   `primary_romaji[1]`.

### Running the full pipeline

```bash
python scripts/convert_kanji.py kanjidic2.xml.gz output jlpt_levels.json
python scripts/build_examples.py JMdict_e.gz BCCWJ_frequencylist_luw2_ver1_0.tsv output output
python scripts/rerank_readings.py BCCWJ_frequencylist_luw2_ver1_0.tsv output

# Then copy the output to src/data/
cp output/n*.json src/data/
```

## Quiz algorithm

`quizGenerator.js` (pure function, no state):

1. For each kanji in the unit, pick a **correct answer** from `primary_romaji`
   (so it's either the most common on'yomi or kun'yomi).
2. Build **distractors** from other kanji in the same level, **excluding** the
   target kanji's full `romaji_readings` — so no distractor is ever a valid
   reading of the asked kanji (prevents "right answer marked wrong").
3. Shuffle choices; the UI adds a separate "Don't know" button.

## Spaced repetition model

`srs.js` uses a forgetting-curve model: `retention(t) = target_retention ^ (t / stability)`.
`stability` = days until retention drops to the target (default 85%). On each
quiz, stability is updated from the score. This is a pure function — all state
lives in IndexedDB via `storage.js`.

## Browser history / navigation

`useRouter.js` encodes each screen in the URL hash. Forward navigation pushes
a history entry; browser Back/Forward fires `popstate` and restores the screen.

## Progress storage

All progress lives in the browser's IndexedDB via Dexie (`src/lib/storage.js`).
Data is local per-device — no sync (would need a backend).

## Progressive Web App

Configured via `vite-plugin-pwa`: installable, offline-capable, auto-updating.
Test with `npm run build && npm run preview`.
