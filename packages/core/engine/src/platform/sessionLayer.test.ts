/**
 * The client half of the per-session query layer.
 *
 * Two things reach the plane from here, and both were unreachable before
 * Phase 12: the edits this session has made, and the rows it excludes. The
 * cases below are about what CROSSES that boundary — the plane's own
 * behaviour once it arrives is pinned in `SessionOverlay.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiHub } from './ApiHub';
import { CsrmDataAdapter } from './CsrmDataAdapter';
import { SsrmDataAdapter } from './SsrmDataAdapter';
import type { RowChangeSink, RowPatch, SsrmDataSource } from './types';

type Row = Record<string, unknown>;

const SEED: Row[] = [
  { id: 'r1', ccy: 'USD', px: 10, note: 'a' },
  { id: 'r2', ccy: 'INR', px: 20, note: 'b' },
];

function sink(): RowChangeSink {
  return { transactionApplied: vi.fn(), rowsChanged: vi.fn() } as unknown as RowChangeSink;
}

function fakeGrid(opts: { refuseWrite?: boolean; missing?: string[] } = {}) {
  const missing = new Set(opts.missing ?? []);
  const calls = {
    refreshServerSide: vi.fn(),
    onFilterChanged: vi.fn(),
  };
  const api = {
    getRowNode: (id: string) =>
      missing.has(id) ? undefined : { data: SEED.find((r) => r.id === id) },
    applyServerSideTransaction: () => ({
      status: opts.refuseWrite ? 'StoreNotFound' : 'Applied',
    }),
    refreshServerSide: calls.refreshServerSide,
    onFilterChanged: calls.onFilterChanged,
    getFilterModel: () => ({}),
    getGridOption: () => '',
    isDestroyed: () => false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return { api, calls };
}

function fakeSource(over: Partial<SsrmDataSource> = {}) {
  const setSessionPatches = vi.fn(async () => {});
  const setSessionExclude = vi.fn(async () => {});
  const source = {
    getRows: async () => ({ rowData: [], rowCount: 0 }),
    getSetFilterValues: async () => [],
    getStatusBar: async () => ({ totalRows: 0, filteredRows: 0, aggregations: [] }),
    setSessionPatches,
    setSessionExclude,
    ...over,
  } as unknown as SsrmDataSource;
  return { source, setSessionPatches, setSessionExclude };
}

function ssrmPort(
  over: Partial<SsrmDataSource> = {},
  gridOpts: { refuseWrite?: boolean; missing?: string[] } = {},
) {
  const grid = fakeGrid(gridOpts);
  const hub = new ApiHub();
  hub.attach(grid.api as never);
  const fake = fakeSource(over);
  return {
    port: new SsrmDataAdapter(hub, { source: fake.source, keyColumn: 'id' }, sink()),
    ...fake,
    ...grid,
  };
}

const patch = (rowId: string, fields: Row): RowPatch => ({ rowId, fields });

/** `setSessionPatches` is fire-and-forget, so let the microtask queue drain. */
const settled = () => new Promise((r) => setTimeout(r, 0));

