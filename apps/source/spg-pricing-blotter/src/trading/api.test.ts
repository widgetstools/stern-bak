import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPG_SERVER_URL, lookupPositions, postUpdates, serverHealth } from './api';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe('postUpdates', () => {
  it('posts the batch as JSON and returns the per-row results', async () => {
    fetchMock.mockResolvedValue(ok({ results: [{ cusip: 'C1', ok: true }] }));

    const result = await postUpdates([{ cusip: 'C1', fields: { price: 99.5 } }]);

    expect(fetchMock).toHaveBeenCalledWith(`${SPG_SERVER_URL}/api/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [{ cusip: 'C1', fields: { price: 99.5 } }] }),
    });
    expect(result.results).toEqual([{ cusip: 'C1', ok: true }]);
  });

  /**
   * A refused write has to reject, not resolve with a body: the write path
   * turns the cells red off the rejection, and swallowing it would leave the
   * trader looking at a yellow "at the server" border forever.
   */
  it('rejects with the path and status when the server refuses', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(postUpdates([])).rejects.toThrow('/api/updates → HTTP 503');
  });

  it('lets a transport failure through', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    await expect(postUpdates([])).rejects.toThrow('connection refused');
  });
});

describe('lookupPositions', () => {
  it('asks the server which cusips exist before anything touches the grid', async () => {
    fetchMock.mockResolvedValue(ok({ found: [{ cusip: 'C1', price: 1, priorPrice: 1 }], missing: ['C9'] }));

    const result = await lookupPositions(['C1', 'C9']);

    expect(fetchMock).toHaveBeenCalledWith(`${SPG_SERVER_URL}/api/lookup`, expect.objectContaining({
      body: JSON.stringify({ cusips: ['C1', 'C9'] }),
    }));
    expect(result.missing).toEqual(['C9']);
  });

  it('rejects on a non-2xx lookup', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    await expect(lookupPositions([])).rejects.toThrow('/api/lookup → HTTP 400');
  });
});

/**
 * The health probe runs on a 5s interval behind a status chip, so "server is
 * down" has to be a `null`, never a throw — an unhandled rejection every five
 * seconds is how a stopped server takes the page with it.
 */
describe('serverHealth', () => {
  it('reports the row count and ack delay when the server answers', async () => {
    fetchMock.mockResolvedValue(ok({ rows: 5000, ackDelayMs: 250 }));
    await expect(serverHealth()).resolves.toEqual({ rows: 5000, ackDelayMs: 250 });
    expect(fetchMock).toHaveBeenCalledWith(`${SPG_SERVER_URL}/health`);
  });

  it('answers null for a non-2xx health response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(serverHealth()).resolves.toBeNull();
  });

  it('answers null when the server is not listening at all', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(serverHealth()).resolves.toBeNull();
  });
});
