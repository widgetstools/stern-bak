/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createFakeConfigManager, type FakeConfigManager } from '../test-utils/fakeConfigManager';

/**
 * Mock the module boundary, not the hook. `@wellsfargo-starui/core/host/config`
 * (buildDeployExport, normalizeImportedAppConfigRow) stays real so the
 * import-reowning and deploy-validation logic under test is the shipped one.
 */
const readHostEnv = vi.fn();
const getConfigManager = vi.fn();

vi.mock('@wellsfargo-starui/openfin/config', () => ({
  readHostEnv: (...args: unknown[]) => readHostEnv(...args),
  getConfigManager: (...args: unknown[]) => getConfigManager(...args),
}));

const { useConfigBrowser } = await import('./useConfigBrowser');

let manager: FakeConfigManager;

const APP_CONFIG_ROWS = [
  { configId: 'grid-1', appId: 'trading', payload: { columns: 3 } },
  { configId: 'grid-2', appId: 'trading', payload: { columns: 5 } },
  { configId: 'chart-1', appId: 'research', payload: { columns: 1 } },
];

function setup(opts: Parameters<typeof createFakeConfigManager>[0] = {}, appId = 'trading') {
  manager = createFakeConfigManager({ appId, ...opts });
  readHostEnv.mockResolvedValue({ appId, configServiceUrl: '' });
  getConfigManager.mockResolvedValue(manager);
  return renderHook(() => useConfigBrowser());
}

/** Boot is async (readHostEnv + getConfigManager + counts + rows). */
async function booted(...args: Parameters<typeof setup>) {
  const view = setup(...args);
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

/**
 * `setSelected` flips `selected` synchronously but `rows` only catches up on
 * the next effect, so waiting on the key alone leaves the previous table's
 * rows in place — enough to make anything reading `rows` (previewImport,
 * deleteAllRows) assert against the wrong table.
 */
async function selectTable(
  result: { current: { setSelected: (k: any) => void; selected: { key: string; primaryKey: string }; rows: any[] } },
  key: string,
  expectedRows: number,
) {
  act(() => result.current.setSelected(key as any));
  await waitFor(() => {
    expect(result.current.selected.key).toBe(key);
    expect(result.current.rows).toHaveLength(expectedRows);
    // Row count alone is not enough to prove the swap happened — two tables
    // can hold the same number of rows. Every row carrying the new table's
    // primary key is what actually distinguishes them.
    const pk = result.current.selected.primaryKey;
    expect(result.current.rows.every((r) => r?.[pk] !== undefined)).toBe(true);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useConfigBrowser — boot', () => {
  it('publishes host env, REST url and seed url from the manager', async () => {
    const { result } = await booted({
      restUrl: 'https://config.example/api',
      seedConfigUrl: '/config/seed.json',
      appConfig: APP_CONFIG_ROWS,
    });

    expect(result.current.hostEnv).toEqual({ appId: 'trading', configServiceUrl: '' });
    // restUrl comes from the MANAGER, not hostEnv — a dock-spawned window has
    // no registry customData, so hostEnv.configServiceUrl is empty there.
    expect(result.current.restUrl).toBe('https://config.example/api');
    expect(result.current.seedConfigUrl).toBe('/config/seed.json');
  });

  it('reports local-only mode as undefined restUrl and a null seed url', async () => {
    const { result } = await booted();

    expect(result.current.restUrl).toBeUndefined();
    expect(result.current.seedConfigUrl).toBeNull();
  });

  it('opens on appConfig, scoped to the active appId', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    expect(result.current.selected.key).toBe('appConfig');
    expect(result.current.rows.map((r) => r.configId)).toEqual(['grid-1', 'grid-2']);
  });

  it('shows every row when no appId is scoped', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS }, '');

    expect(result.current.rows.map((r) => r.configId)).toEqual(['grid-1', 'grid-2', 'chart-1']);
  });

  it('counts scopable tables inside the scope and global tables across it', async () => {
    const { result } = await booted({
      appConfig: APP_CONFIG_ROWS,
      appRegistry: [{ appId: 'trading' }, { appId: 'research' }],
      userProfile: [{ userId: 'u1', appId: 'trading' }, { userId: 'u2', appId: 'research' }],
      roles: [{ roleId: 'r1' }],
      permissions: [{ permissionId: 'p1' }, { permissionId: 'p2' }],
      pendingSync: [{ id: 1 }],
    });

    expect(result.current.counts).toEqual({
      appConfig: 2,      // scoped to trading
      appRegistry: 2,    // always global
      userProfile: 1,    // scoped to trading
      roles: 1,
      permissions: 2,
      pendingSync: 1,
    });
  });

  it('stops loading and logs rather than hanging when boot fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    readHostEnv.mockRejectedValue(new Error('no host env'));
    getConfigManager.mockResolvedValue(createFakeConfigManager());

    const { result } = renderHook(() => useConfigBrowser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(error).toHaveBeenCalledWith('Config Browser boot failed:', expect.any(Error));
    // A spinner that never resolves is the failure mode this guards.
    expect(result.current.rows).toEqual([]);
  });
});

