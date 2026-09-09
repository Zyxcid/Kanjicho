# NOTICE — Kanjichō app

The application code in this repository is proprietary. The **data** it
ships and the obligations attached to that data are described here.

## Data licensing

`src/data/n*.json`, `src/data/n*_examples.json`,
`src/data/strokes_n*.json`, `src/data/components_n*.json` are derived from:

- **KANJIDIC2** and **JMdict** — © Electronic Dictionary Research and
  Development Group — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- **Jiten frequency lists (global)** — © Jiten (jiten.moe) —
  [CC BY-SA 4.0](https://jiten.moe/frequency-dictionaries) — build-time
  frequency signal (hybrid: jiten primary, JMdict common-word markers as
  fallback), **no frequency values are shipped** in `src/data/`
- **KanjiVG** — © Ulrich Apel — [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- **JLPT_Vocabulary** (Bluskyo) — MIT — level assignments only

To satisfy the ShareAlike obligations of the derived dataset, the exact data
files shipped in the app are published at:
**https://github.com/Zyxcid/kanjicho-data** (README + NOTICE + full licence
texts + file-to-source mapping live there). Keep that repository in sync
with `src/data/` on every release that changes the data.

In-app attribution is shown in Help → "Data sources" (KANJIDIC2, JMdict,
Jiten, KanjiVG, Bluskyo, with licence links), which satisfies the
attribution requirement of the CC BY-SA licences.

## Fonts

`public/fonts/` + `src/styles/fonts.css` are self-hosted subsets (woff2,
unicode-range) of Google Fonts — Shippori Mincho, Zen Kaku Gothic New,
DM Mono — all **SIL Open Font License 1.1**. Regenerate with
`python scripts/fetch_fonts.py`. Self-hosting exists so the app makes
**zero third-party requests**, keeping the "no data collected / no data
shared" declaration in the privacy policy honest.

## Privacy policy

`public/privacy-policy.html` — served from the same origin as the app and
linked from Help → "Privacy policy". Developer identity placeholders are
filled (Syahid Nurhidayatullah / kanjicho.dev@gmail.com / Indonesia) —
review the contact and policy sections before publishing to Google Play.

## Third-party libraries (bundled at build time)

- react, react-dom — MIT © Meta / contributors
- dexie — Apache-2.0 © Dexie.js project
- ts-fsrs — MIT
- lucide-react — ISC © Lucide contributors
- vite, @vitejs/plugin-react, vite-plugin-pwa (dev only) — MIT

## Trademark

"JLPT" is a trademark of its organisers (JEES et al.). Kanjichō is an
independent study tool and is not affiliated with, authorised by, or
endorsed by them — disclaimer shown in-app (Help) and in the privacy policy.
