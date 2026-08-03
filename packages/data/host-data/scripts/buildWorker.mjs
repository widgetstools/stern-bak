/**
 * Bundle the SharedWorker entries into single ESM assets.
 *
 * tsc emits bare `@wellsfargo-starui/*` imports that the browser cannot
 * resolve when loaded as a standalone worker script. esbuild inlines
 * host-data, host-config, dexie, and optional stomp into
 * `dist/assets/data-services-worker.mjs` for Vite `?url` imports.
 *
 * `perspectiveEntry.ts` is a SEPARATE entry point, not a flag on the default
 * one: `@perspective-dev/client/inline` embeds its wasm as base64, so
 * bundling it into the asset every app loads would cost every app megabytes
 * even when it never opens a blotter. Only an app that imports the
 * perspective asset's URL pays for it.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const outDir = path.join(pkgRoot, 'dist', 'assets');

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [
    path.join(pkgRoot, 'src/runtime/worker/defaultEntry.ts'),
    path.join(pkgRoot, 'src/runtime/worker/perspectiveEntry.ts'),
  ],
  outdir: outDir,
  entryNames: '[name]',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  logLevel: 'info',
  packages: 'bundle',
  mainFields: ['module', 'import', 'main'],
  conditions: ['import', 'module', 'default'],
  alias: {
    '@stomp/stompjs': path.join(pkgRoot, '../../../node_modules/@stomp/stompjs/esm6/index.js'),
  },
  legalComments: 'none',
});

// Stable public names for Vite ?url imports.
const RENAMES = [
  ['defaultEntry.js', 'data-services-worker.mjs'],
  ['perspectiveEntry.js', 'data-services-perspective-worker.mjs'],
];

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