describe('useConfigBrowser — table selection', () => {
  it('reloads rows for the newly selected table', async () => {
    const { result } = await booted({
      appConfig: APP_CONFIG_ROWS,
      roles: [{ roleId: 'admin' }, { roleId: 'trader' }],
    });

    await selectTable(result, 'roles', 2);

    expect(result.current.rows.map((r) => r.roleId)).toEqual(['admin', 'trader']);
    expect(result.current.selected.primaryKey).toBe('roleId');
  });

  it('does not scope a non-scopable table by appId', async () => {
    const { result } = await booted({
      appRegistry: [{ appId: 'trading' }, { appId: 'research' }],
    });

    await selectTable(result, 'appRegistry', 2);

    // App Registry is global — filtering it by the active appId would hide
    // every other app from the only screen that can edit them.
    expect(result.current.rows.map((r) => r.appId)).toEqual(['trading', 'research']);
  });

  it('refresh re-reads both rows and counts', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    await manager.db.appConfig.put({ configId: 'grid-3', appId: 'trading' });
    await act(async () => { await result.current.refresh(); });

    expect(result.current.rows).toHaveLength(3);
    expect(result.current.counts.appConfig).toBe(3);
  });
});

describe('useConfigBrowser — saveRow', () => {
  it.each([
    ['appConfig', 'saveConfig', { configId: 'grid-9', appId: 'trading' }],
    ['appRegistry', 'saveAppRegistry', { appId: 'ops' }],
    ['userProfile', 'saveUserProfile', { userId: 'u9', appId: 'trading' }],
    ['roles', 'saveRole', { roleId: 'r9' }],
    ['permissions', 'savePermission', { permissionId: 'p9' }],
  ] as const)('routes a %s save through %s', async (table, method, row) => {
    const { result } = await booted();
    const spy = vi.spyOn(manager, method);

    await selectTable(result, table, 0);
    await act(async () => { await result.current.saveRow(row); });

    // Each table has its own REST-sync + validation path inside ConfigManager;
    // a crossed wire here writes the row but skips its validation.
    expect(spy).toHaveBeenCalledWith(row);
  });

  it('writes pendingSync straight to the table — there is no public API for it', async () => {
    const { result } = await booted();

    await selectTable(result, 'pendingSync', 0);
    await act(async () => { await result.current.saveRow({ id: 7, op: 'put' }); });

    expect(manager.db.pendingSync.rows).toEqual([{ id: 7, op: 'put' }]);
  });

  it('splices a new row into the view instead of re-reading the table', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });
    const toArray = vi.spyOn(manager.db.appConfig, 'toArray');

    await act(async () => {
      await result.current.saveRow({ configId: 'grid-3', appId: 'trading', payload: {} });
    });

    expect(result.current.rows.map((r) => r.configId)).toEqual(['grid-1', 'grid-2', 'grid-3']);
    // The whole point of upsertRowLocal: a save must not cost an O(rows) read
    // plus a full grid re-render.
    expect(toArray).not.toHaveBeenCalled();
  });

  it('replaces an existing row in place, keeping its position', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    await act(async () => {
      await result.current.saveRow({ configId: 'grid-1', appId: 'trading', payload: { columns: 9 } });
    });

    expect(result.current.rows.map((r) => r.configId)).toEqual(['grid-1', 'grid-2']);
    expect(result.current.rows[0].payload).toEqual({ columns: 9 });
  });

  it('reflects fields the manager stamped on write, not the submitted object', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });
    vi.spyOn(manager, 'saveConfig').mockImplementation(async (row: any) => {
      await manager.db.appConfig.put({ ...row, updatedAt: '2026-07-31T00:00:00.000Z' });
    });

    await act(async () => {
      await result.current.saveRow({ configId: 'grid-1', appId: 'trading' });
    });

    // upsertRowLocal re-reads the row by key so server-set fields show up.
    expect(result.current.rows[0].updatedAt).toBe('2026-07-31T00:00:00.000Z');
  });

  it('drops a row from the view when the save moved it out of scope', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    await act(async () => {
      await result.current.saveRow({ configId: 'grid-1', appId: 'research' });
    });

    // Re-scoping a row to another app must not leave a phantom in the current
    // view that the next save would resurrect.
    expect(result.current.rows.map((r) => r.configId)).toEqual(['grid-2']);
  });

  it('keeps an out-of-scope row visible on a non-scopable table', async () => {
    const { result } = await booted({ roles: [{ roleId: 'r1', appId: 'research' }] });

    await selectTable(result, 'roles', 1);
    await act(async () => { await result.current.saveRow({ roleId: 'r1', appId: 'ops' }); });

    expect(result.current.rows.map((r) => r.roleId)).toEqual(['r1']);
  });

  it('refreshes the counts so a new pendingSync entry shows up', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });
    vi.spyOn(manager, 'saveConfig').mockImplementation(async (row: any) => {
      await manager.db.appConfig.put(row);
      await manager.db.pendingSync.put({ id: 1, configId: row.configId });
    });

    await act(async () => {
      await result.current.saveRow({ configId: 'grid-3', appId: 'trading' });
    });

    expect(result.current.counts.pendingSync).toBe(1);
    expect(result.current.counts.appConfig).toBe(3);
  });

  it('is a no-op when the manager never became ready', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getConfigManager.mockRejectedValue(new Error('db unavailable'));
    readHostEnv.mockResolvedValue({ appId: 'trading', configServiceUrl: '' });

    const { result } = renderHook(() => useConfigBrowser());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.saveRow({ configId: 'x' }); });
    expect(result.current.rows).toEqual([]);
  });
});

