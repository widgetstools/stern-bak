/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration tests for the WorkspacePlatform persistence override.
 *
 * Runs the override against:
 *   - A real-shape ConfigManager mock (in-memory Map, same surface the
 *     production override calls into)
 *   - A stub WorkspacePlatformProvider parent class (no super.* calls
 *     in the override, so the parent only needs to be constructable)
 *   - A stub `fin` global whose `Platform.getCurrentSync().getSnapshot()`
 *     returns a fixture snapshot
 *
 * NOT a Playwright/OpenFin end-to-end test — that would require an
 * actual OpenFin runtime in CI which the repo doesn't ship today. These
 * tests give the same round-trip coverage with a fraction of the infra.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { COMPONENT_TYPES } from '@wellsfargo-starui/types';
import type { AppConfigRow, ConfigManager } from '@wellsfargo-starui/host-config';
import {
  createWorkspacePersistenceOverride,
  instanceIdsFromSnapshot,
  __resetWorkspaceSaveChannelForTests,
  WORKSPACE_SAVE_CHANNEL,
} from './workspacePersistence';

// ─── Test doubles ────────────────────────────────────────────────────

class InMemoryConfigManager {
  rows = new Map<string, AppConfigRow>();

  async getConfig(configId: string): Promise<AppConfigRow | undefined> {
    const row = this.rows.get(configId);
    return row ? { ...row } : undefined;
  }
  async saveConfig(row: AppConfigRow): Promise<void> {
    this.rows.set(row.configId, { ...row });
  }
  async deleteConfig(configId: string): Promise<void> {
    this.rows.delete(configId);
  }
  async getConfigsByUser(userId: string): Promise<AppConfigRow[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.userId === userId)
      .map((r) => ({ ...r }));
  }
  async getConfigsByUserUnfiltered(userId: string): Promise<AppConfigRow[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.userId === userId)
      .map((r) => ({ ...r }));
  }
}

const superSpies = {
  createView: vi.fn(async (payload: unknown) => ({ payload })),
  createWindow: vi.fn(async (payload: unknown) => ({ payload })),
  applyWorkspace: vi.fn(async () => true),
  openViewTabContextMenu: vi.fn(async () => undefined),
};

class StubWorkspacePlatformProvider {
  async createView(payload: unknown, identity?: unknown) {
    return superSpies.createView(payload, identity);
  }
  async createWindow(payload: unknown, identity?: unknown) {
    return superSpies.createWindow(payload, identity);
  }
  async applyWorkspace(payload: unknown) {
    return superSpies.applyWorkspace(payload);
  }
  async openViewTabContextMenu(req: unknown, identity?: unknown) {
    return superSpies.openViewTabContextMenu(req, identity);
  }
}

function makeProvider(opts: {
  cm: ConfigManager;
  appId: string;
  userId: string;
  onWorkspaceChange?: () => Promise<void> | void;
}): Promise<any> {
  const factory = createWorkspacePersistenceOverride(opts);
  return factory(StubWorkspacePlatformProvider as any);
}

function stubFinSnapshot(snapshot: any): void {
  (globalThis as any).fin = {
    Platform: {
      getCurrentSync: () => ({
        getSnapshot: async () => snapshot,
      }),
    },
  };
}

const APP_ID = 'TestApp';
const USER_ID = 'dev1';

beforeEach(() => {
  delete (globalThis as any).fin;
  __resetWorkspaceSaveChannelForTests();
  for (const spy of Object.values(superSpies)) spy.mockClear();
});

afterEach(() => {
  delete (globalThis as any).fin;
  __resetWorkspaceSaveChannelForTests();
});

// ─── instanceIdsFromSnapshot ─────────────────────────────────────────

