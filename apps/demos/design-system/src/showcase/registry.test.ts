import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHOWCASE_ENTRIES, SHOWCASE_CATEGORIES } from './registry';

// Non-visual / utility modules that are not standalone showcase entries.
const ALLOWLIST = new Set([
  'use-toast', 'toaster', 'sonner',
  'CollapsibleToolbar', 'ToolbarContainer', 'VirtualizedList',
]);

const componentsDir = fileURLToPath(
  new URL('../../../../../packages/react-ui/ui/src/components', import.meta.url),
);

function publicComponentIds(): string[] {
  return readdirSync(componentsDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => f.replace(/\.tsx$/, ''))
    .filter((id) => !ALLOWLIST.has(id));
}

describe('showcase registry completeness', () => {
  it('has an entry for every public @wellsfargo-starui/ui component', () => {
    const ids = new Set(SHOWCASE_ENTRIES.map((e) => e.id));
    const missing = publicComponentIds().filter((id) => !ids.has(id));
    expect(missing, `missing showcase entries: ${missing.join(', ')}`).toEqual([]);
  });

  it('every entry has import line, code, a Demo, and a valid category', () => {
    const cats = new Set(SHOWCASE_CATEGORIES.map((c) => c.id));
    for (const e of SHOWCASE_ENTRIES) {
      expect(e.importLine.length, `${e.id}.importLine`).toBeGreaterThan(0);
      expect(e.code.length, `${e.id}.code`).toBeGreaterThan(0);
      expect(typeof e.Demo, `${e.id}.Demo`).toBe('function');
      expect(cats.has(e.category), `${e.id}.category`).toBe(true);
    }
  });

  it('entry ids are unique', () => {
    const ids = SHOWCASE_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
