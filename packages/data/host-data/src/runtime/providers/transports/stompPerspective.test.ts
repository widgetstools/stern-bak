import { describe, expect, it, vi } from 'vitest';
import type { StompPerspectiveProviderConfig } from '@wellsfargo-starui/types';
import { startStompPerspective } from './stompPerspective.js';
import type { PerspectiveHost } from '../../perspective/perspectiveHost.js';

const stompCalls: { cfg: Record<string, unknown>; emit: (e: unknown) => void }[] = [];
const stopped: string[] = [];
const restarted: unknown[] = [];

// The STOMP wire is `stomp.test.ts`'s job. What matters here is that this
// transport IS that transport, so it is replaced with a recorder whose emit
// this test drives directly.
vi.mock('./stomp.js', () => ({
  startStomp: vi.fn((cfg: Record<string, unknown>, emit: (e: unknown) => void) => {
    stompCalls.push({ cfg, emit });
    return {
      stop: async () => {
        stopped.push('transport');
      },
      restart: async (extra?: unknown) => {
        restarted.push(extra ?? null);
      },
    };
  }),
}));

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

const baseCfg = (over: Partial<StompPerspectiveProviderConfig> = {}) =>
  ({
    providerType: 'stomp-perspective',
    websocketUrl: 'ws://localhost:8081',
    listenerTopic: '/snapshot/positions/T1',
    keyColumn: 'positionId',
    ...over,
  }) as StompPerspectiveProviderConfig;

const reset = () => {
  stompCalls.length = 0;
  stopped.length = 0;
  restarted.length = 0;
};

describe('startStompPerspective', () => {
  it('delegates the wire to startStomp as a plain stomp config', () => {
    reset();
    const { host } = makeHost();
    startStompPerspective(baseCfg(), () => {}, { perspectiveHost: host });

    // A fork would drift from the STOMP transport; this must BE it.
    expect(stompCalls).toHaveLength(1);
    expect(stompCalls[0]!.cfg.providerType).toBe('stomp');
    expect(stompCalls[0]!.cfg.websocketUrl).toBe('ws://localhost:8081');
  });

  it('forwards every event to the push path 1:1, unmodified', () => {
    reset();
    const { host } = makeHost();
    const downstream = vi.fn();
    startStompPerspective(baseCfg(), downstream, { perspectiveHost: host });

    const events = [
      { rows: [], replace: true },
      { rows: [{ positionId: 'p1', pnl: 1 }], replace: true },
      { status: 'ready' as const },
      { rowsReceived: 1 },
      { byteSize: 42 },
      { rows: [{ positionId: 'p1', pnl: 2 }] },
    ];
    for (const event of events) stompCalls[0]!.emit(event);

    // Same events, same order, same object identities — anything already
    // subscribed keeps working exactly as before the Table existed.
    expect(downstream.mock.calls.map((c) => c[0])).toEqual(events);
    for (let i = 0; i < events.length; i++) {
      expect(downstream.mock.calls[i]![0]).toBe(events[i]);
    }
  });

  it('lands a tick in the Table with the same shape as the pushed row', async () => {
    reset();
    const { host, tables } = makeHost();
    const pushed: unknown[] = [];
    const handle = startStompPerspective(baseCfg(), (e) => pushed.push(e), {
      perspectiveHost: host,
    });

    stompCalls[0]!.emit({ rows: [{ positionId: 'p1', pnl: 1 }], replace: true });
    stompCalls[0]!.emit({ status: 'ready' });
    const tick = { positionId: 'p1', pnl: 2 };
    stompCalls[0]!.emit({ rows: [tick] });
    await handle.feed?.drain();

    expect(tables[0]!.rows.get('p1')).toEqual(tick);
  });

  it('builds the Table under the configured name', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(baseCfg({ tableName: 'blotter' }), () => {}, {
      perspectiveHost: host,
    });

    stompCalls[0]!.emit({ rows: [{ positionId: 'p1', v: 1 }], replace: true });
    stompCalls[0]!.emit({ status: 'ready' });
    await handle.feed?.drain();

    expect(handle.tableName).toBe('blotter');
    expect(tables[0]!.name).toBe('blotter');
  });

  // Perspective indexes by ONE scalar. Indexing on the first of a composite
  // key would make distinct rows collide and silently overwrite each other.
  it('refuses to build a Table for a composite keyColumn, and says why', () => {
    reset();
    const { host, tables } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startStompPerspective(
      baseCfg({ keyColumn: ['bookId', 'positionId'] }),
      () => {},
      { perspectiveHost: host, onDiagnostic },
    );

    expect(handle.feed).toBeNull();
    expect(tables).toHaveLength(0);
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'index-invalid' }),
    );
    expect(onDiagnostic.mock.calls[0]![0].reason).toMatch(/composite/);
  });

  it('keeps serving the push path after refusing a composite key', () => {
    reset();
    const { host } = makeHost();
    const downstream = vi.fn();
    startStompPerspective(baseCfg({ keyColumn: ['bookId', 'positionId'] }), downstream, {
      perspectiveHost: host,
      onDiagnostic: () => {},
    });

    const event = { rows: [{ bookId: 'b1', positionId: 'p1' }] };
    expect(() => stompCalls[0]!.emit(event)).not.toThrow();
    expect(downstream).toHaveBeenCalledWith(event);
  });

  it('refuses without a keyColumn at all', () => {
    reset();
    const { host } = makeHost();
    const onDiagnostic = vi.fn();
    const handle = startStompPerspective(baseCfg({ keyColumn: undefined }), () => {}, {
      perspectiveHost: host,
      onDiagnostic,
    });

    expect(handle.feed).toBeNull();
    expect(onDiagnostic.mock.calls[0]![0].reason).toMatch(/keyColumn is required/);
  });

  it('still serves the push path when no Perspective host is available', () => {
    reset();
    const downstream = vi.fn();
    // A worker that never opens a blotter does not load the engine wasm.
    const handle = startStompPerspective(baseCfg(), downstream, {});

    expect(handle.feed).toBeNull();
    stompCalls[0]!.emit({ rows: [{ positionId: 'p1' }] });
    expect(downstream).toHaveBeenCalled();
  });

  it('stops the transport BEFORE the feed, so nothing arrives for a dead Table', async () => {
    reset();
    const { host } = makeHost();
    const handle = startStompPerspective(baseCfg(), () => {}, { perspectiveHost: host });
    const order: string[] = [];
    const feedStop = handle.feed!.stop.bind(handle.feed);
    handle.feed!.stop = async () => {
      order.push('feed');
      await feedStop();
    };
    stopped.length = 0;

    await handle.stop();
    expect(stopped).toEqual(['transport']);
    expect(order).toEqual(['feed']);
  });

  it('keeps the Table across a restart — the feed rebuilds it from the new book', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(baseCfg(), () => {}, { perspectiveHost: host });
    stompCalls[0]!.emit({ rows: [{ positionId: 'p1' }], replace: true });
    stompCalls[0]!.emit({ status: 'ready' });
    await handle.feed?.drain();

    await handle.restart({ asOfDate: '2024-05-28' });

    // Dropping it here would leave every attached window looking at a missing
    // table for the length of a snapshot.
    expect(tables[0]!.deleted).toBe(false);
    expect(restarted).toEqual([{ asOfDate: '2024-05-28' }]);
  });

  it('passes the schema options through to the feed', async () => {
    reset();
    const { host } = makeHost();
    const handle = startStompPerspective(
      baseCfg({ integerColumns: ['couponFrequency'] }),
      () => {},
      { perspectiveHost: host },
    );

    stompCalls[0]!.emit({ rows: [{ positionId: 'p1', couponFrequency: 2 }], replace: true });
    stompCalls[0]!.emit({ status: 'ready' });
    await handle.feed?.drain();

    expect(handle.feed?.schema?.couponFrequency).toBe('integer');
  });
});