describe('instanceIdsFromSnapshot', () => {
  it('returns [] for null/empty/undefined snapshot', () => {
    expect(instanceIdsFromSnapshot(null)).toEqual([]);
    expect(instanceIdsFromSnapshot(undefined)).toEqual([]);
    expect(instanceIdsFromSnapshot({})).toEqual([]);
    expect(instanceIdsFromSnapshot({ windows: [] })).toEqual([]);
  });

  it('extracts ?id= from view URLs', () => {
    const snap = {
      windows: [
        { views: [{ url: 'http://app.test/view?id=abc-123' }] },
      ],
    };
    expect(instanceIdsFromSnapshot(snap)).toEqual(['abc-123']);
  });

  it('walks nested children/views/windows', () => {
    const snap = {
      windows: [
        {
          views: [{ url: 'http://app.test/v?id=top1' }],
          children: [
            {
              views: [{ url: 'http://app.test/v?id=child1' }],
            },
          ],
        },
        { views: [{ url: 'http://app.test/v?id=top2' }] },
      ],
    };
    expect(instanceIdsFromSnapshot(snap)).toEqual(['top1', 'child1', 'top2']);
  });

  it('skips views with no ?id= param', () => {
    const snap = { windows: [{ views: [{ url: 'http://app.test/blotter' }] }] };
    expect(instanceIdsFromSnapshot(snap)).toEqual([]);
  });

  it('skips malformed URLs without throwing', () => {
    const snap = { windows: [{ views: [{ url: '::not a url::' }] }] };
    expect(instanceIdsFromSnapshot(snap)).toEqual([]);
  });

  it('de-duplicates instanceIds', () => {
    const snap = {
      windows: [
        { views: [{ url: 'http://app.test/v?id=dup' }] },
        { views: [{ url: 'http://app.test/v?id=dup' }] },
      ],
    };
    expect(instanceIdsFromSnapshot(snap)).toEqual(['dup']);
  });
});

// ─── createSavedWorkspace ────────────────────────────────────────────

describe('createSavedWorkspace', () => {
  it('writes a WORKSPACE row at WS_<id> with the snapshot + extracted instanceIds', async () => {
    const cm = new InMemoryConfigManager();
    stubFinSnapshot({}); // unused — req.workspace.snapshot is preferred

    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    const liveSnapshot = {
      windows: [
        { views: [{ url: 'http://app.test/grid?id=inst-1' }] },
      ],
    };

    await provider.createSavedWorkspace({
      workspace: {
        workspaceId: 'eod-trading',
        title: 'EOD Trading Setup',
        snapshot: liveSnapshot,
      },
    });

    const row = cm.rows.get('WS_eod-trading');
    expect(row).toBeDefined();
    expect(row!.componentType).toBe(COMPONENT_TYPES.WORKSPACE);
    expect(row!.componentSubType).toBe('SNAPSHOT');
    expect(row!.appId).toBe(APP_ID);
    expect(row!.userId).toBe(USER_ID);
    expect(row!.displayText).toBe('EOD Trading Setup');
    expect(row!.isTemplate).toBe(false);
    expect(row!.payload).toMatchObject({
      name: 'EOD Trading Setup',
      openfinSnapshot: liveSnapshot,
      instanceIds: ['inst-1'],
      version: 1,
    });
    expect(row!.createdBy).toBe(USER_ID);
    expect(row!.updatedBy).toBe(USER_ID);
    expect(row!.creationTime).toBeTruthy();
    expect(row!.updatedTime).toBeTruthy();
  });

  it('captures a live snapshot via fin when req.workspace.snapshot is missing', async () => {
    const cm = new InMemoryConfigManager();
    const liveSnapshot = {
      windows: [{ views: [{ url: 'http://app.test/v?id=fromfin' }] }],
    };
    stubFinSnapshot(liveSnapshot);

    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'ws1', title: 'WS1' /* no snapshot */ },
    });

    const row = cm.rows.get('WS_ws1');
    expect(row!.payload).toMatchObject({
      openfinSnapshot: liveSnapshot,
      instanceIds: ['fromfin'],
    });
  });

  it('throws when workspaceId is missing', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await expect(
      provider.createSavedWorkspace({ workspace: { title: 'no id' } }),
    ).rejects.toThrow(/missing workspaceId/);
  });

  it('fires onWorkspaceChange after a successful save', async () => {
    const cm = new InMemoryConfigManager();
    const onChange = vi.fn();
    const provider = await makeProvider({
      cm, appId: APP_ID, userId: USER_ID, onWorkspaceChange: onChange,
    });
    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'ws1', title: 'WS1', snapshot: {} },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does NOT fail the save if onWorkspaceChange throws', async () => {
    const cm = new InMemoryConfigManager();
    const onChange = vi.fn().mockRejectedValue(new Error('gc broke'));
    const provider = await makeProvider({
      cm, appId: APP_ID, userId: USER_ID, onWorkspaceChange: onChange,
    });
    await expect(
      provider.createSavedWorkspace({
        workspace: { workspaceId: 'ws1', title: 'WS1', snapshot: {} },
      }),
    ).resolves.toBeUndefined();
    expect(cm.rows.has('WS_ws1')).toBe(true);
  });

  it('accepts an already-prefixed workspaceId without double-prefixing', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'WS_already', title: 'X', snapshot: {} },
    });
    expect(cm.rows.has('WS_already')).toBe(true);
    expect(cm.rows.has('WS_WS_already')).toBe(false);
  });
});

