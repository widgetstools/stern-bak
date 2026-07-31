#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────
//  Fails when JSX/TSX under apps/ uses native <select>.
//  React apps must use @wellsfargo-starui/ui (shadcn/Radix) Select instead — see
//  CLAUDE.md UI stack rules.
// ─────────────────────────────────────────────────────────────

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';

const ROOT = process.cwd();
const APPS_DIR = resolve(ROOT, 'apps');
const CODE_EXTS = new Set(['.tsx', '.jsx']);
/** Opening native select tag in JSX (allows whitespace / attrs). */
const NATIVE_SELECT_RE = /<\s*select\b[\s/>]/;

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage']);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = resolve(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (CODE_EXTS.has(extname(p))) out.push(p);
  }
}

function main(): void {
  const files: string[] = [];
  try {
    walk(APPS_DIR, files);
  } catch (e) {
    console.error('check-react-apps-no-native-select: cannot read apps/', e);
    process.exit(1);
  }

  let failed = false;
  for (const file of files.sort()) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (!NATIVE_SELECT_RE.test(line)) return;
      failed = true;
      console.error(`${relative(ROOT, file)}:${i + 1}  native <select> — use Select / SelectTrigger / SelectContent / SelectItem from @wellsfargo-starui/ui`);
    });
  }

  if (failed) {
    console.error('\ncheck-react-apps-no-native-select: failed.');
    process.exit(1);
  }
  console.log('check-react-apps-no-native-select: clean (no native <select> in apps/).');
}

main();
