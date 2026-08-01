/**
 * Normalize a seed bundle before first-run `bulkPut`.
 *
 * Config Browser exports sometimes carry stale `appId` / `userId` values
 * (e.g. `TestApp` / `dev1`) that no longer match the deployment's
 * `activeAppId` / `activeUserId`. Without this pass, profile-set rows
 * fail scope checks and the grid loads empty even though the data is on disk.
 */

import type { AppConfigRow, SeedData, UserProfileRow } from './types';

const REGISTRY_COMPONENT_TYPE = 'component-registry';
const GLOBAL_REGISTRY_USER_ID = 'system';

function readActiveString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Resolve deployment `appId` from the seed's `activeAppId` field. */
export function activeAppIdFromSeed(seed: SeedData): string | undefined {
  return readActiveString(seed.activeAppId);
}

/** Resolve signed-in `userId` from the seed's `activeUserId` field. */
export function activeUserIdFromSeed(seed: SeedData): string | undefined {
  return readActiveString(seed.activeUserId);
}

/** @deprecated Prefer {@link activeAppIdFromSeed}. */
export function canonicalAppIdFromSeed(seed: SeedData): string | undefined {
  return activeAppIdFromSeed(seed);
}

/** @deprecated Prefer {@link activeUserIdFromSeed}. */
export function canonicalUserIdFromSeed(
  seed: SeedData,
  _canonicalAppId?: string,
): string | undefined {
  return activeUserIdFromSeed(seed);
}

/** Deployment scope used when importing or saving appConfig rows. */
export interface ActiveIdentity {
  activeAppId: string;
  activeUserId: string;
}

/**
 * Re-stamp a single `appConfig` row to the deployment's
 * `activeAppId` / `activeUserId` (import, save, or seed normalize).
 */
export function normalizeImportedAppConfigRow(
  row: AppConfigRow,
  identity: ActiveIdentity,
): AppConfigRow {
  return normalizeAppConfigRow(row, identity.activeAppId, identity.activeUserId);
}

/** Re-stamp every `appConfig` row in an import / export bundle. */
export function normalizeImportedAppConfigRows(
  rows: AppConfigRow[],
  identity: ActiveIdentity,
): AppConfigRow[] {
  return rows.map((row) => normalizeImportedAppConfigRow(row, identity));
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type SeedActiveIdentity = { activeAppId: string; activeUserId: string };

const SEED_IDENTITY_SESSION_PREFIX = 'starui:seed-identity:';
const seedIdentityInflight = new Map<string, Promise<SeedActiveIdentity | null>>();

/** True when `activeAppId` / `activeUserId` were resolved earlier this session. */
export function isSeedIdentityCached(url: string): boolean {
  return readCachedSeedIdentity(url) !== null;
}

function readCrossWindowItem(key: string): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) return value;
    } catch {
      /* private mode / quota */
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      return sessionStorage.getItem(key);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function writeCrossWindowItem(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* best-effort */
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* best-effort */
    }
  }
}

