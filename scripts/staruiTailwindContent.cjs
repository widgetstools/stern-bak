/**
 * Tailwind `content` globs for apps consuming @wellsfargo-starui/* packages.
 *
 * CommonJS only — PostCSS/Tailwind load config through jiti, which cannot
 * evaluate `import.meta` in ESM tailwind.config.js.
 */
const { join, resolve } = require('node:path');
const { existsSync, readdirSync, readFileSync } = require('node:fs');

const REPO_ROOT = resolve(__dirname, '..');

function isBundledBucketPackage(pkgPath) {
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return (
      typeof pkg.description === 'string' &&
      pkg.description.includes('bundled tarball')
    );
  } catch {
    return false;
  }
}

/** True when `node_modules/@wellsfargo-starui` holds architecture-bucket tarballs (not only nested workspace apps). */
function hasStaruiBucketPackages(nmPath) {
  const staruiDir = join(nmPath, '@wellsfargo-starui');
  if (!existsSync(staruiDir)) return false;
  for (const entry of readdirSync(staruiDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (isBundledBucketPackage(join(staruiDir, entry.name, 'package.json'))) {
      return true;
    }
  }
  return false;
}

/** Closest ancestor whose `node_modules` has `react` (dedupe / @stomp aliases). */
function findReactRoot(appDir) {
  let dir = resolve(appDir);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'node_modules', 'react'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return REPO_ROOT;
}

/**
 * Closest ancestor whose `node_modules/@wellsfargo-starui` has bucket tarballs.
 * Nested `apps/` workspaces install buckets on the app; `apps/node_modules/@wellsfargo-starui`
 * only lists workspace members — must not win over the app-local install.
 */
function findStaruiPackageRoot(appDir) {
  let dir = resolve(appDir);
  for (let i = 0; i < 8; i++) {
    if (hasStaruiBucketPackages(join(dir, 'node_modules'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return findReactRoot(appDir);
}

/** Every ancestor (closest first) with bucket tarballs — npm may hoist some buckets higher than others. */
function collectStaruiInstallRoots(appDir) {
  const roots = [];
  let dir = resolve(appDir);
  for (let i = 0; i < 8; i++) {
    if (hasStaruiBucketPackages(join(dir, 'node_modules'))) roots.push(dir);
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  if (!roots.length) roots.push(findReactRoot(appDir));
  return roots;
}

/** `node_modules/@wellsfargo-starui/<bucketShort>` for the nearest ancestor that installed that bucket. */
function findBucketNodeModules(appDir, bucketShort) {
  let dir = resolve(appDir);
  for (let i = 0; i < 8; i++) {
    const bucketDir = join(dir, 'node_modules', '@wellsfargo-starui', bucketShort);
    const bucketPkgPath = join(bucketDir, 'package.json');
    if (existsSync(bucketPkgPath) && isBundledBucketPackage(bucketPkgPath)) {
      return bucketDir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return join(findStaruiPackageRoot(appDir), 'node_modules', '@wellsfargo-starui', bucketShort);
}

/** @deprecated Prefer findStaruiPackageRoot / findReactRoot; kept for callers that need one root. */
function findMonoRoot(appDir) {
  return findStaruiPackageRoot(appDir);
}

/**
 * @param {string} appDir absolute path to the app root
 * @returns {string[]}
 */
function staruiTailwindContent(appDir) {
  const installedGlobs = [];
  for (const root of collectStaruiInstallRoots(appDir)) {
    const nm = join(root, 'node_modules', '@wellsfargo-starui');
    installedGlobs.push(
      join(nm, 'ui/src/**/*.{ts,tsx}'),
      join(nm, 'react-ui/ui/src/**/*.{ts,tsx}'),
      join(nm, 'react-ui/ui/dist/**/*.{js,mjs}'),
      join(nm, 'workspace-setup-react/src/**/*.{ts,tsx}'),
      join(nm, 'workspace-setup-react/dist/**/*.{js,mjs}'),
      join(nm, 'react-core/workspace-setup-react/src/**/*.{ts,tsx}'),
      join(nm, 'react-core/workspace-setup-react/dist/**/*.{js,mjs}'),
      join(nm, 'react-grid/grid/src/**/*.{ts,tsx}'),
      join(nm, 'react-grid/grid/dist/**/*.{js,mjs}'),
      join(nm, 'grid/src/**/*.{ts,tsx}'),
      join(nm, 'grid/dist/**/*.{js,mjs}'),
      join(nm, 'widgets-react/src/**/*.{ts,tsx}'),
      join(nm, 'react-core/widgets-react/src/**/*.{ts,tsx}'),
      join(nm, 'react-core/widgets-react/dist/**/*.{js,mjs}'),
      join(nm, 'config-browser/src/**/*.{ts,tsx}'),
      join(nm, 'config-browser/dist/**/*.{js,mjs}'),
      join(nm, 'react-core/config-browser/src/**/*.{ts,tsx}'),
      join(nm, 'react-core/config-browser/dist/**/*.{js,mjs}'),
    );
  }
  return [
    join(REPO_ROOT, 'packages/react-ui/ui/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-grid/grid/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-core/widgets-react/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-core/config-browser/src/**/*.{ts,tsx}'),
    ...installedGlobs,
  ];
}

module.exports = {
  REPO_ROOT,
  findMonoRoot,
  findReactRoot,
  findStaruiPackageRoot,
  findBucketNodeModules,
  collectStaruiInstallRoots,
  hasStaruiBucketPackages,
  staruiTailwindContent,
};
