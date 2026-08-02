/**
 * build.mjs — regenerate the docs/latest PDFs.
 *
 * Prerequisites (one-time, not committed):
 *   npm i --no-save marked pdf-lib   # at the repo root
 *   apps/ installed (`cd apps && npm install`) — supplies Playwright's chromium
 *
 * Run:  node docs/latest/pdf/build.mjs
 * Output: docs/latest/pdf/*.pdf (the .html intermediates are removed).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { marked } from 'marked';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const require = createRequire(import.meta.url);
const { chromium } = require(join(REPO, 'apps', 'node_modules', 'playwright'));

const DOCS = resolve(HERE, '..');
const OUT = join(DOCS, 'pdf');
mkdirSync(OUT, { recursive: true });

const FILES = [
  { md: 'README.md', pdf: 'StarUI-Documentation-Index.pdf', title: 'Documentation Index' },
  { md: 'overview.md', pdf: 'StarUI-Overview.pdf', title: 'Platform Overview' },
  { md: 'getting-started.md', pdf: 'StarUI-Getting-Started.pdf', title: 'Getting Started' },
  { md: 'architecture.md', pdf: 'StarUI-Architecture.pdf', title: 'Architecture' },
  { md: 'packages.md', pdf: 'StarUI-Package-Reference.pdf', title: 'Package Reference' },
];
const PDF_MAP = Object.fromEntries(FILES.map((f) => [f.md.toLowerCase(), f.pdf]));
const TITLE_MAP = Object.fromEntries(FILES.map((f) => [f.md.toLowerCase(), f.title]));
const PDF_SET = new Set(FILES.map((f) => f.pdf));

const CSS = `
  :root {
    --ink: #1c2622; --muted: #5d6b64; --faint: #8a9992;
    --hair: #d9e1dc; --accent: #0e8f6d; --accent-deep: #0b6e54;
    --tint: #f2f7f5; --code-bg: #f5f7f6;
  }
  * { box-sizing: border-box; margin: 0; }
  html { -webkit-print-color-adjust: exact; }
  body {
    font-family: -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.55; color: var(--ink);
  }
  .mono, code, pre, .eyebrow, figcaption { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }

  /* ── Masthead ── */
  .masthead { margin: 0 0 22pt; }
  .eyebrow {
    font-size: 7.5pt; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--accent-deep); margin-bottom: 10pt;
  }
  .masthead h1 { font-size: 23pt; font-weight: 700; letter-spacing: -0.015em; line-height: 1.15; }
  .docmeta { margin-top: 7pt; font-size: 8.5pt; color: var(--muted); }
  .mastrule { margin-top: 12pt; border: 0; border-top: 2.2pt solid var(--accent); width: 44pt; }

  /* ── Headings ── */
  h1, h2, h3, h4 { page-break-after: avoid; line-height: 1.25; }
  h2 {
    font-size: 14.5pt; font-weight: 650; margin: 20pt 0 8pt;
    padding-bottom: 4pt; border-bottom: 0.7pt solid var(--hair);
  }
  h3 { font-size: 11.5pt; font-weight: 650; margin: 14pt 0 6pt; }
  h4 { font-size: 10.5pt; font-weight: 650; margin: 12pt 0 5pt; }
  p { margin: 0 0 7pt; }
  strong { font-weight: 650; }

  /* ── Lists ── */
  ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; }
  li > ul, li > ol { margin-top: 3pt; margin-bottom: 0; }

  /* ── Tables — repeat headers, never clip ── */
  table {
    border-collapse: collapse; width: 100%; margin: 6pt 0 11pt;
    font-size: 9pt; line-height: 1.45;
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th {
    text-align: left; background: var(--tint); color: var(--accent-deep);
    font-size: 8pt; text-transform: uppercase; letter-spacing: 0.07em;
    padding: 4.5pt 7pt; border: 0.6pt solid var(--hair);
  }
  td { padding: 4.5pt 7pt; border: 0.6pt solid var(--hair); vertical-align: top; overflow-wrap: anywhere; }

  /* ── Code — wrap, never truncate ── */
  code {
    font-size: 0.92em; background: var(--code-bg);
    border: 0.5pt solid var(--hair); border-radius: 2pt; padding: 0.5pt 3pt;
    overflow-wrap: anywhere;
  }
  pre {
    background: var(--code-bg); border: 0.6pt solid var(--hair); border-radius: 3pt;
    padding: 8pt 10pt; margin: 6pt 0 11pt; font-size: 8.6pt; line-height: 1.5;
    white-space: pre-wrap; overflow-wrap: anywhere; page-break-inside: avoid;
  }
  pre code { background: none; border: none; padding: 0; font-size: inherit; }

  /* ── Quotes / rules / links ── */
  blockquote {
    margin: 8pt 0 11pt; padding: 6pt 12pt;
    border-left: 2.2pt solid var(--accent); background: var(--tint);
    color: var(--muted); font-size: 9.6pt;
  }
  blockquote p { margin: 0; }
  hr { border: 0; border-top: 0.7pt solid var(--hair); margin: 16pt 0; }
  a { color: var(--accent-deep); text-decoration: none; }
  a[href$='.pdf']::after { content: ' →'; color: var(--faint); }

  /* ── Figures — the diagrams ── */
  figure {
    margin: 12pt 0 16pt; page-break-inside: avoid;
    border: 0.7pt solid var(--hair); border-radius: 4pt;
    padding: 10pt 12pt 8pt; background: #ffffff;
  }
  figure img { display: block; width: 100%; height: auto; }
  figcaption {
    margin-top: 8pt; padding-top: 6pt; border-top: 0.5pt solid var(--hair);
    font-size: 7.5pt; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--accent-deep);
  }
  figcaption .figno { color: var(--faint); }
  img { max-width: 100%; }
