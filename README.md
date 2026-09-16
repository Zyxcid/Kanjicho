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
  back shows the readings, example words, example sentences (Tatoeba,
  target word highlighted), and a tappable stroke-order animation.
  Finishing a quiz schedules the unit's next review.
- **Scheduling** — FSRS-6 (`ts-fsrs`, pinned) with a score→rating adapter
  (see below). First review 1–2 days out (8 for a perfect score); a
  review calendar shows every due date; free practice of not-yet-due
  units never touches the schedule.
- **Weak kanji loop** — every wrong answer is tracked per kanji; each
  unit card offers a re-quiz of its missed kanji (schedule unchanged).
- **Browse library** — all 2,211 kanji with search (kanji, meaning,
  reading) and a scope filter (search in *All fields / Kanji / Meaning /
  Reading* — the placeholder follows the active scope), component
  breakdown (radical/phonetic), stroke animation, and example words.
  Component chips light up as the animation draws.
- **Interface language** — English / Bahasa Indonesia, including kanji
  meanings, example-word glosses, and example-sentence translations
  (see "Indonesian data" below).
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
| [Tatoeba](https://tatoeba.org/) | one example sentence per example word (JP + EN + ID) | © Tatoeba contributors, CC BY / CC BY-SA per sentence |
| [UniDic](https://unidic.ninjal.ac.jp/) (via `unidic-lite`) | furigana readings + reading verification for example sentences (build-time only; no dictionary data ships in `src/data/`) | © NINJAL, Apache Licence 2.0 |
| [pykakasi](https://codeberg.org/miuchiba/pykakasi) | surface readings for furigana + second opinion for reading verification (build-time only) | GPL-3.0 |

The derived JSON files (including the Indonesian overlay `id_gloss.json`,
the sentence files `n*_sentences.json`, and `manifest.json`) are published at
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
| Tatoeba sentence-pair TSVs (JP-EN, JP-ID — Downloads page) → put both in one folder, e.g. `scripts/tatoeba/` (filenames contain the export date; `build_sentences.py` globs them) | tatoeba.org |

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
variants); an example word must be **common in at least one register**
(t110): top-30k of the jiten media corpus, OR marked strong in JMdict
(ichi1/news1/spec1/gai1, or newspaper band nf ≤ 20) — this is what keeps
rare/archival/ceremonial jargon (二百十日, 七回忌, 丙午) out of the example
slots while keeping formal newspaper vocabulary (貿易, 憲法, 県庁) in,
since the subtitle-derived jiten list systematically under-ranks formal
words. Digit-first JMdict headwords (１０日, ７時) no longer hide their
kanji spellings (十日, 七時) from the candidate pool (t110), and weak
jiten attestations cap a word's frequency to its real Zipf rank instead
of a flat value, so genuinely common words win slot ties. Kanji with no
candidate that passes the gate simply ship without examples (zero
examples beats a garbage example; their `primary_readings` are kept, so
quizzes stay healthy). A reading's corpus frequency only counts when the
corpus reading matches a JMdict reading of the word; primary readings must be
backed by one of the kanji's example words. `audit_primary_readings.mjs`
re-verifies the strict rules after promotion.

### Example-sentence pipeline (`n*_sentences.json`)

Runs over `src/data/` directly (no `output/` workspace — the chain is
idempotent and merges previous results). Python deps: `pyahocorasick`,
`fugashi` + `unidic-lite`, `pykakasi` (pip; add `--break-system-packages`
on debian-system installs). Node step needs the `z-ai` CLI in PATH.

Step 1 includes a **reading gate** (t109): a candidate sentence is only
accepted when the target word is actually *read* as the example's
`reading` in that sentence — verified by two tokenizers
(`scripts/reading_check.py`: unidic morphology + pykakasi surface
readings, with phonological tolerances for rendaku/sokuon notation).
This kills the "same spelling, different reading" bug class (e.g.
中［ちゅう］"medium" matched to トムは車の中［なか］にいるよ). Words with no
verifiable candidate get no sentence at all. Manual adjudication of
cases the tools misread lives in `scripts/reading_overrides.json`
(accept/reject/drop/force) — `scripts/audit_sentence_readings.py`
re-derives the QA report (`scripts/sentences_audit.json`) any time.

```bash
# 1. select one Tatoeba sentence per example word
#    (paths default to scripts/tatoeba/; --tatoeba-dir overrides)
python3 scripts/build_sentences.py --tatoeba-dir <folder-with-tsvs>

# 2. Indonesian translations for entries without a native Tatoeba ID
#    (zero LLM calls when the shipped cache covers everything — the
#    normal no-op case after step 1 merged the existing ids)
node scripts/id_translation/translate_sentences.mjs

# 3. furigana runs for every kanji-bearing token
python3 scripts/build_furigana.py

# verifier — wired into `npm test` (scripts/test_sentences.mjs)
node scripts/test_sentences.mjs
```

`--fresh` on step 1 discards the merge (full rebuild); new Tatoeba
snapshots only need the LLM for genuinely new/changed sentences. The
translation cache (`scripts/id_translation/sentences_cache.jsonl`)
ships with the repo; `seed_sentences_cache.mjs --ref <folder>` can
rebuild it from any existing set of translated files.

### Indonesian data (`id_gloss.json`)

The UI language switch also covers kanji **meanings** and
**example-word glosses** via an overlay file, `src/data/id_gloss.json`:
two maps — `m` (5,205 English meanings → Indonesian) and `w` (3,312
example words → Indonesian glosses, 100% coverage as of the rare-word
cleanup round). Missing keys fall back to English,
so the overlay can never break the app.

Provenance & reliability: the source dictionaries have no Indonesian
fields, so this layer was **produced, not downloaded** — batch LLM
translation, manual completion of the remainder, then a full
line-by-line audit that caught and repaired systematic batch misalignment
(translation of word A landing on word B) plus scattered sense errors.
A later library-search round found the same misalignment class in the
`m` map's own history: three whole regions had shifted by +1/+5/+6/+40
positions (England→"Esq.", knife→translation of *kindly*, future→
"terjebak"), 79 hand-patch values had never reached the shipped file
because the cache-only rebuild path skips `patch_m_*.json`, and isolated
mistranslations (convex→"cekung", leisure→"kesibukan"). All repaired
(252 keys, `patch_m_7.json`); the cache is now seeded so
`translate_kanji_data.mjs` and `merge_id_gloss.mjs` produce
**byte-identical** output. The audit tooling ships in
`scripts/id_translation/`:

```bash
node scripts/id_translation/audit_shift.mjs    # shift detector (expect 0 suspects; also audits the m map)
```

Regeneration chain (only needed when the English data changes):
`translate_kanji_data.mjs` (batch translation; `translate_cache.jsonl`
makes re-runs deterministic) → `merge_id_gloss.mjs` (cache + manual
patches → `id_gloss.json`, verifies 100% coverage) → `audit_shift.mjs`.
After the 2026-09 gloss completion round the cache holds all 83 current
batches **complete with the curated final values**, so a straight
rebuild is fully cache-hit and needs no API; only genuinely new words
(added by future data changes) require translation calls. The script
also merge-resumes from the existing `id_gloss.json`, so hand-curated
entries survive rebuilds. Both entry points converge to the same file
(md5-verified); after editing glosses by hand, always go through
`patch_m_*.json`/`patch_w.json` and re-seed the cache rather than editing
the cache directly.

Known limitation (honest note): unlike the example words (fully audited
round by round), the `m` map has had a heuristic audit only — the three
mechanically shifted regions and every anomaly the detectors flag are
fixed, but isolated mistranslations on rare meanings may still lurk;
the C-type "distant synonym" list printed by `audit_shift.mjs` is the
starting point for a future full manual pass.

> **One-shot warning:** `repair_id_gloss.mjs` targets specific corrupted
> zones from the original production run. It is history, not a reusable
> step — running it again on clean data would corrupt it. The canonical
> artifact is `src/data/id_gloss.json` itself; treat it as versioned data.
> As translations of CC BY-SA glosses, the file is itself a CC BY-SA 4.0
> adaptation and is published in the open data repo with the rest.

### Example sentences (`n*_sentences.json`)

Each example word can carry **one example sentence** (Tatoeba): the
Japanese sentence, an English translation, an Indonesian translation,
`pos` — precomputed character offsets of clean-boundary occurrences
of the target word (the UI highlights the word at exactly those
offsets; no tokenization logic ships in the app) — and `furi` —
precomputed furigana runs `[start, length, kana]` over every
kanji-bearing token (rendered as `<ruby>`; a MeCab/unidic pass at
build time, so the app ships no dictionary). Coverage: 2,832
entries for 2,679 unique words (67.7% of all example words; N5–N3
≈ 90%, N1 54% — corpus-thin rare compounds simply show no sentence).
Words without a sentence render exactly as before — the layer is
display-only and never touches the quiz or the FSRS schedule.

The whole sentence chain is reproducible **inside this repo** (like
`build_examples.py`; see "Data build pipeline" below for the exact
commands):

1. `scripts/build_sentences.py` — selects one sentence per word from
   the Tatoeba JP–EN/JP–ID pair TSVs (Aho-Corasick matching,
   clean-boundary rule, length × JLPT-level scoring, native JP–ID
   pairs preferred). Deterministic; a re-run with the same snapshot
   and no `--fresh` merges the existing `id`/`furi` for unchanged
   sentences, so it is a byte-identical no-op.
2. `scripts/id_translation/translate_sentences.mjs` — Indonesian for
   the rest: native Tatoeba IDs are already in place; the remainder is
   batch-LLM-translated with Japanese as the source and the Tatoeba EN
   as reference. Resume-safe cache
   (`scripts/id_translation/sentences_cache.jsonl`, shipped in-repo —
   a rebuild over unchanged sentences makes zero LLM calls;
   `seed_sentences_cache.mjs` rebuilds the cache from existing
   translations).
3. `scripts/build_furigana.py` — hybrid readings (t109): pykakasi
   surface readings per word-chunk as primary, unidic as second
   opinion, the example-word lexicon as referee when the two disagree;
   the target word's reading comes authoritatively from
   `n*_examples.json` (context-matched entry when a word lists several
   readings). All build-time only. Idempotent (`--force` to rebuild).

In-app, the furigana layer is behind a global topbar toggle (ふ,
default on, `localStorage "kanji-sent-furigana"`) and the sentence
text uses Zen Kaku Gothic New for legibility at small sizes.

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
