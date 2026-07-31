/**
 * STOMP provider tests — exercise the trigger/snapshot/realtime
 * lifecycle against a controllable fake client.
 *
 * The real `@stomp/stompjs` Client is dynamically imported in
 * production; tests bypass that path entirely by passing
 * `createClient` so there's no socket touched and no module import
 * to mock.
 */

import { describe, it, expect, vi } from 'vitest';
import { startStomp, probeStomp, connectStomp, resolveStompClientCtor, resolveStompDestinations, resolveEffectiveStompCfg, validateStompWireReady } from './stomp';
import type { ProviderEmitEvent } from '../Provider';
import type { StompProviderConfig } from '@wellsfargo-starui/types';

// Mocked @stomp/stompjs module — only reached by tests that do NOT
// inject `createClient` (i.e. the dynamic-import path). Every other
// test injects a factory and never touches this.
const mockedStomp = vi.hoisted(() => {
  class MockStompClient {
    connected = false;
    reconnectDelay = 0;
    onConnect?: () => void;
    onWebSocketError?: () => void;
    onStompError?: (frame: { headers: Record<string, string> }) => void;
    onDisconnect?: () => void;
    publishLog: Array<{ destination: string; body: string }> = [];
    subscribedTopic = '';
    constructor(cfg: { reconnectDelay: number }) {
      this.reconnectDelay = cfg.reconnectDelay;
      instances.push(this);
    }
    subscribe(d: string) {
      this.subscribedTopic = d;
      return { unsubscribe() { /* no-op */ } };
    }
    publish(p: { destination: string; body?: string }) {
      this.publishLog.push({ destination: p.destination, body: p.body ?? '' });
    }
    activate() { /* tests fire onConnect manually */ }
    deactivate() { this.connected = false; }
  }
  const instances: InstanceType<typeof MockStompClient>[] = [];
  return { instances, MockStompClient };
});

vi.mock('@stomp/stompjs', () => ({
  Client: mockedStomp.MockStompClient,
  // resolveStompClientCtor probes these interop shapes eagerly, and
  // vitest's mock proxy throws on undeclared exports — declare them.
  default: { Client: mockedStomp.MockStompClient },
  StompJs: undefined,
}));

interface FakeClient {
  connected: boolean;
  reconnectDelay: number;
  onConnect?: () => void;
  onWebSocketError?: () => void;
  onStompError?: (frame: { headers: Record<string, string> }) => void;
  onDisconnect?: () => void;
  publish(p: { destination: string; body?: string }): void;
  subscribe(d: string, cb: (msg: { body: string; headers: Record<string, string> }) => void): { unsubscribe(): void };
  activate(): void;
  deactivate(options?: { force?: boolean }): Promise<void> | void;
}

interface FakeController {
  client: FakeClient;
  /** Trigger the onConnect callback from outside. */
  fireConnect(): void;
  /** Deliver a frame to the active subscription. */
  deliver(body: string): void;
  fireError(message?: string): void;
  fireWsError(): void;
  /** Captured publish calls (the trigger frame). */
  publishLog: Array<{ destination: string; body: string }>;
  /** Whether deactivate() has been called. */
  deactivated: boolean;
  /** Whether deactivate({ force: true }) was used. */
  forceDeactivated: boolean;
  /** Whether the subscription is currently active. */
  subscribed: boolean;
  /** Last topic passed to subscribe(). */
  subscribedTopic: string;
  /** reconnectDelay after teardown (should be 0). */
  reconnectDelay: number;
}

