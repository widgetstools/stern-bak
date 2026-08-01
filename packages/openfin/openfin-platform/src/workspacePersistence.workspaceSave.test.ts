/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Workspace-save Channel fan-out tests.
 *
 * Covers the new awaited dispatch path added in the hosted-view-hooks
 * worklog (session 3): before the snapshot's customData is augmented,
 * the override `dispatch`es 'workspace-saving' to every Channel
 * connection and awaits each handler's promise. After the row commits,
 * it fire-and-forget `publish`es 'workspace-saved'.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AppConfigRow, ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  createWorkspacePersistenceOverride,
  __resetWorkspaceSaveChannelForTests,
  WORKSPACE_SAVE_CHANNEL,
} from './workspacePersistence';

class InMemoryConfigManager {
  rows = new Map<string, AppConfigRow>();
  saveOrderToken = 0;
  saveCalledAt = 0;
  async getConfig(configId: string): Promise<AppConfigRow | undefined> {
    return this.rows.get(configId);
  }
  async saveConfig(row: AppConfigRow): Promise<void> {
    this.saveCalledAt = ++this.saveOrderToken;
    this.rows.set(row.configId, { ...row });
  }
  async deleteConfig(configId: string): Promise<void> {
    this.rows.delete(configId);
  }
  async getConfigsByUser(): Promise<AppConfigRow[]> {
    return Array.from(this.rows.values()).map((r) => ({ ...r }));
  }
  async getConfigsByUserUnfiltered(): Promise<AppConfigRow[]> {
    return Array.from(this.rows.values()).map((r) => ({ ...r }));
  }
}

class StubWorkspacePlatformProvider {}

