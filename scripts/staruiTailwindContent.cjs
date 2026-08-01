/**
 * Tailwind `content` globs for apps consuming @wellsfargo-starui/* packages.
 *
 * CommonJS only — PostCSS/Tailwind load config through jiti, which cannot
 * evaluate `import.meta` in ESM tailwind.config.js.
 */
const { join, resolve } = require('node:path');
const { existsSync } = require('node:fs');

const REPO_ROOT = resolve(__dirname, '..');

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
 * Root that owns the installed `@wellsfargo-starui/*` packages.
 *
 * This used to hunt for architecture-bucket tarballs in each ancestor's
 * `node_modules`. Bucket tarballs are gone, so the React root is the only
 * meaningful answer.
 */
function findStaruiPackageRoot(appDir) {
  return findReactRoot(appDir);
}

/**
 * @param {string} appDir absolute path to the app root
 * @returns {string[]}
 */
function staruiTailwindContent(appDir) {
  void appDir;
  // Source-track apps alias straight into this repo, so scanning packages/ is
  // sufficient. The long list of node_modules globs this used to add covered
  // both the bucket-tarball layout (`react-grid/grid/...`) and the flat member
  // layout; buckets are gone, and a tarball-track consumer supplies its own
  // globs against its own node_modules.
  return [
    join(REPO_ROOT, 'packages/react-ui/ui/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-grid/grid/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-grid/widgets-react/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-grid/config-browser/src/**/*.{ts,tsx}'),
  ];
}

module.exports = {
  REPO_ROOT,
  findReactRoot,
  findStaruiPackageRoot,
  staruiTailwindContent,
};
