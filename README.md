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
    dataLoader.js          loads JSON, merges examples (primary_romaji trusted from JSON)
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

scripts/
  fix_primary_romaji.py    surgical fix (no BCCWJ needed, less accurate)
  rerank_readings.py       proper re-ranking using BCCWJ multi-char word freq
```

## Data sources

The 10 JSON files in `src/data/` are a **static, pre-built snapshot**. At
runtime the app makes **no network requests** for kanji data — everything is
bundled. Three public datasets contributed to the snapshot (via the build
pipeline described below):

| Field in JSON | Source | What it is |
|---------------|--------|------------|
| `kanji`, `jlpt_level`, `stroke_count` | **KANJIDIC2** (via kanjiapi.dev) | The kanji, its JLPT level, stroke count |
| `readings.on`, `readings.kun` | **KANJIDIC2** | On'yomi and kun'yomi as kana |
| `meanings` | **KANJIDIC2** | English meanings |
| `romaji_readings` | Derived (kana→romaji) | All readings romanized |
| `primary_romaji` | **BCCWJ corpus** (corrected — see below) | The most common on'yomi AND most common kun'yomi |
| `unit`, `order_index` | Pipeline grouping | Kanji grouped into units of 15, ordered by Mainichi newspaper frequency |
| `examples` (merged from `*_examples.json`) | **JMdict** (words) + **BCCWJ** (frequency) | Real example words using the kanji, ranked by corpus frequency |

### Where "most common reading" comes from

`primary_romaji` is ranked by **real BCCWJ multi-character word frequency**.
For each kanji, the re-ranking script (`scripts/rerank_readings.py`) looks at
all BCCWJ corpus *words* containing that kanji (e.g. 時代, 代わり, 世代 for
代), matches each word's reading back to one of the kanji's on/kun readings,
and sums the word frequencies per reading. The most frequent on'yomi becomes
`primary_romaji[0]`; the most frequent kun'yomi becomes `primary_romaji[1]`.

This is the **correct** signal for reading frequency — it reflects how often
each reading appears in real Japanese text. Example for 代:
- `dai` (ダイ) wins on'yomi — from 時代 (jidai), 世代 (sedai), 代金 (daikin), etc.
- `kawari` (かわり) wins kun'yomi — from 代わり (substitute), a very common word.
- The old broken data had `shiro` (しろ) — a rare reading that only appears in
  standalone 代 as "generation/ruler" — because the original pipeline used
  single-character frequency only.

### The `primary_romaji` re-ranking

The original pipeline (`convert_kanji.py`) used BCCWJ **single-character**
frequency (kanji standing alone as a word) to rank readings. This was flawed:
for many kanji, the common readings only appear in **multi-character words**
(e.g. 代's kun'yomi `kawaru` appears in 代わる, never standalone). The old
pipeline missed these and picked rare standalone readings instead (代 →
`shiro` instead of `kawari`).

This was fixed properly by `scripts/rerank_readings.py`, which uses the raw
BCCWJ frequency list (`BCCWJ_frequencylist_luw2_ver1_0.tsv`) to aggregate
real multi-character word frequencies per reading. 1,227 of 2,211 kanji were
re-ranked. The JSON is now the single source of truth — no runtime override.

**Key results:**
- 代: `["dai","shiro"]` → `["dai","kawari"]` (shiro was rare)
- 言: `["gen","gon"]` → `["gen","iu"]` (iu is the common kun)
- 行: `["an","iki"]` → `["kou","iku"]` (iku is the common verb 行く)

To re-run the re-ranking (needs the raw BCCWJ TSV):

```bash
# Extract the BCCWJ TSV from the zip first
unzip BCCWJ_frequencylist_luw2_ver1_0.zip   # → BCCWJ_frequencylist_luw2_ver1_0.tsv

