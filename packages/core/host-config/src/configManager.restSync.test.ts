/**
 * REST-mode sync tests for `ConfigManager`.
 *
 * REST mode is "write to the server, then mirror into Dexie". Everything
 * interesting lives in the failure paths, which the manager deliberately
 * swallows so a config write never blocks the UI on a flaky backend:
 *
 *   - a non-2xx / thrown fetch is logged and QUEUED in `pendingSync`,
 *     while the local Dexie write still lands;
 *   - a 412 is the one status that is NOT queued — it means the row moved
 *     on under the editor, and the caller must be told;
 *   - the drain loop retries queued entries every 10s, deleting them on
 *     success, counting them up on failure, and giving up after
 *     `MAX_SYNC_RETRIES`.
 *
 * `fetch` is stubbed per test; the IndexedDB is deleted between tests
 * because `ConfigManager` always opens the same shared database name.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import { OptimisticLockError } from './errors';
import { MAX_SYNC_RETRIES, PENDING_SYNC_INTERVAL_MS } from './configManagerInternals';
import type { PendingSyncRow, RoleRow } from './types';

const REST_URL = 'https://config.example/api/v1';

function role(roleId: string): RoleRow {
  return { roleId, displayName: roleId, permissionIds: [] };
}

function okResponse(body: unknown = {}): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function errorResponse(status: number, json?: () => Promise<unknown>): Response {
  return {
    ok: false,
    status,
    json: json ?? (async () => ({})),
  } as unknown as Response;
}

/** Drop the shared IndexedDB so each test starts with an empty queue. */
function deleteSharedDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('marketsui-config');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** The pendingSync table is private to the manager; read it directly. */
function pendingSyncTable(cm: ConfigManager) {
  return (cm as unknown as { db: { pendingSync: {
    toArray(): Promise<PendingSyncRow[]>;
    add(row: PendingSyncRow): Promise<number>;
  } } }).db.pendingSync;
}

