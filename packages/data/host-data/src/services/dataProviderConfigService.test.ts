/**
 * dataProviderConfigService — visibility merge tests.
 *
 * The service talks to a unified-config REST API for everything else;
 * here we focus on the public/private merge pure logic in `listVisible`,
 * which is the surface the DataProviderSelector hits and the easiest to
 * regress when scope plumbing shifts.
 *
 * Strategy: stub `getByUser` so the service's HTTP calls are bypassed
 * and we drive the merge directly. The dedup, subtype-filter, and
 * "system caller doesn't double-fetch" branches are each covered.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProviderConfigService } from './dataProviderConfigService';
import type { DataProviderConfig } from '@wellsfargo-starui/types';

function provider(
  id: string,
  userId: string,
  type: DataProviderConfig['providerType'] = 'stomp',
  extras: Partial<DataProviderConfig> = {},
): DataProviderConfig {
  return {
    providerId: id,
    name: id,
    providerType: type,
    config: {} as DataProviderConfig['config'],
    userId,
    public: userId === 'system',
    ...extras,
  };
}

describe('dataProviderConfigService.listVisible', () => {
  let service: DataProviderConfigService;
  let getByUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new DataProviderConfigService();
    getByUser = vi.fn();
    // Replace the network-bound method with our stub. The merge logic
    // we're testing only consumes its return values.
    (service as unknown as { getByUser: typeof getByUser }).getByUser = getByUser;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns public + user providers when caller is a regular user', async () => {
    getByUser.mockImplementation(async (uid: string) => {
      if (uid === 'system') return [provider('p1', 'system'), provider('p2', 'system')];
      if (uid === 'alice') return [provider('p3', 'alice')];
      return [];
    });

    const out = await service.listVisible('alice');
    const ids = out.map((p) => p.providerId).sort();
    expect(ids).toEqual(['p1', 'p2', 'p3']);
  });

  it('skips the second fetch when caller IS the system sentinel', async () => {
    getByUser.mockImplementation(async () => [provider('p1', 'system')]);

    await service.listVisible('system');
    // listVisible kicks off both fetches in Promise.all but resolves the
    // user-side branch to [] when caller === system, so getByUser is
    // only invoked once (for 'system').
    expect(getByUser).toHaveBeenCalledTimes(1);
    expect(getByUser).toHaveBeenCalledWith('system');
  });

  it('dedupes by providerId — public wins over a private row sharing the id', async () => {
    getByUser.mockImplementation(async (uid: string) => {
      if (uid === 'system') return [provider('shared-id', 'system', 'stomp', { name: 'Public' })];
      if (uid === 'alice') return [provider('shared-id', 'alice', 'stomp', { name: 'Private' })];
      return [];
    });

    const out = await service.listVisible('alice');
    expect(out).toHaveLength(1);
    // Public came first in the merged list (system fetched first).
    expect(out[0].name).toBe('Public');
    expect(out[0].userId).toBe('system');
  });

  it('falls back to a synthetic dedup key when providerId is missing', async () => {
    getByUser.mockImplementation(async (uid: string) => {
      if (uid === 'system') {
        return [provider('', 'system', 'stomp', { providerId: undefined, name: 'duplicate' })];
      }
      if (uid === 'alice') {
        return [provider('', 'alice', 'stomp', { providerId: undefined, name: 'duplicate' })];
      }
      return [];
    });

    const out = await service.listVisible('alice');
    // Both entries have name='duplicate' and providerType='stomp', so the
    // synthetic key `${name}::${providerType}` collides and only the
    // public one survives.
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe('system');
  });

  it('filters by subtype after dedup', async () => {
    getByUser.mockImplementation(async (uid: string) => {
      if (uid === 'system') return [provider('p1', 'system', 'stomp'), provider('p2', 'system', 'rest')];
      if (uid === 'alice') return [provider('p3', 'alice', 'stomp')];
      return [];
    });

    const stompOnly = await service.listVisible('alice', { subtype: 'stomp' });
    expect(stompOnly.map((p) => p.providerId).sort()).toEqual(['p1', 'p3']);

    const restOnly = await service.listVisible('alice', { subtype: 'rest' });
    expect(restOnly.map((p) => p.providerId)).toEqual(['p2']);
  });

  it('preserves public-first ordering in the merged list', async () => {
    getByUser.mockImplementation(async (uid: string) => {
      if (uid === 'system') return [provider('s1', 'system')];
      if (uid === 'alice') return [provider('a1', 'alice'), provider('a2', 'alice')];
      return [];
    });

    const out = await service.listVisible('alice');
    expect(out.map((p) => p.providerId)).toEqual(['s1', 'a1', 'a2']);
  });

  it('returns empty when neither scope has any rows', async () => {
    getByUser.mockResolvedValue([]);
    const out = await service.listVisible('alice');
    expect(out).toEqual([]);
  });
});
