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
});