python scripts/rerank_readings.py BCCWJ_frequencylist_luw2_ver1_0.tsv
```

## Data build pipeline (regenerating the JSON)

The pipeline scripts are in `scripts/`. They read from three public raw
source files and produce the `src/data/*.json` files. You only need to run
the pipeline if you want to regenerate the data (e.g. to change unit sizes,
add new kanji, or pull fresh dictionary updates). The committed JSON is
already correct.

### Required raw sources (3 files)

| File | What it is | Download from |
|------|------------|---------------|
| `kanjidic2.xml.gz` | KANJIDIC2 — kanji readings, meanings, stroke counts, (old) JLPT levels, newspaper frequency | https://www.edrdg.org/kanjidic/kanjidic2.xml.gz |
| `JMdict_e.gz` | JMdict (English) — Japanese→English dictionary entries | https://www.edrdg.org/JMdict/JMdict_e.gz |
| `BCCWJ_frequencylist_luw2_ver1_0.tsv` | BCCWJ word frequency list (Balanced Corpus of Contemporary Written Japanese) | https://pj.ninjal.ac.jp/corpus_center/bccwj/ |
| `jlpt_levels.json` (optional) | Modern N1-N5 JLPT levels (overrides KANJIDIC2's old levels). Format: `{"日": 5, "言": 4, ...}` | kanjiapi.dev |

**Note on JLPT levels:** KANJIDIC2 uses the **old** pre-2010 JLPT system
(levels 1-4, no N5). The modern N1-N5 system (which this app uses) is
available from [kanjiapi.dev](https://kanjiapi.dev). If `jlpt_levels.json`
is present, `convert_kanji.py` uses it; otherwise it falls back to
KANJIDIC2's old levels (which will misclassify some kanji).

### Pipeline overview (3 steps)

```
kanjidic2.xml.gz  ─┐
                    ├─→ convert_kanji.py  ──→ output/n5.json ... n1.json
jlpt_levels.json  ─┘                      (kanji entries, units, readings)

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

1. Parses the KANJIDIC2 XML, extracting each kanji's: literal (the character),
   `ja_on`/`ja_kun` readings, English meanings, stroke count, JLPT level,
   and newspaper frequency.
2. Groups by JLPT level (using `jlpt_levels.json` overrides if available).
3. **Sorts each level** by newspaper frequency (common kanji first), then
   stroke count, then the kanji itself — so common kanji are taught first.
4. **Groups into units of 15** (`UNIT_SIZE`), giving each a `{level}-U{n}` id.
5. For each kanji, builds `romaji_readings` (all readings romanized via the
   built-in kana→romaji converter) and `primary_romaji` (a placeholder:
   `on[0]` + `kun[0]` — re-ranked properly by step 3).
6. Writes `output/n5.json` ... `output/n1.json` + `output/all_kanji.json`.

Includes a self-contained Hepburn kana→romaji converter (handles katakana,
long vowels ー, palatal combinations, gemination っ, okurigana markers).

### Step 2: `scripts/build_examples.py`

Parses `JMdict_e.gz` + BCCWJ TSV and builds example-word lists per kanji.

1. Parses JMdict XML, keeping entries with a kanji element (keb) of length 1-4
   and at least one English gloss.
2. Loads the BCCWJ frequency index (word → frequency + reading).
3. For each kanji, finds JMdict words **containing** that kanji **and** present
   in the BCCWJ frequency index.
4. **Cross-verifies the reading** — the word's JMdict reading must match the
   BCCWJ reading (rejects archaic readings of common words).
5. **Classifies as on or kun** by checking whether the word's reading contains
   one of the kanji's real on'yomi or kun'yomi (not just by word shape —
   correctly handles cases like 母 = はは, a single-kanji kun'yomi word).
6. Prefers multi-character words over single-kanji words (avoids circular
   "日 as example for 日"), then sorts by frequency.
7. Picks the top on'yomi word + top kun'yomi word (fills the second slot
   from either category if one is empty).
8. Writes `output/n5_examples.json` ... `output/n1_examples.json`.

### Step 3: `scripts/rerank_readings.py`

Re-ranks `primary_romaji` using real BCCWJ multi-character word frequency.

1. Loads the BCCWJ TSV (all words with kanji in their lemma).
2. Indexes words by the kanji they contain.
3. For each kanji, matches each BCCWJ word's reading against the kanji's
   on/kun readings (substring match in hiragana) and sums word frequencies
   per reading.
4. The most frequent on'yomi → `primary_romaji[0]`; most frequent kun'yomi →
   `primary_romaji[1]`.
5. Writes back to the same JSON files (only `primary_romaji` is updated).

This is the key fix: instead of using single-character frequency (which misses
common readings that only appear in multi-character words like 代わる), it
aggregates the frequency of ALL words using each reading.

### Running the full pipeline

```bash
# Place the raw files in the project root (or pass paths as args)
# Then run all 3 steps:

python scripts/convert_kanji.py kanjidic2.xml.gz output jlpt_levels.json
python scripts/build_examples.py JMdict_e.gz BCCWJ_frequencylist_luw2_ver1_0.tsv output output
python scripts/rerank_readings.py BCCWJ_frequencylist_luw2_ver1_0.tsv output

# Then copy the output to src/data/
cp output/n*.json src/data/
```

All scripts take paths as CLI args (with sensible defaults relative to the
project root). Run `python scripts/<script>.py` with no args to see usage.

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
