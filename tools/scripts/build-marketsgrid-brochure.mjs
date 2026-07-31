#!/usr/bin/env node
/**
 * Build the MarketsGrid product brochure (PDF) from the source feature
 * inventory at docs/2026-05-07/architecture-and-design/MARKETS_GRID_FEATURES.md.
 *
 * Pipeline:
 *   1. Read the markdown source.
 *   2. Render to HTML via `marked`.
 *   3. Wrap in a print-ready brochure shell (cover + highlights +
 *      rendered feature inventory) styled for Letter size with sane
 *      page breaks.
 *   4. Print to PDF via the local Chrome installation in headless mode.
 *
 * Re-run anytime the source markdown changes:
 *   node tools/scripts/build-marketsgrid-brochure.mjs
 *
 * Outputs:
 *   docs/2026-05-07/architecture-and-design/MarketsGrid-Brochure.html
 *   docs/2026-05-07/architecture-and-design/MarketsGrid-Brochure.pdf
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const docDir = path.join(repoRoot, 'docs', '2026-05-07', 'architecture-and-design');
const sourceMd = path.join(docDir, 'MARKETS_GRID_FEATURES.md');
const outHtml = path.join(docDir, 'MarketsGrid-Brochure.html');
const outPdf = path.join(docDir, 'MarketsGrid-Brochure.pdf');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ─── 1. read + render markdown ───────────────────────────────────────

const md = fs.readFileSync(sourceMd, 'utf8');

// Drop the first H1 + intro paragraph; we replace them with a custom
// cover + highlights block. The body starts at the first horizontal rule.
const bodyMd = md.replace(/^[\s\S]*?\n---\n\n/, '');

marked.setOptions({ headerIds: false, mangle: false, gfm: true });
const bodyHtml = marked.parse(bodyMd);

// ─── 2. brochure HTML shell ──────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

const html = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MarketsGrid — Product Brochure</title>
<style>
  /* ─── Page setup ──────────────────────────────────────────── */
  @page { size: Letter; margin: 0.55in 0.6in 0.7in 0.6in; }
  @page :first { margin: 0; }

  /* ─── Tokens ──────────────────────────────────────────────── */
  :root {
    --ink: #0f172a;
    --ink-soft: #334155;
    --muted: #64748b;
    --line: #e2e8f0;
    --accent: #1e3a8a;       /* deep navy — capital-markets feel */
    --accent-soft: #3b82f6;
    --gold: #b45309;         /* warm accent for callouts */
    --bg: #ffffff;
    --code-bg: #f1f5f9;
    --code-ink: #0f172a;
  }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    color: var(--ink);
    background: var(--bg);
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  h1, h2, h3, h4 { color: var(--ink); margin: 0; }
  h2 { font-size: 16pt; font-weight: 700; letter-spacing: -0.01em; }
  h3 { font-size: 11.5pt; font-weight: 700; margin-top: 12pt; margin-bottom: 4pt; color: var(--accent); }
  h4 { font-size: 10pt; font-weight: 700; margin-top: 8pt; margin-bottom: 3pt; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em; }

  p { margin: 4pt 0; }
  ul { margin: 4pt 0 6pt 0; padding-left: 16pt; }
  li { margin: 1pt 0; }
  li::marker { color: var(--accent-soft); }

  code {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
    background: var(--code-bg);
    color: var(--code-ink);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 8.8pt;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 6pt 0 10pt;
    font-size: 9.2pt;
  }
  th, td {
    border-bottom: 1px solid var(--line);
    padding: 5pt 8pt;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f8fafc;
    color: var(--accent);
    font-weight: 600;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1.5px solid var(--accent);
  }

  hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 14pt 0 10pt;
  }

  /* ─── Cover ───────────────────────────────────────────────── */
  .cover {
    width: 100%;
    height: 11in;
    page-break-after: always;
    position: relative;
    background:
      radial-gradient(circle at 80% 0%, rgba(59,130,246,0.18), transparent 55%),
      radial-gradient(circle at 0% 100%, rgba(180,83,9,0.10), transparent 50%),
      linear-gradient(135deg, #0b1c3f 0%, #1e3a8a 60%, #2563eb 100%);
    color: #f8fafc;
    padding: 1.0in 0.9in;
    overflow: hidden;
  }
  .cover::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px);
    background-size: 42px 42px;
    opacity: 0.6;
    pointer-events: none;
  }
  .cover-eyebrow {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.32em;
    color: rgba(255,255,255,0.75);
    margin-bottom: 18pt;
    position: relative;
  }
  .cover-title {
    font-size: 56pt;
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.0;
    color: #ffffff;
    position: relative;
  }
  .cover-title .accent { color: #fcd34d; }
  .cover-tagline {
    margin-top: 10pt;
    font-size: 17pt;
    font-weight: 400;
    line-height: 1.3;
    color: rgba(255,255,255,0.92);
    max-width: 6.5in;
    position: relative;
  }
  .cover-rule {
    width: 90pt;
    height: 4px;
    background: #fcd34d;
    margin-top: 32pt;
    position: relative;
  }
  .cover-blurb {
    margin-top: 22pt;
    font-size: 11pt;
    color: rgba(255,255,255,0.86);
    max-width: 5.0in;
    line-height: 1.55;
    position: relative;
  }
  .cover-foot {
    position: absolute;
    left: 0.9in;
    right: 0.9in;
    bottom: 0.7in;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    color: rgba(255,255,255,0.7);
    font-size: 9pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .cover-foot .brand {
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.18em;
  }

  /* ─── Highlights page ─────────────────────────────────────── */
  .highlights {
    page-break-after: always;
  }
  .highlights-eyebrow {
    font-size: 8.5pt;
    color: var(--gold);
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-weight: 700;
    margin-bottom: 4pt;
  }
  .highlights h2 {
    font-size: 22pt;
    letter-spacing: -0.018em;
    line-height: 1.1;
    color: var(--accent);
    margin-bottom: 6pt;
  }
  .highlights-lead {
    font-size: 11.5pt;
    color: var(--ink-soft);
    line-height: 1.55;
    max-width: 6.6in;
    margin-bottom: 18pt;
  }

  .pillars {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10pt;
    margin-top: 8pt;
  }
  .pillar {
    border: 1px solid var(--line);
    border-top: 3px solid var(--accent);
    padding: 12pt 12pt 14pt;
    border-radius: 4px;
    background: #fdfdfe;
  }
  .pillar h3 {
    margin: 0 0 6pt 0;
    color: var(--accent);
    font-size: 11pt;
    text-transform: none;
    letter-spacing: 0;
  }
  .pillar p {
    margin: 0;
    font-size: 9.4pt;
    color: var(--ink-soft);
    line-height: 1.45;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10pt;
    margin-top: 16pt;
    padding: 14pt 12pt;
    border: 1px solid var(--line);
    background: #f8fafc;
    border-radius: 4px;
  }
  .stat .num {
    font-size: 22pt;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .stat .label {
    margin-top: 3pt;
    font-size: 8.5pt;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .who {
    margin-top: 18pt;
    padding: 10pt 12pt;
    border-left: 3px solid var(--gold);
    background: #fffbeb;
    border-radius: 0 3px 3px 0;
    font-size: 9.6pt;
    color: var(--ink-soft);
    line-height: 1.55;
  }
  .who strong { color: var(--ink); }

  /* ─── Body sections ───────────────────────────────────────── */
  .body {
    /* enable balanced two-column flow on long bullet sections via
       inline class hooks if needed; default single column for clarity */
  }
  .body h2 {
    margin-top: 16pt;
    margin-bottom: 4pt;
    padding-bottom: 4pt;
    border-bottom: 1.5px solid var(--accent);
    color: var(--accent);
    page-break-after: avoid;
  }
  .body h2 + p,
  .body h2 + ul,
  .body h3 + ul { page-break-before: avoid; }
  .body h3, .body h4 { page-break-after: avoid; }
  .body table { page-break-inside: avoid; }
  .body ul { page-break-inside: avoid; }
  .body hr { display: none; }

  .body-intro {
    margin-bottom: 14pt;
    padding: 10pt 12pt;
    background: #f8fafc;
    border-left: 3px solid var(--accent);
    color: var(--ink-soft);
    font-size: 9.6pt;
    border-radius: 0 3px 3px 0;
  }

  /* Soft visual rhythm: the H2 sections are 1..23 — give them a
     tasteful hairline before each (except the first). */
  .body h2 + * { margin-top: 6pt; }

  /* ─── Footer ──────────────────────────────────────────────── */
  .pageFoot {
    /* Chrome's --print-to-pdf doesn't fire @page margin boxes the way
       paged.js does, so we don't try for live page numbers — instead
       a closing colophon at the very end of the document. */
  }

  .colophon {
    margin-top: 28pt;
    padding-top: 12pt;
    border-top: 1.5px solid var(--accent);
    font-size: 8.6pt;
    color: var(--muted);
    line-height: 1.5;
  }
  .colophon strong { color: var(--ink-soft); }
</style>
</head>
<body>

<!-- ─── Cover ─────────────────────────────────────────────────── -->
<section class="cover">
  <div class="cover-eyebrow">Product Brochure · ${today}</div>
  <div class="cover-title">Markets<span class="accent">Grid</span></div>
  <div class="cover-tagline">An institutional-grade AG-Grid customization platform purpose-built for capital&nbsp;markets trading desks.</div>
  <div class="cover-rule"></div>
  <div class="cover-blurb">
    Profile-driven personalization, calculated columns with a real expression engine, conditional styling, enterprise persistence, and a cockpit-style settings UI — all behind a single <code style="background:rgba(255,255,255,0.18);color:#fcd34d;border-radius:3px;padding:1px 5px;">&lt;MarketsGrid&gt;</code> component.
  </div>
  <div class="cover-foot">
    <div class="brand">MarketsUI Platform</div>
    <div>Code-derived feature inventory · current build</div>
  </div>
</section>

<!-- ─── Highlights ────────────────────────────────────────────── -->
<section class="highlights">
  <div class="highlights-eyebrow">At a glance</div>
  <h2>Everything a trading-desk grid needs, in one component</h2>
  <p class="highlights-lead">
    MarketsGrid layers a profile-driven customization platform on top of AG-Grid Enterprise.
    Traders save and switch full grid personalities; analysts author calculated columns,
    conditional styling, and reusable column templates; operators get enterprise-grade
    persistence, role-based config, and OpenFin-aware popouts — without bespoke wiring per desk.
  </p>

  <div class="pillars">
    <div class="pillar">
      <h3>Profile-driven personalization</h3>
      <p>Full grid state — columns, filters, sort, groups, pivot, viewport, sidebar — saved per profile and switched in a click. Import / export, clone, dirty tracking, and OpenFin per-view active profile resolution out of the box.</p>
    </div>
    <div class="pillar">
      <h3>Live calculated &amp; conditional</h3>
      <p>Real expression engine with math, stats, string, date, and logic functions. Virtual columns, row- and cell-level rules, header pulses, indicator icons, and Excel-format aware value formatters — all authored from the cockpit.</p>
    </div>
    <div class="pillar">
      <h3>Enterprise-ready persistence</h3>
      <p>Pluggable storage adapters: in-memory, Dexie / IndexedDB, or REST-backed config service with role-based identity. Auto-save with debounce, explicit save semantics on grid state, and round-trip safe profile import / export.</p>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><div class="num">9</div><div class="label">Customization modules</div></div>
    <div class="stat"><div class="num">40+</div><div class="label">Expression functions</div></div>
    <div class="stat"><div class="num">30+</div><div class="label">Format presets</div></div>
    <div class="stat"><div class="num">100%</div><div class="label">Profile round-trip</div></div>
  </div>

  <div class="who">
    <strong>Built for:</strong> fixed-income, equity, FX, and credit desks running OpenFin, Workspace, or
    plain-browser deployments. Drop-in for AG-Grid Enterprise customers; pairs with
    <code>@wellsfargo-starui/config-service</code> for multi-app, multi-tenant config governance.
  </div>
</section>

<!-- ─── Feature inventory ─────────────────────────────────────── -->
<section class="body">
  <h2 style="border-bottom:none;margin-bottom:0;font-size:22pt;color:var(--accent);">Feature inventory</h2>
  <div class="body-intro">
    The pages that follow are a code-derived inventory of every public surface,
    module, and capability shipped by MarketsGrid in the current build —
    compiled by reading the source under <code>packages/markets-grid/</code>,
    <code>packages/core/src/modules/</code>, <code>packages/core/src/expression/</code>,
    <code>packages/core/src/ui/</code>, and <code>packages/core/src/profiles/</code>.
    No marketing prose — just what the code actually does.
  </div>
  ${bodyHtml}

  <div class="colophon">
    <strong>About this document.</strong> Compiled directly from the MarketsGrid source tree.
    Sections are kept in lockstep with <code>MarketsGrid.DEFAULT_MODULES</code>, the
    cockpit settings primitives, and the public exports of <code>@wellsfargo-starui/core</code>.
    For the canonical, machine-readable source see
    <code>docs/2026-05-07/architecture-and-design/MARKETS_GRID_FEATURES.md</code>
    in the MarketsUI platform repository.
  </div>
</section>

</body>
</html>
`;

fs.writeFileSync(outHtml, html, 'utf8');
console.log(`✓ wrote ${path.relative(repoRoot, outHtml)}`);

// ─── 3. headless Chrome → PDF ────────────────────────────────────────

if (!fs.existsSync(CHROME)) {
  console.error(`✗ Chrome not found at ${CHROME}; HTML written but PDF skipped.`);
  process.exit(1);
}

const fileUrl = `file://${outHtml}`;
const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${outPdf}`,
  '--virtual-time-budget=2000',
  fileUrl,
];

execFileSync(CHROME, args, { stdio: 'inherit' });

const stat = fs.statSync(outPdf);
console.log(`✓ wrote ${path.relative(repoRoot, outPdf)} (${(stat.size / 1024).toFixed(1)} KB)`);
