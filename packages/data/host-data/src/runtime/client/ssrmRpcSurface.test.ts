/**
 * The SSRM query plane's client half: every RPC below is a thin request/reply
 * pair, and what makes each one worth testing is the failure shape — the hub
 * answers `{ ok: false }` or answers with the wrong payload, and the caller
 * has to see an error rather than `undefined`.
 *
 * `ssrmRpcTimeout.test.ts` covers the no-reply case; this file covers replies.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SharedWorkerDataServicesClient } from './SharedWorkerDataServicesClient.js';

type Sent = Record<string, unknown>;

/**
 * A port that hands every request to `reply`, whose return value is posted
 * back as an `ssrm-rpc` event. Returning `undefined` means "no answer".
 */
function rpcPort(reply: (req: Sent) => Sent | undefined) {
  const sent: Sent[] = [];
  let onMessage: ((ev: MessageEvent) => void) | undefined;
  const port = {
    postMessage(req: Sent) {
      sent.push(req);
      const answer = reply(req);
      if (!answer) return;
      queueMicrotask(() =>
        onMessage?.({
          data: { kind: 'ssrm-rpc', reqId: req.reqId, ...answer },
        } as MessageEvent),
      );
    },
    start() {},
    close() {},
    addEventListener(_t: string, fn: (ev: MessageEvent) => void) {
      onMessage = fn;
    },
    removeEventListener() {},
  } as unknown as MessagePort;
  return {
    port,
    sent,
    /** Push an arbitrary event at the client, as the worker would. */
    emit: (data: unknown) => onMessage?.({ data } as MessageEvent),
  };
}

function clientFor(reply: (req: Sent) => Sent | undefined) {
  const harness = rpcPort(reply);
  const client = new SharedWorkerDataServicesClient(harness.port, {
    disablePageHideClose: true,
  });
  return { ...harness, client };
}

/** A hub that says yes to everything, with a plausible payload. */
const HAPPY = () => ({
  ok: true,
  getRows: { rowData: [{ id: '1' }], rowCount: 1 },
  statusBar: { totalRows: 1, filteredRows: 1, selectedRows: 0, aggregations: [], revision: 3 },
  setFilterValues: ['EMEA'],
});

let open: SharedWorkerDataServicesClient[] = [];
function track<T extends { client: SharedWorkerDataServicesClient }>(h: T): T {
  open.push(h.client);
  return h;
}

afterEach(() => {
  for (const c of open) c.close();
  open = [];
});

describe('ssrmGetRows', () => {
  it('returns the block the hub answered with', async () => {
    const { client, sent } = track(clientFor(HAPPY));

    await expect(client.ssrmGetRows('p1', 's1', { startRow: 0, endRow: 100 } as never))
      .resolves.toMatchObject({ rowCount: 1 });
    expect(sent[0]).toMatchObject({
      kind: 'ssrm-get-rows',
      providerId: 'p1',
      sessionId: 's1',
      request: { startRow: 0, endRow: 100 },
    });
  });

  it('throws the hub error when the query failed', async () => {
    const { client } = track(clientFor(() => ({ ok: false, error: 'no such provider' })));

    await expect(
      client.ssrmGetRows('p1', 's1', { startRow: 0, endRow: 1 } as never),
    ).rejects.toThrow('no such provider');
  });

  it('throws even when the hub failed without saying why', async () => {
    const { client } = track(clientFor(() => ({ ok: false })));

    await expect(
      client.ssrmGetRows('p1', 's1', { startRow: 0, endRow: 1 } as never),
    ).rejects.toThrow(/ssrm-get-rows failed/);
  });

  it('throws when the hub says ok but sends no block', async () => {
    // AG Grid would otherwise be handed `undefined` and spin on "Loading…".
    const { client } = track(clientFor(() => ({ ok: true })));

    await expect(
      client.ssrmGetRows('p1', 's1', { startRow: 0, endRow: 1 } as never),
    ).rejects.toThrow(/ssrm-get-rows failed/);
  });
});

