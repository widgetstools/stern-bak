/**
 * Vite resolve aliases for apps consuming @wellsfargo-starui/* bucket tarballs.
 * Maps legacy member import paths to installed bundle subpaths.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const {
  findReactRoot,
  findStaruiPackageRoot,
  staruiTailwindContent: staruiTailwindContentImpl,
} = require('./staruiTailwindContent.cjs');

const REPO_ROOT = resolve(import.meta.dirname, '..');

/** Monorepo root where hoisted node_modules lives. Walks up from appDir. */
/** Root whose `node_modules` holds installed @wellsfargo-starui/* bucket tarballs. */
export function monoRootFromApp(appDir) {
  return findStaruiPackageRoot(appDir);
}

/**
 * Force a single React + react-dom instance for apps that alias @wellsfargo-starui/*
 * tarball sources.
 */
export function reactResolveConfig(appDir) {
  const reactRootDir = findReactRoot(appDir);
  const reactRoot = join(reactRootDir, 'node_modules/react');
  const reactDomRoot = join(reactRootDir, 'node_modules/react-dom');

  return {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    alias: [
      { find: /^react$/, replacement: join(reactRoot, 'index.js') },
      { find: /^react-dom$/, replacement: join(reactDomRoot, 'index.js') },
      { find: /^react-dom\/client$/, replacement: join(reactDomRoot, 'client.js') },
      { find: /^react\/jsx-runtime$/, replacement: join(reactRoot, 'jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: join(reactRoot, 'jsx-dev-runtime.js') },
    ],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    },
  };
}

export function findMemberFolder(bucket, memberName) {
  const bucketDir = join(REPO_ROOT, 'packages', bucket);
  if (!existsSync(bucketDir)) return memberName.split('/').pop();
  // Collapsed bucket (WORKLOG #11 phase 2): package.json lives at the
  // bucket root, not in a member subfolder — '' joins back to bucketDir.
  const bucketPkgPath = join(bucketDir, 'package.json');
  if (existsSync(bucketPkgPath)) {
    const bucketPkg = JSON.parse(readFileSync(bucketPkgPath, 'utf8'));
    if (bucketPkg.name === memberName) return '';
  }
  for (const dir of readdirSync(bucketDir)) {
    const pkgPath = join(bucketDir, dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.name === memberName) return dir;
  }
  return memberName.split('/').pop();
}

function resolveExportTarget(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value.import ?? value.default ?? value.types ?? null;
  }
  return null;
}

function readMemberExports(bucket, folder) {
  const pkgPath = join(REPO_ROOT, 'packages', bucket, folder, 'package.json');
  if (!existsSync(pkgPath)) return { '.': './src/index.ts' };
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const entries = {};
  if (pkg.exports && typeof pkg.exports === 'object') {
    for (const [key, val] of Object.entries(pkg.exports)) {
      const target = resolveExportTarget(val);
      if (target) entries[key] = target;
    }
  }
  if (!entries['.']) {
    const main = pkg.types ?? pkg.main ?? './src/index.ts';
    entries['.'] = main.startsWith('./') ? main : `./${main}`;
  }
  return entries;
}

/**
 * Bucket → members map, discovered by scanning `packages/`.
 *
 * This used to prefer a `libs/manifest.json` written by `propagate`. Bucket
 * tarballs are gone (they were never installable outside this repo — see
 * docs/APPS_REPO.md), so scanning the source tree is the only source of truth
 * and cannot go stale.
 */
export function readManifest() {
  return discoverManifestFromPackages();
}

function discoverManifestFromPackages() {
  const packagesRoot = join(REPO_ROOT, 'packages');
  if (!existsSync(packagesRoot)) return null;
  const manifest = {};
  for (const bucket of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!bucket.isDirectory()) continue;
    const bucketDir = join(packagesRoot, bucket.name);
    // Collapsed bucket (WORKLOG #11 phase 2): one package.json at the
    // bucket root — treat it as the sole member and skip the subfolder
    // scan below (which would find nothing anyway, by design).
    const bucketPkgPath = join(bucketDir, 'package.json');
    if (existsSync(bucketPkgPath)) {
      const bucketPkg = JSON.parse(readFileSync(bucketPkgPath, 'utf8'));
      if (bucketPkg.name) {
        manifest[`@wellsfargo-starui/${bucket.name}`] = { bucket: bucket.name, members: [bucketPkg.name] };
      }
      continue;
    }
    const members = [];
    for (const child of readdirSync(bucketDir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const pkgPath = join(bucketDir, child.name, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.name) members.push(pkg.name);
    }
    if (members.length === 0) continue;
    members.sort();
    manifest[`@wellsfargo-starui/${bucket.name}`] = { bucket: bucket.name, members };
  }
  return Object.keys(manifest).length > 0 ? manifest : null;
}