`;

function rewriteLinks(html) {
  return html.replace(/<a href="([^"]+)"([^>]*)>(.*?)<\/a>/gs, (m, href, attrs, text) => {
    if (/^https?:/.test(href)) return m;
    const clean = href.replace(/^\.\//, '');
    const [path, _anchor] = clean.split('#');
    const key = (path || '').toLowerCase();
    if (PDF_MAP[key]) {
      // Print-friendly link text: "architecture.md § x" reads as
      // "Architecture § x" in the PDF set.
      const printText = text.replace(/(?:\.\/)?([\w-]+\.md)/gi, (mm, file) =>
        TITLE_MAP[file.toLowerCase()] ?? mm);
      return `<a href="${PDF_MAP[key]}"${attrs}>${printText}</a>`;
    }
    if (!path && _anchor !== undefined) return text;    // in-doc anchor -> plain text
    return text;                                        // out-of-set relative link -> plain text
  });
}

/**
 * Chromium bakes absolute file:// URIs into the link annotations (resolved
 * against the HTML page's <base>, which points at docs/latest for the
 * diagram images — the wrong directory, and machine-specific besides).
 * Rewrite every annotation that targets one of this set's PDFs to a bare
 * RELATIVE URI ("StarUI-Overview.pdf"): viewers resolve those against the
 * containing PDF's own location, so the links survive moving or sharing
 * the pdf/ folder as a unit.
 */
async function relativizeLinks(pdfPath) {
  const doc = await PDFDocument.load(readFileSync(pdfPath));
  let rewritten = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i);
      const action = annot?.lookup?.(PDFName.of('A'));
      if (!action?.lookup) continue;
      const uriObj = action.lookup(PDFName.of('URI'));
      if (!uriObj) continue;
      const uri = decodeURIComponent(String(uriObj.asString?.() ?? uriObj.decodeText?.() ?? ''));
      const base = uri.split('#')[0].split('/').pop();
      if (uri.startsWith('file:') && PDF_SET.has(base)) {
        action.set(PDFName.of('URI'), PDFString.of(base));
        rewritten += 1;
      }
    }
  }
  writeFileSync(pdfPath, await doc.save());
  return rewritten;
}

function figurize(html) {
  let n = 0;
  return html.replace(/<p><img src="([^"]+)" alt="([^"]*)"\s*><\/p>/g, (_m, src, alt) => {
    n += 1;
    return `<figure><img src="${src}" alt="${alt}"><figcaption><span class="figno">Figure ${n}</span> · ${alt}</figcaption></figure>`;
  });
}

const today = new Date().toISOString().slice(0, 10);
const browser = await chromium.launch();
const page = await browser.newPage();

for (const f of FILES) {
  const raw = readFileSync(join(DOCS, f.md), 'utf8');
  const lines = raw.split('\n');
  const h1 = (lines.find((l) => l.startsWith('# ')) ?? `# ${f.title}`).slice(2).trim();
  const body = lines.filter((l) => !l.startsWith('# ')).join('\n');

  let html = marked.parse(body, { gfm: true });
  html = figurize(rewriteLinks(html));

  const doc = `<!doctype html><html><head><meta charset="utf-8">
  <base href="file://${DOCS}/">
  <style>${CSS}</style></head><body>
  <header class="masthead">
    <div class="eyebrow">StarUI · MarketsUI Platform Documentation</div>
    <h1>${h1}</h1>
    <div class="docmeta">${f.title} · docs/latest · generated ${today}</div>
    <hr class="mastrule">
  </header>
  ${html}
  </body></html>`;

  const htmlPath = join(OUT, f.pdf.replace(/\.pdf$/, '.html'));
  writeFileSync(htmlPath, doc);
  await page.goto(`file://${htmlPath}`);
  await page.pdf({
    path: join(OUT, f.pdf),
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-family:Menlo,monospace;font-size:6.5pt;color:#8a9992;padding:0 17mm;display:flex;justify-content:space-between;">
      <span>StarUI Platform · ${f.title}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    margin: { top: '17mm', bottom: '19mm', left: '17mm', right: '17mm' },
  });
  rmSync(htmlPath);
  const links = await relativizeLinks(join(OUT, f.pdf));
  console.log(`wrote ${f.pdf} (${links} cross-links relativized)`);
}
await browser.close();
