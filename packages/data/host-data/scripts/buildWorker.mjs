/**
 * Bundle the worker entries into single-file assets.
 *
 * tsc emits `defaultEntry.js` with bare `@wellsfargo-starui/*` imports that the
 * browser cannot resolve when loaded as a standalone worker script.
 * esbuild inlines host-data, host-config, dexie, and optional stomp
 * into `dist/assets/data-services-worker.mjs` for Vite `?url` imports.
 *
 * Two bundles:
 *   1. `data-provider-worker.js` — the per-provider SharedWorker
 *      (`dataPlane: 'subworker'`): a classic script holding the transports
 *      only (no ConfigManager / dexie). Windows construct it by URL
 *      (`@wellsfargo-starui/data/assets/data-provider-worker.js?url`) and hand its
 *      port to the hub.
 *   2. `data-services-worker.mjs` — the SharedWorker hub.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const outDir = path.join(pkgRoot, 'dist', 'assets');

fs.mkdirSync(outDir, { recursive: true });

const shared = {
  bundle: true,
  platform: 'browser',
  target: ['es2022'],
  logLevel: 'info',
  packages: 'bundle',
  mainFields: ['module', 'import', 'main'],
  conditions: ['import', 'module', 'default'],
  alias: {
    '@stomp/stompjs': path.join(pkgRoot, '../../../node_modules/@stomp/stompjs/esm6/index.js'),
  },
  legalComments: 'none',
};

// ── 1. provider sub-worker (classic script, self-contained) ─────────────
const providerWorkerPath = path.join(outDir, 'data-provider-worker.js');
await esbuild.build({
  ...shared,
  entryPoints: [path.join(pkgRoot, 'src/runtime/worker/providerWorkerMain.ts')],
  outfile: providerWorkerPath,
  format: 'iife',
  sourcemap: true,
});
const providerWorkerCode = fs.readFileSync(providerWorkerPath, 'utf8');
if (/from\s+["']dexie["']|Dexie\.version/i.test(providerWorkerCode)) {
  throw new Error('data-provider-worker.js must not bundle dexie/ConfigManager — check providerWorkerEntry imports');
}
console.log(`data-provider-worker.js: ${(providerWorkerCode.length / 1024).toFixed(0)} KB`);

// Perspective wasm assets for `dataPlane: 'engine'` — served next to the
// provider worker script, which resolves them via its own location.
const WASM_ASSETS = [
  ['@perspective-dev/client/dist/wasm/perspective-js.wasm', 'perspective-js.wasm'],
  ['@perspective-dev/server/dist/wasm/perspective-server.wasm', 'perspective-server.wasm'],
];
for (const [srcRel, destName] of WASM_ASSETS) {
  const srcPath = path.join(pkgRoot, '../../../node_modules', srcRel);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`buildWorker: missing ${srcRel} — run npm install at the repo root`);
  }
  fs.copyFileSync(srcPath, path.join(outDir, destName));
  console.log(`${destName}: ${(fs.statSync(srcPath).size / 1024).toFixed(0)} KB (copied)`);
}

// ── 2. hub ──────────────────────────────────────────────────────────────
await esbuild.build({
  ...shared,
  entryPoints: [path.join(pkgRoot, 'src/runtime/worker/defaultEntry.ts')],
  outdir: outDir,
  entryNames: '[name]',
  format: 'esm',
  sourcemap: true,
});

// Stable public names for Vite ?url imports.
const RENAMES = [['defaultEntry.js', 'data-services-worker.mjs']];

for (const [srcName, destName] of RENAMES) {
  publishWorkerAsset(outDir, srcName, destName);
}

/**
 * Rename an esbuild output to the stable public asset name and fix the
 * `sourceMappingURL` comment so Vite can resolve the sibling `.map`.
 */
function publishWorkerAsset(outDir, srcName, destName) {
  const srcPath = path.join(outDir, srcName);
  const destPath = path.join(outDir, destName);
  if (!fs.existsSync(srcPath)) return;

  const destMapName = `${destName}.map`;
  let code = fs.readFileSync(srcPath, 'utf8');
  code = code.replace(
    /\/\/# sourceMappingURL=.+$/m,
    `//# sourceMappingURL=${destMapName}`,
  );
  fs.writeFileSync(destPath, code);
  fs.unlinkSync(srcPath);

  const srcMapPath = `${srcPath}.map`;
  const destMapPath = path.join(outDir, destMapName);
  if (fs.existsSync(srcMapPath)) {
    const map = JSON.parse(fs.readFileSync(srcMapPath, 'utf8'));
    map.file = destName;
    fs.writeFileSync(destMapPath, JSON.stringify(map));
    fs.unlinkSync(srcMapPath);
  }
}
