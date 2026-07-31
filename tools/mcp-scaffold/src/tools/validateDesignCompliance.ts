import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { lintDesignCompliance, type DesignFile } from '../lib/designLinter.js';

function collectFiles(dir: string, base: string, acc: DesignFile[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'libs') continue;
      collectFiles(full, base, acc);
      continue;
    }
    const rel = relative(base, full);
    if (/\.(tsx?|css)$/.test(rel)) {
      acc.push({ path: rel, content: readFileSync(full, 'utf8') });
    }
  }
}

export function handleValidateDesignCompliance(opts: { projectDir: string }) {
  const files: DesignFile[] = [];
  collectFiles(opts.projectDir, opts.projectDir, files);
  const violations = lintDesignCompliance(files);
  return { success: violations.length === 0, violationCount: violations.length, violations };
}
