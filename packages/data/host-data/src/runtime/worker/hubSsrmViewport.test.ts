/**
 * SSRM viewport-interest lifecycle at the hub boundary.
 *
 * The worker filters live ticks down to the rows a session actually has
 * loaded. That interest must be released when the session detaches —
 * otherwise a remount inherits the previous mount's viewport and rows
 * outside it stay frozen until the next block load lands.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { SharedWorkerDataServicesHub, type PortLike } from './SharedWorkerDataServicesHub';
import { registerProvider } from '../providers/registry';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider';
import type { Event } from '../protocol';
import type { ProviderConfig } from '@wellsfargo-starui/types';

interface CapturedPort extends PortLike {
  messages: Event[];
}

interface FakeTimers {
  set: (cb: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
  /** Step time forward one tick. */
  tick(): void;
  /** True when an interval is currently armed. */
  armed: boolean;
}

function makeFakeTimers(): FakeTimers {
  const callbacks = new Map<number, () => void>();
  let nextId = 1;
  return {
    set(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clear(handle) {
      callbacks.delete(handle as number);
    },
    tick() {
      for (const cb of [...callbacks.values()]) cb();
    },
    get armed() { return callbacks.size > 0; },
  };
}

function makePort(): CapturedPort {
  const messages: Event[] = [];
  return {
    messages,
    postMessage(m: unknown) {
      messages.push({ ...(m as Event) });
    },
  };
}

let emitRef: ProviderEmit | null = null;

beforeEach(() => {
  emitRef = null;
  registerProvider('mock-ssrm' as ProviderConfig['providerType'], (_cfg, emit) => {
    emitRef = emit;
    const handle: ProviderHandle = { stop() {}, restart() {} };
    return handle;
  });
});

const ssrmCfg = (): ProviderConfig =>
  ({ providerType: 'mock-ssrm', keyColumn: 'id' } as unknown as ProviderConfig);

/** Tick payloads delivered to a port, in order. */
function ssrmTicks(port: CapturedPort) {
  return port.messages.filter(
    (m) => (m as { kind?: string }).kind === 'ssrm-tick',
  ) as unknown as Array<{ interestedKeys: string[] }>;
}

describe('hub SSRM viewport interest lifecycle', () => {
  it('releases a session viewport on detach while the plane is still alive', () => {
    const hub = new SharedWorkerDataServicesHub();
    // A second grid keeps the provider — and therefore the SSRM plane —
    // alive, so detaching the first does not dispose the interest map wholesale.
    const keepAlive = makePort();
    const port = makePort();

    hub.handleRequest(keepAlive, {
      kind: 'attach', subId: 'keep', providerId: 'p1', mode: 'data', cfg: ssrmCfg(),
    });
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: ssrmCfg(),
    });
    emitRef?.({ rows: [{ id: 'a' }, { id: 'b' }], replace: true });

    // Session s1 only has row "a" loaded.
    hub.handleRequest(port, {
      kind: 'ssrm-set-viewport', providerId: 'p1', sessionId: 's1', keys: ['a'],
    });

    hub.handleRequest(port, { kind: 'detach', subId: 's1' });

    // Same subId remounts and has loaded nothing yet, so every changed key
    // is of interest. A leaked entry would filter "b" out.
    const port2 = makePort();
    hub.handleRequest(port2, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: ssrmCfg(),
    });
    emitRef?.({ rows: [{ id: 'b', v: 2 }], replace: false });

    const ticks = ssrmTicks(port2);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.at(-1)?.interestedKeys).toEqual(['b']);
  });

  it('releases a session viewport when its port closes without detaching', () => {
    const hub = new SharedWorkerDataServicesHub();
    const keepAlive = makePort();
    const port = makePort();

    hub.handleRequest(keepAlive, {
      kind: 'attach', subId: 'keep', providerId: 'p1', mode: 'data', cfg: ssrmCfg(),
    });
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: ssrmCfg(),
    });
    emitRef?.({ rows: [{ id: 'a' }, { id: 'b' }], replace: true });
    hub.handleRequest(port, {
      kind: 'ssrm-set-viewport', providerId: 'p1', sessionId: 's1', keys: ['a'],
    });

    // Window closed: the client says goodbye without a detach.
    hub.handleRequest(port, { kind: 'port-close' });

    const port2 = makePort();
    hub.handleRequest(port2, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: ssrmCfg(),
    });
    emitRef?.({ rows: [{ id: 'b', v: 2 }], replace: false });

    expect(ssrmTicks(port2).at(-1)?.interestedKeys).toEqual(['b']);
  });
});

