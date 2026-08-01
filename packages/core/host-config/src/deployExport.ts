/**
 * Scoped deploy export — filters a Config Browser raw bundle down to the
 * rows a deployment seed actually needs, validates coherence, and
 * normalizes appId drift via {@link normalizeSeedData}.
 */

import { activeAppIdFromSeed, activeUserIdFromSeed, normalizeSeedData } from './normalizeSeedData';
import { MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE } from './profileBundle.types';
import type { AppConfigRow, SeedData } from './types';

/** Same shape as Config Browser `exportAll` / `SeedData`. */
export interface DeployExportInput {
  /** Deployment scope written to seed.json — defaults from ConfigManager when exporting. */
  activeAppId?: string;
  activeUserId?: string;
  appConfig: AppConfigRow[];
  appRegistry: SeedData['appRegistry'];
  userProfiles: SeedData['userProfiles'];
  roles: SeedData['roles'];
  permissions: SeedData['permissions'];
}

export type DeployExportSeverity = 'error' | 'warn' | 'info';

export interface DeployExportWarning {
  severity: DeployExportSeverity;
  code: string;
  message: string;
  configId?: string;
}

export interface DeployExportStats {
  appConfigTotal: number;
  appConfigIncluded: number;
  appConfigExcluded: number;
  referencedInstanceIds: string[];
}

export interface DeployExportResult {
  bundle: DeployExportInput;
  warnings: DeployExportWarning[];
  stats: DeployExportStats;
  /** True when any warning has severity `error`. */
  hasErrors: boolean;
}

const WORKSPACE_COMPONENT_TYPE = 'workspace';
const DATA_PROVIDER_TYPE = 'data-provider';
const APPDATA_TYPE = 'appdata';
const COMPONENT_REGISTRY_TYPE = 'component-registry';
const DOCK_CONFIG_TYPE = 'dock-config';

const WELL_KNOWN_CONFIG_IDS = new Set(['dock-config', 'workspace-setup']);

const ALWAYS_INCLUDE_TYPES = new Set([
  WORKSPACE_COMPONENT_TYPE,
  DATA_PROVIDER_TYPE,
  APPDATA_TYPE,
  COMPONENT_REGISTRY_TYPE,
  DOCK_CONFIG_TYPE,
]);

function isWellKnownConfigId(configId: string): boolean {
  if (WELL_KNOWN_CONFIG_IDS.has(configId)) return true;
  return configId.startsWith('component-registry::');
}

function isProfileSetPayload(payload: unknown): boolean {
  const p = payload as { profiles?: unknown } | null | undefined;
  return Array.isArray(p?.profiles);
}

function collectInstanceIdsFromUrl(node: unknown, acc: string[]): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.url === 'string') {
    try {
      const u = new URL(obj.url, 'http://placeholder');
      const id = u.searchParams.get('id');
      if (id) acc.push(id);
    } catch {
      /* malformed url */
    }
  }
  for (const v of (obj.views as unknown[] | undefined) ?? []) collectInstanceIdsFromUrl(v, acc);
  for (const w of (obj.windows as unknown[] | undefined) ?? []) collectInstanceIdsFromUrl(w, acc);
  for (const c of (obj.children as unknown[] | undefined) ?? []) collectInstanceIdsFromUrl(c, acc);
  if (obj.layout && typeof obj.layout === 'object') collectInstanceIdsFromUrl(obj.layout, acc);
  for (const c of (obj.content as unknown[] | undefined) ?? []) collectInstanceIdsFromUrl(c, acc);
}

/** Instance ids embedded in view URLs (`?id=`). */
export function instanceIdsFromOpenFinSnapshot(snapshot: unknown): string[] {
  const ids: string[] = [];
  if (!snapshot || typeof snapshot !== 'object') return ids;
  const snap = snapshot as { windows?: unknown[] };
  for (const w of snap.windows ?? []) collectInstanceIdsFromUrl(w, ids);
  return Array.from(new Set(ids));
}

function collectViewNodes(node: unknown, acc: Array<Record<string, unknown>>): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.name === 'string' && typeof obj.url === 'string') {
    acc.push(obj);
  }
  for (const v of (obj.views as unknown[] | undefined) ?? []) collectViewNodes(v, acc);
  for (const w of (obj.windows as unknown[] | undefined) ?? []) collectViewNodes(w, acc);
  for (const c of (obj.children as unknown[] | undefined) ?? []) collectViewNodes(c, acc);
  if (obj.layout && typeof obj.layout === 'object') collectViewNodes(obj.layout, acc);
  for (const c of (obj.content as unknown[] | undefined) ?? []) collectViewNodes(c, acc);
}

function collectCustomDataInstanceIds(snapshot: unknown): string[] {
  const ids: string[] = [];
  if (!snapshot || typeof snapshot !== 'object') return ids;
  const views: Array<Record<string, unknown>> = [];
  const snap = snapshot as { windows?: unknown[] };
  for (const w of snap.windows ?? []) collectViewNodes(w, views);
  for (const view of views) {
    const cd = view.customData as { instanceId?: string } | undefined;
    if (typeof cd?.instanceId === 'string' && cd.instanceId.length > 0) {
      ids.push(cd.instanceId);
    }
  }
  return Array.from(new Set(ids));
}

