/**
 * `ApplicationContext` AppData publishing tests for `ConfigManager`.
 *
 * Session 7 of the config-manager redesign: when wired with a
 * `dataServices` handle, `ConfigManager.init()` publishes four keys
 * onto the framework-owned `"ApplicationContext"` AppData provider:
 *
 *   - `AppId`               — the manager's `appId`
 *   - `LoggedInUser`        — `{ userId, displayName? }` from the identity
 *   - `ImpersonatedUser`    — null until Session 8 sets it
 *   - `LoggedInUserProfile` — `{ roles, permissions }` derived from
 *     the seeded auth tables
 *
 * The dataServices handle is structurally typed (`DataServicesHandle`)
 * so we mock it here with a minimal in-memory `appData` surface. The
 * real `AppDataMirror` from `@wellsfargo-starui/data` satisfies the same
 * shape verbatim — no adapter required.
 */

import { describe, it, expect } from 'vitest';
import { createConfigManager } from './ConfigManager';
import type {
  AppDataMirrorHandle,
  DataServicesHandle,
  PermissionRow,
  RoleRow,
  UserProfileRow,
} from './types';

/**
 * Tiny in-memory stand-in for `AppDataMirror`. Stores values keyed by
 * `${name}\0${key}` so a single named provider can carry multiple
 * keys without colliding. `set` / `get` mirror the real signatures.
 */
function createFakeAppData(): AppDataMirrorHandle & {
  store: Map<string, unknown>;
  readyResolve: () => void;
  setCalls: Array<{ name: string; key: string; value: unknown }>;
} {
  const store = new Map<string, unknown>();
  const setCalls: Array<{ name: string; key: string; value: unknown }> = [];
  let readyResolve!: () => void;
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  const handle: AppDataMirrorHandle = {
    async set(name, key, value) {
      setCalls.push({ name, key, value });
      store.set(`${name}\0${key}`, value);
    },
    get(name, key) {
      return store.get(`${name}\0${key}`);
    },
    ready() {
      return readyPromise;
    },
    async publishNamedRow(name, values) {
      for (const [key, value] of Object.entries(values)) {
        await handle.set(name, key, value);
      }
    },
  };

  return Object.assign(handle, { store, readyResolve, setCalls });
}

function createFakeDataServices() {
  const appData = createFakeAppData();
  const handle: DataServicesHandle = { appData };
  return { handle, appData };
}

// ─── Seed helpers ────────────────────────────────────────────────────

const PERM_READ: PermissionRow = {
  permissionId: 'config:read',
  description: 'Read configs',
  category: 'config',
};
const PERM_WRITE: PermissionRow = {
  permissionId: 'config:write',
  description: 'Write configs',
  category: 'config',
};
const PERM_ADMIN: PermissionRow = {
  permissionId: 'admin:users',
  description: 'Manage users',
  category: 'admin',
};

const ROLE_VIEWER: RoleRow = {
  roleId: 'viewer',
  displayName: 'Viewer',
  permissionIds: ['config:read'],
};
const ROLE_EDITOR: RoleRow = {
  roleId: 'editor',
  displayName: 'Editor',
  // Editor inherits read AND adds write.
  permissionIds: ['config:read', 'config:write'],
};

const ALICE_PROFILE: UserProfileRow = {
  userId: 'alice',
  appId: 'TestApp',
  roleIds: ['viewer', 'editor'],
  displayName: 'Alice Liddell',
};

