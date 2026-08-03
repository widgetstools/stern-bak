import { describe, expect, it, vi } from 'vitest';
import type { ColumnDefinition, MockPerspectiveProviderConfig } from '@wellsfargo-starui/types';
import type { PerspectiveHost } from '../../perspective/perspectiveHost.js';
import type { ProviderEmitEvent } from '../Provider.js';
import { startMockPerspective } from './mockPerspective.js';

/**
 * The REAL generator runs here, unlike the STOMP twin's test. That is the
 * point: the gate for this phase is that a tick reaches the Table with the
 * same shape the push path saw, and only real rows — nested, then flattened —
 * can prove it. The spy wraps rather than replaces, so it also records the
 * config the tee narrowed and every event the generator produced.
 */
const spy = vi.hoisted(() => ({
  cfgs: [] as Record<string, unknown>[],
  /** What the generator emitted INTO the tee, in order. */
  upstream: [] as ProviderEmitEvent[],
}));

vi.mock('./mock.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mock.js')>();
  return {
    ...actual,
    startMock: (
      cfg: Parameters<typeof actual.startMock>[0],
      emit: Parameters<typeof actual.startMock>[1],
      opts: Parameters<typeof actual.startMock>[2],
    ) => {
      spy.cfgs.push(cfg as unknown as Record<string, unknown>);
      return actual.startMock(
        cfg,
        (event) => {
          spy.upstream.push(event);
          emit(event);
        },
        opts,
      );
    },
  };
});

interface FakeTable {
  name: string;
  rows: Map<unknown, Record<string, unknown>>;
  deleted: boolean;
  cleared: number;
}

function makeHost() {
  const tables: FakeTable[] = [];
  const host = {
    tableFactoryFor: vi.fn((name: string) => async (_schema: unknown, index: string) => {
      const record: FakeTable = { name, rows: new Map(), deleted: false, cleared: 0 };
      tables.push(record);
      return {
        update: async (rows: unknown) => {
          for (const row of rows as Record<string, unknown>[]) {
            const key = row[index];
            record.rows.set(key, { ...(record.rows.get(key) ?? {}), ...row });
          }
        },
        clear: async () => {
          record.cleared += 1;
          record.rows.clear();
        },
        delete: async () => {
          record.deleted = true;
        },
      };
    }),
  } as unknown as PerspectiveHost;
  return { host, tables };
}

/** A nested path is deliberately included — that is what the flat shape is for. */
const COLS: ColumnDefinition[] = [
  { field: 'id', headerName: 'Id' },
  { field: 'cusip', headerName: 'CUSIP' },
  { field: 'ratings.moodys.rating', headerName: "Moody's" },
];

const baseCfg = (over: Partial<MockPerspectiveProviderConfig> = {}) =>
  ({
    providerType: 'mock-perspective',
    dataType: 'positions',
    keyColumn: 'id',
    rowCount: 5,
    columnDefinitions: COLS,
    ...over,
  }) as MockPerspectiveProviderConfig;

/** Deterministic ticker: hand back the callback instead of a timer. */
function makeTicker() {
  const ticks: (() => void)[] = [];
  const cleared: string[] = [];
  return {
    ticks,
    cleared,
    opts: {
      setTicker: (cb: () => void) => {
        ticks.push(cb);
        return ticks.length;
      },
      clearTicker: () => {
        cleared.push('transport');
      },
    },
  };
}

const reset = () => {
  spy.cfgs.length = 0;
  spy.upstream.length = 0;
};

