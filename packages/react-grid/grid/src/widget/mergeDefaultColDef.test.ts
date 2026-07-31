import { describe, expect, it, beforeEach } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import { mergeDefaultColDef, resetMergeDefaultColDefCacheForTest } from './mergeDefaultColDef';

describe('mergeDefaultColDef', () => {
  beforeEach(() => resetMergeDefaultColDefCacheForTest());

  it('returns pipeline def when host def is absent', () => {
    const pipeline = { sortable: true } as ColDef;
    expect(mergeDefaultColDef(pipeline, undefined)).toBe(pipeline);
  });

  it('returns host def when pipeline def is absent', () => {
    const host = { filter: true } as ColDef;
    expect(mergeDefaultColDef(undefined, host)).toBe(host);
  });

  it('preserves merged reference when inputs unchanged', () => {
    const pipeline = { sortable: true } as ColDef;
    const host = { filter: true } as ColDef;
    const first = mergeDefaultColDef(pipeline, host);
    const second = mergeDefaultColDef(pipeline, host);
    expect(second).toBe(first);
  });

  it('host keys win on conflict', () => {
    const merged = mergeDefaultColDef(
      { sortable: false, filter: true } as ColDef,
      { sortable: true } as ColDef,
    );
    expect(merged?.sortable).toBe(true);
    expect(merged?.filter).toBe(true);
  });

  it('reuses cached merge when shallow-equal result arrives with new object identity', () => {
    const pipeline = { sortable: true, filter: true } as ColDef;
    const host = { resizable: true } as ColDef;
    const first = mergeDefaultColDef(pipeline, host);
    const secondPipeline = { sortable: true, filter: true } as ColDef;
    const secondHost = { resizable: true } as ColDef;
    const second = mergeDefaultColDef(secondPipeline, secondHost);
    expect(second).toBe(first);
  });
});