describe('useConfigBrowser — deleteRow', () => {
  it.each([
    ['appConfig', 'deleteConfig', 'grid-1'],
    ['appRegistry', 'deleteAppRegistry', 'trading'],
    ['userProfile', 'deleteUserProfile', 'u1'],
    ['roles', 'deleteRole', 'r1'],
    ['permissions', 'deletePermission', 'p1'],
  ] as const)('routes a %s delete through %s, stringifying the id', async (table, method, id) => {
    const { result } = await booted();
    const spy = vi.spyOn(manager, method);

    await selectTable(result, table, 0);
    await act(async () => { await result.current.deleteRow(id); });

    expect(spy).toHaveBeenCalledWith(id);
  });

  it('deletes a pendingSync row by its raw (numeric) key', async () => {
    const { result } = await booted({ pendingSync: [{ id: 1 }, { id: 2 }] });

    await selectTable(result, 'pendingSync', 2);
    await act(async () => { await result.current.deleteRow(1); });

    // `String(1)` would not match the stored numeric key in Dexie, leaving the
    // row in the database while the view showed it gone.
    expect(manager.db.pendingSync.rows).toEqual([{ id: 2 }]);
    expect(result.current.rows).toHaveLength(1);
  });

  it('removes the row from the view and updates the counts', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    await act(async () => { await result.current.deleteRow('grid-1'); });

    expect(result.current.rows.map((r) => r.configId)).toEqual(['grid-2']);
    expect(result.current.counts.appConfig).toBe(1);
  });

  it('matches the row to remove by string comparison, so a numeric id still lands', async () => {
    const { result } = await booted({ pendingSync: [{ id: 3 }] });

    await selectTable(result, 'pendingSync', 1);
    await act(async () => { await result.current.deleteRow('3'); });

    expect(result.current.rows).toHaveLength(0);
  });
});