function makeFakeClient(): FakeController {
  let onMessage: ((m: { body: string; headers: Record<string, string> }) => void) | null = null;
  const ctrl: FakeController = {
    client: {} as FakeClient,
    fireConnect() {
      ctrl.client.connected = true;
      ctrl.client.onConnect?.();
    },
    deliver(body) { onMessage?.({ body, headers: {} }); },
    fireError(message) { ctrl.client.onStompError?.({ headers: { message: message ?? '' } }); },
  fireWsError() { ctrl.client.onWebSocketError?.(); },
  fireDisconnect() { ctrl.client.onDisconnect?.(); },
  publishLog: [],
    deactivated: false,
    forceDeactivated: false,
    subscribed: false,
    subscribedTopic: '',
    reconnectDelay: 5000,
  };
  ctrl.client = {
    connected: false,
    reconnectDelay: ctrl.reconnectDelay,
    publish: (p) => { ctrl.publishLog.push({ destination: p.destination, body: p.body ?? '' }); },
    subscribe: (d, cb) => {
      ctrl.subscribedTopic = d;
      onMessage = cb;
      ctrl.subscribed = true;
      return { unsubscribe() { onMessage = null; ctrl.subscribed = false; ctrl.subscribedTopic = ''; } };
    },
    activate: () => { /* no-op until tests fire onConnect */ },
    deactivate: (options) => {
      ctrl.deactivated = true;
      ctrl.forceDeactivated = Boolean(options?.force);
      ctrl.client.connected = false;
      ctrl.client.reconnectDelay = 0;
      ctrl.reconnectDelay = 0;
    },
  };
  return ctrl;
}

function cfg(overrides: Partial<StompProviderConfig> = {}): StompProviderConfig {
  return {
    providerType: 'stomp',
    websocketUrl: 'ws://test',
    listenerTopic: '/topic/test',
    requestMessage: '/app/test/1000',
    requestBody: '',
    snapshotEndToken: 'Success',
    keyColumn: 'id',
    snapshotTimeoutMs: 30000,
    ...overrides,
  } as StompProviderConfig;
}

describe('resolveStompClientCtor', () => {
  class FakeCtor {}

  it('resolves named Client export', () => {
    expect(resolveStompClientCtor({ Client: FakeCtor })).toBe(FakeCtor);
  });

  it('resolves default.Client (UMD interop)', () => {
    expect(resolveStompClientCtor({ default: { Client: FakeCtor } })).toBe(FakeCtor);
  });

  it('throws with module keys when Client is missing', () => {
    expect(() => resolveStompClientCtor({})).toThrow(/Module keys:/);
  });
});

describe('resolveStompDestinations', () => {
  it('substitutes asOfDate tokens in listener and request destinations', () => {
    const out = resolveStompDestinations(
      {
        listenerTopic: '/snapshot/positions/X/{{positions.asOfDate}}',
        requestMessage: '/snapshot/positions/X/{{positions.asOfDate}}/1000',
      },
      { asOfDate: '2026-04-01' },
    );
    expect(out.listenerTopic).toBe('/snapshot/positions/X/2026-04-01');
    expect(out.requestMessage).toBe('/snapshot/positions/X/2026-04-01/1000');
  });

  it('returns cfg unchanged when overlay has no asOfDate', () => {
    const cfg = {
      listenerTopic: '/topic/live',
      requestMessage: '/app/live',
    };
    expect(resolveStompDestinations(cfg, undefined)).toEqual(cfg);
  });
});

describe('resolveEffectiveStompCfg', () => {
  it('restart overlay asOfDate overrides stale AppData for historical date keys', () => {
    const out = resolveEffectiveStompCfg(
      cfg({
        listenerTopic: '/snapshot/positions/{{SessionContext.userId}}/{{SessionContext.position-asofdate}}',
        requestMessage: '/snapshot/positions/{{SessionContext.userId}}/{{SessionContext.position-asofdate}}/100',
      }),
      (name, key) => {
        if (name === 'SessionContext' && key === 'userId') return 'TRADER001';
        if (name === 'SessionContext' && key === 'position-asofdate') return '2026-01-01';
        if (name === 'positions' && key === 'asOfDate') return '2026-01-01';
        return undefined;
      },
      { asOfDate: '2026-05-22' },
    );
    expect(out.destinations.listenerTopic).toBe('/snapshot/positions/TRADER001/2026-05-22');
    expect(out.destinations.requestMessage).toBe('/snapshot/positions/TRADER001/2026-05-22/100');
    expect(validateStompWireReady(out.destinations)).toBeNull();
  });

  it('reports unresolved wire destinations when lookup and overlay are insufficient', () => {
    const out = resolveEffectiveStompCfg(
      cfg({ listenerTopic: '/snapshot/{{Missing.userId}}' }),
      () => undefined,
      undefined,
    );
    expect(validateStompWireReady(out.destinations)).toMatch(/listenerTopic/);
  });

  it('rejects historical listener paired with live-style trigger after resolve', () => {
    const out = resolveEffectiveStompCfg(
      cfg({
        listenerTopic: '/snapshot/positions/TRADER001/{{positions.asOfDate}}',
        requestMessage: '/snapshot/positions/TRADER001/{{positions.asOfDate}}/1000/50',
      }),
      (name, key) => {
        if (name === 'positions' && key === 'asOfDate') return '2026-05-28';
        return undefined;
      },
      { asOfDate: '2026-05-28' },
    );
    expect(validateStompWireReady(out.destinations)).toMatch(/live rate\/batch path/);
  });
});