describe('startStompPerspective — schema from config', () => {
  // The blotter should paint on open. Inferring from rows means no Table until
  // the snapshot completes, and no Table means a window has nothing to attach
  // to.
  it('builds the Table before any rows when the config declares its fields', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(
      baseCfg({
        inferredFields: [
          { path: 'positionId', type: 'string', nullable: false },
          { path: 'pnl', type: 'number', nullable: false },
        ],
      }),
      () => {},
      { perspectiveHost: host },
    );

    await handle.feed?.drain();
    expect(tables).toHaveLength(1);
    await expect(handle.feed!.whenReady()).resolves.toBeDefined();
  });

  it('falls back to columnDefinitions when there are no inferredFields', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(
      baseCfg({
        columnDefinitions: [
          { field: 'positionId', headerName: 'Id', cellDataType: 'text' },
          { field: 'pnl', headerName: 'PnL', cellDataType: 'number' },
        ],
      }),
      () => {},
      { perspectiveHost: host },
    );

    await handle.feed?.drain();
    expect(tables).toHaveLength(1);
  });

  it('infers from rows when the declaration does not cover the index column', async () => {
    // An unindexable Table is worse than a late one: update() would append
    // instead of upsert and every tick would grow the book.
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(
      baseCfg({ inferredFields: [{ path: 'pnl', type: 'number', nullable: false }] }),
      () => {},
      { perspectiveHost: host },
    );

    await handle.feed?.drain();
    expect(tables).toHaveLength(0);

    stompCalls[0]!.emit({ rows: [{ positionId: 'p1', pnl: 1 }], replace: true });
    stompCalls[0]!.emit({ status: 'ready' });
    await handle.feed?.drain();
    expect(tables).toHaveLength(1);
  });

  it('waits for rows when the config declares nothing', async () => {
    reset();
    const { host, tables } = makeHost();
    const handle = startStompPerspective(baseCfg(), () => {}, { perspectiveHost: host });

    await handle.feed?.drain();
    expect(tables).toHaveLength(0);
  });
});
