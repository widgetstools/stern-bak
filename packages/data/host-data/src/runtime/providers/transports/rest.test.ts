/**
 * REST provider tests — focus on the request shape, response
 * parsing, and the snapshot-only lifecycle.
 *
 * `fetchImpl` is injected throughout so the test runner doesn't
 * need a real HTTP stack.
 */

import { describe, it, expect } from 'vitest';
import { startRest, probeRest } from './rest';
import type { ProviderEmitEvent } from '../Provider';
import type { RestProviderConfig } from '@wellsfargo-starui/types';

function cfg(overrides: Partial<RestProviderConfig> = {}): RestProviderConfig {
  return {
    providerType: 'rest',
    baseUrl: 'http://api.test',
    endpoint: '/positions',
    method: 'GET',
    keyColumn: 'id',
    ...overrides,
  } as RestProviderConfig;
}

interface FetchCall {
  url: string;
  init: RequestInit;
}

function makeFetch(responder: (call: FetchCall) => { status: number; body: string }): {
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const call = { url, init };
    calls.push(call);
    const r = responder(call);
    return new Response(r.body, { status: r.status });
  };
  return { fetchImpl, calls };
}

async function flush(): Promise<void> {
  // The Response.text() chain bottoms out on a stream read, which in
  // jsdom + undici needs a real macrotask hop before resolving.
  // setImmediate isn't available everywhere; setTimeout(0) is.
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

describe('startRest', () => {
  it('emits loading → rows (replace) → ready for a JSON-array response', async () => {
    const { fetchImpl } = makeFetch(() => ({ status: 200, body: JSON.stringify([{ id: 'a' }, { id: 'b' }]) }));
    const events: ProviderEmitEvent[] = [];
    startRest(cfg(), (e) => events.push(e), { fetchImpl });
    await flush();

    const order = events.map((e) =>
      'status' in e ? `s:${e.status}`
      : 'rows' in e ? `r:${e.rows.length}${e.replace ? '!' : ''}`
      : 'b'
    );
    expect(order).toEqual(['s:loading', 'r:2!', 'b', 's:ready']);
  });

  it('walks rowsPath into nested response bodies', async () => {
    const body = { meta: { count: 2 }, data: { results: [{ id: 'x' }, { id: 'y' }] } };
    const { fetchImpl } = makeFetch(() => ({ status: 200, body: JSON.stringify(body) }));
    const events: ProviderEmitEvent[] = [];
    startRest(cfg({ rowsPath: 'data.results' }), (e) => events.push(e), { fetchImpl });
    await flush();

    const replace = events.find((e) => 'rows' in e && e.replace) as { rows: unknown[] };
    expect(replace.rows).toHaveLength(2);
    expect(replace.rows).toEqual([{ id: 'x' }, { id: 'y' }]);
  });

  it('builds query params from cfg.queryParams', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: '[]' }));
    startRest(
      cfg({ queryParams: { symbol: 'AAPL', limit: '10' } }),
      () => undefined,
      { fetchImpl },
    );
    await flush();
    expect(calls[0].url).toBe('http://api.test/positions?symbol=AAPL&limit=10');
  });

  it('attaches bearer auth when configured', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: '[]' }));
    startRest(
      cfg({ auth: { type: 'bearer', credentials: 'tok123' } }),
      () => undefined,
      { fetchImpl },
    );
    await flush();
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok123');
  });

  it('surfaces non-2xx responses as status:error', async () => {
    const { fetchImpl } = makeFetch(() => ({ status: 500, body: 'boom' }));
    const events: ProviderEmitEvent[] = [];
    startRest(cfg(), (e) => events.push(e), { fetchImpl });
    await flush();
    const err = events.find((e) => 'status' in e && e.status === 'error') as { error?: string };
    expect(err.error).toMatch(/500/);
  });

  it('restart() merges overlay into POST body and refetches', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: '[]' }));
    const handle = startRest(
      cfg({ method: 'POST', body: '{"clientId":"X"}' }),
      () => undefined,
      { fetchImpl },
    );
    await flush();
    await handle.restart({ asOfDate: '2026-04-01' });
    await flush();

    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ clientId: 'X', asOfDate: '2026-04-01' });
  });

  it('stop() prevents further fetches and silences emits after', async () => {
    let resolveBody: (() => void) | null = null;
    const fetchImpl = (_url: string): Promise<Response> => new Promise((resolve) => {
      // Hold the response open until we manually release.
      resolveBody = () => resolve(new Response('[]', { status: 200 }));
    });
    const events: ProviderEmitEvent[] = [];
    const handle = startRest(cfg(), (e) => events.push(e), { fetchImpl });
    await Promise.resolve();
    await handle.stop();
    resolveBody?.();
    await flush();

    // No 'ready' should fire after stop.
    expect(events.find((e) => 'status' in e && e.status === 'ready')).toBeFalsy();
  });
});

describe('probeRest', () => {
  it('resolves with rows on success', async () => {
    const { fetchImpl } = makeFetch(() => ({ status: 200, body: JSON.stringify([{ id: 'r1' }]) }));
    const result = await probeRest(cfg(), { fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([{ id: 'r1' }]);
  });

  it('resolves with error on non-2xx', async () => {
    const { fetchImpl } = makeFetch(() => ({ status: 404, body: '' }));
    const result = await probeRest(cfg(), { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/404/);
  });
});
