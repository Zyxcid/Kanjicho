# Third-party licence texts

Full licence texts for every third-party component that is **bundled into
the shipped app** (web bundle / APK). Versions are pinned to the versions
in `package-lock.json` at the time of writing — refresh both the files and
this index whenever you upgrade a dependency.

| Component | Version | Licence | Text |
|---|---|---|---|
| react | 18.3.1 | MIT | `LICENSE-react-18.3.1.txt` |
| react-dom | 18.3.1 | MIT | `LICENSE-react-dom-18.3.1.txt` |
| dexie | 4.4.4 | Apache-2.0 | `LICENSE-dexie-4.4.4.txt` |
| ts-fsrs | 5.4.2 | MIT | `LICENSE-ts-fsrs-5.4.2.txt` |
| lucide-react | 0.383.0 | ISC | `LICENSE-lucide-react-0.383.0.txt` |
| @capacitor/core | 8.5.2 | MIT | `LICENSE-capacitor-core-8.5.2.txt` |
| @capacitor/android | 8.5.2 | MIT | `LICENSE-capacitor-android-8.5.2.txt` |
| @capacitor/filesystem | 8.1.3 | MIT | `LICENSE-capacitor-filesystem-8.1.3.txt` |
| @capacitor/share | 8.0.1 | MIT | `LICENSE-capacitor-share-8.0.1.txt` |
| @capacitor/local-notifications | 8.3.1 | MIT | `LICENSE-capacitor-local-notifications-8.3.1.txt` |
| Shippori Mincho (@fontsource) | 5.3.0 | SIL OFL 1.1 | `LICENSE-OFL-shippori-mincho.txt` |
| Zen Kaku Gothic New (@fontsource) | 5.3.0 | SIL OFL 1.1 | `LICENSE-OFL-zen-kaku-gothic-new.txt` |
| DM Mono (@fontsource) | 5.3.0 | SIL OFL 1.1 | `LICENSE-OFL-dm-mono.txt` |

The fonts are bundled as @fontsource woff2 subsets via Vite; OFL 1.1
permits bundling and redistribution inside an app as long as this licence
text (including the per-family copyright line) accompanies the
distribution — which is exactly what this folder provides.

Kanji data licences (KANJIDIC2 / JMdict / Jiten / KanjiVG / Bluskyo) are
handled in `NOTICE.md` and in the open data repository
(https://github.com/Zyxcid/kanjicho-data).