describe('ConfigManager — ApplicationContext publishing (Session 7)', () => {
  it('publishes AppId, LoggedInUser, ImpersonatedUser, LoggedInUserProfile after seed', async () => {
    const { handle: dataServices, appData } = createFakeDataServices();
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice Liddell' },
      dataServices,
    });

    // Pre-seed the auth tables directly (no seed URL — we stage state
    // ourselves so the test doesn't depend on `fetch`).
    await cm.savePermission({ ...PERM_READ });
    await cm.savePermission({ ...PERM_WRITE });
    await cm.savePermission({ ...PERM_ADMIN });
    await cm.saveRole({ ...ROLE_VIEWER });
    await cm.saveRole({ ...ROLE_EDITOR });
    await cm.saveUserProfile({ ...ALICE_PROFILE });

    // Mirror is "ready" before init starts — production callers await
    // `appData.ready()` inside init, but the mocked promise resolves
    // synchronously on demand.
    appData.readyResolve();

    await cm.init();

    expect(appData.get('ApplicationContext', 'AppId')).toBe('TestApp');
    expect(appData.get('ApplicationContext', 'LoggedInUser')).toEqual({
      userId: 'alice',
      displayName: 'Alice Liddell',
    });
    expect(appData.get('ApplicationContext', 'ImpersonatedUser')).toBeNull();

    const profile = appData.get('ApplicationContext', 'LoggedInUserProfile') as {
      roles: RoleRow[];
      permissions: PermissionRow[];
    };
    expect(profile).toBeDefined();
    expect(profile.roles.map((r) => r.roleId).sort()).toEqual(['editor', 'viewer']);
    // Union of viewer + editor permissions (read + write); admin is NOT
    // here because alice's roles don't include it.
    expect(profile.permissions.map((p) => p.permissionId).sort()).toEqual([
      'config:read',
      'config:write',
    ]);

    cm.dispose();
  });

  it('getApplicationContext() returns the published shape', async () => {
    const { handle: dataServices, appData } = createFakeDataServices();
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice Liddell' },
      dataServices,
    });
    await cm.savePermission({ ...PERM_READ });
    await cm.saveRole({ ...ROLE_VIEWER });
    await cm.saveUserProfile({
      userId: 'alice',
      appId: 'TestApp',
      roleIds: ['viewer'],
      displayName: 'Alice Liddell',
    });
    appData.readyResolve();

    await cm.init();

    const ctx = cm.getApplicationContext();
    expect(ctx.AppId).toBe('TestApp');
    expect(ctx.LoggedInUser).toEqual({
      userId: 'alice',
      displayName: 'Alice Liddell',
    });
    expect(ctx.ImpersonatedUser).toBeNull();
    expect(ctx.LoggedInUserProfile.roles.map((r) => r.roleId)).toEqual(['viewer']);
    expect(
      ctx.LoggedInUserProfile.permissions.map((p) => p.permissionId),
    ).toEqual(['config:read']);

    cm.dispose();
  });

  it('publishes empty roles/permissions when the user profile is missing', async () => {
    const { handle: dataServices, appData } = createFakeDataServices();
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'unknown-user' },
      dataServices,
    });
    appData.readyResolve();

    await cm.init();

    const profile = appData.get(
      'ApplicationContext',
      'LoggedInUserProfile',
    ) as { roles: RoleRow[]; permissions: PermissionRow[] };
    expect(profile).toEqual({ roles: [], permissions: [] });

    cm.dispose();
  });

  it('omits displayName from LoggedInUser when identity has none', async () => {
    const { handle: dataServices, appData } = createFakeDataServices();
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice' },
      dataServices,
    });
    appData.readyResolve();

    await cm.init();

    expect(appData.get('ApplicationContext', 'LoggedInUser')).toEqual({
      userId: 'alice',
    });

    cm.dispose();
  });

  it('awaits appData.ready() before publishing', async () => {
    const { handle: dataServices, appData } = createFakeDataServices();
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice' },
      dataServices,
    });

    // Don't resolve `ready()` yet — init should hang on it.
    let initSettled = false;
    const initPromise = cm.init().then(() => {
      initSettled = true;
    });

    // Yield a few microtasks; init must NOT have completed yet because
    // ready() is unresolved.
    await Promise.resolve();
    await Promise.resolve();
    expect(initSettled).toBe(false);
    expect(appData.setCalls).toHaveLength(0);

    appData.readyResolve();
    await initPromise;
    expect(initSettled).toBe(true);
    expect(appData.setCalls.length).toBeGreaterThanOrEqual(4);

    cm.dispose();
  });

  it('init() resolves without throwing when disposed while awaiting appData.ready()', async () => {
    const { handle: dataServices, appData } = createFakeDataServices();
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice' },
      dataServices,
    });

    const initPromise = cm.init();
    await Promise.resolve();
    cm.dispose();
    appData.readyResolve();
    await expect(initPromise).resolves.toBeUndefined();
    expect(appData.setCalls).toHaveLength(0);
  });

  it('init() succeeds silently when no dataServices is wired', async () => {
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice' },
    });

    await expect(cm.init()).resolves.toBeUndefined();
    expect(() => cm.getApplicationContext()).toThrow(
      /requires dataServices/i,
    );

    cm.dispose();
  });

  it('setDataServices() supports late wiring before init()', async () => {
    const { handle: dataServices, appData } = createFakeDataServices();
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice' },
    });
    cm.setDataServices(dataServices);
    appData.readyResolve();

    await cm.init();

    expect(appData.get('ApplicationContext', 'AppId')).toBe('TestApp');
    expect(cm.getApplicationContext().AppId).toBe('TestApp');

    cm.dispose();
  });

  it('getApplicationContext() throws before init() has published', () => {
    const { handle: dataServices } = createFakeDataServices();
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice' },
      dataServices,
    });

    expect(() => cm.getApplicationContext()).toThrow(/before init/i);

    cm.dispose();
  });

  it('publishes the four keys in the documented order', async () => {
    const { handle: dataServices, appData } = createFakeDataServices();
    const cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice' },
      dataServices,
    });
    appData.readyResolve();

    await cm.init();

    // Sequential ordering matters — `AppDataMirror.set` reads
    // `byName` after each round-trip, so racing four inserts would
    // create four separate configIds. The order itself is informational
    // (any order would be functionally correct), but we lock the
    // documented order so future refactors don't quietly reshuffle.
    const keys = appData.setCalls
      .filter((c) => c.name === 'ApplicationContext')
      .map((c) => c.key);
    expect(keys).toEqual([
      'AppId',
      'LoggedInUser',
      'ImpersonatedUser',
      'LoggedInUserProfile',
    ]);

    cm.dispose();
  });
});
