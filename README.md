# Kanjichō (漢字帳) — JLPT Kanji Practice PWA

A JLPT kanji study app (N5–N1): 15-question reading quizzes per unit, an
FSRS-6 spaced-repetition scheduler, a full kanji library with stroke-order
animations, English & Bahasa Indonesia, light/dark themes, and proper
browser back-button behavior. Fully offline as an installable PWA; the
same build ships as an Android APK via Capacitor.

## Run the app

```bash
npm install
npm run dev       # dev server → http://localhost:5173
npm run build     # production build → dist/
npm run preview   # preview the production build locally
npm test          # logic + reminder-plan unit tests (node, no browser)
npm run cap:sync  # build + copy dist/ into the Android project (Capacitor)
```

## Features

- **Study loop** — pick a JLPT level → unit (15 kanji) → quiz. The card's
  back shows the readings, example words, and a tappable stroke-order
  animation. Finishing a quiz schedules the unit's next review.
- **Scheduling** — FSRS-6 (`ts-fsrs`, pinned) with a score→rating adapter
  (see below). First review 1–2 days out (8 for a perfect score); a
  review calendar shows every due date; free practice of not-yet-due
  units never touches the schedule.
- **Weak kanji loop** — every wrong answer is tracked per kanji; each
  unit card offers a re-quiz of its missed kanji (schedule unchanged).
- **Browse library** — all 2,211 kanji with search (kanji, meaning,
  reading), component breakdown (radical/phonetic), stroke animation,
  and example words. Component chips light up as the animation draws.
- **Interface language** — English / Bahasa Indonesia, including kanji
  meanings and example-word glosses (see "Indonesian data" below).
- **Onboarding tour** — a half-minute spotlight walkthrough of the whole
  loop, replayable from Help.
- **Reminders (Android only)** — local notifications, two modes: at a
  chosen daily time, or the moment a unit comes due. Local-only; see
  "Reminders" below.
- **Backup** — export/import all progress as one JSON file.
- **PWA** — installable, offline after first load, self-hosted fonts.

## Project structure

```
src/
  App.jsx            # screen orchestration, SRS session flow
  components/        # Home, UnitSelect, Quiz, Result, Browse, KanjiDetailSheet,
                     # StrokePlayer (+ Genkou/Reveal glyph variants), ReviewCalendar,
                     # ProgressView, Tutorial, HelpButton, BackupControls, ...
  lib/               # srs.js (FSRS facade), storage.js (Dexie), quizGenerator.js,
                     # useRouter.js (hash router + overlay stack), reminderPlan.js,
                     # notifications.js (Capacitor glue), i18n.js, idData.jsx,
                     # strokes.js (lazy stroke loader), backup.js, ...
  strings/           # en.js, id.js — all UI copy
  data/              # pre-built JSON snapshot (see "Data sources")
  styles/global.css
scripts/            # build pipeline + tests (see "Scripts" below)
android/            # Capacitor 8 shell (dev.kanjicho.app)
public/             # icons, privacy-policy.html
raw/                # your downloads of the raw datasets (not committed)
output/             # pipeline workspace (not committed)
```

## Data sources

`src/data/` is a **static, pre-built snapshot** — the app makes zero
network requests for kanji data. Five public datasets feed the build:

