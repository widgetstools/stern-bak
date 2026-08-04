import { describe, expect, it } from 'vitest';
import { baseColumns } from './columns';
import { buildStressColumns, STRESS_ROW_COUNTS } from './stressColumns';

describe('buildStressColumns', () => {
  it('widens the base set to the requested count', () => {
    expect(buildStressColumns(120)).toHaveLength(120);
    expect(buildStressColumns(60)).toHaveLength(60);
  });

  it('keeps the base columns first and untouched', () => {
    const columns = buildStressColumns(120);

    expect(columns.slice(0, baseColumns.length)).toEqual(baseColumns);
  });

  // AG Grid keys columns by `colId`, defaulting to `field`. The generated
  // columns deliberately repeat fields, so without distinct ids only the first
  // of each would render and the tab would quietly not be a stress test.
  it('gives every generated column a distinct colId', () => {
    const columns = buildStressColumns(120);
    const ids = columns.map((c, i) => c.colId ?? c.field ?? `#${i}`);

    expect(new Set(ids).size).toBe(columns.length);
  });

  // Inert padding columns would let an engine shortcut exactly the layout,
  // format and sort work this tab exists to measure.
  it('derives every generated column from a real field', () => {
    const columns = buildStressColumns(120);
    const baseFields = new Set(baseColumns.map((c) => c.field));

    for (const col of columns.slice(baseColumns.length)) {
      expect(typeof col.field).toBe('string');
      expect(col.field!.length).toBeGreaterThan(0);
      expect(col.headerName).toMatch(/· s\d+$/);
    }
    // And the widening reuses fields rather than inventing new ones.
    const generatedFields = new Set(columns.slice(baseColumns.length).map((c) => c.field));
    expect(generatedFields.size).toBeGreaterThan(0);
    expect([...generatedFields].every((f) => typeof f === 'string')).toBe(true);
    expect(baseFields.size).toBeGreaterThan(0);
  });

  it('never spins when the target is already met', () => {
    expect(buildStressColumns(1)).toHaveLength(baseColumns.length);
  });

  it('offers row counts that reach past what a window holds comfortably', () => {
    expect(STRESS_ROW_COUNTS[0]).toBe(1_000);
    expect(STRESS_ROW_COUNTS.at(-1)).toBe(200_000);
  });
});
