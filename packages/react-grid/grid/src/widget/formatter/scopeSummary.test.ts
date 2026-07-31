import { describe, expect, it } from 'vitest';
import { EMPTY_SCOPE_MESSAGE, scopeSummary } from './scopeSummary';

const base = { scope: 'selected', target: 'cell', colIds: [], colLabel: '' } as const;

describe('scopeSummary', () => {
  it('is empty (invitation) when selected scope has no columns', () => {
    const s = scopeSummary(base);
    expect(s.empty).toBe(true);
    expect(s.full).toBe(EMPTY_SCOPE_MESSAGE);
  });

  it('is never empty in "all" scope even with no focused column', () => {
    const s = scopeSummary({ ...base, scope: 'all' });
    expect(s.empty).toBe(false);
    expect(s.scopeLabel).toBe('all columns');
    expect(s.full).toBe('Cells · all columns');
  });

  it('names the single targeted column', () => {
    const s = scopeSummary({ ...base, colIds: ['price'], colLabel: 'Price' });
    expect(s.scopeLabel).toBe('Price');
    expect(s.full).toBe('Cells · Price');
  });

  it('counts multiple targeted columns', () => {
    const s = scopeSummary({ ...base, colIds: ['a', 'b', 'c'], colLabel: 'A' });
    expect(s.scopeLabel).toBe('3 columns');
  });

  it('reflects the header target', () => {
    const s = scopeSummary({ ...base, target: 'header', colIds: ['a'], colLabel: 'A' });
    expect(s.targetLabel).toBe('Headers');
    expect(s.full).toBe('Headers · A');
  });
});
