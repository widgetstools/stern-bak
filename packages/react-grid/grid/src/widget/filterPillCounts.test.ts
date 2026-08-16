/**
 * Pill badges mean the same thing in both row models — asserted here against a
 * fake {@link GridDataPort} for each, and at the adapter level in core's
 * `portContract.test.ts`.
 *
 * The two shapes of answer are chosen by `canAddressUnloadedRows`, not by the
 * row model, so the fakes below differ only in that capability. That is the
 * whole point: a grid that grows the ability to address unloaded rows starts
 * feeding the delta path without this module learning anything new.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IRowNode } from 'ag-grid-community';
import {
  doesRowMatchFilterModel,
  type GridDataPort,
  type RowChange,
} from '@wellsfargo-starui/core';
import {
  computeFilterPillCounts,
  patchPillCounts,
  rowMatchesPill,
  type CountableFilter,
} from './filterPillCounts';

const ROWS = [
  { id: 'r1', data: { side: 'BUY', px: 10 } },
  { id: 'r2', data: { side: 'SELL', px: 20 } },
  { id: 'r3', data: { side: 'BUY', px: 30 } },
];

const BUY: CountableFilter = {
  id: 'buy',
  filterModel: { side: { filterType: 'text', type: 'equals', filter: 'BUY' } },
};
const EMPTY_SET: CountableFilter = {
  id: 'empty',
  filterModel: { side: { filterType: 'set', values: [] } },
};
const REFUSED: CountableFilter = {
  id: 'refused',
  filterModel: { side: { filterType: 'text', type: 'soundsLike', filter: 'BUY' } },
};

interface Fake {
  port: GridDataPort;
  queries: Array<Record<string, unknown> | undefined>;
}

/** Addresses every row by id — the client-side row model's answer. */
function addressableFake(opts: { complete?: boolean } = {}): Fake {
  const queries: Array<Record<string, unknown> | undefined> = [];
  const port = {
    capabilities: { canAddressUnloadedRows: { supported: true, reason: '' } },
    async scan(visit: (row: (typeof ROWS)[number]) => boolean | void, query?: Record<string, unknown>) {
      queries.push(query);
      for (const row of ROWS) visit(row);
      return { scanned: ROWS.length, stopped: false, complete: opts.complete ?? true };
    },
    async count() {
      throw new Error('an addressable port must not fall back to per-pill counts');
    },
  } as unknown as GridDataPort;
  return { port, queries };
}

/** Cannot address unloaded rows — the server-side row model's answer. */
function windowedFake(opts: { complete?: boolean } = {}): Fake {
  const queries: Array<Record<string, unknown> | undefined> = [];
  const port = {
    capabilities: { canAddressUnloadedRows: { supported: false, reason: 'not here' } },
    async scan() {
      throw new Error('a windowed port must not page the dataset for a badge');
    },
    async count(query?: { filterModel?: Record<string, unknown> }) {
      queries.push(query);
      const model = query?.filterModel;
      const count = model ? ROWS.filter((r) => doesRowMatchFilterModel(r.data, model)).length : ROWS.length;
      return { count, complete: opts.complete ?? true };
    },
  } as unknown as GridDataPort;
  return { port, queries };
}

