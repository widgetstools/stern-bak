import { describe, expect, it } from 'vitest';
import {
  CONFIG_BROWSER_TABLES,
  TABLES,
  type ConfigBrowserTableKey,
} from './configBrowserTables';

/**
 * The Config Browser drives its sidebar, its row-key column and its
 * scope filter straight off this table. A wrong `primaryKey` makes the
 * grid render rows it cannot edit; a wrong `scopable` shows or hides the
 * app/user scope selector on the wrong table.
 */
describe('CONFIG_BROWSER_TABLES', () => {
  it('lists the six Dexie tables in sidebar order', () => {
    expect(CONFIG_BROWSER_TABLES.map((t) => t.key)).toEqual([
      'appConfig',
      'appRegistry',
      'userProfile',
      'roles',
      'permissions',
      'pendingSync',
    ]);
  });

  it('names the correct primary key for each table', () => {
    const byKey = Object.fromEntries(CONFIG_BROWSER_TABLES.map((t) => [t.key, t.primaryKey]));
    expect(byKey).toEqual({
      appConfig: 'configId',
      appRegistry: 'appId',
      userProfile: 'userId',
      roles: 'roleId',
      permissions: 'permissionId',
      pendingSync: 'id',
    });
  });

  it('marks only the two user/app-scoped tables as scopable', () => {
    const scopable = CONFIG_BROWSER_TABLES.filter((t) => t.scopable).map((t) => t.key);
    expect(scopable).toEqual(['appConfig', 'userProfile']);
  });

  it('gives every table a label and a description for the sidebar', () => {
    for (const table of CONFIG_BROWSER_TABLES) {
      expect(table.label.length).toBeGreaterThan(0);
      expect(table.description.length).toBeGreaterThan(0);
    }
  });

  it('has unique keys — the sidebar selects by key', () => {
    const keys = CONFIG_BROWSER_TABLES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is reachable through the deprecated `TABLES` alias', () => {
    // config-browser still imports the old name; dropping the alias
    // would break it silently at runtime.
    expect(TABLES).toBe(CONFIG_BROWSER_TABLES);
  });

  it('accepts every key as a ConfigBrowserTableKey', () => {
    const keys: ConfigBrowserTableKey[] = CONFIG_BROWSER_TABLES.map((t) => t.key);
    expect(keys).toHaveLength(6);
  });
});
