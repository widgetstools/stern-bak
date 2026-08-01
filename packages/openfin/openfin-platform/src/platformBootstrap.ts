/**
 * OpenFin manifest → {@link PlatformBootstrapConfig} resolution.
 *
 * Browser-safe consumers import from `@wellsfargo-starui/openfin-platform/config`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import type OpenFin from '@openfin/core';
import { resolveActiveIdentityFromSeedUrl } from '@wellsfargo-starui/core/host/config';
import {
  DEV_PLATFORM_BOOTSTRAP,
  PlatformBootstrapConfigError,
  resolvePlatformBootstrapFromJson,
  resolvePlatformBootstrapFromObject,
  type PlatformBootstrapConfig,
} from '@wellsfargo-starui/data';

import { DEFAULT_APP_ID } from './defaultAppId.js';
import { resolveSeedConfigUrl } from './resolveSeedConfigUrl.js';
import type { CustomSettings } from './types.js';

/** Default dev userId when manifest omits `customSettings.userId`. */
export const DEFAULT_MANIFEST_USER_ID = 'dev1';

/**
 * Pure helper: map manifest `customSettings` to bootstrap config.
 * Throws {@link PlatformBootstrapConfigError} when `appId` is missing.
 */
export function resolvePlatformBootstrapFromCustomSettings(
  customSettings: CustomSettings | undefined,
): PlatformBootstrapConfig {
  return resolvePlatformBootstrapFromObject({
    appId: customSettings?.appId,
    userId: customSettings?.userId ?? DEFAULT_MANIFEST_USER_ID,
    useRest: customSettings?.useRest,
    configServiceRestUrl: customSettings?.configServiceRestUrl,
    seedConfigUrl: customSettings?.seedConfigUrl,
    seedConfigReload: customSettings?.seedConfigReload,
  });
}

/**
 * Read `customSettings` from the current OpenFin manifest and resolve
 * {@link PlatformBootstrapConfig}.
 *
 * Outside OpenFin (`fin` undefined), returns {@link DEV_PLATFORM_BOOTSTRAP}
 * so plain-browser dev harnesses can import without crashing.
 */
function readSeedUrl(customSettings: CustomSettings | undefined): string | undefined {
  const url = customSettings?.seedConfigUrl;
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function resolvePlatformBootstrapFromManifest(): Promise<PlatformBootstrapConfig> {
  if (typeof fin === 'undefined') {
    return DEV_PLATFORM_BOOTSTRAP;
  }

  try {
    const app = await fin.Application.getCurrent();
    const manifest = (await app.getManifest()) as OpenFin.Manifest & {
      customSettings?: CustomSettings;
    };
    const rawSeedUrl = readSeedUrl(manifest.customSettings);
    if (rawSeedUrl) {
      const seedUrl = await resolveSeedConfigUrl(
        rawSeedUrl,
        manifest.platform?.providerUrl,
      );
      const cs = manifest.customSettings;
      const manifestAppId = typeof cs?.appId === 'string' ? cs.appId.trim() : '';
      const manifestUserId = typeof cs?.userId === 'string' ? cs.userId.trim() : '';
      if (manifestAppId && manifestUserId) {
        return {
          appId: manifestAppId,
          userId: manifestUserId,
          useRest: cs?.useRest,
          configServiceRestUrl: cs?.configServiceRestUrl,
          seedConfigUrl: seedUrl,
          seedConfigReload: cs?.seedConfigReload === 'when-changed' ? 'when-changed' : undefined,
        };
      }
      const identity = await resolveActiveIdentityFromSeedUrl(seedUrl);
      if (identity) {
        return {
          appId: identity.activeAppId,
          userId: identity.activeUserId,
          useRest: cs?.useRest,
          configServiceRestUrl: cs?.configServiceRestUrl,
          seedConfigUrl: seedUrl,
          seedConfigReload: cs?.seedConfigReload === 'when-changed' ? 'when-changed' : undefined,
        };
      }
      throw new PlatformBootstrapConfigError(
        `seed.json at ${seedUrl} must define activeAppId and activeUserId`,
      );
    }
    return resolvePlatformBootstrapFromCustomSettings(manifest.customSettings);
  } catch (err) {
    if (err instanceof PlatformBootstrapConfigError) {
      throw err;
    }
    throw new PlatformBootstrapConfigError(
      'Failed to read OpenFin manifest for platform bootstrap',
    );
  }
}

/** `(appId, userId)` from manifest or web `app-config.json`. */
export interface BootstrapManifestScope {
  appId: string;
  userId: string;
}

/**
 * Deployment identity for `createConfigManager({ appId, identity })`.
 * Manifest / app-config values are fallbacks when the seed can't be read.
 */
export async function resolveDeploymentIdentity(
  manifest?: { appId?: string; userId?: string; seedConfigUrl?: string } | null,
  providerUrl?: string,
): Promise<BootstrapManifestScope> {
  const rawSeedUrl = readSeedUrl(manifest ?? undefined);
  if (rawSeedUrl) {
    const seedUrl = await resolveSeedConfigUrl(rawSeedUrl, providerUrl);
    const identity = await resolveActiveIdentityFromSeedUrl(seedUrl);
    if (identity) {
      return { appId: identity.activeAppId, userId: identity.activeUserId };
    }
    throw new PlatformBootstrapConfigError(
      `seed.json at ${seedUrl} must define activeAppId and activeUserId`,
    );
  }

  const bootstrap = await resolveBootstrapManifestScope();
  const manifestAppId = typeof manifest?.appId === 'string' ? manifest.appId.trim() : '';
  const manifestUserId = typeof manifest?.userId === 'string' ? manifest.userId.trim() : '';
  const appId = bootstrap?.appId ?? (manifestAppId || DEFAULT_APP_ID);
  const userId = bootstrap?.userId ?? (manifestUserId || DEFAULT_MANIFEST_USER_ID);
  return { appId, userId };
}

/**
 * Read deployment `appId` / `userId` from manifest `customSettings`
 * (OpenFin) or web `app-config.json` (browser). Returns `null` when
 * neither source is reachable.
 */
export async function resolveBootstrapManifestScope(): Promise<BootstrapManifestScope | null> {
  try {
    const bootstrap = typeof fin !== 'undefined'
      ? await resolvePlatformBootstrapFromManifest()
      : await resolvePlatformBootstrapFromJson('/app-config.json');
    return { appId: bootstrap.appId, userId: bootstrap.userId };
  } catch {
    return null;
  }
}