// ─── getSavedWorkspace ───────────────────────────────────────────────

describe('getSavedWorkspace', () => {
  it('reads a workspace back into OpenFin shape', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    const snap = { windows: [{ views: [{ url: 'http://app.test/v?id=x' }] }] };
    await provider.createSavedWorkspace({
      workspace: {
        workspaceId: 'roundtrip',
        title: 'Roundtrip',
        snapshot: snap,
        metadata: { color: 'blue' },
      },
    });

    const ws = await provider.getSavedWorkspace('roundtrip');
    expect(ws.workspaceId).toBe('roundtrip');
    expect(ws.title).toBe('Roundtrip');
    expect(ws.snapshot).toEqual(snap);
    expect(ws.metadata).toEqual({ color: 'blue' });
  });

  // The WorkspacePlatformProvider.getSavedWorkspace contract returns
  // `Workspace | undefined` — must NOT throw. Storage.saveWorkspace()
  // calls it first to detect create-vs-update; a throw breaks upsert.
  it('returns undefined for a non-existent id', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    expect(await provider.getSavedWorkspace('missing')).toBeUndefined();
  });

  it('returns undefined when configId exists but is the wrong componentType', async () => {
    const cm = new InMemoryConfigManager();
    cm.rows.set('WS_imposter', {
      configId: 'WS_imposter',
      appId: APP_ID,
      userId: USER_ID,
      componentType: 'something-else',
      componentSubType: '',
      isTemplate: false,
      displayText: 'imposter',
      payload: {},
      createdBy: USER_ID,
      updatedBy: USER_ID,
      creationTime: '',
      updatedTime: '',
    });
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    expect(await provider.getSavedWorkspace('imposter')).toBeUndefined();
  });
});

// ─── getSavedWorkspaces ──────────────────────────────────────────────

describe('getSavedWorkspaces', () => {
  it('lists only WORKSPACE rows for the current (appId, userId)', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });

    // Two workspaces for the current user
    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'one', title: 'One', snapshot: {} },
    });
    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'two', title: 'Two', snapshot: {} },
    });

    // A workspace for ANOTHER user — should NOT appear
    cm.rows.set('WS_other-user', {
      configId: 'WS_other-user',
      appId: APP_ID,
      userId: 'other',
      componentType: COMPONENT_TYPES.WORKSPACE,
      componentSubType: 'SNAPSHOT',
      isTemplate: false,
      displayText: 'OtherUser',
      payload: { name: 'OtherUser', openfinSnapshot: {}, instanceIds: [], version: 1 },
      createdBy: 'other', updatedBy: 'other', creationTime: '', updatedTime: '',
    });

    // A workspace for ANOTHER app — should NOT appear
    cm.rows.set('WS_other-app', {
      configId: 'WS_other-app',
      appId: 'OtherApp',
      userId: USER_ID,
      componentType: COMPONENT_TYPES.WORKSPACE,
      componentSubType: 'SNAPSHOT',
      isTemplate: false,
      displayText: 'OtherApp',
      payload: { name: 'OtherApp', openfinSnapshot: {}, instanceIds: [], version: 1 },
      createdBy: USER_ID, updatedBy: USER_ID, creationTime: '', updatedTime: '',
    });

    // A non-workspace row for the current user — should NOT appear
    cm.rows.set('dock-config', {
      configId: 'dock-config',
      appId: APP_ID,
      userId: USER_ID,
      componentType: COMPONENT_TYPES.DOCK_CONFIG,
      componentSubType: '',
      isTemplate: false,
      displayText: 'Dock',
      payload: {},
      createdBy: USER_ID, updatedBy: USER_ID, creationTime: '', updatedTime: '',
    });

    const list = await provider.getSavedWorkspaces();
    const titles = list.map((w: any) => w.title).sort();
    expect(titles).toEqual(['One', 'Two']);
  });

  it('filters by query (case-insensitive substring on title)', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    for (const t of ['EOD Trading', 'Morning Report', 'Mid-day Review']) {
      await provider.createSavedWorkspace({
        workspace: { workspaceId: t.toLowerCase().replace(/\s+/g, '-'), title: t, snapshot: {} },
      });
    }
    const hits = await provider.getSavedWorkspaces('TRADING');
    expect(hits.map((w: any) => w.title)).toEqual(['EOD Trading']);
  });

  it('returns [] when no workspaces exist', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    expect(await provider.getSavedWorkspaces()).toEqual([]);
  });
});