describe('startStomp', () => {
  it('emits loading, connects, subscribes, publishes the trigger', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });

    // Allow the async start() to resolve into the synchronous wiring.
    await Promise.resolve();
    await Promise.resolve();

    // Loading status emits up-front; subscribe + publish only fire
    // after `onConnect`.
    expect(events.find((e) => 'status' in e && e.status === 'loading')).toBeTruthy();
    expect(ctrl.subscribed).toBe(false);
    expect(ctrl.publishLog).toEqual([]);

    ctrl.fireConnect();
    expect(ctrl.subscribed).toBe(true);
    expect(ctrl.publishLog).toEqual([{ destination: '/app/test/1000', body: '' }]);
  });

  it('buffers snapshot batches and flushes them as a single replace=true on the end token', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireConnect();

    ctrl.deliver(JSON.stringify([{ id: 'r1', x: 1 }, { id: 'r2', x: 2 }]));
    ctrl.deliver(JSON.stringify({ id: 'r3', x: 3 }));   // single object → 1-row batch
    // Before the end-token, no row payloads — progressive count only.
    expect(events.filter((e) => 'rows' in e)).toHaveLength(0);
    const progress = events.filter((e): e is { rowsReceived: number } => 'rowsReceived' in e);
    expect(progress.map((e) => e.rowsReceived)).toEqual([2, 3]);

    ctrl.deliver('Success: All 3 records delivered');    // case-insensitive token

    // After the end-token, the buffer flushes as a single
    // replace=true batch carrying every row collected during the
    // snapshot phase. Hub consumers route this to
    // setGridOption('rowData', ...) — one cheap reset instead of N
    // small `add` transactions.
    const deltas = events.filter((e): e is { rows: readonly unknown[]; replace?: boolean } => 'rows' in e);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].rows).toHaveLength(3);
    expect(deltas[0].replace).toBe(true);

    expect(events.find((e) => 'status' in e && e.status === 'ready')).toBeTruthy();
  });

  it('treats post-Success frames as live updates (no replace, no new status)', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    // throttleEnabled:false → immediate fan-out; the default 25 ms
    // conflation window would otherwise buffer the live frame.
    startStomp(cfg({ throttleEnabled: false }), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver('Success');
    events.length = 0;

    ctrl.deliver(JSON.stringify({ id: 'r1', price: 99 }));

    const lastDelta = events.find((e) => 'rows' in e) as { rows: unknown[]; replace?: boolean };
    expect(lastDelta.rows).toEqual([{ id: 'r1', price: 99 }]);
    expect(lastDelta.replace).toBeUndefined();

    // No spurious status flip after ready.
    expect(events.filter((e) => 'status' in e)).toHaveLength(0);
  });

  it('counts byteSize even on non-row frames (heartbeats, end token)', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireConnect();

    ctrl.deliver('not-json');
    ctrl.deliver('Success');

    const byteEvents = events.filter((e): e is { byteSize: number } => 'byteSize' in e);
    // 'not-json' = 8 bytes, 'Success' = 7 bytes
    expect(byteEvents.map((e) => e.byteSize)).toEqual([8, 7]);
  });

  it('restart() deactivates, emits replace:[], reconnects with overlay merged into trigger body', async () => {
    const events: ProviderEmitEvent[] = [];
    const controllers: FakeController[] = [];
    const handle = startStomp(
      cfg({ requestBody: '{"clientId":"X"}' }),
      (e) => events.push(e),
      {
        createClient: () => {
          const c = makeFakeClient();
          controllers.push(c);
          return c.client;
        },
      },
    );
    await Promise.resolve();
    controllers[0].fireConnect();
    controllers[0].deliver('Success');
    events.length = 0;

    await handle.restart({ asOfDate: '2026-04-01' });
    await Promise.resolve();
    await Promise.resolve();

    expect(controllers[0].deactivated).toBe(true);
    expect(controllers[0].subscribed).toBe(false);
    expect(controllers[0].client.reconnectDelay).toBe(0);
    expect(controllers).toHaveLength(2);
    controllers[1].fireConnect();

    const replaceClear = events.find((e) => 'rows' in e && (e as { replace?: boolean }).replace);
    expect(replaceClear).toMatchObject({ rows: [], replace: true });

    const lastPublish = controllers[1].publishLog.at(-1)!;
    expect(JSON.parse(lastPublish.body)).toEqual({ clientId: 'X', asOfDate: '2026-04-01' });
  });

  it('projectFields prunes snapshot and live rows to columnDefinitions + keyColumn', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(
      cfg({
        projectFields: true,
        throttleEnabled: false, // immediate live fan-out (default window is 25 ms)
        keyColumn: 'id',
        columnDefinitions: [
          { field: 'px', headerName: 'Price' },
          { field: 'risk.dv01', headerName: 'DV01' },
        ],
      }),
      (e) => events.push(e),
      { createClient: () => ctrl.client },
    );
    await Promise.resolve();
    ctrl.fireConnect();

    const fatRow = (id: string) => ({
      id,
      px: 100,
      risk: { dv01: 12, gamma: 9, vega: 3 },
      junkA: 'x',
      junkB: { nested: true },
    });

    // Snapshot phase: buffered rows must already be pruned.
    ctrl.deliver(JSON.stringify([fatRow('r1'), fatRow('r2')]));
    ctrl.deliver('Success');

    const snapshotRows = events
      .filter((e) => 'rows' in e)
      .flatMap((e) => (e as { rows: readonly unknown[] }).rows);
    expect(snapshotRows).toHaveLength(2);
    expect(snapshotRows[0]).toEqual({ id: 'r1', px: 100, risk: { dv01: 12 } });

    // Live phase: deltas pruned too.
    events.length = 0;
    ctrl.deliver(JSON.stringify([fatRow('r1')]));
    const live = events.find((e) => 'rows' in e) as { rows: readonly unknown[] };
    expect(live.rows[0]).toEqual({ id: 'r1', px: 100, risk: { dv01: 12 } });
  });

  it('probeStomp sees RAW rows even when projectFields is on (Infer Fields path)', async () => {
    const ctrl = makeFakeClient();
    const probe = probeStomp(
      cfg({
        projectFields: true,
        keyColumn: 'id',
        columnDefinitions: [{ field: 'px', headerName: 'Price' }],
      }),
      { createClient: () => ctrl.client, maxRows: 1, timeoutMs: 1000 },
    );
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver(JSON.stringify([{ id: 'r1', px: 1, hidden: 'still-here' }]));

    const result = await probe;
    expect(result.ok).toBe(true);
    expect(result.rows?.[0]).toEqual({ id: 'r1', px: 1, hidden: 'still-here' });
  });

  it('restart() strips internal __ keys from the trigger body', async () => {
    const controllers: FakeController[] = [];
    const handle = startStomp(
      cfg({ requestBody: '{"clientId":"X"}' }),
      () => { /* ignore */ },
      {
        createClient: () => {
          const c = makeFakeClient();
          controllers.push(c);
          return c.client;
        },
      },
    );
    await Promise.resolve();
    controllers[0].fireConnect();
    controllers[0].deliver('Success');

    await handle.restart({ asOfDate: '2026-04-01', __refresh: 1781218676307 });
    await Promise.resolve();
    await Promise.resolve();
    controllers[1].fireConnect();

    const lastPublish = controllers[1].publishLog.at(-1)!;
    expect(lastPublish.body).not.toContain('__refresh');
    expect(JSON.parse(lastPublish.body)).toEqual({ clientId: 'X', asOfDate: '2026-04-01' });
  });

  it('an overlay of only internal keys leaves an empty trigger body empty', async () => {
    const controllers: FakeController[] = [];
    const handle = startStomp(
      cfg(), // requestBody: ''
      () => { /* ignore */ },
      {
        createClient: () => {
          const c = makeFakeClient();
          controllers.push(c);
          return c.client;
        },
      },
    );
    await Promise.resolve();
    controllers[0].fireConnect();
    controllers[0].deliver('Success');

    await handle.restart({ __refresh: Date.now() });
    await Promise.resolve();
    await Promise.resolve();
    controllers[1].fireConnect();

    expect(controllers[1].publishLog.at(-1)!.body).toBe('');
  });

  it('restart() during the in-flight initial connect adopts the overlay — single dial, no duplicate session', async () => {
    // No `createClient` here: this exercises the real dynamic-import
    // path (mocked above), whose await opens the pre-dial window the
    // Hub's CREATE+RESTART / RESTART+RECONFIG paths land in when they
    // call restart() synchronously right after startStomp().
    mockedStomp.instances.length = 0;
    const events: ProviderEmitEvent[] = [];
    const handle = startStomp(cfg({ requestBody: '{"clientId":"X"}' }), (e) => events.push(e));
    void handle.restart({ asOfDate: '2026-04-01', __refresh: 123 });
    await new Promise((r) => setTimeout(r, 0));

    const errorEvent = events.find((e) => 'status' in e && e.status === 'error');
    expect(errorEvent).toBeUndefined();
    // The overlay rode the in-flight initial connect: exactly one
    // client was ever constructed.
    expect(mockedStomp.instances).toHaveLength(1);

    const client = mockedStomp.instances[0];
    client.connected = true;
    client.onConnect?.();

    const lastPublish = client.publishLog.at(-1)!;
    expect(lastPublish.body).not.toContain('__refresh');
    expect(JSON.parse(lastPublish.body)).toEqual({ clientId: 'X', asOfDate: '2026-04-01' });

    await handle.stop();
  });

  it('resolves {{name.key}} AppData tokens on connect when appDataLookup is provided', async () => {
    const controllers: FakeController[] = [];
    startStomp(
      cfg({
        listenerTopic: '/snapshot/positions/{{SessionContext.userId}}-[id]/{{SessionContext.position-asofdate}}',
        requestMessage: '/snapshot/positions/{{SessionContext.userId}}-[id]/{{SessionContext.position-asofdate}}/100',
      }),
      () => {},
      {
        createClient: () => {
          const c = makeFakeClient();
          controllers.push(c);
          return c.client;
        },
        appDataLookup: (name, key) => {
          if (name === 'SessionContext' && key === 'userId') return 'TRADER001';
          if (name === 'SessionContext' && key === 'position-asofdate') return '2026-05-22';
          return undefined;
        },
      },
    );
    await Promise.resolve();
    controllers[0].fireConnect();

    expect(controllers[0].subscribedTopic).toBe('/snapshot/positions/TRADER001-[id]/2026-05-22');
    expect(controllers[0].publishLog.at(-1)?.destination).toBe(
      '/snapshot/positions/TRADER001-[id]/2026-05-22/100',
    );
  });

  it('emits error and does not subscribe when AppData tokens remain unresolved', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(
      cfg({ listenerTopic: '/snapshot/{{MissingProvider.userId}}' }),
      (e) => events.push(e),
      { createClient: () => ctrl.client, appDataLookup: () => undefined },
    );
    await Promise.resolve();
    ctrl.fireConnect();
    expect(ctrl.subscribed).toBe(false);
    expect(events.find((e) => 'status' in e && e.status === 'error')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('unresolved AppData template'),
    });
  });

  it('restart() substitutes asOfDate into STOMP destination paths', async () => {
    const controllers: FakeController[] = [];
    const handle = startStomp(
      cfg({
        listenerTopic: '/snapshot/positions/X/{{positions.asOfDate}}',
        requestMessage: '/snapshot/positions/X/{{positions.asOfDate}}/1000',
      }),
      () => {},
      {
        createClient: () => {
          const c = makeFakeClient();
          controllers.push(c);
          return c.client;
        },
      },
    );
    await Promise.resolve();
    controllers[0].fireConnect();
    await handle.restart({ asOfDate: '2026-04-01' });
    await Promise.resolve();
    await Promise.resolve();
    controllers[1].fireConnect();

    expect(controllers[1].subscribedTopic).toBe('/snapshot/positions/X/2026-04-01');
    expect(controllers[1].publishLog.at(-1)?.destination).toBe(
      '/snapshot/positions/X/2026-04-01/1000',
    );
  });

  it('stop() unsubscribes, disables reconnect, and deactivates the client', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    const handle = startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireConnect();
    expect(ctrl.subscribed).toBe(true);

    await handle.stop();

    expect(ctrl.subscribed).toBe(false);
    expect(ctrl.deactivated).toBe(true);
    expect(ctrl.client.reconnectDelay).toBe(0);

    events.length = 0;
    ctrl.deliver(JSON.stringify({ id: 'r1', x: 1 }));
    expect(events.filter((e) => 'rows' in e)).toHaveLength(0);
  });

  it('surfaces WebSocket failure as status:error', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireWsError();
    expect(events.find((e) => 'status' in e && e.status === 'error')).toBeTruthy();
  });

  it('reconnect after disconnect restarts snapshot and returns to ready', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg(), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver(JSON.stringify([{ id: 'r1', x: 1 }]));
    ctrl.deliver('Success');
    events.length = 0;

    ctrl.fireDisconnect();
    expect(events.find((e) => 'status' in e && e.status === 'error')).toMatchObject({
      status: 'error',
      error: 'Provider disconnected',
    });

    ctrl.fireConnect();
    expect(events.find((e) => 'status' in e && e.status === 'loading')).toBeTruthy();
    expect(events.find((e) => 'rows' in e && (e as { replace?: boolean }).replace)).toMatchObject({
      rows: [],
      replace: true,
    });
    expect(ctrl.publishLog.length).toBe(2);

    events.length = 0;
    ctrl.deliver(JSON.stringify([{ id: 'r1', x: 2 }]));
    ctrl.deliver('Success');

    const deltas = events.filter((e): e is { rows: readonly unknown[]; replace?: boolean } => 'rows' in e);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].rows).toEqual([{ id: 'r1', x: 2 }]);
    expect(events.find((e) => 'status' in e && e.status === 'ready')).toBeTruthy();
  });
});

