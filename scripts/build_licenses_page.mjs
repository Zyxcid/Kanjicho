// Build public/licenses.html — the in-app "Open-source licenses" page.
//
// Why this page exists (Play Store compliance): the MIT / Apache-2.0 / ISC
// / SIL-OFL licences of every library and font BUNDLED INTO THE SHIPPED
// BINARY require the *full licence text* to accompany the distribution.
// Since the app repo is private, the "distribution" is the APK itself —
// so the texts must travel inside it. public/ files are copied verbatim
// into the APK assets and the web bundle, and the page is linked from
// Help → Tentang → "Open-source licenses" (same pattern as
// privacy-policy.html: same-origin, fully offline, no external requests).
//
// Source of truth: docs/licenses/ (version-pinned texts + index README).
// Regenerate after every dependency upgrade:
//   node scripts/build_licenses_page.mjs
//
// Output is deliberately English-only (legal/credits convention of this
// app — see HelpButton.jsx "Data sources"), and hand-edit-free.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "docs", "licenses");
const OUT = join(ROOT, "public", "licenses.html");

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Parse the version-pinned index table in docs/licenses/README.md.
// Row shape: | component | version | licence | `LICENSE-file.txt` |
const indexText = readFileSync(join(SRC_DIR, "README.md"), "utf8");
const rows = [];
for (const line of indexText.split("\n")) {
  const m = line.match(
    /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|$/
  );
  if (m && m[1] !== "Component") {
    rows.push({ name: m[1], version: m[2], license: m[3], file: m[4] });
  }
}
if (rows.length === 0) throw new Error("No licence rows parsed from README.md");

const isFont = (r) => r.file.startsWith("LICENSE-OFL-");

const libRows = rows.filter((r) => !isFont(r));
const fontRows = rows.filter((r) => isFont(r));

const entry = (r) => {
  const text = escapeHtml(readFileSync(join(SRC_DIR, r.file), "utf8").trimEnd());
  return `      <details>
        <summary><span class="c">${escapeHtml(r.name)}</span><span class="v">${escapeHtml(
          r.version
        )}</span><span class="l">${escapeHtml(r.license)}</span></summary>
        <pre>${text}</pre>
      </details>`;
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <meta name="theme-color" content="#1F3C5C" />
  <title>Kanjichō — Open-source Licenses</title>
  <style>
    :root {
      --paper: #F5F1E8;
      --ink: #24303E;
      --ink-soft: #5B6672;
      --indigo: #1F3C5C;
      --indigo-soft: #3E5C80;
      --line: #D8D2C4;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --paper: #12161B;
        --ink: #E7E3D8;
        --ink-soft: #A7AEB8;
        --indigo: #9DB4D0;
        --indigo-soft: #B7C8DD;
        --line: #333B44;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Helvetica Neue", Arial, sans-serif;
    }
    main { max-width: 720px; margin: 0 auto; padding: 40px 24px 72px; }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 28px; line-height: 1.25; margin: 0 0 4px;
      color: var(--indigo);
    }
    .sub { color: var(--ink-soft); font-size: 14px; margin-bottom: 28px; }
    h2 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 19px; margin: 34px 0 10px; color: var(--indigo);
      border-bottom: 1px solid var(--line); padding-bottom: 6px;
    }
    p { font-size: 15.5px; }
    details {
      border: 1px solid var(--line);
      border-radius: 8px;
      margin: 8px 0;
      background: rgba(31, 60, 92, 0.03);
    }
    details[open] { background: rgba(31, 60, 92, 0.05); }
    summary {
      cursor: pointer; padding: 10px 14px; font-size: 14.5px;
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px;
      list-style: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: "+"; font-weight: 700; color: var(--indigo-soft); }
    details[open] summary::before { content: "−"; }
    summary .c { font-weight: 600; }
    summary .v { color: var(--ink-soft); font-size: 13px; }
    summary .l {
      margin-left: auto; font-size: 12px; color: var(--indigo-soft);
      border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px;
      white-space: nowrap;
    }
    pre {
      margin: 0; padding: 12px 16px 16px; font-size: 12.5px; line-height: 1.55;
      white-space: pre-wrap; word-break: break-word;
      border-top: 1px solid var(--line);
      color: var(--ink-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .foot { color: var(--ink-soft); font-size: 13px; line-height: 1.6; margin-top: 44px; border-top: 1px solid var(--line); padding-top: 14px; }
    .foot a { color: var(--indigo-soft); }
    a { color: var(--indigo-soft); }
    @media print {
      body { background: #fff; color: #000; }
      details { page-break-inside: avoid; }
      main { padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Kanjichō — Open-source Licenses</h1>
    <div class="sub">Kanjichō 1.0.0 · full licence texts of every third-party component bundled into the app</div>

    <p>
      Kanjichō bundles the open-source libraries and typefaces listed below
      inside its application package. Their licences require the full licence
      text to accompany the distributed app — this page ships inside the app
      itself, works fully offline, and is reachable from Help → About →
      “Open-source licenses”. Kanji dataset licences (KANJIDIC2, JMdict,
      Jiten, KanjiVG, Bluskyo) are attributed in-app (Help → About →
      “Data sources”) and in the
      <a href="https://github.com/Zyxcid/kanjicho-data" target="_blank" rel="noreferrer">open data repository</a>.
    </p>

    <h2>Libraries</h2>
${libRows.map(entry).join("\n")}

    <h2>Typefaces (SIL Open Font License 1.1)</h2>
    <p>
      The three bundled font families ship as @fontsource woff2 subsets.
      Each licence text below carries the per-family copyright line and
      the Reserved Font Name clauses required by OFL 1.1.
    </p>
${fontRows.map(entry).join("\n")}

    <div class="foot">
      This page is generated by <code>scripts/build_licenses_page.mjs</code>
      from the version-pinned texts in <code>docs/licenses/</code> — do not
      edit it by hand; regenerate it whenever a dependency is upgraded.
    </div>
  </main>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} (${rows.length} entries: ${libRows.length} libraries, ${fontRows.length} fonts).`);
