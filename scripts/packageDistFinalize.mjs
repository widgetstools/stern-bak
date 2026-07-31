/**
 * Shared post-`tsc` dist finalizer for @wellsfargo-starui packages that emit
 * real dist builds. Called from each package's `scripts/copy-assets.mjs` as
 * the last step of `npm run build`. Two jobs:
 *
 * 1. **Asset copy** — `tsc` neither copies nor errors on side-effect CSS
 *    imports (`import './x.css'`). The emitted JS keeps those import
 *    statements, so every `.css` under `src/` is copied to the SAME relative
 *    path under `dist/` (grid's exported stylesheets included).
 *
 * 2. **ESM specifier fix-up** — package sources use a mix of extensionless
 *    (`'./GridProvider'`) and extension-full (`'./MarketsGrid.js'`) relative
 *    imports. Vite resolves both, but plain Node ESM / webpack / Next / tsc
 *    node16 consumers of the shipped dist require fully-specified relative
 *    paths. `tsc` does not rewrite specifiers, so this pass rewrites every
 *    extensionless relative import/export/dynamic-import in `dist/**`
 *    `.js` + `.d.ts` files to `./x.js` (file) or `./x/index.js` (directory).
 *    `.d.ts` files use the same `.js` specifiers (TS maps them to `.d.ts`).
 */
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KNOWN_EXT = /\.(js|mjs|cjs|json|css|svg|node)$/;

// `from '...'`, side-effect `import '...'`, dynamic `import('...')`.
const SPECIFIER_RE =
  /(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])(\.\.?\/[^'"]+)\2/gm;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function copyCssFromSrc(pkgDir) {
  const srcDir = path.join(pkgDir, 'src');
  const distDir = path.join(pkgDir, 'dist');
  let copied = 0;
  for (const file of walk(srcDir)) {
    if (!file.endsWith('.css')) continue;
    const rel = path.relative(srcDir, file);
    cpSync(file, path.join(distDir, rel));
    copied++;
  }
  return copied;
}

/** Resolve an extensionless relative specifier against emitted files. */
function fixSpecifier(fileDir, spec, isDts) {
  const fileExt = isDts ? '.d.ts' : '.js';
  const indexName = isDts ? 'index.d.ts' : 'index.js';
  if (existsSync(path.join(fileDir, `${spec}${fileExt}`))) return `${spec}.js`;
  if (existsSync(path.join(fileDir, spec, indexName))) return `${spec}/index.js`;
  return null;
}

function fixEsmSpecifiers(pkgDir) {
  const distDir = path.join(pkgDir, 'dist');
  const warnings = [];
  let rewritten = 0;
  for (const file of walk(distDir)) {
    const isDts = file.endsWith('.d.ts');
    if (!isDts && !/\.js$/.test(file)) continue;
    const fileDir = path.dirname(file);
    const before = readFileSync(file, 'utf8');
    const after = before.replace(SPECIFIER_RE, (whole, lead, quote, spec) => {
      if (KNOWN_EXT.test(spec)) return whole;
      const fixed = fixSpecifier(fileDir, spec, isDts);
      if (!fixed) {
        warnings.push(`${path.relative(pkgDir, file)}: unresolved '${spec}'`);
        return whole;
      }
      rewritten++;
      return `${lead}${quote}${fixed}${quote}`;
    });
    if (after !== before) writeFileSync(file, after);
  }
  return { rewritten, warnings };
}

/**
 * @param {string | URL} pkgDirUrl package root (pass `new URL('..', import.meta.url)`)
 * @param {{ copyCss?: boolean }} [opts]
 */
export function finalizeDist(pkgDirUrl, opts = {}) {
  const pkgDir =
    typeof pkgDirUrl === 'string' ? pkgDirUrl : fileURLToPath(pkgDirUrl);
  const pkgName = JSON.parse(
    readFileSync(path.join(pkgDir, 'package.json'), 'utf8'),
  ).name;

  if (!existsSync(path.join(pkgDir, 'dist'))) {
    throw new Error(`${pkgName}: dist/ missing — run tsc before copy-assets`);
  }

  const copied = opts.copyCss ? copyCssFromSrc(pkgDir) : 0;
  const { rewritten, warnings } = fixEsmSpecifiers(pkgDir);

  const cssNote = opts.copyCss ? `${copied} css copied, ` : '';
  console.log(`${pkgName}: dist finalized (${cssNote}${rewritten} specifiers fixed)`);
  for (const w of warnings) console.warn(`  warn ${w}`);
}
