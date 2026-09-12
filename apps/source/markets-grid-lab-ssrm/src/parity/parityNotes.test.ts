import { describe, expect, it } from 'vitest';
import { SSRM_TABS } from '../tabs/tabConfigs';
import { PARITY, parityFor } from './parityNotes';

describe('parity notes', () => {
  it('carries one verdict per feature tab plus profiles — a new lab tab cannot ship without one', () => {
    const covered = new Set(PARITY.map((p) => p.tabId));
    for (const tab of SSRM_TABS) expect(covered.has(tab.id), tab.id).toBe(true);
    expect(covered.has('profiles')).toBe(true);
    expect(PARITY).toHaveLength(SSRM_TABS.length + 1);
  });

  it('states a summary and at least one mechanism note per entry', () => {
    for (const entry of PARITY) {
      expect(entry.summary.length).toBeGreaterThan(10);
      expect(entry.notes.length).toBeGreaterThan(0);
    }
  });

  it('marks the known write-path gaps as gaps, not partials', () => {
    expect(parityFor('bulk-update')?.status).toBe('gap');
    expect(parityFor('plus-minus')?.status).toBe('gap');
    expect(parityFor('shortcuts')?.status).toBe('gap');
  });
});
