import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { registerProvider } from '../providers/registry';
import type { EncodedChunk, ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider';
import type { AppDataRow, Event, Request } from '../protocol';
import { installProviderWorker, type ProviderWorkerPort as EntryPort } from './providerWorkerEntry';
import {
  startProviderInWorker,
  type ProviderWorkerControl,
  type ProviderWorkerPort as HostPort,
} from './providerWorkerHost';
import type { ProviderWorkerBatchMeta } from './providerWorkerProtocol';
import { createDeferredProviderHandle } from './deferredProviderHandle';
import { SharedWorkerDataServicesHub } from './SharedWorkerDataServicesHub';
import type { PortLike } from './hubTypes';

/**
 * In-process stand-in for a transferred MessagePort pair: the hub-facing
 * end and the worker-facing end of one asynchronous channel (messages hop
 * through a microtask, like real `postMessage`). The real
 * `installProviderWorker` sits on the worker end, so these tests exercise
 * the actual protocol — including the worker-resident data plane — on
 * both sides.
 */
class FakePortPair {
  readonly hubEnd: HostPort & { closed: boolean };
  readonly workerEnd: EntryPort;
  hubSent: unknown[] = [];
  workerSent: unknown[] = [];
  /** Worker side stops answering (simulates a dead SharedWorker). */
  dead = false;

  constructor() {
    const pair = this;
    this.workerEnd = {
      onmessage: null,
      postMessage(message: unknown) {
        pair.workerSent.push(message);
        queueMicrotask(() => pair.hubEnd.onmessage?.({ data: message } as MessageEvent));
      },
    };
    this.hubEnd = {
      closed: false,
      onmessage: null,
      postMessage(message: unknown) {
        pair.hubSent.push(message);
        if (pair.dead) return;
        queueMicrotask(() => pair.workerEnd.onmessage?.({ data: message } as MessageEvent));
      },
      close() {
        pair.hubEnd.closed = true;
      },
    };
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

interface FakeTransport {
  cfg: ProviderConfig;
  emit: ProviderEmit;
  restarts: Array<Record<string, unknown> | undefined>;
  stops: number;
}

const transports: FakeTransport[] = [];

function makeAppData(rows: AppDataRow[] = []) {
  const listeners = new Set<(op: 'upsert' | 'remove', row: AppDataRow) => void>();
  const store = new Map(rows.map((r) => [r.configId, r]));
  return {
    snapshotRows: () => [...store.values()],
    subscribe(l: (op: 'upsert' | 'remove', row: AppDataRow) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    upsert(row: AppDataRow) {
      store.set(row.configId, row);
      for (const l of listeners) l('upsert', row);
    },
    remove(row: AppDataRow) {
      store.delete(row.configId);
      for (const l of listeners) l('remove', row);
    },
    listenerCount: () => listeners.size,
  };
}

const appRow = (name: string, values: Record<string, unknown>): AppDataRow =>
  ({ configId: `cfg-${name}`, name, values } as unknown as AppDataRow);

const cfg = (overrides: Record<string, unknown> = {}): ProviderConfig =>
  ({ providerType: 'mock', keyColumn: 'id', ...overrides } as unknown as ProviderConfig);

const wide = (n: number, tag = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, px: i * 1.5 + tag, desk: i % 2 ? 'A' : 'B' }));

beforeEach(() => {
  transports.length = 0;
  registerProvider('mock' as ProviderConfig['providerType'], ((c: ProviderConfig, emit: ProviderEmit) => {
    if ((c as { __throw?: boolean }).__throw) throw new Error('boom at start');
    const t: FakeTransport = { cfg: c, emit, restarts: [], stops: 0 };
    transports.push(t);
    emit({ status: 'loading' });
    const handle: ProviderHandle = {
      stop() {
        t.stops += 1;
      },
      restart(extra) {
        t.restarts.push(extra);
        if ((extra as { reject?: boolean } | undefined)?.reject) return Promise.reject(new Error('restart failed'));
        return undefined;
      },
    };
    return handle;
  }) as unknown as Parameters<typeof registerProvider>[1]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A worker-side entry in SharedWorker mode, with one connected fake port pair. */
function bootWorker(): { pair: FakePortPair; installed: ReturnType<typeof installProviderWorker> } {
  const pair = new FakePortPair();
  const global: { onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null } = { onconnect: null };
  const installed = installProviderWorker(global);
  installed.connect(pair.workerEnd);
  return { pair, installed };
}

describe('provider sub-worker — entry ↔ host over a transferred port', () => {
  function boot(overrides: Record<string, unknown> = {}, rows: AppDataRow[] = [], extra?: Record<string, unknown>) {
    const { pair, installed } = bootWorker();
    const emitted: ProviderEmitEvent[] = [];
    const batches: Array<{ events: readonly Event[]; meta: ProviderWorkerBatchMeta }> = [];
    const replays: Array<{ reqId: string; chunks: readonly EncodedChunk[]; cacheSize: number }> = [];
    const appData = makeAppData(rows);
    const onDead = vi.fn();
    const control = startProviderInWorker(cfg(overrides), {
      providerId: 'p1',
      appData,
      port: pair.hubEnd,
      dataListenerCount: 1,
      extra,
      emit: (e) => emitted.push(e),
      onBatch: (events, meta) => batches.push({ events, meta }),
      onReplayChunks: (reqId, chunks, cacheSize) => replays.push({ reqId, chunks, cacheSize }),
      onDead,
      startTimeoutMs: 50,
      pingIntervalMs: 40,
      stopGraceMs: 20,
    });
    return { pair, installed, emitted, batches, replays, appData, control, handle: control.handle, onDead };
  }

  it('runs the whole data plane in the worker: cache, encode, wire templates, meta', async () => {
    const { batches, emitted, installed } = boot();
    await flush();
    expect(transports).toHaveLength(1);
    expect(emitted).toEqual([{ status: 'loading' }]); // pass-through

    transports[0]!.emit({ rows: wide(700), replace: true });
    await flush();
    expect(batches).toHaveLength(1);
    const b = batches[0]!;
    expect(b.meta).toMatchObject({ rowCount: 700, cacheSize: 700, keyDropCount: 0 });
    expect(installed.cacheSize()).toBe(700);
    // ≤500-row delta-bin chunks, replace on the first — the hub's own rule.
    expect(b.events.map((e) => e.kind)).toEqual(['delta-bin', 'delta-bin']);
    expect((b.events[0] as { replace?: boolean }).replace).toBe(true);
    expect((b.events[1] as { replace?: boolean }).replace).toBe(false);

    // Post-ready small tick → plain delta template (< LIVE_BIN_MIN_ROWS).
    transports[0]!.emit({ status: 'ready' });
    transports[0]!.emit({ rows: [{ id: 'r1', px: 9 }], uniqueKeys: true });
    await flush();
    expect(emitted.at(-1)).toEqual({ status: 'ready' });
    const live = batches.at(-1)!;
    expect(live.events.map((e) => e.kind)).toEqual(['delta']);
    expect((live.events[0] as { rows: unknown[] }).rows).toEqual([{ id: 'r1', px: 9 }]);
    expect(live.meta.cacheSize).toBe(700);
  });

  it('accounts key drops in the worker and reports them through meta', async () => {
    const { batches } = boot();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await flush();
    transports[0]!.emit({ rows: [{ id: 'a' }, { noKey: true }], replace: true });
    await flush();
    expect(batches[0]!.meta).toMatchObject({ cacheSize: 1, keyDropCount: 1 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropped 1 row(s)'));
  });

  it('skips broadcast building at zero data listeners but keeps the cache current', async () => {
    const { batches, control, installed } = boot();
    await flush();
    control.setDataListenerCount(0);
    await flush();
    transports[0]!.emit({ rows: wide(200), replace: true });
    await flush();
    expect(batches).toHaveLength(1);
    expect(batches[0]!.events).toEqual([]);
    expect(batches[0]!.meta.cacheSize).toBe(200);
    expect(installed.cacheSize()).toBe(200);
    control.setDataListenerCount(1);
    await flush();
    transports[0]!.emit({ rows: wide(200, 1), replace: true });
    await flush();
    expect(batches[1]!.events.length).toBeGreaterThan(0);
  });

  it('answers replay requests from the worker replay cache', async () => {
    const { control, replays } = boot();
    await flush();
    transports[0]!.emit({ rows: wide(600), replace: true });
    await flush();
    control.requestReplay('rq1');
    await flush();
    expect(replays).toHaveLength(1);
    expect(replays[0]).toMatchObject({ reqId: 'rq1', cacheSize: 600 });
    expect(replays[0]!.chunks).toHaveLength(2);
    control.requestReplay('rq2');
    await flush();
    expect(replays[1]!.cacheSize).toBe(600);
  });

  it('applies a start overlay (CREATE+RESTART) inside the worker', async () => {
    boot({}, [], { asOfDate: '2026-01-01' });
    await flush();
    expect(transports[0]!.restarts).toEqual([{ asOfDate: '2026-01-01' }]);
  });

  it('seeds AppData at start (template resolution) and mirrors later changes for reconnect-time lookups', async () => {
    const { appData, installed } = boot({ url: '{{svc.url}}' }, [appRow('svc', { url: 'ws://a' })]);
    await flush();
    expect((transports[0]!.cfg as { url?: string }).url).toBe('ws://a');
    expect(installed.lookup('svc', 'url')).toBe('ws://a');
    appData.upsert(appRow('svc', { url: 'ws://b' }));
    await flush();
    expect(installed.lookup('svc', 'url')).toBe('ws://b');
  });

  it('forwards restart with its overlay and surfaces a rejected restart as a non-fatal error', async () => {
    const { handle, emitted, onDead } = boot();
    await flush();
    handle.restart({ asOfDate: '2026-01-01' });
    await flush();
    expect(transports[0]!.restarts).toEqual([{ asOfDate: '2026-01-01' }]);
    handle.restart({ reject: true });
    await flush();
    expect(emitted.at(-1)).toEqual({ status: 'error', error: 'restart failed' });
    expect(onDead).not.toHaveBeenCalled();
  });

  it('stop tells the worker to stop the transport, closes the port on the ack and drops the AppData subscription', async () => {
    const { handle, pair, appData, installed } = boot();
    await flush();
    expect(appData.listenerCount()).toBe(1);
    handle.stop();
    await flush();
    expect(transports[0]!.stops).toBe(1);
    expect(pair.workerSent.at(-1)).toEqual({ kind: 'pw-stopped' });
    expect(pair.hubEnd.closed).toBe(true);
    expect(appData.listenerCount()).toBe(0);
    // The SharedWorker stays up: a fresh port can start it again with fresh state.
    expect(installed.cacheSize()).toBe(0);
    const again = new FakePortPair();
    installed.connect(again.workerEnd);
    startProviderInWorker(cfg(), {
      providerId: 'p1', appData, port: again.hubEnd, dataListenerCount: 1,
      emit: () => undefined, onBatch: () => undefined, onReplayChunks: () => undefined, onDead: () => undefined,
    });
    await flush();
    expect(transports).toHaveLength(2);
  });

  it('a transport that throws at start is fatal: hub sees status error and the worker is judged dead', async () => {
    const { emitted, onDead, pair } = boot({ __throw: true });
    await flush();
    expect(emitted).toEqual([{ status: 'error', error: 'boom at start' }]);
    expect(onDead).toHaveBeenCalledWith(expect.stringContaining('failed to start'));
    expect(pair.hubEnd.closed).toBe(true);
  });

  it('a worker that never acknowledges start is judged dead after startTimeoutMs', async () => {
    vi.useFakeTimers();
    const { onDead, pair } = boot();
    pair.dead = true; // pw-start never reaches the worker
    vi.advanceTimersByTime(60);
    expect(onDead).toHaveBeenCalledWith('did not acknowledge start');
  });

  it('a missed heartbeat is judged dead; a healthy worker keeps answering pings', async () => {
    vi.useFakeTimers();
    const { onDead, pair, handle } = boot();
    await flush();
    vi.advanceTimersByTime(45);
    await flush(); // pong lands
    vi.advanceTimersByTime(45);
    await flush();
    expect(onDead).not.toHaveBeenCalled();
    pair.dead = true;
    vi.advanceTimersByTime(45); // ping (unanswered)
    vi.advanceTimersByTime(45); // next ping finds no pong
    expect(onDead).toHaveBeenCalledWith('missed heartbeat');
    handle.restart({ x: 1 });
    expect(pair.hubSent.filter((m) => (m as { kind: string }).kind === 'pw-restart')).toHaveLength(0);
  });
});

describe('createDeferredProviderHandle', () => {
  it('queues restarts until resolved, and stops the real handle if stopped before', () => {
    const d = createDeferredProviderHandle();
    d.handle.restart({ a: 1 });
    const real = { stop: vi.fn(), restart: vi.fn() };
    d.resolve(real);
    expect(real.restart).toHaveBeenCalledWith({ a: 1 });

    const d2 = createDeferredProviderHandle();
    d2.handle.restart({ a: 1 });
    d2.handle.stop();
    const real2 = { stop: vi.fn(), restart: vi.fn() };
    d2.resolve(real2);
    expect(real2.restart).not.toHaveBeenCalled();
    expect(real2.stop).toHaveBeenCalledTimes(1);
  });
});

describe('SharedWorkerDataServicesHub — dataPlane: subworker (worker-owned data plane)', () => {
  /** A window port that answers `provider-worker-needed` like the real client does. */
  function makeWindow(hub: SharedWorkerDataServicesHub, opts: { unavailable?: boolean } = {}) {
    const messages: unknown[] = [];
    const pairs: FakePortPair[] = [];
    const port: PortLike & { messages: unknown[] } = {
      messages,
      postMessage: (m) => {
        messages.push(m);
        const ev = m as Event;
        if (ev.kind !== 'provider-worker-needed') return;
        queueMicrotask(() => {
          if (opts.unavailable) {
            hub.handleRequest(port, { kind: 'provider-port', providerId: ev.providerId, unavailable: true });
            return;
          }
          const { pair } = bootWorker();
          pairs.push(pair);
          hub.handleRequest(
            port,
            { kind: 'provider-port', providerId: ev.providerId } satisfies Request,
            [pair.hubEnd as unknown as MessagePort],
          );
        });
      },
    };
    return { port, messages, pairs };
  }

  function introspect(hub: SharedWorkerDataServicesHub, providerId: string) {
    const port: PortLike & { messages: unknown[] } = { messages: [], postMessage: (m) => port.messages.push(m) };
    hub.handleRequest(port, { kind: 'hub-introspect', reqId: 'r1' } as never);
    const snap = port.messages.find((m) => (m as { introspect?: unknown }).introspect) as
      | { introspect: { providers: Array<{ providerId: string; dataPlane?: string; rowCount?: number }> } }
      | undefined;
    return snap?.introspect.providers.find((p) => p.providerId === providerId);
  }

  const dataEvents = (messages: unknown[]) =>
    messages.filter((m) => /^delta/.test((m as { kind: string }).kind)) as Array<{
      kind: string; replace?: boolean; rows?: unknown[];
    }>;

  it('relays worker-built templates verbatim, keeps no hub-side rows, and reports worker sizes', async () => {
    const hub = new SharedWorkerDataServicesHub({ dataPlane: 'subworker' });
    const win = makeWindow(hub);
    hub.handleRequest(win.port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    await flush();
    expect(win.pairs).toHaveLength(1);
    transports[0]!.emit({ rows: wide(700), replace: true });
    transports[0]!.emit({ status: 'ready' });
    await flush();
    const evs = dataEvents(win.messages);
    // Cold-attach empty replay first, then the two worker-encoded chunks.
    expect(evs[0]).toMatchObject({ kind: 'delta', replace: true, rows: [] });
    expect(evs.slice(1).map((e) => e.kind)).toEqual(['delta-bin', 'delta-bin']);
    const row = introspect(hub, 'p1');
    expect(row?.dataPlane).toBe('subworker');
    expect(row?.rowCount).toBe(700);
    await hub.dispose();
  });

  it('late-joins a second window from the WORKER snapshot, gap-free against the live stream', async () => {
    const hub = new SharedWorkerDataServicesHub({ dataPlane: 'subworker' });
    const win = makeWindow(hub);
    hub.handleRequest(win.port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    await flush();
    transports[0]!.emit({ rows: wide(600), replace: true });
    transports[0]!.emit({ status: 'ready' });
    await flush();

    const win2 = makeWindow(hub);
    hub.handleRequest(win2.port, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data' });
    // Live tick lands while s2's replay request is still in flight — it must
    // not leak to s2 (its replay snapshot will contain it).
    transports[0]!.emit({ rows: [{ id: 'r0', px: 999 }], uniqueKeys: true });
    await flush();

    const s1Events = dataEvents(win.messages);
    expect(s1Events.at(-1)).toMatchObject({ kind: 'delta', rows: [{ id: 'r0', px: 999 }] });

    const s2Events = dataEvents(win2.messages);
    expect(s2Events.length).toBeGreaterThan(0);
    // First data event s2 sees is its replay replace — never a live delta.
    expect(s2Events[0]!.kind).toBe('delta-bin');
    expect(s2Events[0]!.replace).toBe(true);
    expect(win2.messages.some((m) => (m as { kind: string; status?: string }).status === 'ready')).toBe(true);

    // Promoted after replay: the next live tick reaches s2 too.
    transports[0]!.emit({ rows: [{ id: 'r1', px: 111 }], uniqueKeys: true });
    await flush();
    expect(dataEvents(win2.messages).at(-1)).toMatchObject({ kind: 'delta', rows: [{ id: 'r1', px: 111 }] });
    await hub.dispose();
  });

  it('replays an attach overlay onto the transport once the port arrives', async () => {
    const hub = new SharedWorkerDataServicesHub({ dataPlane: 'subworker' });
    const win = makeWindow(hub);
    hub.handleRequest(win.port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg(), extra: { asOfDate: '2026-03-03' },
    });
    await flush();
    expect(transports[0]!.restarts).toEqual([{ asOfDate: '2026-03-03' }]);
    await hub.dispose();
  });

  it('per-provider cfg.dataPlane overrides the hub default, and an unavailable window falls back to the hub thread', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hub = new SharedWorkerDataServicesHub({ dataPlane: 'hub' });
    const win = makeWindow(hub, { unavailable: true });
    hub.handleRequest(win.port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg({ dataPlane: 'subworker' }),
    });
    expect(transports).toHaveLength(0);
    await flush();
    expect(transports).toHaveLength(1); // started in-thread after the window declined
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('running its data plane on the hub thread'));
    expect(introspect(hub, 'p1')?.dataPlane).toBe('hub');
    // Hub-plane data flow still works end to end.
    transports[0]!.emit({ rows: wide(10), replace: true });
    expect(dataEvents(win.messages).length).toBeGreaterThan(0);
    await hub.dispose();
  });

  it('falls back to the hub thread when no window answers in time', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hub = new SharedWorkerDataServicesHub({ dataPlane: 'subworker', providerPortTimeoutMs: 30 });
    const silent: PortLike & { messages: unknown[] } = { messages: [], postMessage: (m) => silent.messages.push(m) };
    hub.handleRequest(silent, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    expect(transports).toHaveLength(0);
    vi.advanceTimersByTime(35);
    expect(transports).toHaveLength(1);
    expect(introspect(hub, 'p1')?.dataPlane).toBe('hub');
    await hub.dispose();
  });

  it('fails over to a spare port when the sub-worker dies, then to the hub thread when none is left', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hub = new SharedWorkerDataServicesHub({ dataPlane: 'subworker' });
    const win = makeWindow(hub);
    hub.handleRequest(win.port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    await flush();
    const win2 = makeWindow(hub);
    hub.handleRequest(win2.port, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data' });
    await flush();
    expect(transports).toHaveLength(1);

    win.pairs[0]!.dead = true;
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    await flush();
    expect(transports).toHaveLength(2);
    expect(introspect(hub, 'p1')?.dataPlane).toBe('subworker');

    win2.pairs[0]!.dead = true;
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    await flush();
    expect(transports).toHaveLength(3);
    expect(introspect(hub, 'p1')?.dataPlane).toBe('hub');
    await hub.dispose();
  });
});