describe('computeFilterPillCounts', () => {
  it('gives the same badge for the same pill in both row models', async () => {
    const viaScan = await computeFilterPillCounts(addressableFake().port, [BUY, EMPTY_SET]);
    const viaCount = await computeFilterPillCounts(windowedFake().port, [BUY, EMPTY_SET]);
    expect(viaScan.counts).toEqual({ buy: 2, empty: 0 });
    expect(viaCount.counts).toEqual(viaScan.counts);
  });

  it('counts against the WHOLE dataset — never the applied filter or quick filter', async () => {
    const scanning = addressableFake();
    await computeFilterPillCounts(scanning.port, [BUY]);
    expect(scanning.queries).toEqual([{ scope: 'all' }]);

    const windowed = windowedFake();
    await computeFilterPillCounts(windowed.port, [BUY]);
    expect(windowed.queries).toEqual([{ scope: 'all', filterModel: BUY.filterModel }]);
  });

  it('builds match sets only where row ids span the dataset', async () => {
    const viaScan = await computeFilterPillCounts(addressableFake().port, [BUY]);
    expect([...viaScan.matchSets.get('buy')!]).toEqual(['r1', 'r3']);

    // Empty by design, not by accident: under a windowed port a set of loaded
    // row ids would describe the window. Phase 5 of the parity roadmap gives
    // this path a real delta source.
    const viaCount = await computeFilterPillCounts(windowedFake().port, [BUY]);
    expect(viaCount.matchSets.size).toBe(0);
  });

  it('drops match sets when the scan could not cover the dataset', async () => {
    // Counts built from a partial walk must not be patched incrementally —
    // an empty map sends the next change through a full recompute.
    const partial = await computeFilterPillCounts(addressableFake({ complete: false }).port, [BUY]);
    expect(partial.matchSets.size).toBe(0);
  });

  it('keeps no number for a pill the port could not answer', async () => {
    // `complete: false` is "could not look". Zero would be a claim.
    const result = await computeFilterPillCounts(windowedFake({ complete: false }).port, [BUY]);
    expect(result.counts).toEqual({});
  });

  it('short-circuits an empty pill list without touching the port', async () => {
    const fake = addressableFake();
    await expect(computeFilterPillCounts(fake.port, [])).resolves.toEqual({
      counts: {},
      matchSets: new Map(),
    });
    expect(fake.queries).toEqual([]);
  });

  it('over-counts a refused pill and warns, rather than reporting zero', async () => {
    const warn = vi.fn();
    const result = await computeFilterPillCounts(addressableFake().port, [REFUSED]);
    expect(result.counts).toEqual({ refused: ROWS.length });
    // The same rule the delta path applies, so a badge cannot drift downward
    // tick by tick.
    expect(rowMatchesPill(ROWS[0].data, REFUSED, warn)).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('patchPillCounts', () => {
  const node = (id: string, data: Record<string, unknown> | undefined): IRowNode =>
    ({ id, data }) as unknown as IRowNode;
  const change = (parts: Partial<RowChange>): RowChange =>
    ({ full: false, added: [], updated: [], removed: [], ...parts }) as RowChange;

  /** The membership a full recompute produced, which a delta is relative to. */
  const seeded = async () => (await computeFilterPillCounts(addressableFake().port, [BUY])).matchSets;

  it('adds a row that entered the filter and removes one that left', async () => {
    const matchSets = await seeded();
    const entered = patchPillCounts(
      change({ updated: [node('r2', { side: 'BUY' })] }),
      [BUY],
      matchSets,
      { buy: 2 },
    );
    expect(entered).toEqual({ buy: 3 });
    expect(matchSets.get('buy')!.has('r2')).toBe(true);

    const left = patchPillCounts(
      change({ updated: [node('r1', { side: 'SELL' })] }),
      [BUY],
      matchSets,
      entered!,
    );
    expect(left).toEqual({ buy: 2 });
    expect(matchSets.get('buy')!.has('r1')).toBe(false);
  });

  it('returns null when no pill membership moved', async () => {
    // The common case on a tick touching columns nobody filters on — the hook
    // publishes nothing and React does not re-render.
    const matchSets = await seeded();
    expect(
      patchPillCounts(change({ updated: [node('r1', { side: 'BUY', px: 99 })] }), [BUY], matchSets, {
        buy: 2,
      }),
    ).toBeNull();
  });

  it('drops a removed row from the count', async () => {
    const matchSets = await seeded();
    expect(
      patchPillCounts(change({ removed: [node('r1', { side: 'BUY' })] }), [BUY], matchSets, { buy: 2 }),
    ).toEqual({ buy: 1 });
  });

  it('never lets a count go negative', async () => {
    const matchSets = await seeded();
    expect(
      patchPillCounts(change({ removed: [node('r1', undefined)] }), [BUY], matchSets, { buy: 0 }),
    ).toEqual({ buy: 0 });
  });
});
