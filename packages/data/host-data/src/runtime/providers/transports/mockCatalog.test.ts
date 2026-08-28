import { describe, expect, it } from 'vitest';
import {
  MOCK_DATASETS,
  mockDataset,
  mockFieldGroups,
  curatedColumns,
  allCatalogColumns,
  columnsForFields,
  type MockDataType,
} from './mockCatalog.js';
import { probeMock, startMock } from './mock.js';

/** Field names the generator actually produces, for one dataset. */
function generatedFields(dataType: MockDataType): Set<string> {
  const { rows } = probeMock({ providerType: 'mock', dataType }, { maxRows: 8 });
  const names = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row as object)) names.add(key);
  return names;
}

/**
 * The catalogue is hand-written, so it can drift from the generator. Every
 * catalogued name is checked against real generated rows — a rename in
 * `mockPosition.ts` then breaks this test rather than silently dropping a
 * column from every blotter created afterwards.
 */
describe('catalogue matches the generator', () => {
  for (const dataset of MOCK_DATASETS) {
    it(`every ${dataset.dataType} field exists on a generated row`, () => {
      const real = generatedFields(dataset.dataType);
      const missing = dataset.fields.map((f) => f.field).filter((name) => !real.has(name));

      expect(missing, `catalogued but never generated: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${dataset.dataType} keyColumn is a real field`, () => {
      expect(generatedFields(dataset.dataType).has(dataset.keyColumn)).toBe(true);
    });
  }
});

describe('curation', () => {
  /** The ask was "at least 40 essential columns" for the two real blotters. */
  it.each([
    ['positions' as const, 40],
    ['trades' as const, 40],
  ])('%s opens with at least %i curated columns', (dataType, min) => {
    expect(curatedColumns(dataType).length).toBeGreaterThanOrEqual(min);
  });

  /** Inference returns all 256 position fields — a schema dump, not a blotter.
   *  Curation only earns its place if it is meaningfully smaller. */
  it('curates far fewer columns than the row has fields', () => {
    const generated = generatedFields('positions').size;
    const curated = curatedColumns('positions').length;

    expect(generated).toBeGreaterThan(200);
    expect(curated).toBeLessThan(generated / 3);
  });

  it('gives every curated column a header and a data type', () => {
    for (const dataType of ['positions', 'trades'] as const) {
      for (const col of curatedColumns(dataType)) {
        expect(col.headerName, col.field).toBeTruthy();
        expect(col.cellDataType, col.field).toBeTruthy();
      }
    }
  });

  /** The key must be *resolvable*, not *displayed* — callers add it back
   *  hidden. So it has to be in the catalogue, not in the curated set. */
  it('catalogues the key column so it can always be resolved', () => {
    for (const dataset of MOCK_DATASETS) {
      const catalogued = dataset.fields.map((f) => f.field);
      expect(catalogued, dataset.dataType).toContain(dataset.keyColumn);
    }
  });

  it('never lists the same field twice', () => {
    for (const dataset of MOCK_DATASETS) {
      const names = dataset.fields.map((f) => f.field);
      expect(new Set(names).size, dataset.dataType).toBe(names.length);
    }
  });
});

/**
 * The hub keys its row cache by `keyColumn` and drops rows that collide, so a
 * key that repeats silently shrinks the grid. Positions used to be the trap:
 * past the 50-archetype core the generator cycled the universe with a rotating
 * account index, so `cusip` repeated while the row count kept climbing. The
 * universe now grows a distinct security per row, so both the catalogued
 * `positionKey` and `cusip` (which the FI presets key on) have to hold.
 */
describe('key columns stay unique as the feed grows', () => {
  /**
   * Uses `startMock`, not `probeMock`: the probe helper always builds with
   * account index 0, so it can never emit more than one row per security. The
   * streaming path is the one whose keys have to hold.
   */
  async function snapshotOf(dataType: MockDataType, rowCount: number): Promise<Array<Record<string, unknown>>> {
    let rows: Array<Record<string, unknown>> = [];
    const handle = startMock(
      { providerType: 'mock', dataType, rowCount, enableUpdates: false },
      (event) => {
        const e = event as { rows?: unknown[]; replace?: boolean };
        if (e.rows && e.replace) rows = e.rows as Array<Record<string, unknown>>;
      },
      { setTicker: () => 0, clearTicker: () => {} },
    );
    // The snapshot lands on a microtask (`Promise.resolve().then(fireSnapshot)`).
    await Promise.resolve();
    await Promise.resolve();
    handle.stop?.();
    return rows;
  }

  it('positions keep one key per row well past the universe size', async () => {
    const rows = await snapshotOf('positions', 400);
    const key = mockDataset('positions').keyColumn;

    expect(rows.length).toBe(400);
    expect(new Set(rows.map((r) => r[key])).size).toBe(400);
  });

  /** The FI presets key on `cusip`; a 400-row feed must be 400 securities. */
  it('cusip is unique at the same size, so the presets keyed on it hold too', async () => {
    const rows = await snapshotOf('positions', 400);
    expect(new Set(rows.map((r) => r.cusip)).size).toBe(rows.length);
  });

  it('trades keep one key per row', async () => {
    const rows = await snapshotOf('trades', 500);
    expect(new Set(rows.map((r) => r[mockDataset('trades').keyColumn])).size).toBe(rows.length);
  });
});

describe('grouping', () => {
  it('preserves catalogue order and covers every field', () => {
    const groups = mockFieldGroups('positions');
    const flat = groups.flatMap((g) => g.fields);

    expect(flat).toHaveLength(mockDataset('positions').fields.length);
    expect(groups.map((g) => g.group)).toContain('Pricing');
    // Each group appears once, so a picker renders one section per group.
    expect(new Set(groups.map((g) => g.group)).size).toBe(groups.length);
  });
});

describe('column selection', () => {
  it('returns the requested fields in the order given', () => {
    const { columns, unknown } = columnsForFields('positions', ['marketValue', 'cusip']);

    expect(columns.map((c) => c.field)).toEqual(['marketValue', 'cusip']);
    expect(unknown).toEqual([]);
  });

  /** Reported rather than dropped: a silently missing column is the failure
   *  mode this whole catalogue exists to avoid. */
  it('reports names it does not recognise', () => {
    const { columns, unknown } = columnsForFields('positions', ['cusip', 'nope']);

    expect(columns.map((c) => c.field)).toEqual(['cusip']);
    expect(unknown).toEqual(['nope']);
  });

  it('offers the whole catalogue when asked for everything', () => {
    expect(allCatalogColumns('trades').length).toBe(mockDataset('trades').fields.length);
    expect(allCatalogColumns('trades').length).toBeGreaterThan(curatedColumns('trades').length);
  });
});

describe('dataset lookup', () => {
  it('describes all four dataTypes', () => {
    expect(MOCK_DATASETS.map((d) => d.dataType)).toEqual(['positions', 'trades', 'orders', 'custom']);
    for (const d of MOCK_DATASETS) expect(d.description.length).toBeGreaterThan(40);
  });

  it('falls back to positions for an unknown dataType', () => {
    expect(mockDataset('nonsense' as MockDataType).dataType).toBe('positions');
  });
});