describe('startStomp — snapshot chunk size', () => {
  it('splits the snapshot flush into cfg.snapshotChunkSize-row frames', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    startStomp(cfg({ snapshotChunkSize: 2 }), (e) => events.push(e), { createClient: () => ctrl.client });
    await Promise.resolve();
    ctrl.fireConnect();

    ctrl.deliver(JSON.stringify([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }, { id: 'r5' }]));
    ctrl.deliver('Success');

    const deltas = events.filter((e): e is { rows: readonly unknown[]; replace?: boolean } => 'rows' in e);
    // 5 rows / chunk 2 → 3 frames; first replace=true, rest deltas.
    expect(deltas).toHaveLength(3);
    expect(deltas[0]).toMatchObject({ replace: true });
    expect(deltas[0].rows).toHaveLength(2);
    expect(deltas[1].replace).toBeFalsy();
    expect(deltas[1].rows).toHaveLength(2);
    expect(deltas[2].rows).toHaveLength(1);
  });
});

describe('startStomp — live conflation + throttle', () => {
  function fakeTimer() {
    let scheduled: (() => void) | null = null;
    return {
      setTimer: (cb: () => void) => { scheduled = cb; return 'tok'; },
      clearTimer: () => { scheduled = null; },
      fire: () => { const c = scheduled; scheduled = null; c?.(); },
      get pending() { return scheduled !== null; },
    };
  }

  it('conflates same-key live deltas to the latest within a throttle window', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    const t = fakeTimer();
    // keyColumn 'id' (from cfg) is the default conflation key.
    startStomp(cfg({ throttleMs: 100 }), (e) => events.push(e), {
      createClient: () => ctrl.client,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver('Success');
    events.length = 0;

    ctrl.deliver(JSON.stringify({ id: 'r1', price: 1 }));
    ctrl.deliver(JSON.stringify({ id: 'r1', price: 2 })); // overwrites r1
    ctrl.deliver(JSON.stringify({ id: 'r2', price: 3 }));

    // Throttled — nothing flushed yet.
    expect(events.filter((e) => 'rows' in e)).toHaveLength(0);
    expect(t.pending).toBe(true);

    t.fire();

    const deltas = events.filter((e): e is { rows: readonly unknown[] } => 'rows' in e);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].rows).toEqual([{ id: 'r1', price: 2 }, { id: 'r2', price: 3 }]);
  });

  it('throttle-only (no key) batches distinct frames preserving order', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    const t = fakeTimer();
    startStomp(cfg({ throttleMs: 100, keyColumn: undefined, conflateByKey: undefined }), (e) => events.push(e), {
      createClient: () => ctrl.client,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver('Success');
    events.length = 0;

    ctrl.deliver(JSON.stringify({ id: 'r1', v: 1 }));
    ctrl.deliver(JSON.stringify({ id: 'r1', v: 2 })); // kept (no conflation)
    t.fire();

    const deltas = events.filter((e): e is { rows: readonly unknown[] } => 'rows' in e);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].rows).toEqual([{ id: 'r1', v: 1 }, { id: 'r1', v: 2 }]);
  });

  it('drops pending throttled deltas on stop()', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    const t = fakeTimer();
    const handle = startStomp(cfg({ throttleMs: 100 }), (e) => events.push(e), {
      createClient: () => ctrl.client,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver('Success');
    events.length = 0;

    ctrl.deliver(JSON.stringify({ id: 'r1', price: 1 }));
    expect(t.pending).toBe(true);
    await handle.stop();

    // Timer cancelled; firing it is a no-op and emits nothing.
    t.fire();
    expect(events.filter((e) => 'rows' in e)).toHaveLength(0);
  });

  it('defaults to a 25 ms conflation window when throttleMs is unset', async () => {
    // A 10k msg/sec feed against an unconfigured provider must NOT get
    // one emit per message — unset throttleMs now means a 25 ms
    // trailing-edge window with key conflation (keyColumn 'id').
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    const t = fakeTimer();
    startStomp(cfg(), (e) => events.push(e), {
      createClient: () => ctrl.client,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver('Success');
    events.length = 0;

    ctrl.deliver(JSON.stringify({ id: 'r1', price: 9 }));
    ctrl.deliver(JSON.stringify({ id: 'r1', price: 10 })); // conflated over price 9
    expect(events.filter((e) => 'rows' in e)).toHaveLength(0); // buffered, not passthrough
    expect(t.pending).toBe(true);
    t.fire();

    const deltas = events.filter((e): e is { rows: readonly unknown[]; uniqueKeys?: boolean } => 'rows' in e);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].rows).toEqual([{ id: 'r1', price: 10 }]);
    // Conflation-map batches assert per-batch key uniqueness to the hub.
    expect(deltas[0].uniqueKeys).toBe(true);
  });

  it('conflateEnabled:false keeps same-key deltas (still throttled, not collapsed)', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    const t = fakeTimer();
    // keyColumn 'id' is present, but the explicit switch disables conflation.
    startStomp(cfg({ throttleMs: 100, conflateEnabled: false }), (e) => events.push(e), {
      createClient: () => ctrl.client,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver('Success');
    events.length = 0;

    ctrl.deliver(JSON.stringify({ id: 'r1', price: 1 }));
    ctrl.deliver(JSON.stringify({ id: 'r1', price: 2 })); // kept — not conflated
    expect(t.pending).toBe(true); // still batched by the throttle window
    t.fire();

    const deltas = events.filter((e): e is { rows: readonly unknown[] } => 'rows' in e);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].rows).toEqual([{ id: 'r1', price: 1 }, { id: 'r1', price: 2 }]);
  });

  it('throttleEnabled:false fans out immediately even when throttleMs is set', async () => {
    const events: ProviderEmitEvent[] = [];
    const ctrl = makeFakeClient();
    const t = fakeTimer();
    startStomp(cfg({ throttleMs: 100, throttleEnabled: false }), (e) => events.push(e), {
      createClient: () => ctrl.client,
      setTimer: t.setTimer,
      clearTimer: t.clearTimer,
    });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver('Success');
    events.length = 0;

    ctrl.deliver(JSON.stringify({ id: 'r1', price: 1 }));
    // No timer scheduled — each delta flushes synchronously.
    expect(t.pending).toBe(false);

    const deltas = events.filter((e): e is { rows: readonly unknown[] } => 'rows' in e);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].rows).toEqual([{ id: 'r1', price: 1 }]);
  });
});