function readCachedSeedIdentity(url: string): SeedActiveIdentity | null {
  try {
    const raw = readCrossWindowItem(`${SEED_IDENTITY_SESSION_PREFIX}${url}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SeedActiveIdentity>;
    if (
      typeof parsed.activeAppId === 'string'
      && parsed.activeAppId.trim().length > 0
      && typeof parsed.activeUserId === 'string'
      && parsed.activeUserId.trim().length > 0
    ) {
      return {
        activeAppId: parsed.activeAppId.trim(),
        activeUserId: parsed.activeUserId.trim(),
      };
    }
  } catch {
    /* corrupt cache — fall through to fetch */
  }
  return null;
}

function writeCachedSeedIdentity(url: string, identity: SeedActiveIdentity): void {
  writeCrossWindowItem(
    `${SEED_IDENTITY_SESSION_PREFIX}${url}`,
    JSON.stringify(identity),
  );
}

async function fetchSeedActiveIdentity(
  url: string,
  fetchImpl: FetchLike,
): Promise<SeedActiveIdentity | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const parsed = parseSeedJson(await res.json());
    if (!parsed) return null;
    const activeAppId = activeAppIdFromSeed(parsed);
    const activeUserId = activeUserIdFromSeed(parsed);
    if (!activeAppId || !activeUserId) return null;
    return { activeAppId, activeUserId };
  } catch {
    return null;
  }
}

/**
 * Fetch `seed.json` and read `activeAppId` / `activeUserId`.
 * Returns `null` when the URL is unreachable or the fields are missing.
 *
 * Results are cached in localStorage (cross-window) + in-memory single-flight
 * so OpenFin child views do not re-download the full deploy bundle after the
 * provider window has already resolved identity.
 */
export async function resolveActiveIdentityFromSeedUrl(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<SeedActiveIdentity | null> {
  const cached = readCachedSeedIdentity(url);
  if (cached) return cached;

  let pending = seedIdentityInflight.get(url);
  if (!pending) {
    pending = fetchSeedActiveIdentity(url, fetchImpl).then((identity) => {
      if (identity) writeCachedSeedIdentity(url, identity);
      return identity;
    });
    seedIdentityInflight.set(url, pending);
    pending.finally(() => {
      seedIdentityInflight.delete(url);
    });
  }
  return pending;
}

/** Test-only — clears in-memory single-flight cache. */
export function _resetSeedIdentityCacheForTests(): void {
  seedIdentityInflight.clear();
}

function rescopeConfigId(
  configId: string,
  canonicalAppId: string,
  targetUserId: string,
): string {
  const parts = configId.split('::');
  if (parts.length !== 3) return configId;
  const [base, appPart, userPart] = parts;
  const newUser = userPart === GLOBAL_REGISTRY_USER_ID
    ? GLOBAL_REGISTRY_USER_ID
    : targetUserId;
  if (appPart === canonicalAppId && userPart === newUser) return configId;
  return `${base}::${canonicalAppId}::${newUser}`;
}

function isGlobalUserRow(row: AppConfigRow): boolean {
  if (row.componentType === REGISTRY_COMPONENT_TYPE) return true;
  return row.userId === GLOBAL_REGISTRY_USER_ID;
}

function resolveTargetUserId(
  row: AppConfigRow,
  canonicalUserId: string | undefined,
): string {
  if (isGlobalUserRow(row)) return GLOBAL_REGISTRY_USER_ID;
  return canonicalUserId ?? row.userId;
}

function normalizeRegistryRow(row: AppConfigRow, canonicalAppId: string): AppConfigRow {
  const payload = row.payload as { entries?: Array<Record<string, unknown>> } | null | undefined;
  const entries = Array.isArray(payload?.entries)
    ? payload.entries.map((entry) => ({
        ...entry,
        appId: canonicalAppId,
      }))
    : payload?.entries;

  return {
    ...row,
    appId: canonicalAppId,
    userId: GLOBAL_REGISTRY_USER_ID,
    configId: `component-registry::${canonicalAppId}::${GLOBAL_REGISTRY_USER_ID}`,
    payload: payload ? { ...payload, ...(entries ? { entries } : {}) } : row.payload,
  };
}

function normalizeAppConfigRow(
  row: AppConfigRow,
  canonicalAppId: string,
  canonicalUserId: string | undefined,
): AppConfigRow {
  if (row.componentType === REGISTRY_COMPONENT_TYPE) {
    return normalizeRegistryRow(row, canonicalAppId);
  }

  // Legacy pre-scoped rows keep empty appId but still get userId stamped.
  if (row.appId === '') {
    const targetUserId = resolveTargetUserId(row, canonicalUserId);
    if (row.userId === targetUserId) return row;
    return { ...row, userId: targetUserId };
  }

  const targetUserId = resolveTargetUserId(row, canonicalUserId);
  const appIdChanged = row.appId !== canonicalAppId;
  const userIdChanged = row.userId !== targetUserId;
  if (!appIdChanged && !userIdChanged) {
    return row;
  }

  const next: AppConfigRow = {
    ...row,
    appId: canonicalAppId,
    userId: targetUserId,
    configId: typeof row.configId === 'string'
      ? rescopeConfigId(row.configId, canonicalAppId, targetUserId)
      : row.configId,
  };

  if (next.componentType === 'workspace' && next.payload && typeof next.payload === 'object') {
    next.payload = rewalkScopeFields(next.payload, canonicalAppId, canonicalUserId);
  }

  return next;
}

function normalizeUserProfileRow(
  row: UserProfileRow,
  canonicalAppId: string,
): UserProfileRow {
  if (row.appId === canonicalAppId) return row;
  return { ...row, appId: canonicalAppId };
}

function rewalkScopeFields(
  value: unknown,
  canonicalAppId: string,
  canonicalUserId: string | undefined,
): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => rewalkScopeFields(item, canonicalAppId, canonicalUserId));
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'appId' && typeof val === 'string' && val.length > 0 && val !== canonicalAppId) {
      out[key] = canonicalAppId;
    } else if (
      key === 'userId'
      && typeof val === 'string'
      && val.length > 0
      && val !== GLOBAL_REGISTRY_USER_ID
      && canonicalUserId
      && val !== canonicalUserId
    ) {
      out[key] = canonicalUserId;
    } else {
      out[key] = rewalkScopeFields(val, canonicalAppId, canonicalUserId);
    }
  }
  return out;
}

/**
 * Return a copy of `seed` whose auth + config rows are stamped with
 * `activeAppId` / `activeUserId`. No-op when those fields are missing
 * or every row already matches.
 */
export function normalizeSeedData(seed: SeedData): SeedData {
  const canonicalAppId = activeAppIdFromSeed(seed);
  if (!canonicalAppId) return seed;

  const canonicalUserId = activeUserIdFromSeed(seed);
  let next: SeedData = seed;
  let changed = false;

  if (Array.isArray(seed.userProfiles) && seed.userProfiles.length > 0) {
    const userProfiles = seed.userProfiles.map((row) =>
      normalizeUserProfileRow(row, canonicalAppId),
    );
    if (userProfiles.some((row, i) => row !== seed.userProfiles![i])) {
      next = { ...next, userProfiles };
      changed = true;
    }
  }

  if (Array.isArray(seed.appRegistry) && seed.appRegistry.length > 0) {
    const appRegistry = seed.appRegistry.map((row) =>
      row.appId === canonicalAppId ? row : { ...row, appId: canonicalAppId },
    );
    if (appRegistry.some((row, i) => row !== seed.appRegistry![i])) {
      next = { ...next, appRegistry };
      changed = true;
    }
  }

  if (Array.isArray(seed.appConfig) && seed.appConfig.length > 0) {
    const appConfig = seed.appConfig.map((row) =>
      normalizeAppConfigRow(row, canonicalAppId, canonicalUserId),
    );
    if (appConfig.some((row, i) => row !== seed.appConfig![i])) {
      next = { ...next, appConfig };
      changed = true;
    }
  }

  return changed ? next : seed;
}

const DATA_PROVIDER_EXPORT_KIND = 'starui.dataProvider';

/**
 * Coerce a Config Browser rocket export (`DeployExportInput`) into the
 * canonical {@link SeedData} shape — defaulting optional tables to `[]`.
 */
export function coerceDeploySeedBundle(raw: SeedData): SeedData {
  return {
    activeAppId: raw.activeAppId,
    activeUserId: raw.activeUserId,
    appRegistry: Array.isArray(raw.appRegistry) ? raw.appRegistry : [],
    userProfiles: Array.isArray(raw.userProfiles) ? raw.userProfiles : [],
    roles: Array.isArray(raw.roles) ? raw.roles : [],
    permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
    ...(Array.isArray(raw.appConfig) ? { appConfig: raw.appConfig } : {}),
  };
}

/**
 * Reject JSON that is not a deploy/seed bundle (e.g. a single data-provider
 * export saved as `seed.json`). Returns `null` and logs a clear error.
 *
 * Accepts the exact shape emitted by Config Browser rocket export
 * (`buildDeployExport().bundle`): `activeAppId`, `activeUserId`,
 * `appRegistry`, `userProfiles`, `roles`, `permissions`, optional `appConfig`.
 */
export function parseSeedJson(raw: unknown): SeedData | null {
  if (!raw || typeof raw !== 'object') {
    console.error('ConfigManager: seed.json is not a JSON object — seeding skipped.');
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (obj.kind === DATA_PROVIDER_EXPORT_KIND) {
    console.error(
      'ConfigManager: seed.json is a data-provider export (kind=starui.dataProvider), not a deploy bundle. ' +
      'Use Config Browser rocket export or copy seed1.json shape (activeAppId, activeUserId, appRegistry, appConfig, …).',
    );
    return null;
  }
  if (!Array.isArray(obj.appRegistry)) {
    console.error(
      'ConfigManager: seed.json is missing appRegistry[] — seeding skipped. ' +
      'Expected the same shape as Config Browser deploy export.',
    );
    return null;
  }
  if (!readActiveString(obj.activeAppId)) {
    console.error(
      'ConfigManager: seed.json is missing activeAppId — seeding skipped. ' +
      'Set activeAppId at the top level of seed.json.',
    );
    return null;
  }
  if (!readActiveString(obj.activeUserId)) {
    console.error(
      'ConfigManager: seed.json is missing activeUserId — seeding skipped. ' +
      'Set activeUserId at the top level of seed.json.',
    );
    return null;
  }
  if (obj.appConfig !== undefined && !Array.isArray(obj.appConfig)) {
    console.error(
      'ConfigManager: seed.json appConfig must be an array when present — seeding skipped.',
    );
    return null;
  }
  return coerceDeploySeedBundle(raw as SeedData);
}