describe('useConfigBrowser — previewImport', () => {
  it('splits incoming rows into fresh and conflicting by primary key', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    const preview = result.current.previewImport([
      { configId: 'grid-1' },
      { configId: 'brand-new' },
    ]);

    expect(preview.conflicts.map((r) => r.configId)).toEqual(['grid-1']);
    expect(preview.fresh.map((r) => r.configId)).toEqual(['brand-new']);
    expect(preview.rows).toHaveLength(2);
  });

  it('classifies against the rows currently in view, so scope is respected', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    // chart-1 exists in the database but belongs to `research`, so from this
    // scope's point of view it is a new row.
    const preview = result.current.previewImport([{ configId: 'chart-1' }]);

    expect(preview.fresh).toHaveLength(1);
    expect(preview.conflicts).toHaveLength(0);
  });

  it.each([
    ['null', null, 'not an object'],
    ['a string', 'grid-1', 'not an object'],
    ['a number', 42, 'not an object'],
  ])('rejects %s as not-an-object', async (_label, row, reason) => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    const preview = result.current.previewImport([row]);

    expect(preview.invalid).toEqual([{ row, reason }]);
    expect(preview.fresh).toHaveLength(0);
  });

  it.each([
    ['absent', {}],
    ['undefined', { configId: undefined }],
    ['null', { configId: null }],
    ['an empty string', { configId: '' }],
  ])('rejects a row whose primary key is %s', async (_label, row) => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    const preview = result.current.previewImport([row]);

    // An empty pk would be written as a real key and collide with every other
    // pk-less row in the file.
    expect(preview.invalid).toEqual([{ row, reason: "missing primary key 'configId'" }]);
  });

  it('ignores pk-less existing rows when building the conflict set', async () => {
    const { result } = await booted({ appConfig: [{ appId: 'trading' } as any] });

    const preview = result.current.previewImport([{ configId: 'anything' }]);

    expect(preview.fresh).toHaveLength(1);
  });

  it('uses the selected table\'s primary key, not appConfig\'s', async () => {
    const { result } = await booted({ roles: [{ roleId: 'admin' }] });

    await selectTable(result, 'roles', 1);

    const preview = result.current.previewImport([{ roleId: 'admin' }, { configId: 'grid-1' }]);

    expect(preview.conflicts.map((r) => r.roleId)).toEqual(['admin']);
    expect(preview.invalid[0].reason).toBe("missing primary key 'roleId'");
  });
});