interface FakeChannelProvider {
  connections: Array<{ uuid: string; name?: string }>;
  dispatch: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function makeFin(provider: FakeChannelProvider | null, snapshot: any = {}): void {
  (globalThis as any).fin = {
    me: { identity: { uuid: 'platform' } },
    Platform: {
      getCurrentSync: () => ({ getSnapshot: async () => snapshot }),
    },
    InterApplicationBus: provider
      ? {
          Channel: {
            create: vi.fn().mockResolvedValue(provider),
          },
        }
      : undefined,
  };
}

beforeEach(() => {
  __resetWorkspaceSaveChannelForTests();
  delete (globalThis as any).fin;
});
afterEach(() => {
  __resetWorkspaceSaveChannelForTests();
  delete (globalThis as any).fin;
  vi.restoreAllMocks();
});

async function buildProvider(cm: ConfigManager) {
  const factory = createWorkspacePersistenceOverride({ cm, appId: 'A', userId: 'u' });
  return factory(StubWorkspacePlatformProvider as any);
}

describe('workspace-save Channel fan-out', () => {
  it('awaits dispatch("workspace-saving") to every connection before saveConfig', async () => {
    const order: string[] = [];

    let resolveDispatch: (() => void) | null = null;
    const dispatchGate = new Promise<void>((r) => {
      resolveDispatch = r;
    });

    const provider: FakeChannelProvider = {
      connections: [
        { uuid: 'app', name: 'view-1' },
        { uuid: 'app', name: 'view-2' },
      ],
      dispatch: vi.fn(async () => {
        order.push('dispatch-start');
        await dispatchGate;
        order.push('dispatch-end');
      }),
      publish: vi.fn().mockResolvedValue([]),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    const cm = new InMemoryConfigManager();
    const originalSave = cm.saveConfig.bind(cm);
    cm.saveConfig = async (row: AppConfigRow) => {
      order.push('saveConfig');
      await originalSave(row);
    };

    makeFin(provider);
    const wp = await buildProvider(cm);

    const savePromise = wp.createSavedWorkspace({
      workspace: { workspaceId: 'ws1', title: 'WS1', snapshot: {} },
    });

    // Give the dispatch chain a tick to start
    await Promise.resolve();
    await Promise.resolve();

    expect(provider.dispatch).toHaveBeenCalledTimes(2);
    expect(provider.dispatch).toHaveBeenCalledWith(
      { uuid: 'app', name: 'view-1' },
      'workspace-saving',
      { workspaceId: 'ws1' },
    );
    // saveConfig must NOT have run yet — proves the dispatch is awaited
    expect(order).not.toContain('saveConfig');

    resolveDispatch!();
    await savePromise;

    // dispatch-end precedes saveConfig
    const dispatchEndIdx = order.lastIndexOf('dispatch-end');
    const saveIdx = order.indexOf('saveConfig');
    expect(dispatchEndIdx).toBeGreaterThanOrEqual(0);
    expect(saveIdx).toBeGreaterThan(dispatchEndIdx);
  });

  it('publishes "workspace-saved" after saveConfig succeeds', async () => {
    const provider: FakeChannelProvider = {
      connections: [],
      dispatch: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue([]),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    const cm = new InMemoryConfigManager();
    makeFin(provider);
    const wp = await buildProvider(cm);

    await wp.createSavedWorkspace({
      workspace: { workspaceId: 'ws1', title: 'WS1', snapshot: {} },
    });

    // Let the fire-and-forget publish chain settle
    await new Promise((r) => setTimeout(r, 0));

    expect(provider.publish).toHaveBeenCalledWith('workspace-saved', { workspaceId: 'ws1' });
    expect(cm.rows.get('WS_ws1')).toBeDefined();
  });

  it('does not fail the save when dispatch rejects', async () => {
    const provider: FakeChannelProvider = {
      connections: [{ uuid: 'app', name: 'view-1' }],
      dispatch: vi.fn().mockRejectedValue(new Error('client crashed')),
      publish: vi.fn().mockResolvedValue([]),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    const cm = new InMemoryConfigManager();
    makeFin(provider);
    const wp = await buildProvider(cm);

    await expect(
      wp.createSavedWorkspace({
        workspace: { workspaceId: 'ws1', title: 'WS1', snapshot: {} },
      }),
    ).resolves.toBeUndefined();
    expect(cm.rows.get('WS_ws1')).toBeDefined();
  });

  it('updateSavedWorkspace also dispatches the awaited fan-out', async () => {
    const provider: FakeChannelProvider = {
      connections: [{ uuid: 'app', name: 'view-1' }],
      dispatch: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue([]),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    const cm = new InMemoryConfigManager();
    makeFin(provider);
    const wp = await buildProvider(cm);

    await wp.updateSavedWorkspace({
      workspace: { workspaceId: 'ws-upd', title: 'Up', snapshot: {} },
    });

    expect(provider.dispatch).toHaveBeenCalledWith(
      { uuid: 'app', name: 'view-1' },
      'workspace-saving',
      { workspaceId: 'ws-upd' },
    );
  });

  it('lazily creates the singleton provider on the configured channel name', async () => {
    const provider: FakeChannelProvider = {
      connections: [],
      dispatch: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue([]),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    const cm = new InMemoryConfigManager();
    makeFin(provider);
    const wp = await buildProvider(cm);

    await wp.createSavedWorkspace({
      workspace: { workspaceId: 'a', title: 'A', snapshot: {} },
    });
    await wp.createSavedWorkspace({
      workspace: { workspaceId: 'b', title: 'B', snapshot: {} },
    });

    const create = (globalThis as any).fin.InterApplicationBus.Channel.create as ReturnType<
      typeof vi.fn
    >;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(WORKSPACE_SAVE_CHANNEL);
  });

  it('is a clean no-op when fin.InterApplicationBus.Channel is missing', async () => {
    const cm = new InMemoryConfigManager();
    // fin present but Channel is not — pre-Channel-API runtime / browser
    (globalThis as any).fin = {
      Platform: { getCurrentSync: () => ({ getSnapshot: async () => ({}) }) },
    };
    const wp = await buildProvider(cm);
    await expect(
      wp.createSavedWorkspace({
        workspace: { workspaceId: 'ws1', title: 'WS1', snapshot: {} },
      }),
    ).resolves.toBeUndefined();
    expect(cm.rows.get('WS_ws1')).toBeDefined();
  });
});
