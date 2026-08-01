/**
 * Impersonation tests for `ConfigManager` (Session 8).
 *
 * Decision 5 of the redesign separates the **owner** slot
 * (`AppConfigRow.userId` — drives visibility) from the **audit** slots
 * (`createdBy` / `updatedBy` — audit trail). When an admin sets
 * `ImpersonatedUser` on `ApplicationContext` the framework treats
 * that user as the effective user for ownership and visibility, but
 * audit fields keep tracking the real signed-in user so impersonation
 * can never rewrite history.
 *
 * These tests pin the centralised flow:
 *   - `setImpersonatedUser` flips `ApplicationContext.ImpersonatedUser`.
 *   - Subsequent saves stamp owner from the effective user, audit from
 *     the real identity.
 *   - Subsequent reads filter by the effective user.
 *   - Clearing impersonation reverts both.
 *   - Without `dataServices` wired, `setImpersonatedUser` throws.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import { getEffectiveUser } from './effectiveUser';
import type {
  AppConfigRow,
  AppDataMirrorHandle,
  ApplicationContext,
  DataServicesHandle,
} from './types';

// `createConfigManager` always opens the same Dexie database, so wipe
// IndexedDB between tests for isolation. Same pattern the visibility
// integration test uses.
const DB_NAME = 'marketsui-config';

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/**
 * Tiny in-memory stand-in for `AppDataMirror` — same shape as the
 * Session 7 ApplicationContext fake. `set` + `get` are sync underneath
 * even though `set` is typed `Promise<void>`, which matches the real
 * mirror's main-thread cache: writes update the cache immediately and
 * round-trip to the worker in the background.
 */