describe('useConfigBrowser — importRows', () => {
  it('skip-existing inserts only fresh rows and reports the rest as skipped', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    let out: any;
    await act(async () => {
      out = await result.current.importRows(
        [{ configId: 'grid-1', appId: 'trading', payload: { columns: 99 } }, { configId: 'new-1', appId: 'trading' }],
        'skip-existing',
      );
    });

    expect(out).toEqual({ imported: 1, skipped: 1, failed: 0, errors: [] });
    // grid-1 must be untouched — that is what "skip" means.
    expect((await manager.db.appConfig.get('grid-1')).payload).toEqual({ columns: 3 });
    expect(await manager.db.appConfig.get('new-1')).toBeTruthy();
  });

  it('overwrite upserts fresh and conflicting rows alike', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    let out: any;
    await act(async () => {
      out = await result.current.importRows(
        [{ configId: 'grid-1', appId: 'trading', payload: { columns: 99 } }, { configId: 'new-1', appId: 'trading' }],
        'overwrite',
      );
    });

    expect(out).toMatchObject({ imported: 2, skipped: 0, failed: 0 });
    expect((await manager.db.appConfig.get('grid-1')).payload).toEqual({ columns: 99 });
  });

  it('counts invalid rows as failures and names each reason', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });

    let out: any;
    await act(async () => {
      out = await result.current.importRows([{ configId: 'ok-1', appId: 'trading' }, {}, null], 'overwrite');
    });

    expect(out.imported).toBe(1);
    expect(out.failed).toBe(2);
    expect(out.errors).toEqual([
      "Invalid row: missing primary key 'configId'",
      'Invalid row: not an object',
    ]);
  });

  it('keeps importing after one row throws, and reports its index', async () => {
    const { result } = await booted({ appConfig: [] });
    vi.spyOn(manager, 'saveConfig').mockImplementation(async (row: any) => {
      if (row.configId === 'bad') throw new Error('schema violation');
      await manager.db.appConfig.put(row);
    });

    let out: any;
    await act(async () => {
      out = await result.current.importRows(
        [{ configId: 'a', appId: 'trading' }, { configId: 'bad', appId: 'trading' }, { configId: 'c', appId: 'trading' }],
        'overwrite',
      );
    });

    // A partial import that stops at the first bad row leaves the database in
    // a state nobody asked for; it must carry on and account for the failure.
    expect(out.imported).toBe(2);
    expect(out.failed).toBe(1);
    expect(out.errors).toEqual(['Row 1: schema violation']);
  });

  it('stringifies a non-Error rejection rather than reporting "undefined"', async () => {
    const { result } = await booted({ appConfig: [] });
    vi.spyOn(manager, 'saveConfig').mockRejectedValue('quota exceeded');

    let out: any;
    await act(async () => {
      out = await result.current.importRows([{ configId: 'a', appId: 'trading' }], 'overwrite');
    });

    expect(out.errors).toEqual(['Row 0: quota exceeded']);
  });

  it('re-stamps imported appConfig rows onto the local deployment scope', async () => {
    const { result } = await booted({ appId: 'trading', userId: 'local-user', appConfig: [] });

    await act(async () => {
      await result.current.importRows(
        [{ configId: 'from-elsewhere', appId: 'someone-elses-app', payload: { columns: 1 } }],
        'overwrite',
      );
    });

    // Without the re-own, an export from another machine imports rows the
    // local scope can never see.
    expect((await manager.db.appConfig.get('from-elsewhere')).appId).toBe('trading');
  });

  it('promotes a legacy `config` field to `payload` before re-owning', async () => {
    const { result } = await booted({ appId: 'trading', userId: 'local-user', appConfig: [] });

    await act(async () => {
      await result.current.importRows(
        [{ configId: 'legacy', appId: 'trading', config: { columns: 4 } }],
        'overwrite',
      );
    });

    expect((await manager.db.appConfig.get('legacy')).payload).toEqual({ columns: 4 });
  });

  it('leaves an existing payload alone when both fields are present', async () => {
    const { result } = await booted({ appId: 'trading', userId: 'local-user', appConfig: [] });

    await act(async () => {
      await result.current.importRows(
        [{ configId: 'both', appId: 'trading', config: { columns: 4 }, payload: { columns: 8 } }],
        'overwrite',
      );
    });

    expect((await manager.db.appConfig.get('both')).payload).toEqual({ columns: 8 });
  });

  it('re-scopes imported userProfile rows to the local appId', async () => {
    const { result } = await booted({ appId: 'trading', userProfile: [] });

    await selectTable(result, 'userProfile', 0);
    await act(async () => {
      await result.current.importRows([{ userId: 'u9', appId: 'elsewhere' }], 'overwrite');
    });

    expect((await manager.db.userProfile.get('u9')).appId).toBe('trading');
  });

  it('leaves rows for global tables exactly as the file had them', async () => {
    const { result } = await booted({ appId: 'trading', roles: [] });

    await selectTable(result, 'roles', 0);
    await act(async () => {
      await result.current.importRows([{ roleId: 'admin', appId: 'elsewhere' }], 'overwrite');
    });

    expect(await manager.db.roles.get('admin')).toEqual({ roleId: 'admin', appId: 'elsewhere' });
  });

  it('refreshes the view once the import lands', async () => {
    const { result } = await booted({ appConfig: [] });

    await act(async () => {
      await result.current.importRows([{ configId: 'new-1', appId: 'trading' }], 'overwrite');
    });

    expect(result.current.rows.map((r) => r.configId)).toEqual(['new-1']);
    expect(result.current.counts.appConfig).toBe(1);
  });

  it('fails every row when the manager never became ready', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getConfigManager.mockRejectedValue(new Error('db unavailable'));
    readHostEnv.mockResolvedValue({ appId: 'trading', configServiceUrl: '' });

    const { result } = renderHook(() => useConfigBrowser());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let out: any;
    await act(async () => {
      out = await result.current.importRows([{ configId: 'a' }, { configId: 'b' }], 'overwrite');
    });

    expect(out).toEqual({ imported: 0, skipped: 0, failed: 2, errors: ['ConfigManager not ready'] });
  });
});