describe('ssrmSetViewport', () => {
  it('posts the viewport without waiting for a reply', async () => {
    const { client, sent } = track(clientFor(() => undefined));

    await expect(client.ssrmSetViewport('p1', 's1', ['1', '2'])).resolves.toBeUndefined();
    expect(sent[0]).toMatchObject({ kind: 'ssrm-set-viewport', keys: ['1', '2'] });
    expect(sent[0]).not.toHaveProperty('scope');
  });

  it('carries the block scope when one is given', async () => {
    const { client, sent } = track(clientFor(() => undefined));
    await client.ssrmSetViewport('p1', 's1', ['1'], { blockKey: 'b0', queryId: 'q1' });

    expect(sent[0]).toMatchObject({ scope: { blockKey: 'b0', queryId: 'q1' } });
  });

  it('rejects rather than posting into a closed port', async () => {
    const { client } = track(clientFor(() => undefined));
    client.close();

    await expect(client.ssrmSetViewport('p1', 's1', ['1'])).rejects.toThrow(/client is closed/);
  });
});

describe('fire-and-check RPCs', () => {
  const cases: Array<[string, (c: SharedWorkerDataServicesClient) => Promise<unknown>, RegExp]> = [
    [
      'ssrm-configure-expressions',
      (c) => c.ssrmConfigureExpressions('p1', [{ id: 'r1' } as never], 's1'),
      /ssrm-configure-expressions failed/,
    ],
    [
      'ssrm-set-session-patches',
      (c) => c.ssrmSetSessionPatches('p1', 's1', [{ key: 'k', fields: { qty: 1 } }]),
      /ssrm-set-session-patches failed/,
    ],
    [
      'ssrm-set-session-exclude',
      (c) => c.ssrmSetSessionExclude('p1', 's1', 'qty > 1'),
      /ssrm-set-session-exclude failed/,
    ],
  ];

  it.each(cases)('%s resolves when the hub accepts it', async (kind, call) => {
    const { client, sent } = track(clientFor(() => ({ ok: true })));

    await expect(call(client)).resolves.toBeUndefined();
    expect(sent[0]).toMatchObject({ kind });
  });

  it.each(cases)('%s throws the hub error', async (_kind, call) => {
    const { client } = track(clientFor(() => ({ ok: false, error: 'plane gone' })));
    await expect(call(client)).rejects.toThrow('plane gone');
  });

  it.each(cases)('%s throws a named error when the hub gave none', async (_kind, call, message) => {
    const { client } = track(clientFor(() => ({ ok: false })));
    await expect(call(client)).rejects.toThrow(message);
  });

  it('omits the session id from configureExpressions when there is none', async () => {
    const { client, sent } = track(clientFor(() => ({ ok: true })));
    await client.ssrmConfigureExpressions('p1', []);

    expect(sent[0]).not.toHaveProperty('sessionId');
  });
});

describe('ssrmGetStatusBar', () => {
  it('returns the summary', async () => {
    const { client, sent } = track(clientFor(HAPPY));

    await expect(client.ssrmGetStatusBar('p1', { filterModel: {} } as never))
      .resolves.toMatchObject({ totalRows: 1 });
    expect(sent[0]).toMatchObject({ kind: 'ssrm-status-bar', request: { filterModel: {} } });
  });

  it('asks with no request at all', async () => {
    const { client, sent } = track(clientFor(HAPPY));
    await client.ssrmGetStatusBar('p1');

    expect(sent[0]).toMatchObject({ kind: 'ssrm-status-bar', request: undefined });
  });

  it('throws when the hub says ok but sends no summary', async () => {
    const { client } = track(clientFor(() => ({ ok: true })));
    await expect(client.ssrmGetStatusBar('p1')).rejects.toThrow(/ssrm-status-bar failed/);
  });

  it('throws the hub error', async () => {
    const { client } = track(clientFor(() => ({ ok: false, error: 'no plane' })));
    await expect(client.ssrmGetStatusBar('p1')).rejects.toThrow('no plane');
  });
});

