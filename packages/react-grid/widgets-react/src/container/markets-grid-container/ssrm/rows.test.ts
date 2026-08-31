import { describe, expect, it } from 'vitest';
import {
  CHILD_COUNT_FIELD,
  ROW_ID_FIELD,
  ROW_PATH,
  groupKeyToken,
  mapGroupRows,
  mapLeafRows,
  mapTotalRow,
  routeKey,
  rowIdForGroup,
} from './rows.js';

const SEP = String.fromCharCode(1);

describe('groupKeyToken', () => {
  it('keeps values of different types apart even when they stringify the same', () => {
    expect(groupKeyToken(null)).not.toBe(groupKeyToken('null'));
    expect(groupKeyToken(undefined)).toBe(groupKeyToken(null));
    expect(groupKeyToken(1)).not.toBe(groupKeyToken('1'));
    expect(groupKeyToken(true)).not.toBe(groupKeyToken('true'));
    expect(groupKeyToken(new Date(5))).toBe('d5');
  });
});

describe('rowIdForGroup / routeKey', () => {
  it('renders a stable id per route + key', () => {
    const a = rowIdForGroup(['EMEA'], 'Rates');
    const b = rowIdForGroup(['EMEA'], 'Rates');
    const c = rowIdForGroup(['EMEA'], 'Credit');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('separates path segments with a control character no real key carries', () => {
    // A printable separator would collide with data ('a:b' as one key vs
    // ['a','b'] as a route); the  separator keeps those apart.
    const oneKey = rowIdForGroup([], 'a:b');
    const routed = rowIdForGroup(['a'], 'b');
    expect(oneKey).not.toBe(routed);
    expect(routed).toContain(SEP);
    expect(routeKey(1, ['x'])).toContain(SEP);
  });
});

describe('mapLeafRows', () => {
  it('turns columnar output into row objects (compiled factory path)', () => {
    const rows = mapLeafRows({ a: [1, 2], 'b.c': ['x', 'y'] });
    expect(rows).toEqual([
      { a: 1, 'b.c': 'x' },
      { a: 2, 'b.c': 'y' },
    ]);
  });

  it('returns empty for no columns', () => {
    expect(mapLeafRows({})).toEqual([]);
  });

  it('ignores the row-path column', () => {
    const rows = mapLeafRows({ [ROW_PATH]: [['g']], a: [1] });
    expect(rows).toEqual([{ a: 1 }]);
  });
});

describe('mapGroupRows', () => {
  it('stamps a row id and writes the group key LAST so an aggregate under the same name cannot mask it', () => {
    const columns = {
      [ROW_PATH]: [['EMEA'], ['APAC']],
      // The group column also aggregated as a value — same name.
      desk: [123, 456],
      [CHILD_COUNT_FIELD]: [10, 20],
    };
    const rows = mapGroupRows(columns, 'desk', []);
    expect(rows).toHaveLength(2);
    expect(rows[0].desk).toBe('EMEA');
    expect(rows[1].desk).toBe('APAC');
    expect(rows[0][CHILD_COUNT_FIELD]).toBe(10);
    expect(typeof rows[0][ROW_ID_FIELD]).toBe('string');
    expect(rows[0][ROW_ID_FIELD]).not.toBe(rows[1][ROW_ID_FIELD]);
  });

  it('renders a null-keyed group distinctly from the "null" string group', () => {
    const nullRow = mapGroupRows({ [ROW_PATH]: [[null]] }, 'g', [])[0];
    const strRow = mapGroupRows({ [ROW_PATH]: [['null']] }, 'g', [])[0];
    expect(nullRow[ROW_ID_FIELD]).not.toBe(strRow[ROW_ID_FIELD]);
    expect(nullRow.g).toBeNull();
    expect(strRow.g).toBe('null');
  });
});

describe('mapTotalRow', () => {
  it('reads the single aggregate row, stamping an id when given', () => {
    expect(mapTotalRow({ pnl: [42] })).toEqual({ pnl: 42 });
    expect(mapTotalRow({ pnl: [42] }, 'total-id')).toEqual({ [ROW_ID_FIELD]: 'total-id', pnl: 42 });
  });
});
