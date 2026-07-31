/**
 * `DataProviderConfigService` CRUD across both backends.
 *
 * The service is one API over two very different stores, and the
 * mapping between `DataProviderConfig` and the persisted `UnifiedConfig`
 * envelope is where the behaviour lives:
 *
 *   • `userId` is the authoritative visibility signal — a public
 *     provider is stored under the `'system'` sentinel. The `public`
 *     flag mirrored inside `payload.__providerMeta` is informational, so
 *     a row whose mirror disagrees with its userId must read back
 *     according to the userId.
 *   • local `update` is read-merge-write, because the PUT body
 *     deliberately omits immutable fields (createdBy, creationTime,
 *     appId) that the backend must not lose.
 *   • `expectLocalBackend()` makes CRUD calls WAIT rather than falling
 *     through to REST, so a component that fires before the app finished
 *     wiring its IndexedDB backend doesn't silently hit the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataProviderConfigService,
  dataProviderConfigService,
  type DataProviderLocalBackend,
} from './dataProviderConfigService.js';
import type { UnifiedConfig } from '@wellsfargo-starui/types';
import type { DataProviderConfig } from '@wellsfargo-starui/types';

const DEFAULT_BASE = 'http://localhost:3001/api/v1/configurations';

function provider(overrides: Partial<DataProviderConfig> = {}): DataProviderConfig {
  return {
    providerId: 'p1',
    name: 'Positions feed',
    description: 'the desk feed',
    providerType: 'stomp',
    config: { providerType: 'stomp', websocketUrl: 'wss://feed' } as DataProviderConfig['config'],
    tags: ['desk'],
    isDefault: true,
    public: false,
    ...overrides,
  };
}

function unified(overrides: Partial<UnifiedConfig> = {}): UnifiedConfig {
  return {
    configId: 'p1',
    appId: 'star-platform',
    userId: 'alice',
    componentType: 'data-provider',
    componentSubType: 'stomp',
    isTemplate: false,
    displayText: 'Positions feed',
    payload: {
      websocketUrl: 'wss://feed',
      __providerMeta: { description: 'the desk feed', tags: ['desk'], isDefault: true, public: false },
    },
    createdBy: 'alice',
    updatedBy: 'alice',
    ...overrides,
  } as UnifiedConfig;
}

/** In-memory local backend — the shape `ConfigManager` implements. */
function memoryBackend(seed: UnifiedConfig[] = []) {
  const rows = new Map(seed.map((r) => [r.configId, r]));
  const backend: DataProviderLocalBackend = {
    upsert: vi.fn(async (row: UnifiedConfig) => { rows.set(row.configId, row); return row; }),
    delete: vi.fn(async (configId: string) => { rows.delete(configId); }),
    getById: vi.fn(async (configId: string) => rows.get(configId) ?? null),
    listByUser: vi.fn(async (userId: string) =>
      [...rows.values()].filter((r) => r.userId === userId)),
  };
  return { backend, rows };
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

let service: DataProviderConfigService;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  service = new DataProviderConfigService();
  fetchMock = vi.fn(async () => jsonResponse(unified()));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('configuration', () => {
  it('exports a shared singleton in REST mode by default', () => {
    expect(dataProviderConfigService).toBeInstanceOf(DataProviderConfigService);
    expect(dataProviderConfigService.isLocal).toBe(false);
  });

  it('targets localhost:3001 until told otherwise', async () => {
    await service.getById('p1');
    expect(fetchMock).toHaveBeenCalledWith(`${DEFAULT_BASE}/p1`);
  });

  it('rebases every route on the configured API URL', async () => {
    service.configure({ apiUrl: 'https://cfg.example' });
    await service.getById('p1');
    expect(fetchMock).toHaveBeenCalledWith('https://cfg.example/api/v1/configurations/p1');
  });

  it('strips trailing slashes so the path never doubles up', async () => {
    service.configure({ apiUrl: 'https://cfg.example///' });
    await service.getById('p1');
    expect(fetchMock).toHaveBeenCalledWith('https://cfg.example/api/v1/configurations/p1');
  });

  it('reports local mode once a backend is set, and reverts on undefined', () => {
    const { backend } = memoryBackend();
    expect(service.isLocal).toBe(false);
    service.configureLocal(backend);
    expect(service.isLocal).toBe(true);
    service.configureLocal(undefined);
    expect(service.isLocal).toBe(false);
  });
});

describe('expectLocalBackend', () => {
  it('holds a CRUD call until the backend is wired, then routes it locally', async () => {
    service.expectLocalBackend();
    const { backend } = memoryBackend([unified()]);

    const pending = service.getById('p1');
    // Nothing has resolved yet — and critically, no REST call was made.
    expect(fetchMock).not.toHaveBeenCalled();

    service.configureLocal(backend);
    const got = await pending;

    expect(got?.providerId).toBe('p1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is idempotent — a second call does not replace the pending promise', async () => {
    service.expectLocalBackend();
    service.expectLocalBackend();
    const { backend } = memoryBackend([unified()]);

    const pending = service.getById('p1');
    service.configureLocal(backend);

    await expect(pending).resolves.not.toBeNull();
  });

  it('releases the wait even when the app decides to stay on REST', async () => {
    service.expectLocalBackend();
    const pending = service.getById('p1');

    service.configureLocal(undefined);

    await pending;
    expect(fetchMock).toHaveBeenCalled();
  });

  it('costs nothing for a REST-only app', async () => {
    await service.getById('p1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('REST mode', () => {
  it('POSTs a unified envelope on create', async () => {
    await service.create(provider(), 'alice');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(DEFAULT_BASE);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      configId: 'p1',
      appId: 'star-platform',
      userId: 'alice',
      componentType: 'data-provider',
      componentSubType: 'stomp',
      isTemplate: false,
      displayText: 'Positions feed',
      createdBy: 'alice',
      updatedBy: 'alice',
    });
    // Provider-only fields ride inside the opaque payload.
    expect(body.payload.__providerMeta).toEqual({
      description: 'the desk feed',
      tags: ['desk'],
      isDefault: true,
      public: false,
    });
    expect(body.payload.websocketUrl).toBe('wss://feed');
  });

  it('stores a public provider under the system sentinel, not the caller', async () => {
    await service.create(provider({ public: true }), 'alice');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.userId).toBe('system');
    // Audit still names the real author.
    expect(body.createdBy).toBe('alice');
  });

  it('refuses an unknown provider type instead of writing a subtype-less row', async () => {
    await expect(
      service.create(provider({ providerType: 'kafka' as DataProviderConfig['providerType'] }), 'alice'),
    ).rejects.toThrow('Unknown provider type: kafka');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the status code when create fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
    await expect(service.create(provider(), 'alice')).rejects.toThrow('Failed to create provider (500)');
  });

  it('PUTs only the mutable fields on update', async () => {
    await service.update('p1', { name: 'Renamed', providerType: 'rest', tags: ['x'] }, 'alice');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/p1`);
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      configId: 'p1',
      displayText: 'Renamed',
      updatedBy: 'alice',
      componentSubType: 'rest',
    });
    // Immutable fields are deliberately absent from the PUT body.
    expect(body.createdBy).toBeUndefined();
    expect(body.appId).toBeUndefined();
  });

  it('omits componentSubType when the update does not change the type', async () => {
    await service.update('p1', { name: 'Renamed' }, 'alice');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect('componentSubType' in body).toBe(false);
  });

  it('surfaces the status code when update fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 409 }));
    await expect(service.update('p1', {}, 'alice')).rejects.toThrow('Failed to update provider (409)');
  });

  it('DELETEs by id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));
    await service.delete('p1');
    expect(fetchMock).toHaveBeenCalledWith(`${DEFAULT_BASE}/p1`, { method: 'DELETE' });
  });

  it('surfaces the status code when delete fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 403 }));
    await expect(service.delete('p1')).rejects.toThrow('Failed to delete provider (403)');
  });

  it('decodes a fetched row back into a DataProviderConfig', async () => {
    const got = await service.getById('p1');
    expect(got).toEqual({
      providerId: 'p1',
      name: 'Positions feed',
      description: 'the desk feed',
      providerType: 'stomp',
      config: { websocketUrl: 'wss://feed' },
      tags: ['desk'],
      isDefault: true,
      userId: 'alice',
      public: false,
    });
  });

  it('returns null — not an error — for a 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, { ok: false, status: 404 }));
    expect(await service.getById('missing')).toBeNull();
  });

  it('surfaces any other non-2xx on getById', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, { ok: false, status: 500 }));
    await expect(service.getById('p1')).rejects.toThrow('Failed to fetch provider (500)');
  });

  it('refuses a row whose componentSubType maps to no provider type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(unified({ componentSubType: 'kafka' })));
    await expect(service.getById('p1')).rejects.toThrow('Unknown component subtype: kafka');
  });

  it('queries by-user with includeDeleted=false and filters foreign componentTypes', async () => {
    fetchMock.mockResolvedValue(jsonResponse([
      unified({ configId: 'a' }),
      unified({ configId: 'b', componentType: 'DataProvider' }),
      unified({ configId: 'c', componentType: 'datasource' }),
      unified({ configId: 'd', componentType: 'grid' }),
      unified({ configId: 'e', componentType: undefined as unknown as string }),
    ]));

    const out = await service.getByUser('alice');

    expect(fetchMock).toHaveBeenCalledWith(`${DEFAULT_BASE}/by-user/alice?includeDeleted=false`);
    // The three data-provider spellings survive; grid and the typeless row do not.
    expect(out.map((p) => p.providerId)).toEqual(['a', 'b', 'c']);
  });

  it('surfaces a failed by-user query', async () => {
    fetchMock.mockResolvedValue(jsonResponse([], { ok: false, status: 500 }));
    await expect(service.getByUser('alice')).rejects.toThrow('Failed to fetch providers (500)');
  });

  it('reads public from the userId column, not the payload mirror', async () => {
    // A row stored under 'system' IS public even if the mirror says
    // otherwise — the column is authoritative.
    fetchMock.mockResolvedValue(jsonResponse(unified({ userId: 'system' })));
    const got = await service.getById('p1');
    expect(got?.public).toBe(true);
  });

  it('tolerates a row with no payload at all', async () => {
    fetchMock.mockResolvedValue(jsonResponse(unified({ payload: undefined })));
    const got = await service.getById('p1');
    expect(got?.config).toEqual({});
    expect(got?.description).toBeUndefined();
    expect(got?.tags).toBeUndefined();
    expect(got?.isDefault).toBe(false);
  });
});

describe('local mode', () => {
  it('creates through the backend and never touches fetch', async () => {
    const { backend, rows } = memoryBackend();
    service.configureLocal(backend);

    const created = await service.create(provider(), 'alice');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows.get('p1')?.userId).toBe('alice');
    expect(created.providerId).toBe('p1');
  });

  it('reads and lists through the backend', async () => {
    const { backend } = memoryBackend([
      unified({ configId: 'a' }),
      unified({ configId: 'b', componentType: 'grid' }),
      unified({ configId: 'c', userId: 'system' }),
    ]);
    service.configureLocal(backend);

    expect((await service.getById('a'))?.providerId).toBe('a');
    expect(await service.getById('nope')).toBeNull();
    // Foreign componentTypes are filtered out here exactly as in REST mode.
    expect((await service.getByUser('alice')).map((p) => p.providerId)).toEqual(['a']);
    expect(backend.listByUser).toHaveBeenCalledWith('alice');
  });

  it('deletes through the backend', async () => {
    const { backend, rows } = memoryBackend([unified()]);
    service.configureLocal(backend);

    await service.delete('p1');

    expect(rows.has('p1')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('read-merge-writes on update so immutable fields survive', async () => {
    const { backend, rows } = memoryBackend([
      unified({ createdBy: 'original-author', appId: 'star-platform' }),
    ]);
    service.configureLocal(backend);

    await service.update('p1', { name: 'Renamed', config: { url: 'wss://new' } as never }, 'bob');

    const stored = rows.get('p1')!;
    expect(stored.displayText).toBe('Renamed');
    expect(stored.updatedBy).toBe('bob');
    // The PUT body omits these; a naive overwrite would drop them.
    expect(stored.createdBy).toBe('original-author');
    expect(stored.appId).toBe('star-platform');
    expect(stored.payload).toMatchObject({ url: 'wss://new' });
  });

  it('keeps the existing owner when the update does not touch visibility', async () => {
    const { backend, rows } = memoryBackend([unified({ userId: 'carol' })]);
    service.configureLocal(backend);

    await service.update('p1', { name: 'Renamed' }, 'bob');

    expect(rows.get('p1')?.userId).toBe('carol');
  });

  it('moves the row to the system sentinel when it is made public', async () => {
    const { backend, rows } = memoryBackend([unified({ userId: 'alice' })]);
    service.configureLocal(backend);

    await service.update('p1', { public: true }, 'alice');

    expect(rows.get('p1')?.userId).toBe('system');
  });

  it('moves the row back to the caller when it is made private', async () => {
    const { backend, rows } = memoryBackend([unified({ userId: 'system' })]);
    service.configureLocal(backend);

    await service.update('p1', { public: false }, 'bob');

    expect(rows.get('p1')?.userId).toBe('bob');
  });

  it('reports a missing row on update rather than creating one', async () => {
    const { backend, rows } = memoryBackend();
    service.configureLocal(backend);

    await expect(service.update('ghost', { name: 'x' }, 'alice'))
      .rejects.toThrow('Failed to update provider (not found: ghost)');
    expect(rows.size).toBe(0);
  });
});

describe('search', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse([
      unified({ configId: 'a', displayText: 'Positions', payload: { __providerMeta: { description: 'desk feed', tags: ['fi'] } } }),
      unified({ configId: 'b', displayText: 'Trades', payload: { __providerMeta: { description: 'blotter', tags: ['ops'] } } }),
      unified({ configId: 'c', displayText: 'Orders', payload: {} }),
    ]));
  });

  it('matches on name, case-insensitively', async () => {
    expect((await service.search('POSITIONS', 'alice')).map((p) => p.providerId)).toEqual(['a']);
  });

  it('matches on description', async () => {
    expect((await service.search('blotter', 'alice')).map((p) => p.providerId)).toEqual(['b']);
  });

  it('matches on tags', async () => {
    expect((await service.search('ops', 'alice')).map((p) => p.providerId)).toEqual(['b']);
  });

  it('returns nothing when the term matches nothing, without tripping on tagless rows', async () => {
    expect(await service.search('zzz', 'alice')).toEqual([]);
  });

  it('returns everything for an empty term', async () => {
    expect((await service.search('', 'alice'))).toHaveLength(3);
  });
});
