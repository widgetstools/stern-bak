#!/usr/bin/env node
/**
 * makeTarballApp.mjs — mirror a `source/` app into the `tarball/` track.
 *
 *   node scripts/makeTarballApp.mjs markets-grid-lab
 *   node scripts/makeTarballApp.mjs --all
 *
 * The two tracks run the SAME app source against different resolution:
 *
 *   source/<app>   Vite through the platform's alias layer, tsc through its
 *                  generated tsconfig.consumer.json
 *   tarball/<app>  plain Vite, plain tsconfig, packages installed from
 *                  vendor/*.tgz — exactly what an external team gets
 *
 * So the app's own `src/` is copied verbatim and only its four config surfaces
 * are rewritten. If a tarball app needs a source edit to build, that is a
 * genuine external-consumption defect in the packages, not a porting problem.
 *
 * Re-running is safe: it regenerates the configs and refreshes src/, preserving
 * nothing app-specific outside the table below.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './resolvePlatform.mjs';

const SOURCE_ROOT = join(REPO_ROOT, 'source');
const TARBALL_ROOT = join(REPO_ROOT, 'tarball');
const VENDOR_DIR = join(REPO_ROOT, 'vendor');

/**
 * Per-app config that cannot be inferred from the source tree.
 *
 * Ports are the source port + 1000 so both tracks of the same app can run at
 * once. `open` is deliberately dropped — these are built in CI, not browsed.
 */
const APPS = {
  'basic': { port: 6194 },
  'dataprovider-editor': { port: 6193 },
  'design-system': { port: 6310 },
  'markets-grid-lab': { port: 6300, assetsInclude: ['**/*.md'] },
  'star-demo': { port: 6175, svgr: true },
  'stomp-marketsgrid-minimal': { port: 6213 },
  // stomp-view-server is intentionally absent: it imports zero
  // @wellsfargo-starui packages, so a tarball copy would prove nothing.
};

const SKIP_COPY = new Set(['node_modules', 'dist', '.vite', 'package-lock.json', '.turbo']);

function log(msg) {
  process.stdout.write(`[make-tarball-app] ${msg}\n`);
}