/** The generator fires its snapshot off a resolved promise. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startMockPerspective', () => {
  it('delegates generation to startMock as a plain mock config', () => {
    reset();
    const { host } = makeHost();
    startMockPerspective(baseCfg(), () => {}, { perspectiveHost: host });

    // A fork would drift from the mock generator; this must BE it.
    expect(spy.cfgs).toHaveLength(1);
    expect(spy.cfgs[0]!.providerType).toBe('mock');
    expect(spy.cfgs[0]!.dataType).toBe('positions');
    expect(spy.cfgs[0]!.rowCount).toBe(5);
  });

  /**
   * The one place this deliberately differs from `mock`, and it is not a
   * preference. A Perspective schema is a flat map of typed columns; the mock
   * positions row is deeply nested, and `observeRows` reports nested columns
   * and drops them — a Table with a fraction of its columns and no error.
   */
  it("defaults rowShape to 'flat' so rows reach the Table flat", async () => {
    reset();
    const { host } = makeHost();
    const rows: Record<string, unknown>[] = [];
    startMockPerspective(baseCfg(), (e) => {
      if ('rows' in e) rows.push(...(e.rows as Record<string, unknown>[]));
    }, { perspectiveHost: host, ...makeTicker().opts });
    await settle();

    expect(spy.cfgs[0]!.rowShape).toBe('flat');
    // The nested path arrived as a literal flat key, not as an object.
    expect(Object.keys(rows[0]!).sort()).toEqual(['cusip', 'id', 'ratings.moodys.rating']);
    expect(typeof rows[0]!['ratings.moodys.rating']).toBe('string');
  });

  it('forwards every event to the push path 1:1, unmodified', async () => {
    reset();
    const { host } = makeHost();
    const ticker = makeTicker();
    const downstream: ProviderEmitEvent[] = [];
    startMockPerspective(baseCfg(), (e) => downstream.push(e), {
      perspectiveHost: host,
      ...ticker.opts,
    });
    await settle();
    ticker.ticks[0]!();

    // Same events, same order, same object identities as the un-teed
    // generator produced — the Table is a side effect, not a filter.
    expect(downstream).toHaveLength(spy.upstream.length);
    expect(downstream.length).toBeGreaterThan(2);
    for (let i = 0; i < spy.upstream.length; i++) {
      expect(downstream[i]).toBe(spy.upstream[i]);
    }
  });

  it('lands a tick in the Table with the same shape as the pushed row', async () => {
    reset();
    const { host, tables } = makeHost();
    const ticker = makeTicker();
    const pushed: Record<string, unknown>[][] = [];
    const handle = startMockPerspective(baseCfg(), (e) => {
      if ('rows' in e) pushed.push(e.rows as Record<string, unknown>[]);
    }, { perspectiveHost: host, ...ticker.opts });

    await settle();
    await handle.feed?.drain();
    ticker.ticks[0]!();
    await handle.feed?.drain();

    const tickedRows = pushed[pushed.length - 1]!;
    expect(tickedRows.length).toBeGreaterThan(0);
    for (const row of tickedRows) {
      expect(tables[0]!.rows.get(row.id)).toEqual(row);
    }
  });

  it('lets a config ask for the nested shape explicitly, and then builds no Table', () => {
    reset();
    const { host } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startMockPerspective(baseCfg({ rowShape: 'nested' }), () => {}, {
      perspectiveHost: host,
      onDiagnostic,
      ...makeTicker().opts,
    });

    expect(spy.cfgs[0]!.rowShape).toBe('nested');
    // Refused loudly rather than served short.
    expect(handle.feed).toBeNull();
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'index-invalid' }),
    );
  });

  it('refuses to build a Table with no columnDefinitions to flatten with', () => {
    reset();
    const { host, tables } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startMockPerspective(baseCfg({ columnDefinitions: [] }), () => {}, {
      perspectiveHost: host,
      onDiagnostic,
      ...makeTicker().opts,
    });

    expect(handle.feed).toBeNull();
    expect(tables).toHaveLength(0);
    expect(onDiagnostic.mock.calls[0]![0].reason).toMatch(/columnDefinitions/);
  });

  it('refuses a composite keyColumn, and says why', () => {
    reset();
    const { host } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startMockPerspective(baseCfg({ keyColumn: ['cusip', 'id'] }), () => {}, {
      perspectiveHost: host,
      onDiagnostic,
      ...makeTicker().opts,
    });

    expect(handle.feed).toBeNull();
    expect(onDiagnostic.mock.calls[0]![0].reason).toMatch(/composite/);
  });

  it('keeps serving the push path after refusing', async () => {
    reset();
    const { host } = makeHost();
    const downstream = vi.fn();
    startMockPerspective(baseCfg({ columnDefinitions: [] }), downstream, {
      perspectiveHost: host,
      onDiagnostic: () => {},
      ...makeTicker().opts,
    });
    await settle();

    expect(downstream).toHaveBeenCalledWith(
      expect.objectContaining({ replace: true }),
    );
  });

  it('still serves the push path when no Perspective host is available', async () => {
    reset();
    const downstream = vi.fn();
    // A worker that never opens a blotter does not load the engine wasm.
    const handle = startMockPerspective(baseCfg(), downstream, makeTicker().opts);
    await settle();

    expect(handle.feed).toBeNull();
    expect(downstream).toHaveBeenCalled();
  });

  it('builds the Table under the configured name', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startMockPerspective(baseCfg({ tableName: 'blotter' }), () => {}, {
      perspectiveHost: host,
      ...makeTicker().opts,
    });
    await handle.feed?.drain();

    expect(handle.tableName).toBe('blotter');
    expect(tables[0]!.name).toBe('blotter');
  });

  it('stops the transport BEFORE the feed, so nothing arrives for a dead Table', async () => {
    reset();
    const { host } = makeHost();
    const ticker = makeTicker();
    const handle = startMockPerspective(baseCfg(), () => {}, {
      perspectiveHost: host,
      ...ticker.opts,
    });
    await settle();

    const order: string[] = [];
    const feedStop = handle.feed!.stop.bind(handle.feed);
    handle.feed!.stop = async () => {
      order.push('feed');
      await feedStop();
    };

    await handle.stop();
    expect(ticker.cleared).toEqual(['transport']);
    expect(order).toEqual(['feed']);
  });

  it('keeps the Table across a restart — the feed rebuilds it from the new book', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startMockPerspective(baseCfg(), () => {}, {
      perspectiveHost: host,
      ...makeTicker().opts,
    });
    await settle();
    await handle.feed?.drain();

    await handle.restart({ __refresh: Date.now() });
    await settle();
    await handle.feed?.drain();

    // Dropping it here would leave every attached window looking at a missing
    // table for the length of a snapshot; the declared schema survives, so the
    // feed clears instead.
    expect(tables[0]!.deleted).toBe(false);
    expect(tables[0]!.cleared).toBeGreaterThan(0);
    expect(tables[0]!.rows.size).toBe(5);
  });
});
