import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkScenarioHealth, defaultScenarioBaseUrl, fetchBookSummary, findWorstMove, forkMarket,
  runScan, ScenarioServiceError, SCENARIO_BASE_URL_KEY,
} from './scenarioClient';

const BASE = 'http://svc.test:8081';
const originalFetch = globalThis.fetch;

function respond(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'Bad Request',
    json: async () => body,
  } as Response;
}

let calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as unknown as typeof fetch;
}

describe('configuration', () => {
  it('defaults to the service\'s own port and exposes a stable storage key', () => {
    expect(defaultScenarioBaseUrl()).toBe('http://127.0.0.1:8081');
    expect(SCENARIO_BASE_URL_KEY).toBe('starui.scenario.baseUrl');
  });
});

describe('checkScenarioHealth', () => {
  it('is true when the service answers', async () => {
    mockFetch(() => respond({ ok: true }));
    expect(await checkScenarioHealth(BASE)).toBe(true);
    expect(calls[0]?.url).toBe(`${BASE}/health`);
  });

  it('is false rather than throwing when it does not', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;
    expect(await checkScenarioHealth(BASE)).toBe(false);
  });

  it('is false on a non-ok response', async () => {
    mockFetch(() => respond({}, { ok: false, status: 503 }));
    expect(await checkScenarioHealth(BASE)).toBe(false);
  });
});

describe('requests', () => {
  it('GETs the book summary', async () => {
    mockFetch(() => respond({ positionCount: 1758, marketValue: 2.28e10 }));
    const summary = await fetchBookSummary(BASE);
    expect(summary.positionCount).toBe(1758);
    expect(calls[0]?.url).toBe(`${BASE}/api/book/summary`);
    expect(calls[0]?.init?.method).toBe('GET');
  });

  it('POSTs a scan with its arguments as JSON', async () => {
    mockFetch(() => respond({ worlds: 200 }));
    await runScan(BASE, { worlds: 200, horizonDays: 20 });
    expect(calls[0]?.url).toBe(`${BASE}/api/scenario/scan`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ worlds: 200, horizonDays: 20 });
  });

  it('POSTs a worst-case search and a fork to their own routes', async () => {
    mockFetch(() => respond({}));
    await findWorstMove(BASE, { radius: 3 });
    await forkMarket(BASE, { name: 'hot CPI', shock: { level: 0.3 } });
    expect(calls[0]?.url).toBe(`${BASE}/api/scenario/worst`);
    expect(calls[1]?.url).toBe(`${BASE}/api/scenario/fork`);
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({ name: 'hot CPI' });
  });

  it('tolerates a trailing slash on the configured URL', async () => {
    mockFetch(() => respond({}));
    await fetchBookSummary(`${BASE}/`);
    expect(calls[0]?.url).toBe(`${BASE}/api/book/summary`);
  });
});

describe('failures', () => {
  it('turns an unreachable service into a sentence naming the URL and the fix', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;
    await expect(runScan(BASE, {})).rejects.toThrow(ScenarioServiceError);
    await expect(runScan(BASE, {})).rejects.toThrow(/is not reachable/);
    await expect(runScan(BASE, {})).rejects.toThrow(new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(runScan(BASE, {})).rejects.toThrow(/fi-trading-service/);
  });

  it('relays the service\'s own rejection message', async () => {
    mockFetch(() => respond({ error: 'A fork needs a shock' }, { ok: false, status: 400 }));
    await expect(forkMarket(BASE, { shock: {} })).rejects.toThrow(/A fork needs a shock/);
  });

  it('falls back to the status text when the body is not JSON', async () => {
    globalThis.fetch = (() => Promise.resolve({
      ok: false, status: 500, statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response)) as unknown as typeof fetch;
    await expect(runScan(BASE, {})).rejects.toThrow(/Internal Server Error/);
  });

  it('carries the base URL on the error, so a caller can name it', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('boom'))) as unknown as typeof fetch;
    await runScan(BASE, {}).catch((error: unknown) => {
      expect((error as ScenarioServiceError).baseUrl).toBe(BASE);
      expect((error as ScenarioServiceError).name).toBe('ScenarioServiceError');
    });
  });
});
