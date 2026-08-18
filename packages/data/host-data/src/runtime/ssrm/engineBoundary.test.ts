import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE_DIR = join(__dirname);
const FORBIDDEN = ['../worker/', '../client/', '../providers/', '../bootstrap/'];

/**
 * Every way a module specifier can appear, not just `from '…'`.
 *
 * The check used to match the static form alone, so `import('../worker/x')`,
 * `await import("../client/y")` and a bare `require(…)` would have slipped
 * through — and a dynamic import is exactly how someone reaches for the
 * forbidden side of the boundary when the static one is refused.
 */
function referencesModule(src: string, specifier: string): boolean {
  for (const q of ['"', "'", '`']) {
    if (src.includes(`from ${q}${specifier}`)) return true;
    if (src.includes(`import(${q}${specifier}`)) return true;
    if (src.includes(`require(${q}${specifier}`)) return true;
  }
  return false;
}

describe('ssrm engine boundary', () => {
  it('imports nothing from worker, client, providers, or bootstrap', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(ENGINE_DIR)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const src = readFileSync(join(ENGINE_DIR, f), 'utf8');
      for (const bad of FORBIDDEN) {
        if (referencesModule(src, bad)) offenders.push(`${f} -> ${bad}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('catches a DYNAMIC import, not just a static one', () => {
    // The gap this closes: the old matcher only looked for `from '…'`.
    expect(referencesModule(`await import('../worker/hub.js')`, '../worker/')).toBe(true);
    expect(referencesModule(`import("../client/x.js")`, '../client/')).toBe(true);
    expect(referencesModule(`require('../providers/p.js')`, '../providers/')).toBe(true);
    expect(referencesModule(`import { A } from '../worker/hub.js'`, '../worker/')).toBe(true);
    expect(referencesModule(`import { A } from './types.js'`, '../worker/')).toBe(false);
  });
});