describe('useConfigBrowser — deleteAllRows', () => {
  it('deletes every row in view through the per-table delete method', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });
    const spy = vi.spyOn(manager, 'deleteConfig');

    let out: any;
    await act(async () => { out = await result.current.deleteAllRows(); });

    expect(out).toEqual({ deleted: 2, failed: 0, errors: [] });
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['grid-1', 'grid-2']);
    // Out-of-scope rows must survive a scoped Delete All.
    expect(manager.db.appConfig.rows.map((r) => r.configId)).toEqual(['chart-1']);
  });

  it('reports a row with no primary key instead of deleting something else', async () => {
    const { result } = await booted({ appConfig: [{ appId: 'trading' } as any] });

    let out: any;
    await act(async () => { out = await result.current.deleteAllRows(); });

    expect(out).toEqual({ deleted: 0, failed: 1, errors: ["Row missing primary key 'configId'"] });
  });

  it('keeps going past a failing delete and identifies the row', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS });
    vi.spyOn(manager, 'deleteConfig').mockImplementation(async (id: string) => {
      if (id === 'grid-1') throw new Error('row is locked');
      await manager.db.appConfig.delete(id);
    });

    let out: any;
    await act(async () => { out = await result.current.deleteAllRows(); });

    expect(out.deleted).toBe(1);
    expect(out.errors).toEqual(['configId=grid-1: row is locked']);
  });

  it('deletes pendingSync rows by their raw numeric key', async () => {
    const { result } = await booted({ pendingSync: [{ id: 1 }, { id: 2 }] });

    await selectTable(result, 'pendingSync', 2);
    await act(async () => { await result.current.deleteAllRows(); });

    expect(manager.db.pendingSync.rows).toEqual([]);
  });

  it.each([
    ['appRegistry', 'deleteAppRegistry', { appRegistry: [{ appId: 'ops' }] }],
    ['userProfile', 'deleteUserProfile', { userProfile: [{ userId: 'u1', appId: 'trading' }] }],
    ['roles', 'deleteRole', { roles: [{ roleId: 'r1' }] }],
    ['permissions', 'deletePermission', { permissions: [{ permissionId: 'p1' }] }],
  ] as const)('routes a %s bulk delete through %s', async (table, method, seed) => {
    const { result } = await booted(seed);
    const spy = vi.spyOn(manager, method);

    await selectTable(result, table, 1);
    await act(async () => { await result.current.deleteAllRows(); });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('fails every row when the manager never became ready', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getConfigManager.mockRejectedValue(new Error('db unavailable'));
    readHostEnv.mockResolvedValue({ appId: 'trading', configServiceUrl: '' });

    const { result } = renderHook(() => useConfigBrowser());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let out: any;
    await act(async () => { out = await result.current.deleteAllRows(); });

    expect(out).toEqual({ deleted: 0, failed: 0, errors: ['ConfigManager not ready'] });
  });
});

