#!/usr/bin/env node
/**
 * Aligns dep + devDep versions across every workspace package.json to
 * match the fi-trading-terminal/react-app/package.json reference
 * (corp-vetted versions). Only modifies versions — does NOT add or
 * remove deps. Leaves peerDependencies alone so library consumer
 * ranges stay loose.
 */
import fs from 'node:fs';
import path from 'node:path';

const FI_TT = {
  // dependencies
  '@radix-ui/react-accordion': '^1.2.12',
  '@radix-ui/react-aspect-ratio': '^1.1.8',
  '@radix-ui/react-avatar': '^1.1.11',
  '@radix-ui/react-checkbox': '^1.3.3',
  '@radix-ui/react-collapsible': '^1.1.12',
  '@radix-ui/react-context-menu': '^2.2.16',
  '@radix-ui/react-dialog': '^1.1.15',
  '@radix-ui/react-dropdown-menu': '^2.1.16',
  '@radix-ui/react-hover-card': '^1.1.15',
  '@radix-ui/react-label': '^2.1.8',
  '@radix-ui/react-menubar': '^1.1.16',
  '@radix-ui/react-navigation-menu': '^1.2.14',
  '@radix-ui/react-popover': '^1.1.15',
  '@radix-ui/react-progress': '^1.1.8',
  '@radix-ui/react-radio-group': '^1.3.8',
  '@radix-ui/react-scroll-area': '^1.2.10',
  '@radix-ui/react-select': '^2.2.6',
  '@radix-ui/react-separator': '^1.1.8',
  '@radix-ui/react-slider': '^1.3.6',
  '@radix-ui/react-slot': '^1.2.4',
  '@radix-ui/react-switch': '^1.2.6',
  '@radix-ui/react-tabs': '^1.1.13',
  '@radix-ui/react-toast': '^1.2.15',
  '@radix-ui/react-toggle': '^1.1.10',
  '@radix-ui/react-toggle-group': '^1.1.11',
  '@radix-ui/react-tooltip': '^1.2.8',
  'ag-grid-community': '35.1.0',
  'ag-grid-enterprise': '35.1.0',
  'ag-grid-react': '35.1.0',
  'class-variance-authority': '^0.7.1',
  'clsx': '^2.1.1',
  'cmdk': '^1.1.1',
  'embla-carousel-react': '^8.6.0',
  // fi-tt uses file:libs/lucide-react-0.554.0.tgz — using registry caret
  // for our repo since we don't carry that tarball locally
  'lucide-react': '^0.554.0',
  'next-themes': '^0.4.6',
  'react': '~19.2.5',
  'react-day-picker': '^9.11.0',
  'react-dom': '~19.2.5',
  'react-hook-form': '^7.72.1',
  'react-resizable-panels': '^4.9.0',
  'recharts': '^3.6.0',
  'sonner': '^2.0.7',
  'tailwind-merge': '^3.5.0',
  'vaul': '^1.1.2',
  // devDependencies
  '@eslint/js': '^9.39.4',
  '@types/node': '^22.19.17',
  '@types/react': '^19.2.14',
  '@types/react-dom': '^19.2.3',
  '@vitejs/plugin-react': '~4.5.2',
  'autoprefixer': '^10.4.27',
  'eslint': '^9.39.4',
  'eslint-plugin-react-hooks': '^7.0.1',
  'eslint-plugin-react-refresh': '^0.4.26',
  'globals': '^16.5.0',
  'postcss': '^8.5.9',
  'tailwindcss': '3.4.1',
  'tailwindcss-animate': '^1.0.7',
  'typescript': '~5.9.3',
  'typescript-eslint': '^8.53.1',
  'vite': '~7.3.2',
};

function alignDeps(deps) {
  if (!deps) return { changed: 0, before: deps };
  let changed = 0;
  for (const name of Object.keys(deps)) {
    if (FI_TT[name] && deps[name] !== FI_TT[name]) {
      deps[name] = FI_TT[name];
      changed++;
    }
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
  // Preserve trailing newline if present
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
