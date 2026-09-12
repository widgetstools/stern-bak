/**
 * `ConfigManagerOptions.writer` — the worker-split's single-writer rule
 * (plan W2). A window's ConfigManager hands `appConfig` writes to a
 * delegate (the platform-services worker's client) instead of writing
 * IndexedDB / REST itself; reads stay local; the row the delegate returns
 * is what this context caches and announces.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import { OptimisticLockError } from './errors';
import type { AppConfigRow, ConfigWriter } from './types';

function row(configId: string, extra: Partial<AppConfigRow> = {}): AppConfigRow {
  return {
    configId,
    appId: 'TestApp',
    userId: 'alice',
    isPublic: true,
    displayText: configId,
    componentType: 'GRID',
    componentSubType: '',
    isTemplate: false,
    payload: { v: 1 },
    createdBy: 'alice',
    updatedBy: 'alice',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('ConfigManager — writer delegate (single writer, W2)', () => {
  let cm: ConfigManager;
  let writer: { saveConfig: ReturnType<typeof vi.fn>; deleteConfig: ReturnType<typeof vi.fn> };
  let stored: Map<string, AppConfigRow>;
  /** Rows as the writer received them (snapshots — the manager adopts the persisted stamps onto the same object afterwards). */
  let sent: AppConfigRow[];

  beforeEach(() => {
    stored = new Map();
    sent = [];
    writer = {
      saveConfig: vi.fn(async (r: AppConfigRow) => {
        sent.push({ ...r });
        // The owner stamps the row its own way — the caller must adopt that.
        const persisted = { ...r, updatedBy: 'worker', updatedTime: '2026-09-12T10:00:00.000Z' };
        stored.set(r.configId, persisted);
        return persisted;
      }),
      deleteConfig: vi.fn(async (id: string) => { stored.delete(id); }),
    };
    cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice' },
      writer: writer as unknown as ConfigWriter,
    });
  });

  it('saveConfig hands the stamped row to the writer instead of writing IndexedDB, and caches the persisted row', async () => {
    const changed: string[] = [];
    cm.onConfigChanged((id) => changed.push(id));

    await cm.saveConfig(row('cfg-1'), { expectedUpdatedTime: '2026-01-01T00:00:00.000Z' });

    expect(writer.saveConfig).toHaveBeenCalledTimes(1);
    expect(sent[0]).toMatchObject({ configId: 'cfg-1', appId: 'TestApp', updatedBy: 'alice' });
    expect(writer.saveConfig.mock.calls[0][1]).toEqual({ expectedUpdatedTime: '2026-01-01T00:00:00.000Z' });
    // The cached row carries the WRITER's stamps, so a later optimistic-lock
    // check compares against what IndexedDB actually holds.
    const cached = await cm.getConfig('cfg-1');
    expect(cached).toMatchObject({ updatedBy: 'worker', updatedTime: '2026-09-12T10:00:00.000Z' });
    expect(changed).toEqual(['cfg-1']);
  });

  it('a writer rejection (stale write) propagates and leaves nothing cached', async () => {
    const current = row('cfg-2', { displayText: 'elsewhere' });
    writer.saveConfig.mockRejectedValueOnce(new OptimisticLockError(current));
    await expect(cm.saveConfig(row('cfg-2'))).rejects.toBeInstanceOf(OptimisticLockError);
    expect(await cm.getConfig('cfg-2')).toBeUndefined();
  });

  it('deleteConfig hands the delete to the writer, notifies, and evicts the cache', async () => {
    await cm.saveConfig(row('cfg-3'));
    const changed: string[] = [];
    cm.onConfigChanged((id) => changed.push(id));

    await cm.deleteConfig('cfg-3');

    expect(writer.deleteConfig).toHaveBeenCalledWith('cfg-3');
    expect(await cm.getConfig('cfg-3')).toBeUndefined();
    expect(changed).toEqual(['cfg-3']);
  });

  it('createConfig / updateConfig ride the same delegate', async () => {
    await cm.createConfig({ ...row('cfg-4'), creationTime: undefined, updatedTime: undefined } as never);
    expect(writer.saveConfig).toHaveBeenCalledTimes(1);
    await cm.updateConfig('cfg-4', { payload: { v: 2 } });
    expect(writer.saveConfig).toHaveBeenCalledTimes(2);
    expect(sent[1].payload).toEqual({ v: 2 });
  });

  it('without a writer the manager still writes its own IndexedDB', async () => {
    const local = createConfigManager({ appId: 'TestApp', identity: { userId: 'alice', displayName: 'Alice' } });
    await local.saveConfig(row('cfg-5'));
    expect(writer.saveConfig).not.toHaveBeenCalled();
    expect((await local.getConfig('cfg-5'))?.configId).toBe('cfg-5');
  });
});
