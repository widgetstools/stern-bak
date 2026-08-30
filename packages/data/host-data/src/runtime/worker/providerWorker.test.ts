import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { registerProvider } from '../providers/registry';
import type { ProviderEmit, ProviderEmitEvent, ProviderHandle } from '../providers/Provider';
import type { AppDataRow, Event, Request } from '../protocol';
import { installProviderWorker, type ProviderWorkerPort as EntryPort } from './providerWorkerEntry';
import { startProviderInWorker, type ProviderWorkerPort as HostPort } from './providerWorkerHost';
import { createDeferredProviderHandle } from './deferredProviderHandle';
import { SharedWorkerDataServicesHub } from './SharedWorkerDataServicesHub';
import type { PortLike } from './hubTypes';

/**
 * In-process stand-in for a transferred MessagePort pair: the hub-facing
 * end and the worker-facing end of one asynchronous channel (messages hop
 * through a microtask, like real `postMessage`). The real
 * `installProviderWorker` sits on the worker end, so these tests exercise
 * the actual protocol on both sides.
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
  for (let i = 0; i < 8; i++) await Promise.resolve();
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
    const appData = makeAppData(rows);
    const onDead = vi.fn();
    const handle = startProviderInWorker(cfg(overrides), (e) => emitted.push(e), {
      providerId: 'p1',
      appData,
      port: pair.hubEnd,
      extra,
      onDead,
      startTimeoutMs: 50,
      pingIntervalMs: 40,
      stopGraceMs: 20,
    });
    return { pair, installed, emitted, appData, handle, onDead };
  }

  it('starts the transport in the worker and forwards its emits to the hub', async () => {
    const { emitted, pair } = boot({ tag: 'x' });
    await flush();
    expect(transports).toHaveLength(1);
    expect((transports[0]!.cfg as { tag?: string }).tag).toBe('x');
    expect(pair.hubSent[0]).toMatchObject({ kind: 'pw-start', providerId: 'p1' });
    expect(pair.workerSent).toContainEqual({ kind: 'pw-started' });
    expect(emitted).toEqual([{ status: 'loading' }]);

    transports[0]!.emit({ rows: [{ id: 1 }], uniqueKeys: true });
    transports[0]!.emit({ timing: { firstMessageMs: 7 } });
    await flush();
    expect(emitted.slice(1)).toEqual([
      { rows: [{ id: 1 }], uniqueKeys: true },
      { timing: { firstMessageMs: 7 } },
    ]);
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
    appData.remove(appRow('svc', {}));
    await flush();
    expect(installed.lookup('svc', 'url')).toBeUndefined();
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
    // The SharedWorker stays up: a fresh port can start it again.
    const again = new FakePortPair();
    installed.connect(again.workerEnd);
    startProviderInWorker(cfg(), () => undefined, { providerId: 'p1', appData, port: again.hubEnd, onDead: () => undefined });
    await flush();
    expect(transports).toHaveLength(2);
  });

  it('closes the port after the grace period when the worker never acks the stop', async () => {
    vi.useFakeTimers();
    const { handle, pair } = boot();
    await flush();
    pair.dead = true;
    handle.stop();
    await flush();
    expect(pair.hubEnd.closed).toBe(false);
    vi.advanceTimersByTime(25);
    expect(pair.hubEnd.closed).toBe(true);
  });

  it('a transport that throws at start is fatal: hub sees status error and the worker is judged dead', async () => {
    const { emitted, onDead, pair } = boot({ __throw: true });
    await flush();
    expect(emitted).toEqual([{ status: 'error', error: 'boom at start' }]);
    expect(onDead).toHaveBeenCalledWith(expect.stringContaining('failed to start'));
    expect(pair.hubEnd.closed).toBe(true);
  });

  it('an unresolvable template at start is fatal too (no silent half-resolved cfg)', async () => {
    const { onDead } = boot({ url: '{{missing.url}}' });
    await flush();
    expect(onDead).toHaveBeenCalledTimes(1);
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
    expect(pair.hubSent.filter((m) => (m as { kind: string }).kind === 'pw-ping')).toHaveLength(2);
    pair.dead = true;
    vi.advanceTimersByTime(45); // ping (unanswered)
    vi.advanceTimersByTime(45); // next ping finds no pong
    expect(onDead).toHaveBeenCalledWith('missed heartbeat');
    // Inert afterwards.
    handle.restart({ x: 1 });
    expect(pair.hubSent.filter((m) => (m as { kind: string }).kind === 'pw-restart')).toHaveLength(0);
  });
});

describe('provider sub-worker — encoded row relay', () => {
  function bootRelay(overrides: Record<string, unknown> = {}) {
    const { pair } = bootWorker();
    const emitted: ProviderEmitEvent[] = [];
    startProviderInWorker(cfg(overrides), (e) => emitted.push(e), {
      providerId: 'p1',
      appData: makeAppData(),
      port: pair.hubEnd,
      onDead: () => undefined,
    });
    return { pair, emitted };
  }

  const wide = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, px: i * 1.5, desk: i % 2 ? 'A' : 'B' }));

  it('encodes snapshot and large batches on the worker, transfers the bytes, and the hub gets rows + chunks', async () => {
    const { pair, emitted } = bootRelay();
    await flush();
    const rows = wide(1200);
    transports[0]!.emit({ rows, replace: true });
    await flush();
    const wire = pair.workerSent.find((m) => (m as { kind: string }).kind === 'pw-rows') as
      | { encoded: Array<{ buf: Uint8Array; enc: string }>; rowCount: number; replace?: boolean }
      | undefined;
    expect(wire).toBeDefined();
    expect(wire!.rowCount).toBe(1200);
    expect(wire!.encoded).toHaveLength(3); // ≤ LATE_JOIN_CHUNK_SIZE (500) per chunk
    expect(wire!.encoded.every((c) => c.enc === 'col')).toBe(true);
    expect(wire!.encoded.every((c) => c.buf.byteOffset === 0 && c.buf.byteLength === c.buf.buffer.byteLength)).toBe(true);

    const got = emitted.find((e) => 'rows' in e) as Extract<ProviderEmitEvent, { rows: readonly unknown[] }>;
    expect(got.replace).toBe(true);
    expect(got.rows).toEqual(rows);
    expect(got.encoded).toBe(wire!.encoded);
  });

  it('honours cfg.wireFormat json and keeps small live ticks as plain object emits', async () => {
    const { pair, emitted } = bootRelay({ wireFormat: 'json' });
    await flush();
    transports[0]!.emit({ rows: wide(64) });
    transports[0]!.emit({ rows: wide(3), uniqueKeys: true });
    await flush();
    const wires = pair.workerSent.filter((m) => (m as { kind: string }).kind === 'pw-rows') as Array<{ encoded: Array<{ enc: string }> }>;
    expect(wires).toHaveLength(1);
    expect(wires[0]!.encoded[0]!.enc).toBe('json');
    const plain = pair.workerSent.filter((m) => (m as { kind: string }).kind === 'pw-emit');
    expect(plain.some((m) => (m as { event: ProviderEmitEvent }).event && 'rows' in (m as { event: ProviderEmitEvent }).event)).toBe(true);
    const rowEvents = emitted.filter((e) => 'rows' in e) as Array<Extract<ProviderEmitEvent, { rows: readonly unknown[] }>>;
    expect(rowEvents.map((e) => e.rows.length)).toEqual([64, 3]);
    expect(rowEvents[0]!.encoded).toBeDefined();
    expect(rowEvents[1]!.encoded).toBeUndefined();
    expect(rowEvents[1]!.uniqueKeys).toBe(true);
  });

  it('the hub relays the worker-encoded chunks verbatim to windows instead of re-encoding', async () => {
    const hub = new SharedWorkerDataServicesHub({ dataPlane: 'subworker' });
    const messages: unknown[] = [];
    const pairs: FakePortPair[] = [];
    const port: PortLike = {
      postMessage: (m) => {
        messages.push(m);
        const ev = m as Event;
        if (ev.kind !== 'provider-worker-needed') return;
        queueMicrotask(() => {
          const { pair } = bootWorker();
          pairs.push(pair);
          hub.handleRequest(port, { kind: 'provider-port', providerId: ev.providerId }, [pair.hubEnd as unknown as MessagePort]);
        });
      },
    };
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    await flush();
    transports[0]!.emit({ rows: wide(700), replace: true });
    await flush();
    const wire = pairs[0]!.workerSent.find((m) => (m as { kind: string }).kind === 'pw-rows') as { encoded: Array<{ buf: Uint8Array }> };
    const bins = messages.filter((m) => (m as { kind: string }).kind === 'delta-bin') as Array<{ buf: Uint8Array; replace?: boolean }>;
    expect(bins).toHaveLength(2);
    expect(bins[0]!.buf).toBe(wire.encoded[0]!.buf);
    expect(bins[1]!.buf).toBe(wire.encoded[1]!.buf);
    expect(bins[0]!.replace).toBe(true);
    await hub.dispose();
  });
});

describe('createDeferredProviderHandle', () => {
  it('queues restarts until resolved, and stops the real handle if stopped before', () => {
    const d = createDeferredProviderHandle();
    d.handle.restart({ a: 1 });
    d.handle.restart({ b: 2 });
    const real = { stop: vi.fn(), restart: vi.fn() };
    d.resolve(real);
    expect(real.restart.mock.calls.map((c) => c[0])).toEqual([{ a: 1 }, { b: 2 }]);
    d.handle.restart({ c: 3 });
    expect(real.restart).toHaveBeenLastCalledWith({ c: 3 });

    const d2 = createDeferredProviderHandle();
    d2.handle.restart({ a: 1 });
    d2.handle.stop();
    const real2 = { stop: vi.fn(), restart: vi.fn() };
    d2.resolve(real2);
    expect(real2.restart).not.toHaveBeenCalled();
    expect(real2.stop).toHaveBeenCalledTimes(1);
  });
});

describe('SharedWorkerDataServicesHub — dataPlane: subworker', () => {
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

  function introspectPlane(hub: SharedWorkerDataServicesHub, providerId: string): string | undefined {
    const port: PortLike & { messages: unknown[] } = { messages: [], postMessage: (m) => port.messages.push(m) };
    hub.handleRequest(port, { kind: 'hub-introspect', reqId: 'r1' } as never);
    const snap = port.messages.find((m) => (m as { introspect?: unknown }).introspect) as
      | { introspect: { providers: Array<{ providerId: string; dataPlane?: string }> } }
      | undefined;
    return snap?.introspect.providers.find((p) => p.providerId === providerId)?.dataPlane;
  }

  it('asks the attaching window for a sub-worker, runs the transport over the port, and reports the plane', async () => {
    const hub = new SharedWorkerDataServicesHub({ dataPlane: 'subworker' });
    const win = makeWindow(hub);
    hub.handleRequest(win.port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: cfg() });
    // Loading is visible before the port arrives (in-thread transports emit it synchronously).
    expect(win.messages.some((m) => (m as { kind: string; status?: string }).kind === 'status')).toBe(true);
    expect(win.messages.some((m) => (m as { kind: string }).kind === 'provider-worker-needed')).toBe(true);
    await flush();
    expect(win.pairs).toHaveLength(1);
    expect(transports).toHaveLength(1);

    transports[0]!.emit({ rows: [{ id: 'a', px: 1 }], replace: true });
    transports[0]!.emit({ status: 'ready' });
    await flush();
    expect(win.messages.some((m) => /^delta/.test((m as { kind: string }).kind))).toBe(true);
    expect(introspectPlane(hub, 'p1')).toBe('subworker');

    // A second window joins: it is asked to connect too (keep-alive) and its port becomes a spare.
    const win2 = makeWindow(hub);
    hub.handleRequest(win2.port, { kind: 'attach', subId: 's2', providerId: 'p1', mode: 'data' });
    expect(win2.messages.some((m) => (m as { kind: string }).kind === 'provider-worker-needed')).toBe(true);
    await flush();
    expect(win2.pairs).toHaveLength(1);
    expect(transports).toHaveLength(1); // spare, not a second transport

    await hub.dispose();
    await flush();
    expect(transports[0]!.stops).toBe(1);
    expect(win.pairs[0]!.hubEnd.closed).toBe(true);
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
    expect(win.messages.some((m) => (m as { kind: string }).kind === 'provider-worker-needed')).toBe(true);
    expect(transports).toHaveLength(0);
    await flush();
    expect(transports).toHaveLength(1); // started in-thread after the window declined
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('running its transport on the hub thread'));
    expect(introspectPlane(hub, 'p1')).toBe('hub');
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
    expect(introspectPlane(hub, 'p1')).toBe('hub');
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

    // First worker stops answering pings → spare (win2's port) takes over.
    win.pairs[0]!.dead = true;
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    await flush();
    expect(transports).toHaveLength(2);
    expect(introspectPlane(hub, 'p1')).toBe('subworker');

    // Second worker dies too, no spares → hub thread.
    win2.pairs[0]!.dead = true;
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    await flush();
    expect(transports).toHaveLength(3);
    expect(introspectPlane(hub, 'p1')).toBe('hub');
    await hub.dispose();
  });
});
