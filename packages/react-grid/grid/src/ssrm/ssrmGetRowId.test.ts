import { describe, expect, it } from 'vitest';
import { createSsrmGetRowId, ssrmGetRowId } from './ssrmGetRowId.js';

describe('ssrmGetRowId', () => {
  it('uses the key column for leaves', () => {
    expect(ssrmGetRowId({ positionId: 'p1' }, 'positionId')).toBe('p1');
  });

  it('uses __ssrmGroupKey for groups', () => {
    expect(ssrmGetRowId({ desk: 'A', __ssrmGroupKey: 'A' }, 'positionId')).toBe('A');
  });
});

describe('createSsrmGetRowId', () => {
  it('prefixes group rows with level and parentKeys', () => {
    const getId = createSsrmGetRowId('positionId');
    expect(getId({
      data: { desk: 'EQ', __ssrmGroupKey: 'EQ' },
      level: 1,
      parentKeys: ['NY'],
    } as never)).toBe('1:NY:EQ');
  });

  it('returns the leaf id when level and parents are empty', () => {
    const getId = createSsrmGetRowId('positionId');
    expect(getId({ data: { positionId: 'p1' }, level: 0, parentKeys: [] } as never)).toBe('p1');
  });
});

describe('ssrmGetRowId edge cases', () => {
  it('returns a sentinel for missing rows', () => {
    expect(ssrmGetRowId(null, 'id')).toBe('__ssrm_missing__');
    expect(ssrmGetRowId(12, 'id')).toBe('__ssrm_missing__');
  });

  it('falls through an empty group key and memoizes anonymous ids', () => {
    const row = { desk: 'A', __ssrmGroupKey: '' };
    const a = ssrmGetRowId(row, 'missing');
    const b = ssrmGetRowId(row, 'missing');
    expect(a).toMatch(/^__ssrm_anon_/);
    expect(a).toBe(b);
  });
});
