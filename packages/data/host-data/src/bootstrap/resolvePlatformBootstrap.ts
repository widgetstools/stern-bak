import { resolveActiveIdentityFromSeedUrl } from '@wellsfargo-starui/core/host/config';
import {
  validatePlatformBootstrapConfig,
  type AppDataBootstrapManifest,
  type PlatformBootstrapConfig,
} from './PlatformBootstrapConfig.js';

/** Thrown when bootstrap JSON is missing required fields or fails validation. */
export class PlatformBootstrapConfigError extends Error {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];

  constructor(
    message: string,
    errors: readonly string[] = [],
    warnings: readonly string[] = [],
  ) {
    super(message);
    this.name = 'PlatformBootstrapConfigError';
    this.errors = errors;
    this.warnings = warnings;
  }
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRequiredString(value: unknown, field: string): string {
  const parsed = readOptionalString(value);
  if (!parsed) {
    throw new PlatformBootstrapConfigError(`${field} is required`);
  }
  return parsed;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return out.length > 0 ? out : undefined;
}

function readAppDataBootstrapManifest(value: unknown): AppDataBootstrapManifest | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const runPolicy = record.runPolicy;
  const policy =
    runPolicy === 'if-missing' || runPolicy === 'always' || runPolicy === 'once-per-session'
      ? runPolicy
      : undefined;

  let targets: Record<string, string[]> | undefined;
  if (record.targets !== null && typeof record.targets === 'object' && !Array.isArray(record.targets)) {
    const parsed: Record<string, string[]> = {};
    for (const [hookId, names] of Object.entries(record.targets as Record<string, unknown>)) {
      const list = readStringArray(names);
      if (list) parsed[hookId] = list;
    }
    if (Object.keys(parsed).length > 0) targets = parsed;
  }

  const manifest: AppDataBootstrapManifest = {
    onHubReady: readStringArray(record.onHubReady),
    onUserChange: readStringArray(record.onUserChange),
    runPolicy: policy,
    targets,
  };

  if (
    !manifest.onHubReady
    && !manifest.onUserChange
    && !manifest.runPolicy
    && !manifest.targets
  ) {
    return undefined;
  }

  return manifest;
}

/**
 * Parse a plain object (e.g. parsed JSON) into {@link PlatformBootstrapConfig}.
 * Throws {@link PlatformBootstrapConfigError} when required fields are missing.
 */
export function resolvePlatformBootstrapFromObject(
  raw: unknown,
): PlatformBootstrapConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlatformBootstrapConfigError(
      'Platform bootstrap config must be a JSON object',
    );
  }

  const record = raw as Record<string, unknown>;

  const seedConfigReload =
    record.seedConfigReload === 'when-changed' ? 'when-changed' : undefined;

  const config: PlatformBootstrapConfig = {
    appId: readOptionalString(record.appId) ?? '',
    userId: readOptionalString(record.userId) ?? '',
    useRest: readOptionalBoolean(record.useRest),
    configServiceRestUrl: readOptionalString(record.configServiceRestUrl),
    seedConfigUrl: readOptionalString(record.seedConfigUrl),
    seedConfigReload,
    appDataBootstrap: readAppDataBootstrapManifest(record.appDataBootstrap),
  };

  const result = validatePlatformBootstrapConfig(config);
  if (!result.valid) {
    throw new PlatformBootstrapConfigError(
      `Invalid platform bootstrap config: ${result.errors.join('; ')}`,
      result.errors,
      result.warnings,
    );
  }

  return config;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Fetch and parse web `app-config.json` (or env-specific path).
 */
export async function resolvePlatformBootstrapFromJson(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<PlatformBootstrapConfig> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new PlatformBootstrapConfigError(
      `Failed to fetch platform bootstrap config from ${url}`,
    );
  }

  if (!response.ok) {
    throw new PlatformBootstrapConfigError(
      `Failed to fetch platform bootstrap config from ${url}: HTTP ${response.status}`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new PlatformBootstrapConfigError(
      `Platform bootstrap config at ${url} is not valid JSON`,
    );
  }

  try {
    const record = raw as Record<string, unknown>;
    const seedConfigUrl = readOptionalString(record.seedConfigUrl);
    let appId = readOptionalString(record.appId);
    let userId = readOptionalString(record.userId);

    if (seedConfigUrl) {
      const fromSeed = await resolveActiveIdentityFromSeedUrl(seedConfigUrl, fetchImpl);
      if (fromSeed) {
        appId = fromSeed.activeAppId;
        userId = fromSeed.activeUserId;
      }
    }

    if (!appId || !userId) {
      throw new PlatformBootstrapConfigError(
        seedConfigUrl
          ? `seed.json at ${seedConfigUrl} must define activeAppId and activeUserId`
          : 'appId and userId are required (or provide seedConfigUrl with activeAppId/activeUserId in seed.json)',
      );
    }

    return resolvePlatformBootstrapFromObject({ ...record, appId, userId });
  } catch (err) {
    if (err instanceof PlatformBootstrapConfigError) {
      throw err;
    }
    throw new PlatformBootstrapConfigError(
      `Failed to parse platform bootstrap config from ${url}`,
    );
  }
}