| Source | Provides | Licence |
|---|---|---|
| [KANJIDIC2](https://www.edrdg.org/wiki/KANJIDIC_Project.html) | kanji, readings, English meanings, stroke count | © EDRDG, CC BY-SA 4.0 |
| [JMdict](https://www.edrdg.org/jmdict/edict_doc_depr.html) | example-word glosses, common-word markers | © EDRDG, CC BY-SA 4.0 |
| [Jiten global frequency list](https://jiten.moe/frequency-dictionaries) | word/reading frequency signals (build-time only; no values ship in `src/data/`) | © Jiten, CC BY-SA 4.0 |
| [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary) | modern N1–N5 levels for kanji & vocab | MIT |
| [KanjiVG](https://github.com/KanjiVG/kanjivg) | stroke-order paths | © Ulrich Apel, CC BY-SA 3.0 |

The derived JSON files are published at
[Zyxcid/kanjicho-data](https://github.com/Zyxcid/kanjicho-data) under the
same licences (ShareAlike compliance — sync it whenever `src/data/`
changes). `NOTICE.md` carries the full licensing map.

Per-kanji fields: `kanji`, `stroke_count`, `readings`, `meanings`
(KANJIDIC2); `jlpt_level` (Bluskyo); `primary_readings` — the readings
the quiz asks, ranked by corpus-backed frequency and filtered to those
exercised by an example word; `unit`/`order_index` — 15 kanji per unit,
ordered by frequency; `examples` — JMdict words ranked by frequency with
a preference for same-level-or-easier vocabulary.

## Data build pipeline (regenerating the JSON)

Only needed when regenerating data (unit size, dictionary updates).
Download the raw sources into `raw/` at the app root:

| File | From |
|---|---|
| `kanjidic2.xml.gz`, `JMdict_e.gz` | EDRDG download pages |
| `frequency_list_global.csv` | jiten.moe → "Global" → CSV |
| `JLPT_kanji_ALL.json` (releases) + `JLPT_vocab_ALL.json` (`data/vocab/results/`) | Bluskyo/JLPT_Vocabulary |
| KanjiVG `kanji/` SVGs (clone/ZIP → `raw/kanjivg-master/`) | github.com/KanjiVG/kanjivg |

```bash
python scripts/convert_kanji.py raw/kanjidic2.xml.gz output raw/JLPT_kanji_ALL.json
python scripts/rerank_readings.py raw/JMdict_e.gz output raw/kanjidic2.xml.gz
python scripts/build_examples.py raw/JMdict_e.gz output output raw/JLPT_vocab_ALL.json raw/kanjidic2.xml.gz
python scripts/build_manifest.py output
python scripts/build_strokes.py       # → output/strokes_n*.json (KanjiVG)
python scripts/build_components.py    # → output/components_n*.json (KanjiVG)

# split oversized stroke files into lazy-loadable parts (N1 only; keeps
# build chunks under 500 kB — loader src/lib/strokes.js reads idx + parts)
node scripts/split_strokes.mjs

# promote: the single copy into the app (src/data/ is only ever written here)
cp output/n[1-5].json output/n[1-5]_examples.json output/manifest.json \
   output/strokes_n[1-5]*.json output/components_n[1-5].json src/data/

# post-promotion verifier — expect "GANTI (0)"
node scripts/audit_primary_readings.mjs
```

All steps read/write `output/` (the workspace); `src/data/` receives one
promotion copy. Re-running the whole pipeline reproduces every file
byte-identically. Quality rules enforced in-pipeline: example words must
be corpus-attested or common-marked (never kana-alone spellings or rare
variants); a reading's corpus frequency only counts when the corpus
reading matches a JMdict reading of the word; primary readings must be
backed by one of the kanji's example words. `audit_primary_readings.mjs`
re-verifies the strict rules after promotion.

### Indonesian data (`id_gloss.json`)

The UI language switch also covers kanji **meanings** and
**example-word glosses** via an overlay file, `src/data/id_gloss.json`:
two maps — `m` (5,205 English meanings → Indonesian) and `w` (3,960
example words → Indonesian glosses). Missing keys fall back to English,
so the overlay can never break the app.

Provenance & reliability: the source dictionaries have no Indonesian
fields, so this layer was **produced, not downloaded** — batch LLM
translation, manual completion of the remainder, then a full
line-by-line audit that caught and repaired systematic batch misalignment
(translation of word A landing on word B) plus scattered sense errors.
The audit tooling ships in `scripts/id_translation/`:

```bash
node scripts/id_translation/audit_shift.mjs    # shift detector (expect 0 suspects)
```

Regeneration chain (only needed when the English data changes):
`translate_kanji_data.mjs` (batch translation; `translate_cache.jsonl`
makes re-runs deterministic) → `merge_id_gloss.mjs` (cache + manual
patches → `id_gloss.json`, verifies 100% coverage) → `audit_shift.mjs`.

> **One-shot warning:** `repair_id_gloss.mjs` targets specific corrupted
> zones from the original production run. It is history, not a reusable
> step — running it again on clean data would corrupt it. The canonical
> artifact is `src/data/id_gloss.json` itself; treat it as versioned data.

## Scripts

Two families, deliberately kept apart:

- **`.py`** — the raw-data pipeline above. Heavy XML/gzip parsing
  (JMdict, KANJIDIC2, KanjiVG SVG) where Python's stdlib shines.
- **`.mjs` (Node)** — everything that touches the app side: unit tests
  (`test_logic`, `test_reminders`), the audit verifier, stroke splitting,
  and the SRS experiments — they import the same ESM modules the browser
  runs, which is only possible in JS.

Rule of thumb: if it imports `src/*`, it must be `.mjs`; if it parses raw
dictionaries, it's Python. Don't port one to the other — `build_examples.py`
encodes 2,300 lines of battle-tested selection logic where a "harmless"
rewrite would silently change example words for thousands of kanji.

## Spaced repetition model

`srs.js` is a thin facade over the official **`ts-fsrs` 5.4.2** engine
(FSRS-6, 21 default weights pinned explicitly and verified at module
load), with the unit — not the kanji — as the memory item. Kanjichō
contributes:

- **Score → rating adapter**: the quiz score is graded against the
  scheduler's own prediction (15 Bernoulli trials): perfect → Easy,
  ≤30% or z ≤ −2 → Again, z ≥ +2.5 & ≥13/15 → Easy, z < −0.5 → Hard,
  else Good. First quizzes (no prior state) use an absolute anchor.
- **Policies**: `MAX_INTERVAL` 365 days, relearning step 6 h, no learning
  steps for new units, whole-day intervals.
- **First-time intervals**: ≤80% → 1 day, 87–99% → 2 days, 100% → 8 days.

Equivalence with the previous hand-written engine is proven by a
differential test (`scripts/differential_tsfsrs.mjs`); the adapter was
validated in simulation (`scripts/experiment_adapters.mjs`,
`experiment_slope_full.mjs` — 24k+19k histories: binomial wins calibration
in 4/4 scenarios). Quiz sessions: `srs` (new/due — moves progress),
`practice` (scheduled/mastered — writes nothing), `weak` (missed kanji —
per-kanji stats only).

## Quiz algorithm

`quizGenerator.js` (pure): for each kanji, the correct answer comes from
its `primary_readings` (corpus-ranked, example-backed); distractors come
from other kanji in the same level, excluding the target's readings in
**both** kana and romaji (no distractor is ever a valid answer in either
script). Choices are shuffled; a separate "Don't know" button keeps
honest misses cheap. The あ/Aa topbar toggle only changes display script,
never grading (answers compare indices).

## Browser history / navigation

`useRouter.js` encodes screens in the URL hash (`#/`, `#/browse`,
`#/level/N5`, `#/quiz/N5-U1`, `#/result/N5-U1`). Overlays (modals,
dialogs, the help dropdown) push their own history entry, so mobile Back
closes the overlay instead of leaving the screen; "up" navigation
(quiz ✕, result → Home) folds entries so Back never resurrects a dead
screen. Reload/deep-link on a quiz hash falls back to Unit Select.

## Progress storage & backup

All progress lives in IndexedDB via Dexie (`src/lib/storage.js`):
`unitProgress` (SRS state per unit), `quizAttempts` (streak stats),
`kanjiStats` (per-kanji right/wrong for weak review). Local-only — no
sync, no account. Help → Export/Import writes a versioned JSON snapshot
of all three tables plus display settings; import is replace-all behind
a confirmation, with a migration chain for older formats. On Android the
export goes through the system share sheet (Filesystem + Share plugins).

## Reminders (Android shell only)

No push infrastructure — reminders are **local notifications** scheduled
on-device (channel importance-default, no vibration/lights; permission
asked once, after the first real quiz completes). Web/PWA gets none.
Two user-selectable modes (`reminderPlan.js`, unit-tested):

- **"When due"** (default): the notification fires the moment a unit
  comes due — including at night (silencing nights is the OS's Do Not
  Disturb job, not the app's). Due moments within 30 minutes of each
  other merge into one notification (chain-merged, cumulative count)
  at the last due moment of the cluster.
- **"At a set time"**: one daily nudge at a chosen HH:MM, only on days
  with something due.

Work already overdue when the app syncs waits out a 2-hour grace.
At most 3 notifications are scheduled ahead; the whole batch is
recomputed from IndexedDB on every app open and finished quiz.

## Progressive Web App

`vite-plugin-pwa`: installable, offline after first load (all data and
assets precached), auto-updating service worker. Fonts ship as npm
`@fontsource` packages bundled by Vite (Shippori Mincho, Zen Kaku Gothic
New, DM Mono — SIL OFL 1.1; zero third-party requests). A `postinstall`
hook (`scripts/fix_font_maxp.py`) patches a Firefox font-warning in the
Shippori subsets and soft-fails when Python/fontTools are unavailable.
Test PWA behavior with `npm run build && npm run preview`.

## Android app (Capacitor 8)

The same web build, wrapped with Capacitor (`dev.kanjicho.app`) for the
Play Store — plus the local reminders above. Service-worker registration
is skipped inside the native shell (the bundle ships in the APK; a stale
SW cache would serve old builds after Play updates).

```bash
npm install          # also patches font maxp (postinstall)
npm run cap:sync     # vite build → npx cap sync android
npx cap open android # Android Studio → Run / Build APK
# headless: cd android && ./gradlew assembleDebug (or bundleRelease)
```

Bump `versionCode`/`versionName` in `android/app/build.gradle` per
release. Launcher icons regenerate from `public/icons/icon-512.png` via
`scripts/gen_android_icons.py`. The template `INTERNET` permission is
Capacitor's default; the app itself makes zero network requests.

## Privacy & Google Play readiness

Zero-collection, no-account, offline-first. `public/privacy-policy.html`
(same origin; fill the marked placeholders before submitting),
`NOTICE.md` (licensing map), the open data repo above, and the JLPT
trademark disclaimer in Help cover the Play paperwork. If in-app
purchases are ever added: Google Play Billing only, and never paywall
the CC BY-SA data itself — sell supporter features, keep the data free.
