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
  emptyPillMembership,
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

  it('a scan establishes every row; a per-pill count establishes none', async () => {
    const viaScan = await computeFilterPillCounts(addressableFake().port, [BUY]);
    expect([...viaScan.membership.sets.get('buy')!]).toEqual(['r1', 'r3']);
    // `null` is "all of them" — absence from the set is then a fact.
    expect(viaScan.membership.evaluated).toBeNull();

    // A count answers about the dataset without naming a row, so nothing is
    // established and the delta path fills it in as ticks arrive.
    const viaCount = await computeFilterPillCounts(windowedFake().port, [BUY]);
    expect(viaCount.membership.evaluated).toEqual(new Set());
    expect(viaCount.membership.sets.get('buy')).toEqual(new Set());
  });

  it('establishes nothing when the scan could not cover the dataset', async () => {
    // Counts built from a partial walk must not be patched as if the rows it
    // never reached were known not to match.
    const partial = await computeFilterPillCounts(addressableFake({ complete: false }).port, [BUY]);
    expect(partial.membership.evaluated).toEqual(new Set());
  });

  it('carries membership forward across a recount, and drops it when the pills change', async () => {
    // Discarding what earlier ticks established would send every subsequent
    // tick back through a full recompute — the storm would never end.
    const established = emptyPillMembership([BUY]);
    established.evaluated!.add('r1');
    established.sets.get('buy')!.add('r1');

    const same = await computeFilterPillCounts(windowedFake().port, [BUY], established);
    expect(same.membership).toBe(established);

    // A pill added since has no membership even for rows already seen.
    const widened = await computeFilterPillCounts(windowedFake().port, [BUY, EMPTY_SET], established);
    expect(widened.membership).not.toBe(established);
    expect(widened.membership.evaluated).toEqual(new Set());
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
      membership: { sets: new Map(), evaluated: new Set() },
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

  /** The membership a scan produced: every row established. */
  const scanned = async () =>
    (await computeFilterPillCounts(addressableFake().port, [BUY])).membership;

  /** The membership a per-pill count produced: no row established. */
  const counted = async () =>
    (await computeFilterPillCounts(windowedFake().port, [BUY])).membership;

  it('adds a row that entered the filter and removes one that left', async () => {
    const membership = await scanned();
    const entered = patchPillCounts(
      change({ updated: [node('r2', { side: 'BUY' })] }),
      [BUY],
      membership,
      { buy: 2 },
    );
    expect(entered).toEqual({ counts: { buy: 3 }, unresolved: false });
    expect(membership.sets.get('buy')!.has('r2')).toBe(true);

    const left = patchPillCounts(
      change({ updated: [node('r1', { side: 'SELL' })] }),
      [BUY],
      membership,
      entered.counts!,
    );
    expect(left).toEqual({ counts: { buy: 2 }, unresolved: false });
    expect(membership.sets.get('buy')!.has('r1')).toBe(false);
  });

  it('publishes nothing when no pill membership moved', async () => {
    // The common case on a tick touching columns nobody filters on — the hook
    // publishes nothing, asks for nothing, and React does not re-render.
    const membership = await scanned();
    expect(
      patchPillCounts(change({ updated: [node('r1', { side: 'BUY', px: 99 })] }), [BUY], membership, {
        buy: 2,
      }),
    ).toEqual({ counts: null, unresolved: false });
  });

  it('drops a removed row from the count', async () => {
    const membership = await scanned();
    expect(
      patchPillCounts(change({ removed: [node('r1', { side: 'BUY' })] }), [BUY], membership, { buy: 2 }),
    ).toEqual({ counts: { buy: 1 }, unresolved: false });
  });

  it('never lets a count go negative', async () => {
    const membership = await scanned();
    expect(
      patchPillCounts(change({ removed: [node('r1', undefined)] }), [BUY], membership, { buy: 0 }),
    ).toEqual({ counts: { buy: 0 }, unresolved: false });
  });

  // ─── Rows whose prior membership was never established ──────────────────
  //
  // The badge counts the whole dataset and a changed row is one row OF it, so
  // a flip moves the total by exactly one — no matter what is unknown about
  // every other row. The one thing a patch cannot do without is the row's own
  // prior state.

  it('asks for a recompute the FIRST time it sees a row, and patches ever after', async () => {
    const membership = await counted();

    const first = patchPillCounts(
      change({ updated: [node('r1', { side: 'BUY' })] }),
      [BUY],
      membership,
      { buy: 2 },
    );
    // Prior state unknown: r1 may already be in the source's 2, or not.
    // Guessing either way drifts the badge one row at a time.
    expect(first).toEqual({ counts: null, unresolved: true });
    // …but it is established NOW, which is what makes the next tick free.
    expect(membership.evaluated).toEqual(new Set(['r1']));
    expect(membership.sets.get('buy')).toEqual(new Set(['r1']));

    const second = patchPillCounts(
      change({ updated: [node('r1', { side: 'SELL' })] }),
      [BUY],
      membership,
      { buy: 2 },
    );
    expect(second).toEqual({ counts: { buy: 1 }, unresolved: false });
  });

  it('publishes nothing from a partly-resolved delta', async () => {
    // Half a patch on top of a total the rest of the delta also moved is a
    // number that was never true.
    const membership = await counted();
    membership.evaluated!.add('r1');
    membership.sets.get('buy')!.add('r1');

    const patch = patchPillCounts(
      change({ updated: [node('r1', { side: 'SELL' }), node('r9', { side: 'BUY' })] }),
      [BUY],
      membership,
      { buy: 2 },
    );
    expect(patch).toEqual({ counts: null, unresolved: true });
    // Both rows are established, so the delta that follows resolves cleanly.
    expect(membership.evaluated).toEqual(new Set(['r1', 'r9']));
  });

  it('does not invent a number for a pill the port could not answer', async () => {
    // `complete: false` leaves the pill with no count at all. Moving a total
    // that does not exist would put a made-up figure on the badge.
    const membership = (
      await computeFilterPillCounts(windowedFake({ complete: false }).port, [BUY])
    ).membership;
    membership.evaluated!.add('r2');

    const patch = patchPillCounts(
      change({ updated: [node('r2', { side: 'BUY' })] }),
      [BUY],
      membership,
      {},
    );
    expect(patch).toEqual({ counts: null, unresolved: true });
  });
});