function createFakeAppData(): AppDataMirrorHandle & {
  store: Map<string, unknown>;
  readyResolve: () => void;
} {
  const store = new Map<string, unknown>();
  let readyResolve!: () => void;
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  const handle: AppDataMirrorHandle = {
    async set(name, key, value) {
      store.set(`${name} ${key}`, value);
    },
    get(name, key) {
      return store.get(`${name} ${key}`);
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
  return Object.assign(handle, { store, readyResolve });
}

function createFakeDataServices() {
  const appData = createFakeAppData();
  const handle: DataServicesHandle = { appData };
  return { handle, appData };
}

/**
 * Build a partial row that `saveConfig` will fill in. We deliberately
 * skip `userId` / `createdBy` / `updatedBy` / `creationTime` /
 * `updatedTime` so `stampWrite` and the effective-user owner default
 * stamp them. Casting back to `AppConfigRow` keeps the writer's type
 * happy without sneaking in misleading default values.
 */
function makeRow(over: Partial<AppConfigRow>): AppConfigRow {
  return {
    configId: over.configId ?? 'cfg',
    appId: over.appId ?? 'TestApp',
    isPublic: over.isPublic,
    displayText: over.displayText ?? 'row',
    componentType: over.componentType ?? 'GRID',
    componentSubType: over.componentSubType ?? 'CREDIT',
    isTemplate: over.isTemplate ?? false,
    payload: over.payload ?? {},
    ...over,
  } as unknown as AppConfigRow;
}

describe('ConfigManager — impersonation (Session 8)', () => {
  let cm: ConfigManager;
  let appData: ReturnType<typeof createFakeAppData>;

  beforeEach(async () => {
    await wipeDatabase();
    const ds = createFakeDataServices();
    appData = ds.appData;
    cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'real-user', displayName: 'Real User' },
      dataServices: ds.handle,
    });
    appData.readyResolve();
    await cm.init();
  });

  afterEach(async () => {
    cm.dispose();
    await wipeDatabase();
  });

  // ─── Setter mechanics ───────────────────────────────────────────

  it('setImpersonatedUser updates ApplicationContext.ImpersonatedUser', async () => {
    expect(cm.getApplicationContext().ImpersonatedUser).toBeNull();

    await cm.setImpersonatedUser({ userId: 'alice', displayName: 'Alice' });

    expect(cm.getApplicationContext().ImpersonatedUser).toEqual({
      userId: 'alice',
      displayName: 'Alice',
    });
  });

  it('setImpersonatedUser(null) clears the slot', async () => {
    await cm.setImpersonatedUser({ userId: 'alice' });
    expect(cm.getApplicationContext().ImpersonatedUser).toEqual({
      userId: 'alice',
    });

    await cm.setImpersonatedUser(null);
    expect(cm.getApplicationContext().ImpersonatedUser).toBeNull();
  });

  // ─── Owner stamping ────────────────────────────────────────────

  it('saved row owner === seeded identity.userId even while impersonating; audit === real user', async () => {
    await cm.setImpersonatedUser({ userId: 'alice', displayName: 'Alice' });

    await cm.saveConfig(
      makeRow({
        configId: 'cfg-1',
        appId: 'TestApp',
        isPublic: false,
        displayText: 'private cfg',
        componentType: 'GRID',
        componentSubType: 'CREDIT',
        isTemplate: false,
        payload: {},
      }),
    );

    const row = (await cm.getConfig('cfg-1'))!;
    expect(row.userId).toBe('real-user');
    expect(row.createdBy).toBe('real-user');
    expect(row.updatedBy).toBe('real-user');
  });

  it('every save stamps owner to seeded identity.userId regardless of impersonation state', async () => {
    await cm.setImpersonatedUser({ userId: 'alice' });
    await cm.saveConfig(
      makeRow({
        configId: 'cfg-as-alice',
        appId: 'TestApp',
        isPublic: false,
      }),
    );

    await cm.setImpersonatedUser(null);
    await cm.saveConfig(
      makeRow({
        configId: 'cfg-as-real',
        appId: 'TestApp',
        isPublic: false,
      }),
    );

    expect((await cm.getConfig('cfg-as-alice'))!.userId).toBe('real-user');
    expect((await cm.getConfig('cfg-as-real'))!.userId).toBe('real-user');
  });

  // ─── Visibility ─────────────────────────────────────────────────

  it('reads as alice show alice-owned private rows; hide real-user-owned private rows', async () => {
    const internal = cm as unknown as {
      db: { appConfig: { put: (r: AppConfigRow) => Promise<string> } };
    };
    await internal.db.appConfig.put(
      makeRow({ configId: 'priv-alice', appId: 'TestApp', userId: 'alice', isPublic: false }),
    );
    await internal.db.appConfig.put(
      makeRow({ configId: 'pub-alice', appId: 'TestApp', userId: 'alice', isPublic: true }),
    );
    await internal.db.appConfig.put(
      makeRow({ configId: 'priv-real', appId: 'TestApp', userId: 'real-user', isPublic: false }),
    );
    await internal.db.appConfig.put(
      makeRow({ configId: 'pub-real', appId: 'TestApp', userId: 'real-user', isPublic: true }),
    );

    await cm.setImpersonatedUser({ userId: 'alice' });
    const visibleAsAlice = (await cm.getConfigsByApp('TestApp'))
      .map((r) => r.configId)
      .sort();
    expect(visibleAsAlice).toEqual(['priv-alice', 'pub-alice', 'pub-real']);

    await cm.setImpersonatedUser(null);
    const visibleAsReal = (await cm.getConfigsByApp('TestApp'))
      .map((r) => r.configId)
      .sort();
    expect(visibleAsReal).toEqual(['priv-real', 'pub-alice', 'pub-real']);
  });

  // ─── Guard: no dataServices ────────────────────────────────────

  it('setImpersonatedUser throws when dataServices is not configured', async () => {
    await wipeDatabase();
    const bare = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'real-user' },
    });
    await bare.init();

    await expect(
      bare.setImpersonatedUser({ userId: 'alice' }),
    ).rejects.toThrow(/requires dataServices/i);

    bare.dispose();
  });
});

describe('getEffectiveUser helper (Session 8)', () => {
  // Pure helper — no DB / no ConfigManager. Locks the simple rule so a
  // future refactor can't quietly invert it.
  const ctxBase: ApplicationContext = {
    AppId: 'TestApp',
    LoggedInUser: { userId: 'real-user', displayName: 'Real' },
    ImpersonatedUser: null,
    LoggedInUserProfile: { roles: [], permissions: [] },
  };

  it('returns LoggedInUser when ImpersonatedUser is null', () => {
    expect(getEffectiveUser(ctxBase)).toEqual({
      userId: 'real-user',
      displayName: 'Real',
    });
  });

  it('returns ImpersonatedUser when set', () => {
    expect(
      getEffectiveUser({
        ...ctxBase,
        ImpersonatedUser: { userId: 'alice', displayName: 'Alice' },
      }),
    ).toEqual({ userId: 'alice', displayName: 'Alice' });
  });
});
