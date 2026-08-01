/**
 * Auth-table CRUD + permission resolution for `ConfigManager`.
 *
 * `getUserPermissions` / `userHasPermission` are the only place the
 * three auth tables are joined, and they are what gates every
 * permission check in the platform. Both walk `userProfile.roleIds` →
 * `roles.permissionIds` → `permissions`, and both are deliberately
 * lenient: a dangling roleId or permissionId is skipped rather than
 * throwing, so a partially-seeded database degrades to "fewer
 * permissions" instead of a crash. Those skip branches are the ones
 * pinned here.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import type { PermissionRow, RoleRow, UserProfileRow } from './types';

function deleteSharedDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('marketsui-config');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

const perm = (permissionId: string, category = 'config'): PermissionRow => ({
  permissionId,
  description: `allows ${permissionId}`,
  category,
});

const roleRow = (roleId: string, permissionIds: string[]): RoleRow => ({
  roleId,
  displayName: roleId,
  permissionIds,
});

const profile = (userId: string, roleIds: string[]): UserProfileRow => ({
  userId,
  appId: 'ignored — saveUserProfile overwrites this',
  roleIds,
  displayName: userId,
});

describe('ConfigManager — auth tables', () => {
  let cm: ConfigManager;

  beforeEach(async () => {
    await deleteSharedDb();
    cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice' },
    });
  });

  afterEach(() => {
    cm.dispose();
  });

  describe('roles', () => {
    it('round-trips a role and lists it', async () => {
      await cm.saveRole(roleRow('admin', ['config:read', 'config:write']));
      expect((await cm.getRole('admin'))?.permissionIds).toEqual(['config:read', 'config:write']);
      expect((await cm.getAllRoles()).map((r) => r.roleId)).toEqual(['admin']);
    });

    it('returns undefined for an unknown role', async () => {
      expect(await cm.getRole('nope')).toBeUndefined();
    });

    it('deletes a role', async () => {
      await cm.saveRole(roleRow('admin', []));
      await cm.deleteRole('admin');
      expect(await cm.getRole('admin')).toBeUndefined();
      expect(await cm.getAllRoles()).toEqual([]);
    });

    it('deleting a role that does not exist is a no-op', async () => {
      await expect(cm.deleteRole('ghost')).resolves.toBeUndefined();
    });
  });

  describe('permissions', () => {
    it('round-trips a permission and lists it', async () => {
      await cm.savePermission(perm('config:read'));
      expect((await cm.getPermission('config:read'))?.description).toBe('allows config:read');
      expect((await cm.getAllPermissions()).map((p) => p.permissionId)).toEqual(['config:read']);
    });

    it('filters by category', async () => {
      await cm.savePermission(perm('config:read', 'config'));
      await cm.savePermission(perm('admin:all', 'admin'));

      expect((await cm.getPermissionsByCategory('admin')).map((p) => p.permissionId))
        .toEqual(['admin:all']);
      expect(await cm.getPermissionsByCategory('nothing-here')).toEqual([]);
    });

    it('deletes a permission', async () => {
      await cm.savePermission(perm('config:read'));
      await cm.deletePermission('config:read');
      expect(await cm.getPermission('config:read')).toBeUndefined();
    });
  });

  describe('app registry', () => {
    it('round-trips a registry entry and lists it', async () => {
      await cm.saveAppRegistry({
        appId: 'TestApp',
        displayName: 'Test App',
        manifestUrl: 'https://x/manifest.json',
        configServiceEnabled: false,
        environment: 'dev',
      });
      expect((await cm.getAppRegistry('TestApp'))?.displayName).toBe('Test App');
      expect((await cm.getAllApps()).map((a) => a.appId)).toEqual(['TestApp']);
    });

    it('deletes a registry entry', async () => {
      await cm.saveAppRegistry({
        appId: 'TestApp',
        displayName: 'Test App',
        manifestUrl: 'https://x/manifest.json',
        configServiceEnabled: false,
        environment: 'dev',
      });
      await cm.deleteAppRegistry('TestApp');
      expect(await cm.getAppRegistry('TestApp')).toBeUndefined();
    });
  });

  describe('user profiles', () => {
    it('stamps the manager\'s appId over whatever the caller passed', async () => {
      // A profile row belongs to the app that saved it; trusting the
      // caller here would let one app write rows scoped to another.
      await cm.saveUserProfile(profile('alice', ['admin']));
      expect((await cm.getUserProfile('alice'))?.appId).toBe('TestApp');
    });

    it('lists profiles by app and returns them all', async () => {
      await cm.saveUserProfile(profile('alice', ['admin']));
      await cm.saveUserProfile(profile('bob', []));

      expect((await cm.getUsersByApp('TestApp')).map((p) => p.userId).sort())
        .toEqual(['alice', 'bob']);
      expect(await cm.getUsersByApp('OtherApp')).toEqual([]);
      expect((await cm.getAllUserProfiles()).map((p) => p.userId).sort())
        .toEqual(['alice', 'bob']);
    });

    it('deletes a profile', async () => {
      await cm.saveUserProfile(profile('alice', []));
      await cm.deleteUserProfile('alice');
      expect(await cm.getUserProfile('alice')).toBeUndefined();
    });
  });

  describe('getUserPermissions', () => {
    beforeEach(async () => {
      await cm.savePermission(perm('config:read'));
      await cm.savePermission(perm('config:write'));
      await cm.savePermission(perm('admin:all', 'admin'));
      await cm.saveRole(roleRow('reader', ['config:read']));
      await cm.saveRole(roleRow('writer', ['config:read', 'config:write']));
      await cm.saveRole(roleRow('admin', ['admin:all']));
    });

    it('returns the union of every role\'s permissions', async () => {
      await cm.saveUserProfile(profile('alice', ['writer', 'admin']));

      const ids = (await cm.getUserPermissions('alice')).map((p) => p.permissionId).sort();
      expect(ids).toEqual(['admin:all', 'config:read', 'config:write']);
    });

    it('deduplicates a permission granted by two roles', async () => {
      await cm.saveUserProfile(profile('alice', ['reader', 'writer']));

      const ids = (await cm.getUserPermissions('alice')).map((p) => p.permissionId).sort();
      expect(ids).toEqual(['config:read', 'config:write']);
    });

    it('returns [] for an unknown user', async () => {
      expect(await cm.getUserPermissions('nobody')).toEqual([]);
    });

    it('returns [] for a user with no roles', async () => {
      await cm.saveUserProfile(profile('alice', []));
      expect(await cm.getUserPermissions('alice')).toEqual([]);
    });

    it('skips a roleId that has no role row', async () => {
      await cm.saveUserProfile(profile('alice', ['reader', 'deleted-role']));
      const ids = (await cm.getUserPermissions('alice')).map((p) => p.permissionId);
      expect(ids).toEqual(['config:read']);
    });

    it('skips a permissionId that has no permission row', async () => {
      // A role referencing a permission that was deleted must not
      // produce an undefined entry in the returned array.
      await cm.saveRole(roleRow('stale', ['config:read', 'gone']));
      await cm.saveUserProfile(profile('alice', ['stale']));

      const perms = await cm.getUserPermissions('alice');
      expect(perms.map((p) => p.permissionId)).toEqual(['config:read']);
      expect(perms.every(Boolean)).toBe(true);
    });
  });

  describe('userHasPermission', () => {
    beforeEach(async () => {
      await cm.saveRole(roleRow('reader', ['config:read']));
      await cm.saveRole(roleRow('admin', ['admin:all']));
    });

    it('is true when any role grants it', async () => {
      await cm.saveUserProfile(profile('alice', ['reader', 'admin']));
      expect(await cm.userHasPermission('alice', 'admin:all')).toBe(true);
    });

    it('is false when no role grants it', async () => {
      await cm.saveUserProfile(profile('alice', ['reader']));
      expect(await cm.userHasPermission('alice', 'admin:all')).toBe(false);
    });

    it('is false for an unknown user', async () => {
      expect(await cm.userHasPermission('nobody', 'config:read')).toBe(false);
    });

    it('is false when the user has no roles', async () => {
      await cm.saveUserProfile(profile('alice', []));
      expect(await cm.userHasPermission('alice', 'config:read')).toBe(false);
    });

    it('skips a dangling roleId rather than throwing', async () => {
      await cm.saveUserProfile(profile('alice', ['deleted-role', 'reader']));
      expect(await cm.userHasPermission('alice', 'config:read')).toBe(true);
    });

    it('does not require the permission row to exist — the role grant is authoritative', async () => {
      // `userHasPermission` never reads the permissions table; it answers
      // from the role's id list alone. Pinned because it means a check
      // can pass for a permission that `getUserPermissions` omits.
      await cm.saveRole(roleRow('stale', ['never-defined']));
      await cm.saveUserProfile(profile('alice', ['stale']));

      expect(await cm.userHasPermission('alice', 'never-defined')).toBe(true);
      expect(await cm.getUserPermissions('alice')).toEqual([]);
    });
  });

  describe('configExists', () => {
    it('is false before the row is written and true after', async () => {
      expect(await cm.configExists('cfg-1')).toBe(false);
      await cm.saveConfig({
        configId: 'cfg-1',
        appId: 'TestApp',
        isPublic: true,
        displayText: 'cfg one',
        componentType: 'grid',
        componentSubType: 'default',
        isTemplate: false,
        payload: {},
      } as never);
      expect(await cm.configExists('cfg-1')).toBe(true);
    });
  });
});
