#!/usr/bin/env node
/**
 * Aligns dep + devDep versions across every workspace package.json to
 * match the fi-trading-terminal/angular-app/package.json reference
 * (corp-vetted Angular versions). Companion to align-with-fi-tt.mjs
 * (which mirrors the React reference). Same rules:
 *   - Only modifies versions, never adds or removes deps.
 *   - Leaves peerDependencies alone (consumer ranges stay loose).
 *   - Idempotent — re-runnable when fi-tt's reference shifts.
 *
 * fi-tt declares two local-tarball deps via `file:libs/*.tgz`:
 *   - @widgetstools/angular-dock-manager
 *   - @widgetstools/dock-manager-core
 * Our libs/ directory carries the same tarballs, so when an
 * align-target dep matches, we keep the file: path so the install
 * resolves identically.
 *
 * Theming resolves from the public registry: @primeuix/themes (the
 * non-deprecated successor to @primeng/themes), aligned to the version
 * that pairs with PrimeNG 21.
 */
import fs from 'node:fs';
import path from 'node:path';

const FI_TT_ANGULAR = {
  // dependencies
  '@angular/animations': '21.1.0',
  '@angular/cdk': '21.1.0',
  '@angular/common': '21.1.0',
  '@angular/compiler': '21.1.0',
  '@angular/core': '21.1.0',
  '@angular/forms': '21.1.0',
  '@angular/platform-browser': '21.1.0',
  '@angular/router': '21.1.0',
  '@primeuix/themes': '~2.0.3',
  '@widgetstools/angular-dock-manager': 'file:libs/widgetstools-angular-dock-manager-1.0.0.tgz',
  '@widgetstools/dock-manager-core': 'file:libs/widgetstools-dock-manager-core-1.0.0.tgz',
  'ag-grid-angular': '35.1.0',
  'ag-grid-community': '35.1.0',
  'ag-grid-enterprise': '35.1.0',
  'chart.js': '~4.4.9',
  'primeng': '~21.1.5',
  'rxjs': '~7.8.2',
  'tslib': '^2.8.1',
  // devDependencies
  '@angular/build': '21.1.0',
  '@angular/cli': '21.1.0',
  '@angular/compiler-cli': '21.1.0',
  'prettier': '^3.8.1',
  'typescript': '~5.9.3',
};

function alignDeps(deps) {
  if (!deps) return { changed: 0 };
  let changed = 0;
  for (const name of Object.keys(deps)) {
    if (!FI_TT_ANGULAR[name]) continue;
    if (deps[name] === FI_TT_ANGULAR[name]) continue;
    // Don't rewrite file: paths — fi-tt's paths are root-relative, but
    // our workspaces sit one level deeper and need ../../libs/... to
    // reach the same tarballs. Same .tgz file = same version, so skip.
    if (typeof deps[name] === 'string' && deps[name].startsWith('file:')) continue;
    if (FI_TT_ANGULAR[name].startsWith('file:')) continue;
    deps[name] = FI_TT_ANGULAR[name];
    changed++;
  }
  return { changed };
}

function alignFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(raw);
  const before = JSON.stringify(json);
  const dRes = alignDeps(json.dependencies);
  const ddRes = alignDeps(json.devDependencies);
  const optRes = alignDeps(json.optionalDependencies);
  const total = dRes.changed + ddRes.changed + optRes.changed;
  if (JSON.stringify(json) === before) return { file, changed: 0 };
  const trailing = raw.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + trailing);
  return { file, changed: total };
}

function findPackageJsons() {
  const out = ['package.json'];
  for (const dir of ['apps', 'packages']) {
    if (!fs.existsSync(dir)) continue;
    for (const sub of fs.readdirSync(dir)) {
      const p = path.join(dir, sub, 'package.json');
      if (fs.existsSync(p)) out.push(p);
    }
  }
  if (fs.existsSync('e2e-openfin/package.json')) out.push('e2e-openfin/package.json');
  return out;
}

const files = findPackageJsons();
let totalChanges = 0;
for (const f of files) {
  const { changed } = alignFile(f);
  if (changed > 0) {
    console.log(`  ${changed.toString().padStart(2)} change(s) → ${f}`);
    totalChanges += changed;
  }
}
console.log(`\nTotal: ${totalChanges} version edit(s) across ${files.length} package.json files.`);