describe('ssrmGetSetFilterValues', () => {
  it('returns the values and carries the session id', async () => {
    const { client, sent } = track(clientFor(HAPPY));

    await expect(client.ssrmGetSetFilterValues('p1', { column: 'region' } as never, 's1'))
      .resolves.toEqual(['EMEA']);
    expect(sent[0]).toMatchObject({ kind: 'ssrm-set-filter-values', sessionId: 's1' });
  });

  it('omits the session id when there is none', async () => {
    const { client, sent } = track(clientFor(HAPPY));
    await client.ssrmGetSetFilterValues('p1', { column: 'region' } as never);

    expect(sent[0]).not.toHaveProperty('sessionId');
  });

  it('throws when the hub answered with something that is not a list', async () => {
    const { client } = track(clientFor(() => ({ ok: true, setFilterValues: 'EMEA' })));

    await expect(
      client.ssrmGetSetFilterValues('p1', { column: 'region' } as never),
    ).rejects.toThrow(/ssrm-set-filter-values failed/);
  });

  it('throws the hub error', async () => {
    const { client } = track(clientFor(() => ({ ok: false, error: 'unknown column' })));
    await expect(
      client.ssrmGetSetFilterValues('p1', { column: 'nope' } as never),
    ).rejects.toThrow('unknown column');
  });
});

describe('onSsrmTick', () => {
  const tick = (subId: string, over: Record<string, unknown> = {}) => ({
    kind: 'ssrm-tick',
    subId,
    event: { type: 'rows' },
    interestedKeys: ['1'],
    ...over,
  });

  it('delivers a tick to the session that asked for it', () => {
    const { client, emit } = track(clientFor(() => undefined));
    const seen: unknown[] = [];
    client.onSsrmTick('s1', (p) => seen.push(p));

    emit(tick('s1'));
    expect(seen).toEqual([{ event: { type: 'rows' }, interestedKeys: ['1'] }]);
  });

  it("does not deliver another session's tick", () => {
    const { client, emit } = track(clientFor(() => undefined));
    const seen: unknown[] = [];
    client.onSsrmTick('s1', (p) => seen.push(p));

    emit(tick('s2'));
    expect(seen).toEqual([]);
  });

  it('carries alerts only when the worker found some', () => {
    const { client, emit } = track(clientFor(() => undefined));
    const seen: Array<Record<string, unknown>> = [];
    client.onSsrmTick('s1', (p) => seen.push(p as never));

    emit(tick('s1', { alerts: [] }));
    emit(tick('s1', { alerts: [{ rowId: 'r1', ruleId: 'a1' }] }));

    expect(seen[0]).not.toHaveProperty('alerts');
    expect(seen[1].alerts).toEqual([{ rowId: 'r1', ruleId: 'a1' }]);
  });

  it('fans one tick out to every listener on the session', () => {
    const { client, emit } = track(clientFor(() => undefined));
    const seen: string[] = [];
    client.onSsrmTick('s1', () => seen.push('a'));
    client.onSsrmTick('s1', () => seen.push('b'));

    emit(tick('s1'));
    expect(seen).toEqual(['a', 'b']);
  });

  it('keeps delivering to later listeners when an earlier one throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, emit } = track(clientFor(() => undefined));
    const seen: string[] = [];
    client.onSsrmTick('s1', () => {
      throw new Error('consumer blew up');
    });
    client.onSsrmTick('s1', () => seen.push('b'));

    emit(tick('s1'));
    expect(seen).toEqual(['b']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stops delivering once every listener has unsubscribed', () => {
    const { client, emit } = track(clientFor(() => undefined));
    const seen: string[] = [];
    const offA = client.onSsrmTick('s1', () => seen.push('a'));
    const offB = client.onSsrmTick('s1', () => seen.push('b'));

    offA();
    emit(tick('s1'));
    offB();
    emit(tick('s1'));

    expect(seen).toEqual(['b']);
  });
});

describe('close', () => {
  it('rejects every RPC still in flight', async () => {
    const { client } = track(clientFor(() => undefined));
    const pending = client.ssrmGetRows('p1', 's1', { startRow: 0, endRow: 1 } as never);
    client.close();

    await expect(pending).rejects.toThrow(/client closed/);
  });

  it('refuses new RPCs', async () => {
    const { client } = track(clientFor(HAPPY));
    client.close();

    await expect(client.ssrmGetStatusBar('p1')).rejects.toThrow(/client is closed/);
  });

  it('is safe to close twice', () => {
    const { client } = track(clientFor(() => undefined));
    client.close();
    expect(() => client.close()).not.toThrow();
  });
});
