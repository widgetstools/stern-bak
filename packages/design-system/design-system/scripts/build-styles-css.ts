// ─────────────────────────────────────────────────────────────
//  build-styles-css.ts — emits the consumer-facing stylesheets.
//
//    dist/css/styles.css — THE import. Design tokens + self-hosted
//                          @font-face + the minimal base rules our
//                          utilities mechanically require (including
//                          Tailwind's --tw-* variable defaults, without
//                          which transform/ring/shadow/filter utilities
//                          compute to their invalid/initial value) +
//                          every component's compiled Tailwind utilities +
//                          the grid's chrome CSS.
//    dist/css/reset.css  — OPT-IN global normalisation (Tailwind
//                          preflight). Restyles the CONSUMER's own
//                          markup, so it is never bundled into
//                          styles.css — the MUI `CssBaseline` /
//                          Chakra `resetCSS` convention.
//    dist/fonts/*.woff2  — Inter + JetBrains Mono (variable, latin +
//                          latin-ext), copied from @fontsource-variable
//                          at build time. No CDN, no consumer install.
//
//  Why the split is not "styles.css = zero global rules": Tailwind's
//  `border-*` utilities only set border-WIDTH. They render nothing
//  unless `border-style: solid` and `border-width: 0` are defaulted on
//  `*` first — that default lives in preflight. So styles.css carries
//  those few mechanically-required declarations (in a @layer, so a
//  consumer's own rules win) while the opinionated document
//  normalisation — heading margins, list markers, form typography,
//  img display — stays in reset.css.
// ─────────────────────────────────────────────────────────────

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
// tailwindcss/nesting has no bundled types; it is a plain PostCSS plugin.
 
// @ts-ignore
import tailwindNesting from 'tailwindcss/nesting';
import autoprefixer from 'autoprefixer';
import { tailwindPreset } from '../src/adapters/tailwind';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, '..');
const repoRoot = resolve(pkgRoot, '../../..');
const require = createRequire(import.meta.url);

// Every package whose TSX carries Tailwind utility classes.
const CONTENT_GLOBS = [
  'packages/react-core/ui/src/**/*.{ts,tsx}',
  'packages/react-grid/grid/src/**/*.{ts,tsx}',
  'packages/react-grid/widgets-react/src/**/*.{ts,tsx}',
  'packages/react-grid/config-browser/src/**/*.{ts,tsx}',
  'packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  'packages/react-core/host-data-react/src/**/*.{ts,tsx}',
].map((g) => resolve(repoRoot, g).replace(/\\/g, '/'));

// The grid package's chrome CSS, inlined so one import styles the whole
// estate. The marketsGrid.css barrel is expanded manually (its @imports
// would dangle once concatenated).
const GRID_CSS = [
  'src/widget/styles/marketsGrid-core.css',
  'src/widget/styles/marketsGrid-chrome.css',
  'src/widget/grid-chrome.css',
  'src/widget/HelpPanel.css',
  'src/widget/ProfileSelector.css',
  'src/widget/editingToolbar/editingToolbar.css',
  'src/widget/formatter/formatter.css',
  'src/customizer/modules/alerts/AlertsBadge.css',
  'src/customizer/ui/ExpressionEditor/expressionEditor.css',
].map((p) => resolve(repoRoot, 'packages/react-grid/grid', p));

/** Variable-font faces to self-host: [fontsource pkg, family, files…]. */
const FONTS = [
  {
    pkg: '@fontsource-variable/inter',
    family: 'Inter',
    css: 'wght.css',
    files: ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2'],
  },
  {
    pkg: '@fontsource-variable/jetbrains-mono',
    family: 'JetBrains Mono',
    css: 'wght.css',
    files: [
      'jetbrains-mono-latin-wght-normal.woff2',
      'jetbrains-mono-latin-ext-wght-normal.woff2',
    ],
  },
];

function fail(msg: string): never {
  throw new Error(`[build-styles-css] ${msg}`);
}

/**
 * Pull the Tailwind preflight rules that are 100% custom-property
 * declarations (`--tw-translate-x`, `--tw-ring-color`, `--tw-blur`, …) out
 * of a compiled `@tailwind base;` root. Every transform/ring/shadow/filter/
 * backdrop-filter utility Tailwind emits composes its final property value
 * from these `--tw-*` variables via `var(--tw-foo)` with NO fallback — if a
 * variable is never set on an element, the whole shorthand (`transform`,
 * `box-shadow`, `filter`, …) is invalid at computed-value time and the
 * browser drops back to the property's initial value (e.g. `transform:
 * none`). Preflight normally sets sane defaults for all of them on `*,
 * ::before, ::after` (+ `::backdrop`) — but `styles.css` compiles with
 * `preflight: false` so its opinionated margin/heading/list resets don't
 * leak onto a consumer's own markup, and that turns off the var defaults
 * too. Isolate ONLY those rules (rather than hand-copying Tailwind's
 * variable list, which would silently drift on a version bump) by keeping
 * whatever preflight rule is composed entirely of `--`-prefixed
 * declarations — structurally, that is exactly (and only) this reset.
 */
