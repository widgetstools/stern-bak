import { describe, expect, it } from 'vitest';
import { filterPresets } from './presetSearch';
import { presetsForDataType } from './presetsForDataType';

const numberPresets = presetsForDataType('number');

describe('filterPresets', () => {
  it('returns nothing for a blank query (caller shows tabs)', () => {
    expect(filterPresets(numberPresets, '')).toEqual([]);
    expect(filterPresets(numberPresets, '   ')).toEqual([]);
  });

  it('matches on label', () => {
    const ids = filterPresets(numberPresets, 'paren').map((p) => p.id);
    expect(ids).toContain('num-neg-parens');
  });

  it('matches on hint', () => {
    const ids = filterPresets(numberPresets, 'bps').map((p) => p.id);
    expect(ids).toContain('num-bps');
  });

  it('matches on the format code', () => {
    const ids = filterPresets(numberPresets, '#,##0.00').map((p) => p.id);
    expect(ids).toContain('num-2dp');
  });

  it('matches text transforms by label', () => {
    const ids = filterPresets(presetsForDataType('string'), 'upper').map((p) => p.id);
    expect(ids).toContain('str-upper');
  });

  it('is case-insensitive', () => {
    expect(filterPresets(numberPresets, 'INTEGER').map((p) => p.id)).toContain('num-integer');
  });
});
