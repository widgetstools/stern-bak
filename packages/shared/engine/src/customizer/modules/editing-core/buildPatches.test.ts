import { describe, expect, it } from 'vitest';
import { buildPatchesFromTargets, dedupePatches } from './buildPatches.js';

describe('buildPatchesFromTargets', () => {
  it('builds patches with old and new values', () => {
    const patches = buildPatchesFromTargets(
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 100 }],
      () => 200,
    );
    expect(patches).toEqual([
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 },
    ]);
  });

  it('skips targets where compute returns null', () => {
    const patches = buildPatchesFromTargets(
      [{ rowId: 'r1', colId: 'qty', field: 'qty', value: 'bad' }],
      () => null,
    );
    expect(patches).toHaveLength(0);
  });
});

describe('dedupePatches', () => {
  it('keeps last patch per row+field', () => {
    const out = dedupePatches([
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 },
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 2, newValue: 3 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.newValue).toBe(3);
  });
});
