/**
 * Seed fetch, digest tracking, and table replacement for {@link ConfigManager}.
 * Extracted to keep the orchestrator readable.
 */
import type { ConfigDatabase } from './db';
import { normalizeSeedData, parseSeedJson } from './normalizeSeedData';
import { computeSeedDigest, seedDigestStorageKey } from './seedDigest';
import type { SeedConfigReloadMode, SeedData } from './types';
import type { SeedLockManager } from './configManagerInternals';

export interface ResetToSeedResult {
  seedUrl: string;
  counts: {
    appConfig: number;
    appRegistry: number;
    userProfiles: number;
    roles: number;
    permissions: number;
  };
}

export interface ConfigManagerSeedContext {
  db: ConfigDatabase;
  seedConfigUrl: string | undefined;
  seedConfigReload: SeedConfigReloadMode;
  disposed: boolean;
  clearRowCache: () => void;
}

export async function runWithSeedLock(url: string, fn: () => Promise<void>): Promise<void> {
  const locks = (
    globalThis as { navigator?: { locks?: SeedLockManager } }
  ).navigator?.locks;
  if (!locks || typeof locks.request !== 'function') {
    await fn();
    return;
  }
  await locks.request(`starui:seed-lock:${url}`, { mode: 'exclusive' }, async () => {
    await fn();
  });
}

export function readSeedDigest(key: string): string | null {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null;
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSeedDigest(key: string, digest: string): void {
  try {
    if (typeof globalThis.localStorage === 'undefined') return;
    globalThis.localStorage.setItem(key, digest);
  } catch {
    /* private mode / quota — seed still applied */
  }
}

export async function replaceAllWithSeed(
  ctx: Pick<ConfigManagerSeedContext, 'db' | 'clearRowCache'>,
  seedData: SeedData,
  options: { clearFirst?: boolean } = {},
): Promise<ResetToSeedResult['counts']> {
  const { clearFirst = true } = options;
  await ctx.db.transaction(
    'rw',
    [
      ctx.db.appRegistry,
      ctx.db.userProfile,
      ctx.db.roles,
      ctx.db.permissions,
      ctx.db.appConfig,
    ],
    async () => {
      if (clearFirst) {
        await Promise.all([
          ctx.db.appConfig.clear(),
          ctx.db.appRegistry.clear(),
          ctx.db.userProfile.clear(),
          ctx.db.roles.clear(),
          ctx.db.permissions.clear(),
        ]);
      }
      if (seedData.permissions.length > 0) {
        await ctx.db.permissions.bulkPut(seedData.permissions);
      }
      if (seedData.roles.length > 0) {
        await ctx.db.roles.bulkPut(seedData.roles);
      }
      if (seedData.appRegistry.length > 0) {
        await ctx.db.appRegistry.bulkPut(seedData.appRegistry);
      }
      if (seedData.userProfiles.length > 0) {
        await ctx.db.userProfile.bulkPut(seedData.userProfiles);
      }
      if (seedData.appConfig && seedData.appConfig.length > 0) {
        await ctx.db.appConfig.bulkPut(seedData.appConfig);
      }
    },
  );
  ctx.clearRowCache();
  return {
    permissions: seedData.permissions.length,
    roles: seedData.roles.length,
    appRegistry: seedData.appRegistry.length,
    userProfiles: seedData.userProfiles.length,
    appConfig: seedData.appConfig?.length ?? 0,
  };
}

export async function seedIfEmptyLocked(ctx: ConfigManagerSeedContext): Promise<void> {
  if (ctx.disposed || !ctx.seedConfigUrl) {
    return;
  }

  const [appCount, configCount] = await Promise.all([
    ctx.db.appRegistry.count(),
    ctx.db.appConfig.count(),
  ]);
  const hasData = appCount > 0 || configCount > 0;

  if (hasData && ctx.seedConfigReload === 'empty-only') {
    console.log('ConfigManager: Database already seeded, skipping.');
    return;
  }

  if (!hasData && ctx.seedConfigReload === 'empty-only') {
    console.log(`ConfigManager: Seeding database from ${ctx.seedConfigUrl}`);
  }

  try {
    const response = await fetch(ctx.seedConfigUrl, { cache: 'no-store' });
    if (!response.ok) {
      console.error(
        `ConfigManager: ⚠️ Failed to fetch seed data from ${ctx.seedConfigUrl} (HTTP ${response.status}). ` +
        'The database will start empty. Check that the dev server is running and the seedConfigUrl is correct.',
      );
      return;
    }

    const parsed = parseSeedJson(await response.json());
    if (!parsed) {
      return;
    }
    const seedData: SeedData = normalizeSeedData(parsed);
    const digest = await computeSeedDigest(seedData);
    const digestKey = seedDigestStorageKey(ctx.seedConfigUrl);
    const previousDigest = readSeedDigest(digestKey);

    if (hasData && ctx.seedConfigReload === 'when-changed') {
      if (previousDigest === digest) {
        console.log('ConfigManager: seed.json unchanged — skipping re-seed.');
        return;
      }
      console.log(
        `ConfigManager: seed.json changed — clearing config tables and re-seeding from ${ctx.seedConfigUrl}`,
      );
    }

    if (!hasData) {
      console.log(`ConfigManager: Seeding database from ${ctx.seedConfigUrl}`);
    }

    const seeded = await replaceAllWithSeed(ctx, seedData, {
      clearFirst: hasData && ctx.seedConfigReload === 'when-changed',
    });
    writeSeedDigest(digestKey, digest);
    console.log(
      `ConfigManager: Database seeding complete — ${seeded.permissions} permissions, ` +
      `${seeded.roles} roles, ${seeded.appRegistry} app registry, ` +
      `${seeded.userProfiles} user profiles, ${seeded.appConfig} component configs.`,
    );
  } catch (error) {
    console.error('ConfigManager: Error seeding database.', error);
  }
}

export async function seedIfEmpty(ctx: ConfigManagerSeedContext): Promise<void> {
  if (!ctx.seedConfigUrl) {
    return;
  }
  await runWithSeedLock(ctx.seedConfigUrl, () => seedIfEmptyLocked(ctx));
}

export async function resetToSeedFromUrl(
  ctx: ConfigManagerSeedContext,
  url: string,
): Promise<ResetToSeedResult> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(
      `ConfigManager: failed to fetch seed data from ${url} (HTTP ${response.status}).`,
    );
  }
  const parsed = parseSeedJson(await response.json());
  if (!parsed) {
    throw new Error(`ConfigManager: ${url} is not a valid seed file.`);
  }
  const seedData: SeedData = normalizeSeedData(parsed);

  let counts: ResetToSeedResult['counts'] | undefined;
  await runWithSeedLock(url, async () => {
    counts = await replaceAllWithSeed(ctx, seedData);
  });

  writeSeedDigest(seedDigestStorageKey(url), await computeSeedDigest(seedData));
  ctx.clearRowCache();
  console.log(`ConfigManager: reset complete — re-seeded from ${url}.`);
  return { seedUrl: url, counts: counts! };
}
