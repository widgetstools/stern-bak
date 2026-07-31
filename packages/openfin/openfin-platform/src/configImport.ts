/**
 * Bulk import of an exported config bundle into the local ConfigManager.
 *
 * Pairs with the export shape produced by `exportAllConfig` in
 * `workspace.ts`:
 *
 *   {
 *     appRegistry: AppRegistryRow[],
 *     appConfig:   AppConfigRow[],
 *     userProfiles: UserProfileRow[],
 *     roles: RoleRow[],
 *     permissions: PermissionRow[],
 *     exportedAt: string,
 *   }
 *
 * Every imported `appConfig` row is re-stamped to the deployment's
 * `activeAppId` / `activeUserId` (from `seed.json`, via ConfigManager)
 * before `saveConfig()` — imports from other machines or exports with
 * stale scope become readable under the local deployment.
 *
 * userProfile rows are intentionally NOT imported — userId IS the row's
 * primary key, so importing would either collide with or silently
 * overwrite local profiles. Replicating users is a separate concern; the
 * Config Browser exposes per-row import for that case.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AppConfigRow,
  AppRegistryRow,
  PermissionRow,
  RoleRow,
} from '@wellsfargo-starui/host-config';
import { normalizeImportedAppConfigRow } from '@wellsfargo-starui/host-config';
import { getConfigManager } from './db';

/** Result of importing a single table. */
export interface ImportTableResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/** Aggregate result across all tables in the bundle. */
export interface ImportConfigBundleResult {
  appConfig: ImportTableResult;
  appRegistry: ImportTableResult;
  roles: ImportTableResult;
  permissions: ImportTableResult;
  totalImported: number;
  totalSkipped: number;
  totalFailed: number;
}

export type ImportMode = 'overwrite' | 'skip-existing';

export interface ImportConfigBundleOptions {
  /**
   * `overwrite` (default) — every valid row is upserted by primary key.
   * `skip-existing`        — only rows whose primary key is NOT already
   *                          present locally are inserted; conflicting
   *                          rows are reported as skipped and untouched.
   */
  mode?: ImportMode;
}

/** Shape we accept on input. Tolerant — older exports may omit fields. */
export interface ImportBundle {
  appConfig?: AppConfigRow[];
  appRegistry?: AppRegistryRow[];
  roles?: RoleRow[];
  permissions?: PermissionRow[];
  /**
   * Ignored on import — deployment identity comes from `seed.json`
   * `activeAppId` / `activeUserId`, not the bundle file.
   */
  activeAppId?: string;
  activeUserId?: string;
  /**
   * Present in exports but NOT auto-imported. See module header — userId
   * IS the primary key, so importing would collide with local profiles.
   */
  userProfiles?: unknown[];
  exportedAt?: string;
}

const EMPTY_TABLE_RESULT = (): ImportTableResult => ({
  imported: 0,
  skipped: 0,
  failed: 0,
  errors: [],
});

function prepareAppConfigForImport(
  row: AppConfigRow,
  activeAppId: string,
  activeUserId: string,
): AppConfigRow {
  const next: AppConfigRow = { ...row };
  // Tolerate legacy exports that used `config` instead of `payload`.
  if ((next as any).config && !(next as any).payload) {
    (next as any).payload = (next as any).config;
  }
  return normalizeImportedAppConfigRow(next, { activeAppId, activeUserId });
}

function pickValid<T>(rows: readonly T[], pk: keyof T): { valid: T[]; invalid: { row: T; reason: string }[] } {
  const valid: T[] = [];
  const invalid: { row: T; reason: string }[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      invalid.push({ row, reason: 'not an object' });
      continue;
    }
    const key = (row as any)[pk];
    if (key === undefined || key === null || key === '') {
      invalid.push({ row, reason: `missing primary key '${String(pk)}'` });
      continue;
    }
    valid.push(row);
  }
  return { valid, invalid };
}

/**
 * Import every supported section of an exported config bundle into the
 * local ConfigManager singleton. Returns per-table counts so callers can
 * surface a useful success message.
 */