describe('useConfigBrowser — exports', () => {
  it('exportAll scopes appConfig and userProfile but not the global tables', async () => {
    const { result } = await booted({
      appConfig: APP_CONFIG_ROWS,
      appRegistry: [{ appId: 'trading' }, { appId: 'research' }],
      userProfile: [{ userId: 'u1', appId: 'trading' }, { userId: 'u2', appId: 'research' }],
      roles: [{ roleId: 'r1' }],
      permissions: [{ permissionId: 'p1' }],
    });

    let bundle: any;
    await act(async () => { bundle = await result.current.exportAll(); });

    expect(bundle.appConfig.map((r: any) => r.configId)).toEqual(['grid-1', 'grid-2']);
    expect(bundle.userProfiles.map((r: any) => r.userId)).toEqual(['u1']);
    expect(bundle.appRegistry).toHaveLength(2);
    expect(bundle.roles).toHaveLength(1);
    expect(bundle.permissions).toHaveLength(1);
    // `userProfiles` (plural) matches the seed bundle shape even though the
    // Dexie table is `userProfile` — the file has to round-trip as a seed.
    expect(Object.keys(bundle)).toEqual([
      'appConfig', 'appRegistry', 'userProfiles', 'roles', 'permissions',
    ]);
  });

  it('exportAll returns everything when no appId is scoped', async () => {
    const { result } = await booted({ appConfig: APP_CONFIG_ROWS }, '');

    let bundle: any;
    await act(async () => { bundle = await result.current.exportAll(); });

    expect(bundle.appConfig).toHaveLength(3);
  });

  it('exportAll yields an empty bundle when the manager never became ready', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getConfigManager.mockRejectedValue(new Error('db unavailable'));
    readHostEnv.mockResolvedValue({ appId: 'trading', configServiceUrl: '' });

    const { result } = renderHook(() => useConfigBrowser());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let bundle: any;
    await act(async () => { bundle = await result.current.exportAll(); });

    expect(bundle).toEqual({ appConfig: [], appRegistry: [], userProfiles: [], roles: [], permissions: [] });
  });

  it('exportDeploy reads appConfig unfiltered so stale-scope rows still ship', async () => {
    const { result } = await booted({
      appId: 'trading',
      userId: 'local-user',
      appConfig: APP_CONFIG_ROWS,
    });
    const unfiltered = vi.spyOn(manager, 'getAllConfigsUnfiltered');

    let out: any;
    await act(async () => { out = await result.current.exportDeploy(); });

    // A row left behind on an old appId is exactly the row a deploy needs;
    // scoping it out here is how a seed silently loses a workspace.
    expect(unfiltered).toHaveBeenCalledTimes(1);
    expect(out.stats.appConfigTotal).toBe(3);
    expect(out).toHaveProperty('warnings');
    expect(out).toHaveProperty('hasErrors');
  });

  it('exportDeploy still validates when the manager never became ready', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getConfigManager.mockRejectedValue(new Error('db unavailable'));
    readHostEnv.mockResolvedValue({ appId: 'trading', configServiceUrl: '' });

    const { result } = renderHook(() => useConfigBrowser());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let out: any;
    await act(async () => { out = await result.current.exportDeploy(); });

    expect(out.stats.appConfigTotal).toBe(0);
    expect(out.bundle.appConfig).toEqual([]);
  });
});

describe('useConfigBrowser — resetToSeed', () => {
  it('resets and refreshes the view', async () => {
    const { result } = await booted({
      seedConfigUrl: '/config/seed.json',
      appConfig: APP_CONFIG_ROWS,
    });
    vi.spyOn(manager, 'resetToSeed').mockImplementation(async () => {
      manager.db.appConfig.rows = [{ configId: 'seeded', appId: 'trading' }];
      return { seedUrl: '/config/seed.json', counts: { appConfig: 1, appRegistry: 0, userProfiles: 0, roles: 0, permissions: 0 } };
    });

    let out: any;
    await act(async () => { out = await result.current.resetToSeed(); });

    expect(out.seedUrl).toBe('/config/seed.json');
    expect(result.current.rows.map((r) => r.configId)).toEqual(['seeded']);
    expect(result.current.counts.appConfig).toBe(1);
  });

  it('rejects rather than silently doing nothing when the manager is not ready', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getConfigManager.mockRejectedValue(new Error('db unavailable'));
    readHostEnv.mockResolvedValue({ appId: 'trading', configServiceUrl: '' });

    const { result } = renderHook(() => useConfigBrowser());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Unlike the other actions this one throws — the caller shows a failure
    // dialog, which is right for an operation that would wipe everything.
    await expect(result.current.resetToSeed()).rejects.toThrow('ConfigManager not ready');
  });

  it('propagates a reset failure without refreshing', async () => {
    const { result } = await booted({ seedConfigUrl: '/config/seed.json', appConfig: APP_CONFIG_ROWS });
    vi.spyOn(manager, 'resetToSeed').mockRejectedValue(new Error('seed fetch failed'));

    await expect(result.current.resetToSeed()).rejects.toThrow('seed fetch failed');
    // The DB is left untouched on a fetch/parse failure, so the view must be too.
    expect(result.current.rows).toHaveLength(2);
  });
});
