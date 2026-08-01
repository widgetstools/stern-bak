/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from './GridProvider';
import { clearEditJournalRegistry, getEditJournal } from '../editing/editJournalScope';
import { useEditJournal, useSyncJournalSuspend } from './useEditJournal';
import { dataChangeHistoryModule } from '../modules/data-change-history';

function wrap(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GridProvider platform={platform}>{children}</GridProvider>;
  };
}

describe('useEditJournal', () => {
  beforeEach(() => {
    clearEditJournalRegistry();
  });

  it('returns the shared journal for the grid', () => {
    const platform = new GridPlatform({ gridId: 'g1', modules: [dataChangeHistoryModule] });
    const { result } = renderHook(() => useEditJournal(), { wrapper: wrap(platform) });
    expect(result.current).toBe(getEditJournal(platform));
  });

  it('re-renders when journal records a new entry', () => {
    const platform = new GridPlatform({ gridId: 'g2', modules: [dataChangeHistoryModule] });
    const { result } = renderHook(() => useEditJournal(), { wrapper: wrap(platform) });
    expect(result.current.entries.length).toBe(0);

    act(() => {
      result.current.record({
        source: 'cell-editor',
        label: 'Typed qty',
        patches: [{ rowId: 'r1', colId: 'qty', field: 'qty', prev: 1, next: 5 }],
      });
    });
    expect(result.current.entries.length).toBe(1);
  });
});

describe('useSyncJournalSuspend', () => {
  beforeEach(() => {
    clearEditJournalRegistry();
  });

  it('suspends and resumes the journal with the flag', () => {
    const platform = new GridPlatform({ gridId: 'g3', modules: [dataChangeHistoryModule] });
    const journal = getEditJournal(platform);

    const { rerender } = renderHook(
      ({ suspended }) => useSyncJournalSuspend(suspended),
      { wrapper: wrap(platform), initialProps: { suspended: false } },
    );
    expect(journal.isSuspended).toBe(false);

    rerender({ suspended: true });
    expect(journal.isSuspended).toBe(true);

    rerender({ suspended: false });
    expect(journal.isSuspended).toBe(false);
  });
});