// ─── updateSavedWorkspace ────────────────────────────────────────────

describe('updateSavedWorkspace', () => {
  it('preserves creationTime + createdBy across updates', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });

    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'ws', title: 'v1', snapshot: {} },
    });
    const before = cm.rows.get('WS_ws')!;
    const originalCreationTime = before.creationTime;

    // Tiny delay so updatedTime moves
    await new Promise((r) => setTimeout(r, 5));

    await provider.updateSavedWorkspace({
      workspace: { workspaceId: 'ws', title: 'v2', snapshot: {} },
    });
    const after = cm.rows.get('WS_ws')!;
    expect(after.creationTime).toBe(originalCreationTime);
    expect(after.createdBy).toBe(USER_ID);
    expect(after.updatedTime).not.toBe(originalCreationTime);
    expect(after.displayText).toBe('v2');
    expect(after.payload.name).toBe('v2');
  });

  it('writes a new row when updating a workspace that does not exist yet', async () => {
    // OpenFin's update path can be called speculatively — treat as upsert
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await provider.updateSavedWorkspace({
      workspace: { workspaceId: 'fresh', title: 'Fresh', snapshot: {} },
    });
    expect(cm.rows.get('WS_fresh')).toBeDefined();
  });

  it('throws when workspaceId is missing', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await expect(
      provider.updateSavedWorkspace({ workspace: { title: 'noid' } }),
    ).rejects.toThrow(/missing workspaceId/);
  });
});

// ─── deleteSavedWorkspace ────────────────────────────────────────────

describe('deleteSavedWorkspace', () => {
  it('removes the row + fires onWorkspaceChange', async () => {
    const cm = new InMemoryConfigManager();
    const onChange = vi.fn();
    const provider = await makeProvider({
      cm, appId: APP_ID, userId: USER_ID, onWorkspaceChange: onChange,
    });
    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'doomed', title: 'Doomed', snapshot: {} },
    });
    onChange.mockClear();

    await provider.deleteSavedWorkspace('doomed');
    expect(cm.rows.has('WS_doomed')).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is a silent no-op if the workspace does not exist', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await expect(provider.deleteSavedWorkspace('missing')).resolves.toBeUndefined();
  });
});

// ─── End-to-end round trip ───────────────────────────────────────────

describe('full round trip', () => {
  it('create -> list -> get -> update -> delete -> list empty', async () => {
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });

    const snap = { windows: [{ views: [{ url: 'http://app.test/v?id=alpha' }] }] };

    // 1. Create
    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'rt', title: 'Round Trip', snapshot: snap },
    });

    // 2. List
    let list = await provider.getSavedWorkspaces();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Round Trip');

    // 3. Get
    const got = await provider.getSavedWorkspace('rt');
    expect(got.snapshot).toEqual(snap);

    // 4. Update
    await provider.updateSavedWorkspace({
      workspace: { workspaceId: 'rt', title: 'Round Trip (renamed)', snapshot: snap },
    });
    const updated = await provider.getSavedWorkspace('rt');
    expect(updated.title).toBe('Round Trip (renamed)');

    // 5. Delete
    await provider.deleteSavedWorkspace('rt');
    list = await provider.getSavedWorkspaces();
    expect(list).toEqual([]);
  });
});

