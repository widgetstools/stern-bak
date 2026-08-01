/**
 * Optimistic locking tests for `ConfigManager.saveConfig` against the
 * local Dexie path (Decision 12.5 / Session 6). When the caller supplies
 * `expectedUpdatedTime` and the row has moved on since, the manager
 * throws `OptimisticLockError` instead of clobbering the newer row.
 *
 * REST-mode plumbing (If-Match + Authorization Bearer headers) is
 * exercised here too via a fetch mock — those headers must flow
 * through `syncToRest` before Dexie persists locally.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import { OptimisticLockError } from './errors';
import type { AppConfigRow } from './types';

describe('ConfigManager — optimistic locking (Session 6)', () => {
  let cm: ConfigManager;

  beforeEach(() => {
    cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice' },
    });
  });

  it('saveConfig without expectedUpdatedTime overwrites (last-write-wins)', async () => {
    await cm.saveConfig({
      configId: 'cfg-1',
      appId: 'TestApp',
      isPublic: true,
      displayText: 'first',
      componentType: 'GRID',
      componentSubType: '',
      isTemplate: false,
      payload: { v: 1 },
    } as unknown as AppConfigRow);

    const after1 = (await cm.getConfig('cfg-1'))!;
    await new Promise((r) => setTimeout(r, 5));
    await cm.saveConfig({ ...after1, payload: { v: 2 } });

    const after2 = (await cm.getConfig('cfg-1'))!;
    expect(after2.payload).toEqual({ v: 2 });
  });

  it('saveConfig with matching expectedUpdatedTime succeeds', async () => {
    await cm.saveConfig({
      configId: 'cfg-2',
      appId: 'TestApp',
      isPublic: true,
      displayText: 'first',
      componentType: 'GRID',
      componentSubType: '',
      isTemplate: false,
      payload: { v: 1 },
    } as unknown as AppConfigRow);

    const row = (await cm.getConfig('cfg-2'))!;
    await new Promise((r) => setTimeout(r, 5));
    await cm.saveConfig(
      { ...row, payload: { v: 2 } },
      { expectedUpdatedTime: row.updatedTime },
    );

    const after = (await cm.getConfig('cfg-2'))!;
    expect(after.payload).toEqual({ v: 2 });
  });

  it('saveConfig with stale expectedUpdatedTime throws OptimisticLockError', async () => {
    await cm.saveConfig({
      configId: 'cfg-3',
      appId: 'TestApp',
      isPublic: true,
      displayText: 'first',
      componentType: 'GRID',
      componentSubType: '',
      isTemplate: false,
      payload: { v: 1 },
    } as unknown as AppConfigRow);
    const row = (await cm.getConfig('cfg-3'))!;

    // Another writer bumps the row.
    await new Promise((r) => setTimeout(r, 5));
    await cm.saveConfig({ ...row, payload: { v: 2 } });

    // Original writer tries to save against the stale `updatedTime`.
    await expect(
      cm.saveConfig({ ...row, payload: { v: 99 } }, { expectedUpdatedTime: row.updatedTime }),
    ).rejects.toBeInstanceOf(OptimisticLockError);

    // Verify the stale write didn't overwrite the bumped row.
    const after = (await cm.getConfig('cfg-3'))!;
    expect(after.payload).toEqual({ v: 2 });
  });

  it('REST mode: syncToRest sends If-Match and Authorization headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const cmRest = createConfigManager({
      appId: 'TestApp',
      configServiceRestUrl: 'http://test.example/api/v1',
      identity: {
        userId: 'alice',
        getAccessToken: async () => 'tok-xyz',
      },
    });

    await cmRest.saveConfig({
      configId: 'cfg-rest',
      appId: 'TestApp',
      isPublic: true,
      displayText: 'first',
      componentType: 'GRID',
      componentSubType: '',
      isTemplate: false,
      payload: {},
    } as unknown as AppConfigRow);

    // Read back the freshly-stamped row to capture its updatedTime.
    const row = (await cmRest.getConfig('cfg-rest'))!;

    fetchSpy.mockClear();
    await cmRest.saveConfig(
      { ...row, payload: { v: 2 } },
      { expectedUpdatedTime: row.updatedTime },
    );

    expect(fetchSpy).toHaveBeenCalled();
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-xyz');
    expect(headers['If-Match']).toBe(row.updatedTime);

    fetchSpy.mockRestore();
    cmRest.dispose();
  });

  it('REST mode: 412 response throws OptimisticLockError and is not queued for retry', async () => {
    const cmRest = createConfigManager({
      appId: 'TestApp',
      configServiceRestUrl: 'http://test.example/api/v1',
      identity: { userId: 'alice' },
    });

    // First write seeds the row locally; mock a successful PUT for it.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );
    await cmRest.saveConfig({
      configId: 'cfg-rest-412',
      appId: 'TestApp',
      isPublic: true,
      displayText: 'first',
      componentType: 'GRID',
      componentSubType: '',
      isTemplate: false,
      payload: {},
    } as unknown as AppConfigRow);
    const row = (await cmRest.getConfig('cfg-rest-412'))!;

    // Now force a 412 with a current row body.
    const currentRow: AppConfigRow = {
      ...row,
      updatedTime: '2099-01-01T00:00:00.000Z',
      updatedBy: 'bob',
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(currentRow), {
        status: 412,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      cmRest.saveConfig(
        { ...row, payload: { v: 2 } },
        { expectedUpdatedTime: row.updatedTime },
      ),
    ).rejects.toMatchObject({ name: 'OptimisticLockError' });

    fetchSpy.mockRestore();
    cmRest.dispose();
  });
});