function extractCustomPropertyDefaults(root: import('postcss').Root): string {
  const kept: string[] = [];
  root.walkRules((rule) => {
    const decls = rule.nodes.filter((n) => n.type === 'decl');
    if (decls.length === 0) return;
    const allCustomProps = decls.every(
      (n) => n.type === 'decl' && n.prop.startsWith('--'),
    );
    if (allCustomProps) kept.push(rule.toString());
  });
  if (kept.length === 0) {
    fail('extractCustomPropertyDefaults found no --tw-* reset rules in preflight output — Tailwind version change?');
  }
  return kept.join('\n\n');
}

/**
 * Copy the woff2 files into dist/fonts and build @font-face rules,
 * reusing Fontsource's own `unicode-range` values so subsetting still
 * works. Fails loudly on a missing file — an `existsSync` filter here
 * previously let a stale path silently drop a stylesheet.
 */
function buildFonts(): string {
  const fontsOut = resolve(pkgRoot, 'dist/fonts');
  mkdirSync(fontsOut, { recursive: true });
  const blocks: string[] = [];

  for (const font of FONTS) {
    const pkgJson = require.resolve(`${font.pkg}/package.json`);
    const fontRoot = dirname(pkgJson);

    // Ship the OFL licence next to the fonts (required by OFL-1.1).
    const licence = resolve(fontRoot, 'LICENSE');
    if (!existsSync(licence)) fail(`missing licence for ${font.pkg}`);
    copyFileSync(licence, resolve(fontsOut, `LICENSE-${font.family.replace(/\s+/g, '-')}.txt`));

    const srcCss = resolve(fontRoot, font.css);
    if (!existsSync(srcCss)) fail(`missing ${font.css} in ${font.pkg}`);
    const declarations = readFileSync(srcCss, 'utf8');

    for (const file of font.files) {
      const from = resolve(fontRoot, 'files', file);
      if (!existsSync(from)) fail(`missing font file ${from}`);
      copyFileSync(from, resolve(fontsOut, file));

      // Pull this file's unicode-range straight out of Fontsource's CSS.
      const re = new RegExp(
        `@font-face\\s*\\{[^}]*${file.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^}]*\\}`,
        'm',
      );
      const match = declarations.match(re);
      if (!match) fail(`no @font-face block for ${file} in ${font.pkg}/${font.css}`);
      const range = match[0].match(/unicode-range:\s*([^;]+);/)?.[1];
      if (!range) fail(`no unicode-range for ${file}`);

      blocks.push(
        [
          '@font-face {',
          `  font-family: '${font.family}';`,
          '  font-style: normal;',
          '  font-display: swap;',
          '  font-weight: 100 900;',
          `  src: url('../fonts/${file}') format('woff2-variations');`,
          `  unicode-range: ${range.trim()};`,
          '}',
        ].join('\n'),
      );
    }
  }

  return [
    '/* ── Self-hosted variable fonts (Inter, JetBrains Mono — OFL-1.1) ──',
    '   Shipped in this package; no CDN request, no consumer install.',
    '   Licences: dist/fonts/LICENSE-*.txt */',
    blocks.join('\n\n'),
  ].join('\n');
}

/**
 * The only global rules styles.css carries. Wrapped in a cascade layer so
 * ANY unlayered consumer rule beats them, and deliberately limited to what
 * Tailwind's utilities cannot function without.
 */
const MINIMAL_BASE = `@layer wf-base {
  /* Tailwind's border-* utilities set WIDTH only; without these defaults a
     \`border\` class renders nothing (initial border-style is none). */
  *,
  ::before,
  ::after {
    box-sizing: border-box;
    border-width: 0;
    border-style: solid;
    border-color: oklch(var(--border));
  }

  /* Form controls do NOT inherit typography from their ancestors — browsers
     substitute a system font (verified: our Button rendered in Arial without
     this). Every button/input/select we ship is styled with utility classes
     that assume inherited type, so this is mechanically required, not an
     aesthetic opinion.
     NOTE: this DOES also normalise a consumer's own form controls. It is the
     one place styles.css reaches beyond our components, and is documented as
     such — the alternative (native button chrome fighting our background and
     padding utilities) makes the components unusable. */
  button,
  input,
  optgroup,
  select,
  textarea {
    font-family: inherit;
    font-feature-settings: inherit;
    font-variation-settings: inherit;
    font-size: 100%;
    font-weight: inherit;
    line-height: inherit;
    letter-spacing: inherit;
    color: inherit;
    margin: 0;
    padding: 0;
  }

  button,
  select {
    text-transform: none;
  }

  button,
  input:where([type='button']),
  input:where([type='reset']),
  input:where([type='submit']) {
    -webkit-appearance: button;
    appearance: button;
    background-color: transparent;
    background-image: none;
  }

  :disabled {
    cursor: default;
  }
}`;