describe('save channel + live snapshot augmentation', () => {
  it('dispatches workspace-saving and publishes workspace-saved around create', async () => {
    const cm = new InMemoryConfigManager();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const publish = vi.fn().mockResolvedValue([]);
    const channelCreate = vi.fn().mockResolvedValue({
      connections: [{ uuid: 'v1', name: 'view-1' }],
      dispatch,
      publish,
    });
    (globalThis as any).fin = {
      InterApplicationBus: { Channel: { create: channelCreate } },
      Platform: { getCurrentSync: () => ({ getSnapshot: async () => ({ windows: [] }) }) },
    };

    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'ws1', title: 'WS1', snapshot: {} },
    });

    expect(channelCreate).toHaveBeenCalledWith(WORKSPACE_SAVE_CHANNEL);
    expect(dispatch).toHaveBeenCalledWith(
      { uuid: 'v1', name: 'view-1' },
      'workspace-saving',
      { workspaceId: 'ws1' },
    );
    expect(publish).toHaveBeenCalledWith('workspace-saved', { workspaceId: 'ws1' });
  });

  it('merges live view customData into the saved snapshot', async () => {
    const cm = new InMemoryConfigManager();
    const snapshot = {
      windows: [{ views: [{ name: 'grid-1', url: 'http://app.test/v?id=live', customData: { stale: true } }] }],
    };
    (globalThis as any).fin = {
      me: { identity: { uuid: 'plat' } },
      View: {
        wrapSync: vi.fn(() => ({
          getOptions: vi.fn().mockResolvedValue({ customData: { activeProfileId: 'p2' } }),
        })),
      },
      Platform: { getCurrentSync: () => ({ getSnapshot: async () => snapshot }) },
    };

    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await provider.createSavedWorkspace({
      workspace: { workspaceId: 'ws-live', title: 'Live', snapshot },
    });

    const row = cm.rows.get('WS_ws-live');
    expect(row!.payload.openfinSnapshot.windows[0].views[0].customData).toEqual({
      stale: true,
      activeProfileId: 'p2',
    });
  });

  it('updateSavedWorkspace captures a live snapshot when none is supplied', async () => {
    const cm = new InMemoryConfigManager();
    const liveSnapshot = { windows: [{ views: [{ url: 'http://app.test/v?id=upd' }] }] };
    stubFinSnapshot(liveSnapshot);
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await provider.updateSavedWorkspace({
      workspace: { workspaceId: 'upd', title: 'Updated' },
    });
    expect(cm.rows.get('WS_upd')!.payload.instanceIds).toEqual(['upd']);
  });
});

describe('provider view/window overrides', () => {
  it('createView strips legacy isolation and disables background throttling before delegating', async () => {
    const provider = await makeProvider({ cm: new InMemoryConfigManager(), appId: APP_ID, userId: USER_ID });
    (globalThis as any).fin = { me: { identity: { uuid: 'plat' } } };
    const payload = {
      opts: { processAffinity: 'view-iso-old', backgroundThrottling: true },
    };
    await provider.createView(payload, { uuid: 'plat' });
    expect(superSpies.createView).toHaveBeenCalledWith(payload, { uuid: 'plat' });
    expect(payload.opts.backgroundThrottling).toBe(false);
  });

  it('createWindow cleans nested layouts and window options', async () => {
    const provider = await makeProvider({ cm: new InMemoryConfigManager(), appId: APP_ID, userId: USER_ID });
    (globalThis as any).fin = { me: { identity: { uuid: 'plat' } } };
    const payload = {
      layout: { content: [{ views: [{ processAffinity: 'view-iso-old' }] }] },
      windowOptions: { layout: { views: [{ processAffinity: 'view-iso-old' }] }, backgroundThrottling: true },
      backgroundThrottling: true,
    };
    await provider.createWindow(payload, { uuid: 'plat' });
    expect(superSpies.createWindow).toHaveBeenCalled();
    expect(payload.backgroundThrottling).toBe(false);
    expect(payload.windowOptions.backgroundThrottling).toBe(false);
  });

  it('applyWorkspace forces skipPrompt and injects rename into the tab context menu', async () => {
    const provider = await makeProvider({ cm: new InMemoryConfigManager(), appId: APP_ID, userId: USER_ID });
    await provider.applyWorkspace({ workspaceId: 'ws1', options: { foo: true } });
    expect(superSpies.applyWorkspace).toHaveBeenCalledWith({
      workspaceId: 'ws1',
      options: { foo: true, skipPrompt: true },
    });
    await provider.openViewTabContextMenu(
      { menuEntries: [], selectedViews: [{ name: 'tab-1' }], template: [] },
      { uuid: 'plat' },
    );
    expect(superSpies.openViewTabContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ menuEntries: expect.any(Array) }),
      { uuid: 'plat' },
    );
  });
});

describe('outside OpenFin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __resetWorkspaceSaveChannelForTests();
  });

  it('skips save-channel fan-out when fin is undefined', async () => {
    vi.stubGlobal('fin', undefined);
    const cm = new InMemoryConfigManager();
    const provider = await makeProvider({ cm, appId: APP_ID, userId: USER_ID });
    await expect(
      provider.createSavedWorkspace({
        workspace: { workspaceId: 'offline', title: 'Offline', snapshot: {} },
      }),
    ).resolves.toBeUndefined();
    expect(cm.rows.has('WS_offline')).toBe(true);
  });
});