describe('ConfigManager — REST sync', () => {
  let cm: ConfigManager;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await deleteSharedDb();
    fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    // The manager narrates every failure through console; keep the test
    // output readable without losing the assertions below.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice' },
      configServiceRestUrl: REST_URL,
    });
  });

  afterEach(() => {
    cm.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('outbound writes', () => {
    it('reports REST mode', () => {
      expect(cm.isRestMode()).toBe(true);
      expect(createConfigManager({}).isRestMode()).toBe(false);
    });

    it('PUTs an upsert to <restUrl>/<table>/<id> and still writes locally', async () => {
      await cm.saveRole(role('admin'));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${REST_URL}/roles/admin`);
      expect(init.method).toBe('PUT');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body as string)).toMatchObject({ roleId: 'admin' });

      expect((await cm.getRole('admin'))?.displayName).toBe('admin');
    });

    it('DELETEs with no body', async () => {
      await cm.saveRole(role('admin'));
      fetchMock.mockClear();

      await cm.deleteRole('admin');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${REST_URL}/roles/admin`);
      expect(init.method).toBe('DELETE');
      expect(init.body).toBeUndefined();
      expect(await cm.getRole('admin')).toBeUndefined();
    });

    it('routes each auth table to its own REST path', async () => {
      await cm.saveAppRegistry({
        appId: 'TestApp',
        displayName: 'Test',
        manifestUrl: 'https://x/manifest.json',
        configServiceEnabled: true,
        environment: 'dev',
      });
      await cm.saveUserProfile({
        userId: 'alice',
        appId: 'TestApp',
        roleIds: ['admin'],
        displayName: 'Alice',
      });
      await cm.savePermission({ permissionId: 'config:read', description: 'read', category: 'config' });
      await cm.deleteAppRegistry('TestApp');
      await cm.deleteUserProfile('alice');
      await cm.deletePermission('config:read');

      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        `${REST_URL}/app-registry/TestApp`,
        `${REST_URL}/user-profiles/alice`,
        `${REST_URL}/permissions/config:read`,
        `${REST_URL}/app-registry/TestApp`,
        `${REST_URL}/user-profiles/alice`,
        `${REST_URL}/permissions/config:read`,
      ]);
    });

    it('attaches the bearer token the host supplies', async () => {
      const withToken = createConfigManager({
        configServiceRestUrl: REST_URL,
        identity: { userId: 'alice', getAccessToken: async () => 'tok-123' },
      });
      await withToken.saveRole(role('admin'));
      withToken.dispose();

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
    });

    it('omits Authorization when the host returns no token', async () => {
      const noToken = createConfigManager({
        configServiceRestUrl: REST_URL,
        identity: { userId: 'alice', getAccessToken: async () => undefined },
      });
      await noToken.saveRole(role('admin'));
      noToken.dispose();

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });
  });

  describe('failure handling', () => {
    it('queues a non-2xx write for retry and still lands the local write', async () => {
      fetchMock.mockResolvedValue(errorResponse(500));

      await cm.saveRole(role('admin'));

      // The caller is NOT told — a flaky backend must not block editing.
      expect((await cm.getRole('admin'))?.roleId).toBe('admin');
      const queued = await pendingSyncTable(cm).toArray();
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({
        operation: 'upsert',
        tableName: 'roles',
        recordId: 'admin',
        retries: 0,
      });
    });

    it('queues a thrown fetch (offline) the same way', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await cm.saveRole(role('admin'));

      const queued = await pendingSyncTable(cm).toArray();
      expect(queued).toHaveLength(1);
      expect(queued[0].operation).toBe('upsert');
    });

    it('queues deletes with an undefined payload', async () => {
      fetchMock.mockResolvedValue(errorResponse(503));

      await cm.deleteRole('admin');

      const queued = await pendingSyncTable(cm).toArray();
      expect(queued[0]).toMatchObject({ operation: 'delete', payload: undefined });
    });

    it('throws OptimisticLockError on 412 and does NOT queue it', async () => {
      const serverRow = { configId: 'cfg-1', updatedTime: '2026-02-02T00:00:00Z' };
      fetchMock.mockResolvedValue(errorResponse(412, async () => serverRow));

      // 412 means "someone else wrote this row" — a retry would clobber
      // their change, so it surfaces to the caller instead of queueing.
      await expect(cm.saveRole(role('admin'))).rejects.toBeInstanceOf(OptimisticLockError);
      await expect(pendingSyncTable(cm).toArray()).resolves.toEqual([]);
    });

    it('carries the server row on the 412 so the editor can offer a reload', async () => {
      const serverRow = { configId: 'cfg-1', updatedTime: '2026-02-02T00:00:00Z' };
      fetchMock.mockResolvedValue(errorResponse(412, async () => serverRow));

      await cm.saveRole(role('admin')).then(
        () => { throw new Error('expected a rejection'); },
        (err: OptimisticLockError) => { expect(err.currentRow).toMatchObject(serverRow); },
      );
    });

    it('still throws OptimisticLockError when the 412 body is unreadable', async () => {
      fetchMock.mockResolvedValue(
        errorResponse(412, async () => { throw new Error('not json'); }),
      );

      await cm.saveRole(role('admin')).then(
        () => { throw new Error('expected a rejection'); },
        (err: OptimisticLockError) => {
          expect(err).toBeInstanceOf(OptimisticLockError);
          expect(err.currentRow).toBeUndefined();
        },
      );
    });
  });

  describe('drain loop', () => {
    // Vitest's fake timers deadlock `fake-indexeddb`, so the loop is
    // driven by capturing the callback `startSyncDrain` schedules and
    // invoking it directly. That still exercises the real interval
    // registration (asserted below) plus the whole drain body.
    let tick: (() => Promise<void>) | undefined;
    let setIntervalSpy: ReturnType<typeof vi.spyOn>;
    let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      tick = undefined;
      setIntervalSpy = vi
        .spyOn(globalThis, 'setInterval')
        .mockImplementation(((fn: () => Promise<void>, ms?: number) => {
          if (ms === PENDING_SYNC_INTERVAL_MS) tick = fn;
          return 1234 as unknown as ReturnType<typeof setInterval>;
        }) as typeof setInterval);
      clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});
    });

    async function queue(entry: Partial<PendingSyncRow> = {}): Promise<void> {
      await pendingSyncTable(cm).add({
        operation: 'upsert',
        tableName: 'roles',
        recordId: 'admin',
        payload: role('admin'),
        createdAt: '2026-01-01T00:00:00Z',
        retries: 0,
        ...entry,
      } as PendingSyncRow);
    }

    it('schedules the drain every 10s in REST mode', async () => {
      await cm.init();
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), PENDING_SYNC_INTERVAL_MS);
      expect(tick).toBeTypeOf('function');
    });

    it('does not schedule a drain in local mode', async () => {
      const local = createConfigManager({ appId: 'TestApp' });
      await local.init();
      local.dispose();
      expect(tick).toBeUndefined();
    });

    it('clears the interval on dispose', async () => {
      await cm.init();
      cm.dispose();
      expect(clearIntervalSpy).toHaveBeenCalledWith(1234);
    });

    it('retries a queued entry and removes it on success', async () => {
      await queue();
      await cm.init();
      fetchMock.mockClear();

      await tick!();

      expect(fetchMock).toHaveBeenCalledWith(
        `${REST_URL}/roles/admin`,
        expect.objectContaining({ method: 'PUT' }),
      );
      await expect(pendingSyncTable(cm).toArray()).resolves.toEqual([]);
    });

    it('uses DELETE and no body when replaying a queued delete', async () => {
      await queue({ operation: 'delete', payload: undefined });
      await cm.init();
      fetchMock.mockClear();

      await tick!();

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('DELETE');
      expect(init.body).toBeUndefined();
    });

    it('attaches the bearer token on a retry too', async () => {
      const withToken = createConfigManager({
        configServiceRestUrl: REST_URL,
        identity: { userId: 'alice', getAccessToken: async () => 'tok-123' },
      });
      await pendingSyncTable(withToken).add({
        operation: 'upsert',
        tableName: 'roles',
        recordId: 'admin',
        payload: role('admin'),
        createdAt: '2026-01-01T00:00:00Z',
        retries: 0,
      } as PendingSyncRow);
      await withToken.init();
      fetchMock.mockClear();

      await tick!();
      withToken.dispose();

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
    });

    it('counts up retries instead of dropping the entry when the retry fails', async () => {
      await queue({ retries: 2 });
      await cm.init();
      fetchMock.mockResolvedValue(errorResponse(500));

      await tick!();

      const queued = await pendingSyncTable(cm).toArray();
      expect(queued).toHaveLength(1);
      expect(queued[0].retries).toBe(3);
    });

    it('counts up when the retry throws too', async () => {
      await queue();
      await cm.init();
      fetchMock.mockRejectedValue(new Error('still offline'));

      await tick!();

      const queued = await pendingSyncTable(cm).toArray();
      expect(queued[0].retries).toBe(1);
    });

    it('stops retrying — but keeps the row — once the retry cap is hit', async () => {
      await queue({ retries: MAX_SYNC_RETRIES });
      await cm.init();
      fetchMock.mockClear();

      await tick!();
      await tick!();

      expect(fetchMock).not.toHaveBeenCalled();
      // Kept on disk for manual inspection rather than silently dropped.
      await expect(pendingSyncTable(cm).toArray()).resolves.toHaveLength(1);
    });

    it('does nothing when the queue is empty', async () => {
      await cm.init();
      fetchMock.mockClear();

      await tick!();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('drains every queued entry in one pass', async () => {
      await queue({ recordId: 'first' });
      await queue({ recordId: 'second' });
      await cm.init();
      fetchMock.mockClear();

      await tick!();

      expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([
        `${REST_URL}/roles/first`,
        `${REST_URL}/roles/second`,
      ]);
      await expect(pendingSyncTable(cm).toArray()).resolves.toEqual([]);
    });
  });
});