export async function importConfigBundle(
  bundle: ImportBundle,
  opts: ImportConfigBundleOptions = {},
): Promise<ImportConfigBundleResult> {
  const mode: ImportMode = opts.mode ?? 'overwrite';
  const cm = await getConfigManager();
  const activeAppId = cm.getAppId();
  const activeUserId = cm.getIdentity().userId;

  const result: ImportConfigBundleResult = {
    appConfig: EMPTY_TABLE_RESULT(),
    appRegistry: EMPTY_TABLE_RESULT(),
    roles: EMPTY_TABLE_RESULT(),
    permissions: EMPTY_TABLE_RESULT(),
    totalImported: 0,
    totalSkipped: 0,
    totalFailed: 0,
  };

  // ── appConfig ───────────────────────────────────────────────────
  if (Array.isArray(bundle.appConfig) && bundle.appConfig.length > 0) {
    const { valid, invalid } = pickValid(bundle.appConfig, 'configId');
    result.appConfig.failed += invalid.length;
    for (const inv of invalid) result.appConfig.errors.push(`appConfig: ${inv.reason}`);

    const existingIds = mode === 'skip-existing'
      ? new Set((await cm.getAllConfigsUnfiltered()).map((r) => r.configId))
      : null;

    for (const row of valid) {
      try {
        const prepared = prepareAppConfigForImport(row, activeAppId, activeUserId);
        if (mode === 'skip-existing' && existingIds?.has(prepared.configId)) {
          result.appConfig.skipped++;
          continue;
        }
        await cm.saveConfig(prepared);
        result.appConfig.imported++;
      } catch (err) {
        result.appConfig.failed++;
        result.appConfig.errors.push(`appConfig[${row.configId}]: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── appRegistry ─────────────────────────────────────────────────
  if (Array.isArray(bundle.appRegistry) && bundle.appRegistry.length > 0) {
    const { valid, invalid } = pickValid(bundle.appRegistry, 'appId');
    result.appRegistry.failed += invalid.length;
    for (const inv of invalid) result.appRegistry.errors.push(`appRegistry: ${inv.reason}`);

    const existingIds = mode === 'skip-existing'
      ? new Set((await cm.getAllApps()).map((r) => r.appId))
      : null;

    for (const row of valid) {
      try {
        if (existingIds?.has(row.appId)) {
          result.appRegistry.skipped++;
          continue;
        }
        await cm.saveAppRegistry(row);
        result.appRegistry.imported++;
      } catch (err) {
        result.appRegistry.failed++;
        result.appRegistry.errors.push(`appRegistry[${row.appId}]: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── roles ────────────────────────────────────────────────────────
  if (Array.isArray(bundle.roles) && bundle.roles.length > 0) {
    const { valid, invalid } = pickValid(bundle.roles, 'roleId');
    result.roles.failed += invalid.length;
    for (const inv of invalid) result.roles.errors.push(`roles: ${inv.reason}`);

    const existingIds = mode === 'skip-existing'
      ? new Set((await cm.getAllRoles()).map((r) => r.roleId))
      : null;

    for (const row of valid) {
      try {
        if (existingIds?.has(row.roleId)) {
          result.roles.skipped++;
          continue;
        }
        await cm.saveRole(row);
        result.roles.imported++;
      } catch (err) {
        result.roles.failed++;
        result.roles.errors.push(`roles[${row.roleId}]: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── permissions ─────────────────────────────────────────────────
  if (Array.isArray(bundle.permissions) && bundle.permissions.length > 0) {
    const { valid, invalid } = pickValid(bundle.permissions, 'permissionId');
    result.permissions.failed += invalid.length;
    for (const inv of invalid) result.permissions.errors.push(`permissions: ${inv.reason}`);

    const existingIds = mode === 'skip-existing'
      ? new Set((await cm.getAllPermissions()).map((r) => r.permissionId))
      : null;

    for (const row of valid) {
      try {
        if (existingIds?.has(row.permissionId)) {
          result.permissions.skipped++;
          continue;
        }
        await cm.savePermission(row);
        result.permissions.imported++;
      } catch (err) {
        result.permissions.failed++;
        result.permissions.errors.push(`permissions[${row.permissionId}]: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  result.totalImported =
    result.appConfig.imported + result.appRegistry.imported
    + result.roles.imported + result.permissions.imported;
  result.totalSkipped =
    result.appConfig.skipped + result.appRegistry.skipped
    + result.roles.skipped + result.permissions.skipped;
  result.totalFailed =
    result.appConfig.failed + result.appRegistry.failed
    + result.roles.failed + result.permissions.failed;

  return result;
}
