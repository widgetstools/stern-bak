import { describe, expect, it } from 'vitest';
import {
  buildBulkUpdatePatches,
  buildBulkUpdatePatchesFromRaw,
  parseBulkUpdateValue,
} from './applyBulkUpdate';
import type { BulkUpdateTarget } from './collectBulkUpdateTargets.js';

const targets: BulkUpdateTarget[] = [
  { rowId: 'r1', colId: 'price', field: 'price', value: 10, cellDataType: 'number' },
  { rowId: 'r2', colId: 'price', field: 'price', value: 20, cellDataType: 'number' },
];

describe('parseBulkUpdateValue', () => {
  it('parses numbers and rejects non-finite input', () => {
    expect(parseBulkUpdateValue('12.5', 'number')).toBe(12.5);
    expect(parseBulkUpdateValue('nope', 'number')).toBeNull();
  });

  it('parses dates to yyyy-mm-dd', () => {
    expect(parseBulkUpdateValue('2026-04-17', 'dateTime')).toBe('2026-04-17');
    expect(parseBulkUpdateValue('bad-date', 'dateTime')).toBeNull();
  });

  it('passes through text values', () => {
    expect(parseBulkUpdateValue('hello', 'text')).toBe('hello');
  });
});

describe('buildBulkUpdatePatches', () => {
  it('skips unchanged cells and emits patches for changes', () => {
    expect(buildBulkUpdatePatches(targets, 10)).toEqual([
      {
        rowId: 'r2',
        colId: 'price',
        field: 'price',
        oldValue: 20,
        newValue: 10,
      },
    ]);
    const patches = buildBulkUpdatePatches(targets, 99);
    expect(patches).toHaveLength(2);
    expect(patches[0].newValue).toBe(99);
  });

  it('returns no patches when raw input does not parse', () => {
    expect(buildBulkUpdatePatchesFromRaw([], '1')).toEqual([]);
    expect(buildBulkUpdatePatchesFromRaw(targets, 'nope')).toEqual([]);
  });
});