/** Union of workspace.payload.instanceIds and snapshot URL / customData ids. */
export function collectReferencedInstanceIds(appConfig: AppConfigRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of appConfig) {
    if (row.componentType !== WORKSPACE_COMPONENT_TYPE) continue;
    const payload = row.payload as {
      instanceIds?: string[];
      openfinSnapshot?: unknown;
    } | null | undefined;
    for (const id of payload?.instanceIds ?? []) {
      if (typeof id === 'string' && id.length > 0) ids.add(id);
    }
    for (const id of instanceIdsFromOpenFinSnapshot(payload?.openfinSnapshot)) ids.add(id);
    for (const id of collectCustomDataInstanceIds(payload?.openfinSnapshot)) ids.add(id);
  }
  return ids;
}

function isProfileSetRow(row: AppConfigRow): boolean {
  return row.componentType === MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE
    || isProfileSetPayload(row.payload);
}

function shouldIncludeAppConfigRow(row: AppConfigRow, referencedIds: Set<string>): boolean {
  const configId = String(row.configId ?? '');
  if (isWellKnownConfigId(configId)) return true;
  if (row.isTemplate === true) return true;
  if (row.componentType && ALWAYS_INCLUDE_TYPES.has(row.componentType)) return true;
  if (isProfileSetRow(row)) return referencedIds.has(configId);
  if (referencedIds.has(configId)) return true;
  return false;
}

/** @internal Exported for tests that pin legacy scoped-filter rules. */
export function filterAppConfigForDeploy(
  appConfig: AppConfigRow[],
  referencedIds: Set<string>,
): { included: AppConfigRow[]; excluded: AppConfigRow[] } {
  const included: AppConfigRow[] = [];
  const excluded: AppConfigRow[] = [];
  for (const row of appConfig) {
    if (shouldIncludeAppConfigRow(row, referencedIds)) {
      included.push(row);
    } else {
      excluded.push(row);
    }
  }
  return { included, excluded };
}

function profileStateKeyCount(state: unknown): number {
  if (!state || typeof state !== 'object') return 0;
  return Object.keys(state as object).length;
}

function findInstanceRow(appConfig: AppConfigRow[], instanceId: string): AppConfigRow | undefined {
  return appConfig.find((r) => String(r.configId) === instanceId);
}

function liveProviderIdFromRow(row: AppConfigRow | undefined): string | undefined {
  if (!row?.payload || typeof row.payload !== 'object') return undefined;
  const gld = (row.payload as { gridLevelData?: { provider?: { liveProviderId?: string }; liveProviderId?: string } })
    .gridLevelData;
  if (!gld || typeof gld !== 'object') return undefined;
  return gld.provider?.liveProviderId ?? (gld as { liveProviderId?: string }).liveProviderId;
}

/**
 * Validate a deploy bundle (before or after scoping). Pass the scoped
 * `appConfig` when checking post-filter coherence.
 */
export function validateDeployExport(
  input: DeployExportInput,
  options: { referencedInstanceIds?: string[] } = {},
): DeployExportWarning[] {
  const warnings: DeployExportWarning[] = [];
  const canonicalAppId = input.activeAppId?.trim()
    || activeAppIdFromSeed({
      activeAppId: input.activeAppId ?? '',
      activeUserId: input.activeUserId ?? '',
      appRegistry: input.appRegistry,
      userProfiles: input.userProfiles,
      roles: input.roles,
      permissions: input.permissions,
    });
  if (!canonicalAppId) {
    warnings.push({
      severity: 'error',
      code: 'NO_ACTIVE_APP_ID',
      message: 'Deploy bundle has no activeAppId — set it in seed.json or pass it when exporting.',
    });
  }

  const referenced = new Set(
    options.referencedInstanceIds ?? [...collectReferencedInstanceIds(input.appConfig)],
  );

  const workspaces = input.appConfig.filter((r) => r.componentType === WORKSPACE_COMPONENT_TYPE);
  for (const ws of workspaces) {
    const payload = ws.payload as { instanceIds?: string[]; openfinSnapshot?: unknown } | null | undefined;
    const declared = payload?.instanceIds ?? [];
    const fromSnapshot = instanceIdsFromOpenFinSnapshot(payload?.openfinSnapshot);
    const fromCustomData = collectCustomDataInstanceIds(payload?.openfinSnapshot);

    if (declared.length === 0 && (fromSnapshot.length > 0 || fromCustomData.length > 0)) {
      warnings.push({
        severity: 'warn',
        code: 'INSTANCE_IDS_EMPTY',
        message: `Workspace "${ws.configId}" has instanceIds: [] but the snapshot references ${fromSnapshot.length + fromCustomData.length} instance id(s). Save Workspace again before exporting.`,
        configId: String(ws.configId),
      });
    }

    for (const cdId of fromCustomData) {
      if (declared.length > 0 && !declared.includes(cdId)) {
        warnings.push({
          severity: 'warn',
          code: 'CUSTOM_DATA_INSTANCE_MISMATCH',
          message: `Snapshot customData.instanceId "${cdId}" is not listed in workspace instanceIds [${declared.join(', ')}].`,
          configId: String(ws.configId),
        });
      }
    }
  }

  for (const instanceId of referenced) {
    const row = findInstanceRow(input.appConfig, instanceId);
    if (!row) {
      warnings.push({
        severity: 'error',
        code: 'MISSING_INSTANCE_ROW',
        message: `Referenced instance "${instanceId}" has no appConfig row — grid will boot empty for that view.`,
        configId: instanceId,
      });
      continue;
    }

    if (canonicalAppId && row.appId !== canonicalAppId && row.appId !== '') {
      /* APP_ID_DRIFT already reported per-row */
    }

    if (isProfileSetPayload(row.payload)) {
      const profiles = (row.payload as { profiles?: Array<{ id: string; state?: unknown }> }).profiles ?? [];
      const defaultProfile = profiles.find((p) => p.id === '__default__') ?? profiles[0];
      const stateKeys = profileStateKeyCount(defaultProfile?.state);
      if (stateKeys === 0) {
        warnings.push({
          severity: 'warn',
          code: 'EMPTY_PROFILE_STATE',
          message: `Instance "${instanceId}" profile "${defaultProfile?.id ?? '__default__'}" has empty state — formatting/filters were not saved to this row.`,
          configId: instanceId,
        });
      }
    }

    const liveId = liveProviderIdFromRow(row);
    if (!liveId && isProfileSetPayload(row.payload)) {
      warnings.push({
        severity: 'warn',
        code: 'MISSING_GRID_LEVEL_PROVIDER',
        message: `Instance "${instanceId}" has no gridLevelData.provider.liveProviderId — provider link may be missing after seed.`,
        configId: instanceId,
      });
    }
  }

  return warnings;
}