async function main(): Promise<void> {
  const fontFaces = buildFonts();

  // 1. Preflight ALONE → reset.css (opt-in).
  const reset = await postcss([
    tailwindNesting,
    tailwindcss({
      presets: [tailwindPreset],
      corePlugins: { preflight: true },
      content: CONTENT_GLOBS,
    } as never),
    autoprefixer,
  ]).process('@tailwind base;', { from: undefined });

  // 2. Components + utilities WITHOUT preflight → part of styles.css.
  const utilities = await postcss([
    tailwindNesting,
    tailwindcss({
      presets: [tailwindPreset],
      corePlugins: { preflight: false },
      content: CONTENT_GLOBS,
    } as never),
    autoprefixer,
  ]).process('@tailwind components;\n@tailwind utilities;', { from: undefined });

  // 3. Grid chrome — nesting transform applied; fail loudly on a bad path.
  const missing = GRID_CSS.filter((p) => !existsSync(p));
  if (missing.length > 0) fail(`GRID_CSS path(s) not found:\n  ${missing.join('\n  ')}`);
  const gridRaw = GRID_CSS
    .map((p) => `/* ── ${p.split(/[\\/]/).slice(-1)[0]} ── */\n` + readFileSync(p, 'utf8'))
    .join('\n\n');
  const grid = await postcss([tailwindNesting, autoprefixer]).process(gridRaw, { from: undefined });

  // 3b. The `--tw-*` var defaults preflight normally provides, isolated so
  // transform/ring/shadow/filter utilities compute correctly without
  // pulling in the rest of preflight's document reset. See the doc comment
  // on extractCustomPropertyDefaults for why this is structurally required.
  const customPropertyDefaults = extractCustomPropertyDefaults(reset.root);

  // 4. Tokens — strip the Google Fonts @import; we self-host now.
  const theme = readFileSync(resolve(pkgRoot, 'dist/css/theme.css'), 'utf8').replace(
    /@import url\('https:\/\/fonts\.googleapis\.com[^)]*'\);?/g,
    '/* fonts: self-hosted, see @font-face below */',
  );

  mkdirSync(resolve(pkgRoot, 'dist/css'), { recursive: true });

  writeFileSync(
    resolve(pkgRoot, 'dist/css/reset.css'),
    [
      '/* @wellsfargo-starui/design-system — reset.css (OPT-IN) */',
      '/* generated by scripts/build-styles-css.ts; do not edit by hand */',
      '/* Global normalisation. Import ONLY if your app has no reset of its',
      '   own — it restyles YOUR markup (headings, lists, forms, images). */',
      '',
      reset.css,
      '',
    ].join('\n'),
  );

  writeFileSync(
    resolve(pkgRoot, 'dist/css/styles.css'),
    [
      '/* @wellsfargo-starui/design-system — styles.css */',
      '/* generated by scripts/build-styles-css.ts; do not edit by hand */',
      '/* tokens + self-hosted fonts + component styles. Contains NO global',
      '   document reset — import ./reset.css separately if you want one. */',
      '',
      fontFaces,
      '',
      theme,
      '',
      MINIMAL_BASE,
      '',
      '/* Tailwind preflight\'s --tw-* variable defaults (extracted — see',
      '   extractCustomPropertyDefaults in build-styles-css.ts). Required for',
      '   transform/ring/shadow/filter/backdrop-filter utilities to compute;',
      '   without them e.g. `translate-x-[-50%]` resolves to `transform: none`. */',
      customPropertyDefaults,
      '',
      utilities.css,
      '',
      grid.css,
      '',
    ].join('\n'),
  );

  const kb = (s: string) => Math.round(Buffer.byteLength(s) / 1024);
  console.log(
    `[build-styles-css] styles.css ${kb(fontFaces) + kb(theme) + kb(MINIMAL_BASE) + kb(customPropertyDefaults) + kb(utilities.css) + kb(grid.css)} KB · `
      + `reset.css ${kb(reset.css)} KB · fonts ${FONTS.reduce((n, f) => n + f.files.length, 0)} woff2`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
