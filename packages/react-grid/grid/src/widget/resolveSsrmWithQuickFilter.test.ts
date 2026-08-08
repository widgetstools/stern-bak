import { describe, expect, it, vi } from 'vitest';
import { resolveSsrmWithQuickFilter } from './resolveSsrmWithQuickFilter.js';

describe('resolveSsrmWithQuickFilter', () => {
  const provider = { id: 'p1' } as never;

  it('synthesizes getQuickFilterText when ssrm provider is set', () => {
    const read = vi.fn(() => 'search-term');
    const resolved = resolveSsrmWithQuickFilter({ provider, keyColumn: 'id' }, read);
    expect(resolved?.getQuickFilterText?.()).toBe('search-term');
    expect(read).toHaveBeenCalled();
  });

  it('preserves caller-provided getQuickFilterText', () => {
    const custom = vi.fn(() => 'custom');
    const resolved = resolveSsrmWithQuickFilter(
      { provider, getQuickFilterText: custom },
      vi.fn(() => 'ignored'),
    );
    expect(resolved?.getQuickFilterText).toBe(custom);
  });

  it('returns undefined when ssrm is absent', () => {
    expect(resolveSsrmWithQuickFilter(undefined, () => '')).toBeUndefined();
  });
});
