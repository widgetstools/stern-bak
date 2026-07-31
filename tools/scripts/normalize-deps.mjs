#!/usr/bin/env node
/**
 * normalize-deps.mjs — Day 5 dep standardization script.
 *
 * Walks every package.json in the monorepo (apps/* + packages/*)
 * and normalizes the pinned versions of cross-cutting dependencies
 * per docs/DEPS_STANDARD.md.
 *
 * Leaves package-specific deps alone (e.g., radix-ui versions) —
 * those are already harmonized via fi-trading-terminal's package.json.
 * Only touches cross-cutting platform deps + framework cores.
 *
 * Safe to re-run; idempotent.
 */

import fs from 'node:fs';
import path from 'node:path';

const STANDARD = {
  // React core
  'react': '~19.2.5',
  'react-dom': '~19.2.5',
  '@types/react': '^19.2.14',
  '@types/react-dom': '^19.2.3',

  // TypeScript + build
  'typescript': '~5.9.3',
  'vite': '~7.3.2',
  '@vitejs/plugin-react': '~4.5.2',
  'vite-plugin-dts': '^4.5.4',

  // AG-Grid (exact pin — corporate requirement)
  'ag-grid-community': '35.1.0',
  'ag-grid-enterprise': '35.1.0',
  'ag-grid-react': '35.1.0',
  'ag-grid-angular': '35.1.0',

  // OpenFin (43.x family)
  '@openfin/core': '~43.101.4',
  '@openfin/node-adapter': '~43.101.2',
  '@openfin/workspace': '~43.101.4',
  '@openfin/workspace-platform': '~43.101.4',

  // Testing
  'vitest': '^4.1.4',
  'jsdom': '^29.0.2',
  '@testing-library/react': '~16.2.0',
  '@testing-library/dom': '^10.4.0',
  '@testing-library/jest-dom': '^6.9.1',
  '@testing-library/user-event': '^14.6.1',
  '@playwright/test': '^1.59.1',

  // Utilities
  'dexie': '^4.4.2',
  'zustand': '^5.0.12',
  'concurrently': '^9.2.1',
  'wait-on': '^9.0.5',

  // Angular (exact pin per fi-trading authority)
  '@angular/animations': '21.1.0',
  '@angular/cdk': '21.1.0',
  '@angular/common': '21.1.0',
  '@angular/compiler': '21.1.0',
  '@angular/core': '21.1.0',
  '@angular/forms': '21.1.0',
  '@angular/platform-browser': '21.1.0',
  '@angular/router': '21.1.0',
  '@angular/build': '21.1.0',
  '@angular/cli': '21.1.0',
  '@angular/compiler-cli': '21.1.0',

  // Angular peer ecosystem
  'rxjs': '~7.8.2',
  'tslib': '^2.8.1',
  'primeng': '~21.1.5',

  // Tailwind — NOTE: aggrid-customization uses v4, fi-trading specifies 3.4.1
  // Applying 3.4.1 to packages that already use 3.x; leaving v4 packages alone
  // for this pass (downgrade is Day 5b separate migration).
  // 'tailwindcss': '3.4.1',  // disabled until Tailwind migration day
};

// Peer-dep normalisation — use >= ranges so peers are permissive but
// standardized
const PEER_STANDARD = {
  'react': '>=19.0.0',
  'react-dom': '>=19.0.0',
  '@angular/core': '>=21.0.0',
  '@angular/common': '>=21.0.0',
  'ag-grid-community': '>=35.0.0',
  'ag-grid-enterprise': '>=35.0.0',
  'ag-grid-react': '>=35.0.0',
  'ag-grid-angular': '>=35.0.0',
};

function findPackageJsons(root, maxDepth = 3) {
  const results = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name === 'package.json') results.push(full);
    }
  }
  walk(root, 0);
  return results;
}

const files = [...findPackageJsons('apps'), ...findPackageJsons('packages')];

let filesChanged = 0;
let changes = 0;

for (const filePath of files) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const p = JSON.parse(raw);
  let localChanges = 0;

  for (const section of ['dependencies', 'devDependencies']) {
    if (!p[section]) continue;
    for (const [dep, wanted] of Object.entries(STANDARD)) {
      if (p[section][dep] && p[section][dep] !== wanted) {
        p[section][dep] = wanted;
        localChanges++;
      }
    }
  }
  if (p.peerDependencies) {
    for (const [dep, wanted] of Object.entries(PEER_STANDARD)) {
      if (p.peerDependencies[dep] && p.peerDependencies[dep] !== wanted) {
        p.peerDependencies[dep] = wanted;
        localChanges++;
      }
    }
  }

  if (localChanges > 0) {
    fs.writeFileSync(filePath, JSON.stringify(p, null, 2) + '\n');
    console.log(`  ${filePath}: ${localChanges} version(s) normalized`);
    filesChanged++;
    changes += localChanges;
  }
}

console.log(`\n${filesChanged} files changed, ${changes} total version normalizations`);