/** Row payloads delivered to a port, in order. */
function tickRows(port: CapturedPort) {
  return (
    port.messages.filter(
      (m) => (m as { kind?: string }).kind === 'ssrm-tick',
    ) as unknown as Array<{ event: { rows?: unknown[] } }>
  ).map((m) => m.event.rows ?? []);
}

describe('hub SSRM tick fan-out when nothing in view changed', () => {
  it('sends no rows to an unfiltered session whose viewport matched nothing', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();

    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: ssrmCfg(),
    });
    emitRef?.({ rows: [{ id: 'a' }, { id: 'b' }], replace: true });
    hub.handleRequest(port, {
      kind: 'ssrm-set-viewport',
      providerId: 'p1',
      sessionId: 's1',
      keys: ['a'],
      scope: { blockKey: 'b0', queryId: 'q1', hasFilter: false },
    });

    const before = tickRows(port).length;
    // "b" is outside the viewport and there is no filter to re-evaluate.
    emitRef?.({ rows: [{ id: 'b', v: 2 }], replace: false });

    const delivered = tickRows(port).slice(before);
    expect(delivered.flat()).toEqual([]);
  });

  it('still sends every changed row to a filtered session so rows can enter the filter', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();

    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: ssrmCfg(),
    });
    emitRef?.({ rows: [{ id: 'a' }, { id: 'b' }], replace: true });
    hub.handleRequest(port, {
      kind: 'ssrm-set-viewport',
      providerId: 'p1',
      sessionId: 's1',
      keys: ['a'],
      scope: { blockKey: 'b0', queryId: 'q1', hasFilter: true },
    });

    const before = tickRows(port).length;
    emitRef?.({ rows: [{ id: 'b', v: 2 }], replace: false });

    const delivered = tickRows(port).slice(before).flat();
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ id: 'b' });
  });
});

describe('hub SSRM live delta suppression', () => {
  it('stops broadcasting live deltas once ready — rows travel only as ssrm-ticks', () => {
    const hub = new SharedWorkerDataServicesHub();
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data', cfg: ssrmCfg(),
    });
    emitRef?.({ status: 'loading' });
    emitRef?.({ rows: [{ id: 'a' }, { id: 'b' }], replace: true });
    emitRef?.({ status: 'ready' });
    const deltasBeforeLive = port.messages.filter(
      (m) => m.kind === 'delta' || m.kind === 'delta-bin',
    ).length;
    // Snapshot delivery itself must still flow (seeds handle.snapshot).
    expect(deltasBeforeLive).toBeGreaterThan(0);

    emitRef?.({ rows: [{ id: 'a', v: 2 }] }); // live tick after ready

    const deltasAfterLive = port.messages.filter(
      (m) => m.kind === 'delta' || m.kind === 'delta-bin',
    ).length;
    expect(deltasAfterLive).toBe(deltasBeforeLive); // no NEW delta
    expect(ssrmTicks(port).length).toBeGreaterThan(0); // tick fan still works
  });
});

describe('hub windowed fan-out', () => {
  it('publishes ONE conflated tick per window with flush-fresh rows', () => {
    const timers = makeFakeTimers();
    const hub = new SharedWorkerDataServicesHub({
      setTimer: timers.set, clearTimer: timers.clear,
    });
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'p1', mode: 'data',
      cfg: { ...ssrmCfg(), publishWindowMs: 200 } as never,
    });
    emitRef?.({ status: 'loading' });
    emitRef?.({ rows: [{ id: 'a', px: 1 }, { id: 'b', px: 1 }], replace: true });
    emitRef?.({ status: 'ready' });
    hub.handleRequest(port, {
      kind: 'ssrm-set-viewport', providerId: 'p1', sessionId: 's1',
      keys: ['a', 'b'], scope: { blockKey: 'b0', queryId: 'q1', hasFilter: false },
    });
    const before = ssrmTicks(port).length;

    emitRef?.({ rows: [{ id: 'a', px: 2 }] });
    emitRef?.({ rows: [{ id: 'a', px: 3 }] }); // same key twice in window
    emitRef?.({ rows: [{ id: 'b', px: 2 }] });
    expect(ssrmTicks(port).length).toBe(before); // window open

    timers.tick();
    const delivered = ssrmTicks(port).slice(before);
    expect(delivered).toHaveLength(1);
    const rows = (delivered[0] as never as { event: { rows: Array<{ id: string; px: number }> } }).event.rows;
    // Conflated: 'a' once, carrying the LAST value.
    expect(rows.find((r) => r.id === 'a')?.px).toBe(3);
    expect(rows).toHaveLength(2);
  });
});