describe('probeStomp', () => {
  it('resolves with collected rows once the end token arrives', async () => {
    const ctrl = makeFakeClient();
    const promise = probeStomp(cfg(), {
      createClient: () => ctrl.client,
      timeoutMs: 1000,
    });
    // Drive the connect + frames after the probe call. Use a microtask
    // gap so startStomp's async start() has wired everything up.
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver(JSON.stringify([{ id: 'r1' }, { id: 'r2' }]));
    ctrl.deliver('Success');

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(2);
  });

  it('rejects with error when WebSocket fails', async () => {
    const ctrl = makeFakeClient();
    const promise = probeStomp(cfg(), { createClient: () => ctrl.client, timeoutMs: 1000 });
    await Promise.resolve();
    ctrl.fireWsError();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/WebSocket/);
  });

  it('caps at maxRows and resolves without waiting for the end token', async () => {
    const ctrl = makeFakeClient();
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: `r${i}` }));
    const promise = probeStomp(cfg(), {
      createClient: () => ctrl.client,
      maxRows: 100,
      timeoutMs: 1000,
    });
    await Promise.resolve();
    ctrl.fireConnect();
    ctrl.deliver(JSON.stringify(rows));

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(100);
  });
});

describe('connectStomp', () => {
  it('resolves on connect without subscribing, publishing, or waiting for rows', async () => {
    const ctrl = makeFakeClient();
    const promise = connectStomp(cfg(), { createClient: () => ctrl.client, timeoutMs: 1000 });
    await Promise.resolve();
    ctrl.fireConnect();

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.rows).toBeUndefined();
    // Pure connect: never subscribed, never published a trigger frame.
    expect(ctrl.subscribed).toBe(false);
    expect(ctrl.publishLog).toHaveLength(0);
  });

  it('tears the connection down once it resolves', async () => {
    const ctrl = makeFakeClient();
    const promise = connectStomp(cfg(), { createClient: () => ctrl.client, timeoutMs: 1000 });
    await Promise.resolve();
    ctrl.fireConnect();
    await promise;
    expect(ctrl.deactivated).toBe(true);
  });

  it('fails when the WebSocket errors before connecting', async () => {
    const ctrl = makeFakeClient();
    const promise = connectStomp(cfg(), { createClient: () => ctrl.client, timeoutMs: 1000 });
    await Promise.resolve();
    ctrl.fireWsError();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/WebSocket/);
  });

  it('fails on a STOMP error frame', async () => {
    const ctrl = makeFakeClient();
    const promise = connectStomp(cfg(), { createClient: () => ctrl.client, timeoutMs: 1000 });
    await Promise.resolve();
    ctrl.fireError('broker rejected');
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('broker rejected');
  });

  it('fails fast when the WebSocket URL is unresolved', async () => {
    const ctrl = makeFakeClient();
    const result = await connectStomp(cfg({ websocketUrl: 'ws://{{env.host}}' }), {
      createClient: () => ctrl.client,
      timeoutMs: 1000,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Unresolved or missing WebSocket URL/);
  });
});