/** Every packed member package, read from what setup.mjs vendored. */
function vendoredPackages() {
  if (!existsSync(VENDOR_DIR)) {
    throw new Error('vendor/ is empty — run `node scripts/setup.mjs` first.');
  }
  return readdirSync(VENDOR_DIR)
    .filter((f) => f.endsWith('.tgz'))
    .map((f) => ({
      name: `@wellsfargo-starui/${f.replace(/^wellsfargo-starui-/, '').replace(/\.tgz$/, '')}`,
      spec: `file:../../vendor/${f}`,
      file: join(VENDOR_DIR, f),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @wellsfargo-starui dependency names declared by a vendored tarball's own
 * manifest (dependencies + peerDependencies) — the edges the closure walk
 * follows.
 */
function vendoredStaruiDeps(tarballFile) {
  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', tarballFile, 'package/package.json'], { encoding: 'utf8' }),
  );
  return Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
    .filter((name) => name.startsWith('@wellsfargo-starui/'));
}

/**
 * Expand the app's direct set to its full transitive @wellsfargo-starui closure.
 * Every closure member becomes a direct file: dependency, which is what lets
 * the generated manifest carry NO `overrides` block: a transitive semver range
 * (grid -> @wellsfargo-starui/core@^0.1.0) dedupes onto the direct file: node,
 * so npm never consults the registry for the unpublished names.
 */
function staruiClosure(direct, vendored) {
  const byName = new Map(vendored.map((v) => [v.name, v]));
  const closure = new Set(direct);
  const queue = [...direct];
  while (queue.length > 0) {
    const entry = byName.get(queue.pop());
    if (!entry) continue;
    for (const dep of vendoredStaruiDeps(entry.file)) {
      if (!closure.has(dep) && byName.has(dep)) {
        closure.add(dep);
        queue.push(dep);
      }
    }
  }
  return closure;
}

const SCANNED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json']);
const SPECIFIER_RE = /@wellsfargo-starui\/([a-z0-9][a-z0-9-]*)/g;

/**
 * Packages the app actually imports.
 *
 * Scanned against the SOURCE app, so the generated configs (which always name
 * host-data in optimizeDeps and design-system in the Tailwind preset) cannot
 * inflate the answer. Matches any subpath — `.../design-system/css`,
 * `.../host-data/assets/…?url`, `.../widgets-react/hosted` — back to its member.
 */
function directPackages(srcDir, known) {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_COPY.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      const dot = entry.name.lastIndexOf('.');
      if (dot < 0 || !SCANNED_EXT.has(entry.name.slice(dot))) continue;
      const text = readFileSync(path, 'utf8');
      for (const [, short] of text.matchAll(SPECIFIER_RE)) {
        const name = `@wellsfargo-starui/${short}`;
        if (known.has(name)) found.add(name);
      }
    }
  };
  walk(srcDir);
  return found;
}

function viteConfig(app, cfg) {
  const imports = [
    "import { defineConfig } from 'vite';",
    "import react from '@vitejs/plugin-react';",
    ...(cfg.svgr ? ["import svgr from 'vite-plugin-svgr';"] : []),
  ].join('\n');

  const plugins = cfg.svgr ? 'react(), svgr()' : 'react()';
  const extra = cfg.assetsInclude
    ? `\n  assetsInclude: [${cfg.assetsInclude.map((g) => `'${g}'`).join(', ')}],`
    : '';

  return `${imports}

/**
 * TARBALL TRACK — deliberately plain. GENERATED by scripts/makeTarballApp.mjs.
 *
 * No platform imports, no aliases: this app installs @wellsfargo-starui/* as
 * ordinary npm packages, so it is the honest test of the "install the package,
 * import one stylesheet, done" contract. If this file ever needs platform
 * helpers to build, external consumption is broken and the PACKAGES need the
 * fix — not this config.
 *
 * The source-track twin of this app is source/${app}/.
 */
export default defineConfig({
  plugins: [${plugins}],
  server: { port: ${cfg.port} },${extra}
  optimizeDeps: {
    // Vite dev prebundles bare node_modules imports into .vite/deps/, which
    // relocates the module and breaks the SharedWorker's
    // \`new URL(..., import.meta.url)\` resolution. A package cannot opt itself
    // out of the optimizer, so consumers add this one line. \`vite build\` and
    // every other bundler need nothing.
    exclude: ['@wellsfargo-starui/data'],
  },
});
`;
}

function tailwindConfig(app) {
  return `/** @type {import('tailwindcss').Config} */
// TARBALL TRACK — GENERATED by scripts/makeTarballApp.mjs.
// The preset comes from the INSTALLED design-system package, not the platform
// repo's scripts/. NOTE it is a NAMED export: the package ships no default, so
// \`import preset from '.../tailwind'\` yields undefined and Tailwind dies with
// "Cannot read properties of undefined (reading 'future')" pointing at an
// unrelated CSS file.
import { tailwindPreset } from '@wellsfargo-starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@wellsfargo-starui/*/dist/**/*.{js,mjs}',
    '../../node_modules/@wellsfargo-starui/*/dist/**/*.{js,mjs}',
  ],
};
`;
}

/** Strip comments so JSONC tsconfigs parse. */
function readJsonc(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
}

function rewriteTsconfig(destDir, filename) {
  const path = join(destDir, filename);
  if (!existsSync(path)) return false;
  const cfg = readJsonc(path);
  // Local base, NOT the platform's tsconfig.consumer.json — that maps
  // @wellsfargo-starui/* onto the platform's packages/ tree, which would defeat
  // the whole point of this track.
  cfg.extends = '../../tsconfig.base.json';
  // `extends` REPLACES compilerOptions.paths rather than merging, and here we
  // want plain node resolution anyway.
  if (cfg.compilerOptions?.paths) delete cfg.compilerOptions.paths;
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
  return true;
}

function patchTarballVitestConfig(destDir) {
  const vitestPath = join(destDir, 'vitest.config.ts');
  if (!existsSync(vitestPath)) return;
  let content = readFileSync(vitestPath, 'utf8');
  content = content.replace(/\nimport \{ tarballReactResolve \}[^\n]+\n/g, '\n');
  content = content.replace(/\n\s*resolve: tarballReactResolve\(import\.meta\),\n/g, '\n');
  content = content.replace(
    'mergeConfig(\n  mergeConfig(viteConfig, defineConfig({ resolve: tarballReactResolve(import.meta) })),',
    'mergeConfig(\n  viteConfig,',
  );

  const repoSetup = "join(dirname(fileURLToPath(import.meta.url)), '../../test-utils/setup.ts')";
  if (!content.includes('fileURLToPath')) {
    content = content.replace(
      "import { defineConfig, mergeConfig } from 'vitest/config';",
      "import { dirname, join } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nimport { defineConfig, mergeConfig } from 'vitest/config';",
    );
  }
  content = content.replace(
    "'../../test-utils/setup.ts'",
    repoSetup,
  );

  if (!content.includes('deps:')) {
    content = content.replace(
      /test: \{\s*\n(\s*)environment:/,
      `test: {
$1server: {
$1  deps: {
$1    inline: [/@wellsfargo-starui\\/.*/],
$1  },
$1},
$1environment:`,
    );
  }

  content = content.replace(
    'inline: [/@wellsfargo-starui\\\\/.*/]',
    'inline: [/@wellsfargo-starui\\/.*/]',
  );

  if (!content.includes('optimizeDeps')) {
    content = content.replace(
      'defineConfig({',
      "defineConfig({\n    optimizeDeps: {\n      exclude: [/@wellsfargo-starui\\/.*/],\n    },",
    );
  }

  writeFileSync(vitestPath, content);
}

function makeApp(app) {
  const cfg = APPS[app];
  if (!cfg) throw new Error(`No tarball spec for "${app}". Known: ${Object.keys(APPS).join(', ')}`);

  const srcDir = join(SOURCE_ROOT, app);
  const destDir = join(TARBALL_ROOT, app);
  if (!existsSync(srcDir)) throw new Error(`source/${app} does not exist`);

  // Preserve the installed node_modules so re-running does not force a full
  // reinstall of every app.
  const keptModules = join(destDir, 'node_modules');
  const hadModules = existsSync(keptModules);
  if (existsSync(destDir)) {
    for (const entry of readdirSync(destDir)) {
      if (entry === 'node_modules') continue;
      rmSync(join(destDir, entry), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
  mkdirSync(destDir, { recursive: true });

  for (const entry of readdirSync(srcDir)) {
    if (SKIP_COPY.has(entry)) continue;
    cpSync(join(srcDir, entry), join(destDir, entry), { recursive: true });
  }

  // ── package.json ───────────────────────────────────────────────────────
  const pkg = JSON.parse(readFileSync(join(srcDir, 'package.json'), 'utf8'));
  const sourcePort = String(pkg.scripts?.client ?? '').match(/localhost:(\d+)/)?.[1];

  pkg.name = `${pkg.name}-tarball`;
  pkg.description =
    `Tarball-track twin of source/${app}. Consumes @wellsfargo-starui/* as installed `
    + `npm packages (vendor/*.tgz) with a plain Vite config — the path an external team takes.`;

  /*
   * `dependencies` lists the app's imports PLUS their transitive
   * @wellsfargo-starui closure, every one pinned to its vendored file: tarball.
   * The closure entries are the "no registry available" shim: the packed
   * tarballs depend on each other by semver range and none are published, so
   * without a local node for each name npm would 404 against the registry. In
   * a real Artifactory setup only the imports would be listed and the
   * registry would answer for the rest.
   *
   * This deliberately carries NO `overrides` block. An earlier shape kept
   * imports-only deps and overrode the whole packed set to file: specs — it
   * resolved identically, but npm logs a spurious "ERESOLVE overriding peer
   * dependency" warning for every peer edge under an overridden subtree even
   * when all versions are compatible, which buried real install warnings in
   * hundreds of false ones. With the closure as plain direct deps, semver
   * ranges dedupe onto the file: nodes and the install is warning-free
   * (established by experiment on star-demo: dozens of warnings -> zero).
   */
  const vendored = vendoredPackages();
  const known = new Set(vendored.map((v) => v.name));
  const direct = directPackages(srcDir, known);

  // The generated Tailwind config imports the design-system preset, so the app
  // depends on it whether or not its own source mentions it.
  if (existsSync(join(srcDir, 'tailwind.config.js'))) direct.add('@wellsfargo-starui/design-system');

  const closure = staruiClosure(direct, vendored);
  const deps = Object.fromEntries(
    Object.entries(pkg.dependencies ?? {}).filter(([k]) => !k.startsWith('@wellsfargo-starui/')),
  );
  for (const { name, spec } of vendored) {
    if (closure.has(name)) deps[name] = spec;
  }
  pkg.dependencies = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
  delete pkg.overrides;
  cfg._counts = { direct: direct.size, closure: closure.size };

  // Isolated install — no hoisted root node_modules to borrow React types from.
  const dev = { ...(pkg.devDependencies ?? {}) };
  dev['@types/react'] ??= '19.2.18';
  dev['@types/react-dom'] ??= '19.2.4';
  if (pkg.scripts?.test) {
    dev.vitest ??= '^4.1.4';
    dev['@vitest/coverage-v8'] ??= '^4.1.4';
    dev.jsdom ??= '^29.0.2';
    dev['@testing-library/react'] ??= '^16.3.2';
    dev['@testing-library/dom'] ??= '^10.4.0';
    dev['@testing-library/jest-dom'] ??= '^6.9.1';
    dev['@testing-library/user-event'] ??= '^14.6.1';
  }
  pkg.devDependencies = Object.fromEntries(Object.entries(dev).sort(([a], [b]) => a.localeCompare(b)));

  // Retarget any script that hardcoded the source port (e.g. star-demo's OpenFin launcher).
  if (sourcePort) {
    for (const [k, v] of Object.entries(pkg.scripts ?? {})) {
      if (typeof v === 'string') pkg.scripts[k] = v.replaceAll(`localhost:${sourcePort}`, `localhost:${cfg.port}`);
    }
  }

  writeFileSync(join(destDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

  // ── configs ────────────────────────────────────────────────────────────
  writeFileSync(join(destDir, 'vite.config.ts'), viteConfig(app, cfg));
  if (existsSync(join(destDir, 'tailwind.config.js'))) {
    writeFileSync(join(destDir, 'tailwind.config.js'), tailwindConfig(app));
  }
  patchTarballVitestConfig(destDir);
  const tsconfigs = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.test.json']
    .filter((f) => rewriteTsconfig(destDir, f));

  const { direct: nDirect, closure: nClosure } = cfg._counts;
  log(
    `${app} -> tarball/${app} (port ${cfg.port}, ${nDirect} imported + ${nClosure - nDirect} closure dep(s), `
      + `${tsconfigs.length} tsconfig(s)${hadModules ? ', kept node_modules' : ''})`,
  );
}

const args = process.argv.slice(2);
const targets = args.includes('--all') ? Object.keys(APPS) : args;

if (targets.length === 0) {
  process.stderr.write(
    `Usage: node scripts/makeTarballApp.mjs <app> | --all\nKnown apps: ${Object.keys(APPS).join(', ')}\n`,
  );
  process.exit(1);
}

for (const app of targets) makeApp(app);
log(`done — ${targets.length} app(s)`);
