/**
 * Tailwind preset for app tailwind.config.* — loaded by PostCSS/jiti (not Vite).
 * Resolves from installed @wellsfargo-starui/design-system or monorepo dist after build:packages.
 */
const { resolve } = require('node:path');
const { existsSync } = require('node:fs');
const { createRequire } = require('node:module');

const REPO_ROOT = resolve(__dirname, '..');

function appsRequire() {
  const appsTailwindPkg = resolve(REPO_ROOT, 'apps/node_modules/tailwindcss/package.json');
  if (existsSync(appsTailwindPkg)) {
    return createRequire(appsTailwindPkg);
  }
  return createRequire(resolve(REPO_ROOT, 'package.json'));
}

function resolveJiti() {
  // Apps build from source and no longer hoist jiti into apps/node_modules
  // (it used to arrive via the bucket tarballs). It is still installed at the
  // repo root (a transitive of tailwindcss). Search both, then fall back to
  // Node resolution from this file.
  const candidates = [
    resolve(REPO_ROOT, 'apps/node_modules/jiti/lib/index.js'),
    resolve(REPO_ROOT, 'node_modules/jiti/lib/index.js'),
  ];
  const hit = candidates.find((p) => existsSync(p));
  if (hit) return hit;
  try {
    return createRequire(__filename).resolve('jiti');
  } catch {
    return null;
  }
}

function loadViaJiti(modulePath) {
  const jitiPath = resolveJiti();
  if (!jitiPath) {
    throw new Error('jiti not found — run `npm install` at the repo root (or `npm run install:apps`)');
  }
  const jiti = require(jitiPath);
  const load = jiti(__filename, { interopDefault: true });
  const mod = load(modulePath);
  return mod?.tailwindPreset ?? mod?.default?.tailwindPreset ?? mod;
}

function loadTailwindPreset() {
  const req = appsRequire();

  try {
    const mod = req('@wellsfargo-starui/design-system/tailwind');
    if (mod?.tailwindPreset) return mod.tailwindPreset;
  } catch {
    /* tarball not installed — use monorepo dist */
  }

  const distPath = resolve(
    REPO_ROOT,
    'packages/design-system/design-system/dist/adapters/tailwind.js',
  );
  if (!existsSync(distPath)) {
    throw new Error(
      'Cannot load StarUI Tailwind preset. Run: npm run build:packages (and npm run install:apps for tarball-only apps).',
    );
  }

  return loadViaJiti(distPath);
}

module.exports = { tailwindPreset: loadTailwindPreset() };
