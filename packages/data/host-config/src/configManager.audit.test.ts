/**
 * Owner / audit field stamping tests for `ConfigManager`.
 *
 * Session 3 of the config-manager redesign: every write through the
 * manager funnels through a single `stampWrite` helper that defaults
 * audit fields from the current `AppIdentity`. The behaviour is:
 *
 *   - INSERT: `userId` (owner) + `createdBy` + `creationTime` default
 *     to the current identity / now if the caller didn't set them.
 *   - INSERT or UPDATE: `updatedBy` + `updatedTime` are stamped
 *     unconditionally from the current identity / now.
 *
 * Until Session 8 lands impersonation, owner === audit on every row,
 * so externally-visible behaviour is unchanged for existing call sites.
 * These tests pin the centralised flow so the Session 8 swap (owner →
 * effective user, audit stays on real user) is a one-line change.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import type {
  AppConfigRow,
  AppRegistryRow,
  PermissionRow,
  RoleRow,
  UserProfileRow,
} from './types';

// Each test gets its own ConfigManager (and Dexie DB) so isolation is
// trivial — fake-indexeddb resets state between opens via test/setup.ts.

describe('ConfigManager — owner / audit stamping (Session 3)', () => {
  let cm: ConfigManager;

  beforeEach(() => {
    cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice' },
    });
  });

  // ─── AppConfigRow: owner + audit ────────────────────────────────

  it('insert stamps userId (owner) === createdBy === updatedBy === identity.userId', async () => {
    const partial = {
      configId: 'cfg-1',
      appId: 'TestApp',
      isPublic: true,
      displayText: 'cfg one',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      isTemplate: false,
      payload: { foo: 'bar' },
    } as unknown as AppConfigRow;

    await cm.saveConfig(partial);

    const row = (await cm.getConfig('cfg-1'))!;
    expect(row).toBeDefined();
    expect(row.userId).toBe('alice');
    expect(row.createdBy).toBe('alice');
    expect(row.updatedBy).toBe('alice');
    expect(row.creationTime).toBe(row.updatedTime);
    expect(typeof row.creationTime).toBe('string');
    expect(row.creationTime!.length).toBeGreaterThan(0);
  });

  it('update preserves createdBy / creationTime, advances updatedBy / updatedTime', async () => {
    // ── Insert as identity "alice"
    await cm.saveConfig({
      configId: 'cfg-2',
      appId: 'TestApp',
      isPublic: true,
      displayText: 'first',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      isTemplate: false,
      payload: { v: 1 },
    } as unknown as AppConfigRow);

    const after1 = (await cm.getConfig('cfg-2'))!;
    const originalCreationTime = after1.creationTime;
    expect(after1.createdBy).toBe('alice');
    expect(after1.creationTime).toBe(after1.updatedTime);

    // ── Swap identity to "bob" and update the same row
    const cm2 = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'bob', displayName: 'Bob' },
    });

    // Tiny wait so updatedTime can advance past creationTime — ISO
    // strings are millisecond resolution, so 5 ms is plenty.
    await new Promise((r) => setTimeout(r, 5));
    await cm2.saveConfig({
      ...after1,
      payload: { v: 2 },
    });

    const after2 = (await cm2.getConfig('cfg-2'))!;
    // createdBy / creationTime preserved across update
    expect(after2.createdBy).toBe('alice');
    expect(after2.creationTime).toBe(originalCreationTime);
    // updatedBy / updatedTime advanced to the current writer
    expect(after2.updatedBy).toBe('bob');
    expect(after2.updatedTime > originalCreationTime!).toBe(true);

    cm2.dispose();
  });

  it('overwrites caller-supplied appId / userId with deployment scope on save', async () => {
    const ts = '2025-12-31T23:59:00.000Z';
    await cm.saveConfig({
      configId: 'cfg-3',
      appId: 'wrong-app',
      userId: 'pre-set-owner',
      isPublic: false,
      displayText: 'caller-stamped',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      isTemplate: false,
      payload: {},
      createdBy: 'pre-set-creator',
      creationTime: ts,
    } as unknown as AppConfigRow);

    const row = (await cm.getConfig('cfg-3'))!;
    expect(row.appId).toBe('TestApp');
    expect(row.userId).toBe('alice');
    expect(row.createdBy).toBe('pre-set-creator');
    expect(row.creationTime).toBe(ts);
    expect(row.updatedBy).toBe('alice');
    expect(typeof row.updatedTime).toBe('string');
    expect(row.updatedTime).not.toBe(ts);
  });

  it('keeps userId system for global catalogue rows', async () => {
    await cm.saveConfig({
      configId: 'component-registry::TestApp::system',
      appId: 'wrong-app',
      userId: 'dev1',
      isPublic: true,
      displayText: 'registry',
      componentType: 'component-registry',
      componentSubType: '',
      isTemplate: false,
      payload: { version: 2, entries: [] },
    } as unknown as AppConfigRow);

    const registry = (await cm.getConfig('component-registry::TestApp::system'))!;
    expect(registry.appId).toBe('TestApp');
    expect(registry.userId).toBe('system');

    await cm.saveConfig({
      configId: 'dp-public',
      appId: 'wrong-app',
      userId: 'system',
      isPublic: true,
      displayText: 'feed',
      componentType: 'data-provider',
      componentSubType: 'stomp',
      isTemplate: false,
      payload: {},
    } as unknown as AppConfigRow);

    const provider = (await cm.getConfig('dp-public'))!;
    expect(provider.appId).toBe('TestApp');
    expect(provider.userId).toBe('system');
  });

  // ─── Auth tables — audit only, no owner concept ─────────────────

  it('saveAppRegistry stamps audit fields on insert and update', async () => {
    const reg: AppRegistryRow = {
      appId: 'TestApp',
      displayName: 'Test',
      manifestUrl: 'http://example/manifest',
      configServiceEnabled: false,
      environment: 'dev',
    };
    await cm.saveAppRegistry(reg);

    const after1 = (await cm.getAppRegistry('TestApp'))!;
    expect(after1.createdBy).toBe('alice');
    expect(after1.updatedBy).toBe('alice');
    expect(after1.creationTime).toBe(after1.updatedTime);

    await new Promise((r) => setTimeout(r, 5));
    const cm2 = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'bob' },
    });
    await cm2.saveAppRegistry({ ...after1, displayName: 'Renamed' });

    const after2 = (await cm2.getAppRegistry('TestApp'))!;
    expect(after2.createdBy).toBe('alice');                 // preserved
    expect(after2.creationTime).toBe(after1.creationTime);   // preserved
    expect(after2.updatedBy).toBe('bob');
    expect(after2.updatedTime! > after1.updatedTime!).toBe(true);
    cm2.dispose();
  });

  it('saveUserProfile stamps audit fields independently of the row primary key', async () => {
    const profile: UserProfileRow = {
      userId: 'charlie',          // primary key — the user this profile is FOR
      appId: 'TestApp',
      roleIds: ['viewer'],
      displayName: 'Charlie',
    };
    await cm.saveUserProfile(profile);                       // identity = alice

    const row = (await cm.getUserProfile('charlie'))!;
    // Primary key untouched
    expect(row.userId).toBe('charlie');
    // Audit fields reflect the WRITER (alice), not the row subject
    expect(row.createdBy).toBe('alice');
    expect(row.updatedBy).toBe('alice');
    expect(typeof row.creationTime).toBe('string');
    expect(typeof row.updatedTime).toBe('string');
  });

  it('saveRole stamps audit fields', async () => {
    const role: RoleRow = {
      roleId: 'admin',
      displayName: 'Admin',
      permissionIds: ['config:read', 'config:write'],
    };
    await cm.saveRole(role);

    const row = (await cm.getRole('admin'))!;
    expect(row.createdBy).toBe('alice');
    expect(row.updatedBy).toBe('alice');
  });

  it('savePermission stamps audit fields', async () => {
    const perm: PermissionRow = {
      permissionId: 'config:read',
      description: 'Read configs',
      category: 'config',
    };
    await cm.savePermission(perm);

    const row = (await cm.getPermission('config:read'))!;
    expect(row.createdBy).toBe('alice');
    expect(row.updatedBy).toBe('alice');
  });
});
