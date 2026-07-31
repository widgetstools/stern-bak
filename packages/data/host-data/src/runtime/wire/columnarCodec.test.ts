import { describe, expect, it } from 'vitest';
import { decodeColumnar, tryEncodeColumnar } from './columnarCodec.js';

function roundtrip(rows: readonly unknown[]): unknown[] {
  const buf = tryEncodeColumnar(rows);
  expect(buf).not.toBeNull();
  return decodeColumnar(buf!);
}

describe('columnarCodec — roundtrip', () => {
  it('roundtrips number-heavy rows', () => {
    const rows = [
      { id: 'a', px: 101.25, qty: 500, pnl: -12.5 },
      { id: 'b', px: 99.875, qty: 0, pnl: 0.001 },
    ];
    expect(roundtrip(rows)).toEqual(rows);
  });

  it('roundtrips strings, booleans and nulls', () => {
    const rows = [
      { id: 'a', name: 'Alpha', live: true, note: null },
      { id: 'b', name: 'Beta', live: false, note: 'x' },
    ];
    expect(roundtrip(rows)).toEqual(rows);
  });

  it('omits absent fields instead of inventing values (ragged rows)', () => {
    const rows = [
      { id: 'a', px: 1 },
      { id: 'b', qty: 2 },
      { id: 'c', px: 3, qty: 4 },
    ];
    const out = roundtrip(rows) as Array<Record<string, unknown>>;
    expect(out).toEqual(rows);
    expect('qty' in out[0]).toBe(false);
    expect('px' in out[1]).toBe(false);
  });

  it('ships nested objects and arrays through the json column', () => {
    const rows = [
      { id: 'a', meta: { venue: 'X', depth: [1, 2, 3] } },
      { id: 'b', meta: { venue: 'Y', depth: [] } },
    ];
    expect(roundtrip(rows)).toEqual(rows);
  });

  it('demotes mixed-type columns to json', () => {
    const rows = [
      { id: 'a', v: 1 },
      { id: 'b', v: 'two' },
      { id: 'c', v: true },
    ];
    expect(roundtrip(rows)).toEqual(rows);
  });

  it('handles all-null columns', () => {
    const rows = [
      { id: 'a', v: null },
      { id: 'b', v: null },
    ];
    expect(roundtrip(rows)).toEqual(rows);
  });

  it('roundtrips an empty frame', () => {
    expect(roundtrip([])).toEqual([]);
  });

  it('roundtrips > 8 rows so bitmap bytes span (boundary check)', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `r${i}`,
      px: i * 1.5,
      odd: i % 2 === 1,
      gap: i % 3 === 0 ? undefined : i,
    })).map(({ gap, ...rest }) => (gap === undefined ? rest : { ...rest, gap }));
    expect(roundtrip(rows)).toEqual(rows);
  });

  it('preserves special float values (NaN excluded — JSON parity not required)', () => {
    const rows = [{ id: 'a', v: Number.MAX_SAFE_INTEGER }, { id: 'b', v: 1e-12 }];
    expect(roundtrip(rows)).toEqual(rows);
  });
});

describe('columnarCodec — fallback + errors', () => {
  it('returns null when a row is not a plain object', () => {
    expect(tryEncodeColumnar([{ id: 'a' }, 42])).toBeNull();
    expect(tryEncodeColumnar([['array-row']])).toBeNull();
    expect(tryEncodeColumnar([null])).toBeNull();
  });

  it('throws on a buffer that is not a COL1 frame', () => {
    const junk = new TextEncoder().encode('[{"id":"a"}]');
    expect(() => decodeColumnar(junk)).toThrow(/bad magic/);
  });

  it('decodes from a non-zero byteOffset subarray', () => {
    const buf = tryEncodeColumnar([{ id: 'a', px: 1 }])!;
    const padded = new Uint8Array(buf.byteLength + 8);
    padded.set(buf, 8);
    const view = padded.subarray(8);
    expect(decodeColumnar(view)).toEqual([{ id: 'a', px: 1 }]);
  });
});