/**
 * Resolve one export target to an absolute path.
 *
 * Prefers the package's built `dist/` when it exists and falls back to live
 * `src/`. Note what that means in practice: after `build:packages`, nearly
 * every alias points at dist — "source mode" is really "built output, with a
 * source fallback". Delete a package's `dist/` to get live TS for it.
 *
 * @param {string} exportKey package.json exports key (e.g. '.', './css')
 * @param {{ignoreDist?: boolean}} opts `ignoreDist` forces the src/ branch —
 *   used by the source-alias audit to prove every export has a source form.
 */
function resolveMemberPath(resolveRoot, relTarget, exportKey = '.', opts = {}) {
  const ignoreDist = opts.ignoreDist === true;
  if (typeof relTarget !== 'string' || relTarget.includes('*')) {
    return join(resolveRoot, String(relTarget).replace(/^\.\//, ''));
  }

  const rel = relTarget.replace(/^\.\//, '');
  const primary = join(resolveRoot, rel);
  if (existsSync(primary) && !(ignoreDist && rel.startsWith('dist/'))) return primary;

  const srcBase = rel.replace(/^dist\//, 'src/');
  const srcCandidates = [
    join(resolveRoot, srcBase.replace(/\.js$/, '.ts')),
    join(resolveRoot, srcBase.replace(/\.js$/, '.tsx')),
    join(resolveRoot, srcBase.replace(/\.mjs$/, '.ts')),
    join(resolveRoot, srcBase),
  ];
  for (const candidate of srcCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  if (exportKey === '.') {
    for (const entry of ['src/index.ts', 'src/index.tsx']) {
      const candidate = join(resolveRoot, entry);
      if (existsSync(candidate)) return candidate;
    }
  }

  return primary;
}

/** Paths that are generated at build time — no src/ substitute exists. */
export function isBuildGeneratedExport(relTarget) {
  if (typeof relTarget !== 'string') return false;
  const rel = relTarget.replace(/^\.\//, '');
  return (
    rel.includes('*')
    || rel.endsWith('.css')
    || rel.endsWith('.scss')
    || (rel.includes('/assets/') && rel.endsWith('.mjs'))
  );
}

/**
 * @param {string} appDir absolute path to the app root (where vite.config lives)
 * @returns {{ find: string | RegExp, replacement: string }[]}
 */
export function staruiViteAliases(appDir) {
  const manifest = readManifest();
  if (!manifest) return [];
  void appDir; // resolution is anchored to THIS repo, not the app's location

  const aliases = [];
  const seen = new Set();

  function add(find, replacement) {
    const key = `${find}\0${replacement}`;
    if (seen.has(key)) return;
    seen.add(key);
    aliases.push({ find, replacement });
  }

  for (const entry of Object.values(manifest)) {
    if (!entry?.members?.length || !entry.bucket) continue;

    for (const member of entry.members) {
      const folder = findMemberFolder(entry.bucket, member);
      const resolveRoot = join(REPO_ROOT, 'packages', entry.bucket, folder);
      const exportEntries = readMemberExports(entry.bucket, folder);

      for (const [exportKey, relTarget] of Object.entries(exportEntries)) {
        if (typeof relTarget === 'string' && relTarget.includes('*')) continue;
        const absTarget = resolveMemberPath(resolveRoot, relTarget, exportKey);
        const suffix =
          exportKey === '.'
            ? ''
            : exportKey.startsWith('./')
              ? exportKey.slice(1)
              : exportKey.startsWith('/')
                ? exportKey
                : `/${exportKey}`;

        if (exportKey === '.') {
          const memberExact = member.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          add(new RegExp(`^${memberExact}$`), absTarget);
        } else {
          add(`${member}${suffix}`, absTarget);
        }
      }
    }
  }

  return aliases.sort((a, b) => String(b.find).length - String(a.find).length);
}

/**
 * Verify every @wellsfargo-starui/* export resolves in source mode (optionally ignoring dist/).
 * @returns {{ broken: object[], requiresBuild: object[], ok: string[] }}
 */
export function auditSourceModePaths(appDir, opts = {}) {
  const ignoreDist = opts.ignoreDist !== false;
  const manifest = readManifest();
  const broken = [];
  const requiresBuild = [];
  const ok = [];

  if (!manifest) {
    broken.push({ label: '(manifest)', reason: 'libs/manifest.json missing and packages/ discovery failed' });
    return { broken, requiresBuild, ok };
  }

  for (const [bucketName, entry] of Object.entries(manifest)) {
    if (!entry?.members?.length || !entry.bucket) continue;
    for (const member of entry.members) {
      const folder = findMemberFolder(entry.bucket, member);
      const resolveRoot = join(REPO_ROOT, 'packages', entry.bucket, folder);
      const exportEntries = readMemberExports(entry.bucket, folder);

      for (const [exportKey, relTarget] of Object.entries(exportEntries)) {
        if (typeof relTarget !== 'string' || relTarget.includes('*')) continue;

        const label = exportKey === '.' ? member : `${member}${exportKey.slice(1)}`;
        const resolved = resolveMemberPath(resolveRoot, relTarget, exportKey, { ignoreDist });

        if (existsSync(resolved)) {
          ok.push(label);
          continue;
        }

        const item = { label, relTarget, path: resolved, member };
        if (isBuildGeneratedExport(relTarget)) requiresBuild.push(item);
        else broken.push(item);
      }
    }
  }

  const workerPath = join(REPO_ROOT, 'packages/data/host-data/dist/assets/data-services-worker.mjs');
  if (!existsSync(workerPath)) {
    requiresBuild.push({
      label: '@wellsfargo-starui/data/assets/data-services-worker.mjs',
      relTarget: './dist/assets/data-services-worker.mjs',
      path: workerPath,
      member: '@wellsfargo-starui/data',
    });
  } else {
    ok.push('@wellsfargo-starui/data/assets/data-services-worker.mjs');
  }

  return { broken, requiresBuild, ok };
}

const HOST_DATA_WORKER_ASSET_RE =
  /^@wellsfargo-starui\/data\/assets\/data-services-worker\.mjs\?url$/;

/** Resolve `@wellsfargo-starui/data/assets/data-services-worker.mjs?url` for Vite. */
export function resolveHostDataWorkerAssetUrl(source, appDir) {
  if (!HOST_DATA_WORKER_ASSET_RE.test(source)) return null;
  void appDir;

  // Only one candidate now. This used to also search installed bucket tarballs
  // under the app's node_modules; buckets are gone, and a consumer installing
  // real member packages resolves the asset through normal node resolution
  // without needing this plugin at all.
  const workerPath = join(REPO_ROOT, 'packages/data/host-data/dist/assets/data-services-worker.mjs');
  return existsSync(workerPath) ? `${workerPath}?url` : null;
}

/**
 * Vite plugin — keeps `?url` asset handling for the bundled SharedWorker.
 * @param {string} appDir absolute path to the app root
 */
export function staruiHostDataWorkerAssetPlugin(appDir) {
  return {
    name: 'starui-host-data-worker-asset-url',
    enforce: 'pre',
    resolveId(source) {
      return resolveHostDataWorkerAssetUrl(source, appDir);
    },
  };
}

// Build-generated assets that source mode cannot produce on the fly — design
// system CSS and the host-data SharedWorker bundle. If either is missing, the
// packages have not been built (or dist/ was wiped) and the app would fail with
// a cryptic ENOENT / unresolved-import. These sentinels gate an auto-build.
const BUILD_ASSET_SENTINELS = [
  'packages/design-system/design-system/dist/css/theme.css',
  'packages/data/host-data/dist/assets/data-services-worker.mjs',
];

/** True when every build-generated package asset an app needs is present. */
export function staruiBuiltAssetsPresent() {
  return BUILD_ASSET_SENTINELS.every((rel) => existsSync(join(REPO_ROOT, rel)));
}

/**
 * Vite plugin — guarantees `@wellsfargo-starui/*` build-generated assets (design-system
 * CSS, host-data worker) exist before an app dev server or build starts.
 * Source mode aliases TS/TSX live, but CSS and the worker are emitted by
 * `npm run build:packages`; without this an app run after a clean/`rimraf`
 * fails with `ENOENT … dist/css/theme.css`. Skips when assets are present
 * (a cheap stat) or when STARUI_SKIP_ENSURE_BUILD=1.
 */
export function staruiEnsureBuiltAssetsPlugin() {
  let ensured = false;
  return {
    name: 'starui-ensure-built-assets',
    enforce: 'pre',
    buildStart() {
      if (ensured || process.env.STARUI_SKIP_ENSURE_BUILD === '1') return;
      ensured = true;
      if (staruiBuiltAssetsPresent()) return;
      this.warn(
        '@wellsfargo-starui package build assets missing — running `npm run build:packages` '
        + '(design-system CSS / host-data worker). This runs once.',
      );
      execSync('npm run build:packages', { cwd: REPO_ROOT, stdio: 'inherit' });
      if (!staruiBuiltAssetsPresent()) {
        this.error(
          'build:packages did not produce the expected @wellsfargo-starui assets. '
          + 'Run `npm run build:packages` manually and check for errors.',
        );
      }
    },
  };
}

/** Tailwind `content` globs — absolute paths; prefer tailwindContentGlobs.mjs in tailwind.config.js. */
export function staruiTailwindContent(appDir) {
  return staruiTailwindContentImpl(appDir);
}

/** Force ESM entry — browser export resolves to UMD which breaks dynamic `import()` Client lookup. */
export function stompJsEsmAlias(appDir) {
  const reactRootDir = findReactRoot(appDir);
  // @stomp/stompjs is a dep of @wellsfargo-starui/grid (widgets-react). In source mode the apps
  // don't declare it, so it isn't hoisted into the app's node_modules — it
  // lives at the repo root. Search the app's react root, every @wellsfargo-starui install
  // root, then REPO_ROOT, and alias to the first esm6 entry that exists.
  const esm6 = 'node_modules/@stomp/stompjs/esm6/index.js';
  const roots = [reactRootDir, REPO_ROOT];
  const seen = new Set();
  let replacement = join(reactRootDir, esm6);
  for (const root of roots) {
    if (seen.has(root)) continue;
    seen.add(root);
    const candidate = join(root, esm6);
    if (existsSync(candidate)) {
      replacement = candidate;
      break;
    }
  }
  return { find: /^@stomp\/stompjs$/, replacement };
}

/** Paths Vite may read when aliases resolve into hoisted node_modules. */
export function staruiServerFsAllow(appDir) {
  const reactRootDir = findReactRoot(appDir);
  const allow = new Set([
    REPO_ROOT,
    join(REPO_ROOT, 'packages'),
    join(REPO_ROOT, 'node_modules'),
    reactRootDir,
    join(reactRootDir, 'node_modules'),
  ]);
  for (const root of [reactRootDir]) {
    allow.add(root);
    allow.add(join(root, 'node_modules'));
  }
  return [...allow];
}

export function staruiOptimizeDeps() {
  return {
    exclude: [
      '@stomp/stompjs',
      // Keep host-data out of the deps prebundle — prebundling breaks
      // `new SharedWorker(new URL(..., import.meta.url))` inside the
      // library. Apps must construct SharedWorkers at the call site.
      '@wellsfargo-starui/data',
      '@wellsfargo-starui/data/runtime',
      // Single React context instance — prebundling @wellsfargo-starui/grid/widgets pulls
      // a second copy of the data bindings and breaks <DataServicesProvider>.
      '@wellsfargo-starui/react/data',
      '@wellsfargo-starui/react/data/runtime',
    ],
  };
}

/** @param {string} configUrl import.meta.url from the calling vite.config */
export function appDirFromConfig(configUrl) {
  return dirname(fileURLToPath(configUrl));
}