/**
 * Build a scoped, normalized deploy bundle from a raw Config Browser export.
 */
export function buildDeployExport(raw: DeployExportInput): DeployExportResult {
  const referencedIds = collectReferencedInstanceIds(raw.appConfig);
  // Full snapshot — every appConfig row in Dexie is included so deploy
  // seed restores the same state as Config Browser "Export ALL". Scope
  // drift (wrong appId) is fixed by normalizeSeedData; validation below
  // only emits warnings.
  const included = raw.appConfig;
  const { excluded: wouldExclude } = filterAppConfigForDeploy(raw.appConfig, referencedIds);

  const scoped: DeployExportInput = {
    appConfig: included,
    appRegistry: raw.appRegistry,
    userProfiles: raw.userProfiles,
    roles: raw.roles,
    permissions: raw.permissions,
  };

  const activeAppId = raw.activeAppId?.trim() ?? '';
  const activeUserId = raw.activeUserId?.trim() ?? '';
  const normalizedSeed = normalizeSeedData({
    activeAppId,
    activeUserId,
    ...scoped,
    appConfig: scoped.appConfig,
  });
  const bundle: DeployExportInput = {
    ...scoped,
    activeAppId: activeAppId || activeAppIdFromSeed(normalizedSeed) || '',
    activeUserId: activeUserId || activeUserIdFromSeed(normalizedSeed) || '',
    appRegistry: normalizedSeed.appRegistry,
    userProfiles: normalizedSeed.userProfiles,
    appConfig: normalizedSeed.appConfig ?? scoped.appConfig,
  };

  const warnings = validateDeployExport(bundle, {
    referencedInstanceIds: [...referencedIds],
  });

  const canonicalAppId = bundle.activeAppId?.trim() || activeAppIdFromSeed(normalizedSeed);
  if (canonicalAppId) {
    for (const row of raw.appConfig) {
      if (row.appId && row.appId !== '' && row.appId !== canonicalAppId) {
        if (!warnings.some((w) => w.code === 'APP_ID_DRIFT' && w.configId === String(row.configId))) {
          warnings.push({
            severity: 'warn',
            code: 'APP_ID_DRIFT',
            message: `Row appId "${row.appId}" differs from registry "${canonicalAppId}" (auto-fixed in this deploy bundle).`,
            configId: String(row.configId),
          });
        }
      }
    }
  }

  if (wouldExclude.length > 0) {
    const orphanProfileSets = wouldExclude.filter((r) => isProfileSetPayload(r.payload));
    warnings.push({
      severity: 'info',
      code: 'UNREFERENCED_ROWS',
      message: `${wouldExclude.length} appConfig row(s) are not referenced by any saved workspace (${orphanProfileSets.length} profile-set) — included in this full deploy export anyway.`,
    });
  }

  const hasErrors = warnings.some((w) => w.severity === 'error');

  return {
    bundle,
    warnings,
    stats: {
      appConfigTotal: raw.appConfig.length,
      appConfigIncluded: included.length,
      appConfigExcluded: 0,
      referencedInstanceIds: [...referencedIds],
    },
    hasErrors,
  };
}
