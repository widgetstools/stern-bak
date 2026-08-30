import { describe, it, expect } from 'vitest';
import { inferFields } from './inferFields';

describe('inferFields', () => {
  it('returns empty when given no rows', () => {
    expect(inferFields([])).toEqual({ fields: [], rowsUsed: 0, rowsFetched: 0 });
  });

  it('infers a flat schema with type detection + nullable flag', () => {
    const { fields } = inferFields([
      { id: 'a', price: 1.2, active: true, when: '2024-01-15', meta: {} },
      { id: 'b', price: 1.3, active: false, when: '2024-01-16' },
    ]);

    const byPath = Object.fromEntries(fields.map((f) => [f.path, f]));
    expect(byPath.id?.type).toBe('string');
    expect(byPath.price?.type).toBe('number');
    expect(byPath.active?.type).toBe('boolean');
    expect(byPath.when?.type).toBe('date');
    expect(byPath.id?.nullable).toBe(false);  // present in every row
    expect(byPath.meta?.nullable).toBe(true); // missing in row 2
  });

  it('walks nested objects into children with dotted paths', () => {
    const { fields } = inferFields([
      { id: 'a', meta: { region: 'US', risk: 0.4 } },
      { id: 'b', meta: { region: 'UK', risk: 0.5 } },
    ]);
    const meta = fields.find((f) => f.path === 'meta');
    expect(meta?.type).toBe('object');
    const childPaths = meta?.children?.map((c) => c.path).sort();
    expect(childPaths).toEqual(['meta.region', 'meta.risk']);
  });

  it('honours targetSampleSize via completeness-weighted scoring', () => {
    // 3 rows: two complete, one with only id. With sampleSize=2 the
    // sparse row should be dropped so the inferred schema looks
    // complete (no nullable for `value`).
    const { fields, rowsUsed, rowsFetched } = inferFields(
      [
        { id: 'a' }, // sparse
        { id: 'b', value: 1, ts: '2024-01-15' },
        { id: 'c', value: 2, ts: '2024-01-16' },
      ],
      { targetSampleSize: 2 },
    );
    expect(rowsFetched).toBe(3);
    expect(rowsUsed).toBe(2);
    const value = fields.find((f) => f.path === 'value');
    expect(value?.nullable).toBe(false);
  });

  it('caps total fields at maxFields', () => {
    const wide = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 };
    const { fields } = inferFields([wide], { maxFields: 3 });
    expect(fields.map((f) => f.path)).toEqual(['a', 'b', 'c']);
  });

  it('descends arrays into positional element paths (legs[0].rate)', () => {
    const { fields } = inferFields([
      { id: 'a', legs: [{ rate: 0.05, ccy: 'USD' }, { rate: 0.03, ccy: 'EUR' }], tenors: [1, 2, 3] },
      { id: 'b', legs: [{ rate: 0.04, ccy: 'GBP' }], tenors: [4, 5] },
    ]);
    const legs = fields.find((f) => f.path === 'legs')!;
    expect(legs.type).toBe('array');
    expect(legs.name).toBe('legs');
    expect(legs.children?.map((c) => [c.path, c.name, c.type, c.nullable])).toEqual([
      ['legs[0]', '[0]', 'object', false],
      ['legs[1]', '[1]', 'object', true], // only row a has a second leg
    ]);
    expect(legs.children![0]!.children?.map((c) => c.path)).toEqual(['legs[0].rate', 'legs[0].ccy']);
    expect(legs.children![0]!.children![0]!.type).toBe('number');

    const tenors = fields.find((f) => f.path === 'tenors')!;
    expect(tenors.children?.map((c) => [c.path, c.type, c.nullable])).toEqual([
      ['tenors[0]', 'number', false],
      ['tenors[1]', 'number', false],
      ['tenors[2]', 'number', true],
    ]);
  });

  it('bounds array descent by maxArrayElements (0 keeps arrays opaque)', () => {
    const rows = [{ xs: [1, 2, 3, 4] }];
    expect(inferFields(rows, { maxArrayElements: 2 }).fields[0]!.children?.map((c) => c.path))
      .toEqual(['xs[0]', 'xs[1]']);
    const opaque = inferFields(rows, { maxArrayElements: 0 }).fields[0]!;
    expect(opaque.type).toBe('array');
    expect(opaque.children).toBeUndefined();
  });

  it('descends nested arrays (m[1][0]) and empty arrays stay childless', () => {
    const { fields } = inferFields([{ m: [[1, 2], [3]], empty: [] }]);
    const m = fields.find((f) => f.path === 'm')!;
    expect(m.children![1]!.children?.map((c) => c.path)).toEqual(['m[1][0]']);
    expect(fields.find((f) => f.path === 'empty')!.children).toBeUndefined();
  });

  it('bracket-quotes keys that contain grammar characters and keeps the raw name', () => {
    const { fields } = inferFields([{ 'a.b': { c: 1 }, 'we[ird': 2 }]);
    expect(fields.map((f) => [f.path, f.name])).toEqual([
      ['["a.b"]', 'a.b'],
      ['["we[ird"]', 'we[ird'],
    ]);
    expect(fields[0]!.children![0]!.path).toBe('["a.b"].c');
  });

  it('lets the first non-null value decide the type', () => {
    const { fields } = inferFields([{ v: null }, { v: 3 }]);
    expect(fields[0]!.type).toBe('number');
    expect(fields[0]!.nullable).toBe(true);
  });
});