describe('an SSRM edit is recorded with the plane, so it survives a block refetch', () => {
  it('sends the EDITED FIELDS, not the assembled row', async () => {
    const fx = ssrmPort();
    await fx.port.mutate([patch('r1', { px: 99 })]);
    await settled();

    // The assembled row carries every column; sending it would shadow `ccy`
    // and `note` at their value-as-of-the-edit until the source happened to
    // tick those exact columns.
    expect(fx.setSessionPatches).toHaveBeenCalledWith([{ key: 'r1', fields: { px: 99 } }]);
  });

  it('merges several patches to one row, and keeps rows apart', async () => {
    const fx = ssrmPort();
    await fx.port.mutate([
      patch('r1', { px: 99 }),
      patch('r1', { note: 'mine' }),
      patch('r2', { px: 1 }),
    ]);
    await settled();

    expect(fx.setSessionPatches).toHaveBeenCalledWith([
      { key: 'r1', fields: { px: 99, note: 'mine' } },
      { key: 'r2', fields: { px: 1 } },
    ]);
  });

  it('records nothing for a write the grid refused', async () => {
    const fx = ssrmPort({}, { refuseWrite: true });
    const result = await fx.port.mutate([patch('r1', { px: 99 })]);
    await settled();

    expect(result.ok).toBe(false);
    // A patch that never landed must not survive in the plane as though it had.
    expect(fx.setSessionPatches).not.toHaveBeenCalled();
  });

  it('records nothing for a row the grid could not address', async () => {
    const fx = ssrmPort({}, { missing: ['r2'] });
    await fx.port.mutate([patch('r2', { px: 99 })]);
    await settled();
    expect(fx.setSessionPatches).not.toHaveBeenCalled();
  });

  it('still reports the write as applied when the plane call fails', async () => {
    const fx = ssrmPort({
      setSessionPatches: vi.fn(async () => {
        throw new Error('worker gone');
      }),
    });
    const result = await fx.port.mutate([patch('r1', { px: 99 })]);
    await settled();

    // The value is already on screen and already reported to `rows`. A failed
    // round trip means it reverts on the next refetch — which is exactly the
    // behaviour that existed before this call, not a reason to fail a write
    // that landed.
    expect(result).toMatchObject({ applied: ['r1'], ok: true });
  });

  it('degrades quietly against a source that has no session RPC', async () => {
    const fx = ssrmPort({ setSessionPatches: undefined });
    const result = await fx.port.mutate([patch('r1', { px: 99 })]);
    expect(result).toMatchObject({ applied: ['r1'], ok: true });
  });
});

describe('row exclusion reaches the plane, and the grid asks again', () => {
  it('hands over the expression and purges the loaded blocks', async () => {
    const fx = ssrmPort();
    await fx.port.setRowExclusion('[ccy] == "INR"');

    expect(fx.setSessionExclude).toHaveBeenCalledWith('[ccy] == "INR"');
    // Every loaded block was built by a query that did not carry this rule, so
    // without a purge the excluded rows stay on screen.
    expect(fx.calls.refreshServerSide).toHaveBeenCalledWith({ purge: true });
  });

  it('carries a cleared rule through as null', async () => {
    const fx = ssrmPort();
    await fx.port.setRowExclusion(null);
    expect(fx.setSessionExclude).toHaveBeenCalledWith(null);
    expect(fx.calls.refreshServerSide).toHaveBeenCalled();
  });

  it('does not purge when the plane refused the rule', async () => {
    const fx = ssrmPort({
      setSessionExclude: vi.fn(async () => {
        throw new Error('worker gone');
      }),
    });
    await fx.port.setRowExclusion('[ccy] == "INR"');
    // Purging on a rule the plane never took would refetch the same rows for
    // nothing, and repeat on every keystroke in the panel.
    expect(fx.calls.refreshServerSide).not.toHaveBeenCalled();
  });

  it('does nothing at all against a source with no exclusion RPC', async () => {
    const fx = ssrmPort({ setSessionExclude: undefined });
    await expect(fx.port.setRowExclusion('[ccy] == "INR"')).resolves.toBeUndefined();
    expect(fx.calls.refreshServerSide).not.toHaveBeenCalled();
  });
});

describe('the client-side adapter answers the same port method its own way', () => {
  let grid: ReturnType<typeof fakeGrid>;
  let port: CsrmDataAdapter;

  beforeEach(() => {
    grid = fakeGrid();
    const hub = new ApiHub();
    hub.attach(grid.api as never);
    port = new CsrmDataAdapter(hub);
  });

  it('re-runs the external filter, which reads the rule live', async () => {
    await port.setRowExclusion('[ccy] == "INR"');
    expect(grid.calls.onFilterChanged).toHaveBeenCalled();
  });

  it('is safe before the grid mounts', async () => {
    const unmounted = new CsrmDataAdapter(new ApiHub());
    await expect(unmounted.setRowExclusion('[ccy] == "INR"')).resolves.toBeUndefined();
  });
});
