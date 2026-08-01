// ─── ConfigManager ───────────────────────────────────────────────────
//
// The ConfigManager is the main entry point for the config service.
// It provides CRUD operations for all six database tables and handles
// two modes of operation:
//
//   1. DEV MODE (default) — all reads and writes go to Dexie/IndexedDB.
//      No backend required. Perfect for local development.
//
//   2. REST MODE — when `configServiceRestUrl` is provided, writes go
//      to REST first, then mirror to Dexie. Reads always come from
//      Dexie for speed. Failed REST writes are queued in PENDING_SYNC
//      and retried every 10 seconds.
//
// On first run, if a `seedConfigUrl` is provided and the database is
// empty, the ConfigManager fetches the seed file and populates the
// APP_REGISTRY, USER_PROFILE, and ROLES tables.

import Dexie from 'dexie';
import { ChangeNotifier } from './changeNotifier';
import { ConfigDatabase } from './db';
import { ConfigNotFoundError, OptimisticLockError } from './errors';
import { normalizeImportedAppConfigRow, normalizeSeedData, parseSeedJson } from './normalizeSeedData';
import { computeSeedDigest, seedDigestStorageKey } from './seedDigest';
import { createProfilesNamespace } from './profileBundle';
import type { ProfilesNamespace } from './profileBundle.types';
import type {
  AppConfigRow,
  AppIdentity,
  AppRegistryRow,
  ApplicationContext,
  ConfigManagerInitOptions,
  ConfigManagerOptions,
  DataServicesHandle,
  PermissionRow,
  PendingSyncRow,
  RoleRow,
  SeedData,
  SeedConfigReloadMode,
  UserProfileRow,
} from './types';
import { isVisible, type VisibilityContext } from './visibility';
import {
  type SeedLockManager,
  APPLICATION_CONTEXT_NAME,
  DEFAULT_APP_ID,
  DEFAULT_IDENTITY,
  GLOBAL_OWNER_USER_ID,
  COMPONENT_TYPE_REGISTRY,
  COMPONENT_TYPE_DATA_PROVIDER,
  COMPONENT_TYPE_APPDATA,
  PENDING_SYNC_INTERVAL_MS,
  MAX_SYNC_RETRIES,
} from './configManagerInternals';

/**
 * Subset of `ApplicationContext.ImpersonatedUser` used by
 * `setImpersonatedUser`. Kept as a structural alias so callers can pass
 * either a freshly-constructed object literal or the
 * `LoggedInUser` shape they already hold.
 */
export type ImpersonatedUser = { userId: string; displayName?: string };

/**
 * Optional behavior knobs on a single `saveConfig` call. Adding fields
 * here is non-breaking; existing call sites pass nothing and get the
 * pre-Session-6 last-write-wins semantics.
 */
export interface SaveConfigOptions {
  /**
   * The `updatedTime` the caller observed at edit-start. When supplied
   * AND the manager is in REST mode, the value flows out as an
   * `If-Match` header so the server can refuse a stale write with HTTP
   * 412 (Decision 12.5 / Session 6). Local mode applies the same check
   * against Dexie before persisting.
   */
  expectedUpdatedTime?: string;
}

/**
 * Minimal fields to create a new `appConfig` row via
 * {@link ConfigManager.createConfig} — `creationTime` / `updatedTime`
 * are stamped by the manager.
 */
export type CreateConfigInput = Omit<AppConfigRow, 'creationTime' | 'updatedTime'>;

/** Behavior knobs for {@link ConfigManager.updateConfig}. */
export interface UpdateConfigOptions {
  /**
   * The `updatedTime` the caller observed at edit-start; rejects the
   * write with {@link OptimisticLockError} if the row has moved on.
   */
  expectedUpdatedTime?: string;
}

/** Summary returned by {@link ConfigManager.resetToSeed}. */
export interface ResetToSeedResult {
  /** The seed-config URL the database was reset from. */
  seedUrl: string;
  /** Per-table row counts written from the seed. */
  counts: {
    appConfig: number;
    appRegistry: number;
    userProfiles: number;
    roles: number;
    permissions: number;
  };
}

/**
 * Create a new ConfigManager instance — the single entry point for the
 * config service. Local Dexie by default; pass `configServiceRestUrl`
 * to sync writes to a REST backend with Dexie as a local cache.
 *
 * @example
 * ```typescript
 * const configManager = createConfigManager({
 *   seedConfigUrl: "http://localhost:5174/seed-config.json",
 * });
 * await configManager.init();
 *
 * // Use the config manager
 * const config = await configManager.getConfig("my-component-1");
 * ```
 */
export function createConfigManager(options: ConfigManagerOptions = {}): ConfigManager {
  return new ConfigManager(options);
}

/**
 * The single config-service API. Provides CRUD over all six database
 * tables (appConfig + the auth tables), the `profiles` namespace for
 * bundled MarketsGrid profile-sets, seeding, dual-mode persistence
 * (local Dexie / REST with retry), visibility filtering, and owner /
 * audit stamping. One instance per execution context (window or
 * SharedWorker); all share the same `marketsui-config` IndexedDB.
 */
export class ConfigManager {
  private db: ConfigDatabase;
  private seedConfigUrl: string | undefined;
  private seedConfigReload: SeedConfigReloadMode;
  private restUrl: string | undefined;
  private readonly appId: string;
  private readonly identity: AppIdentity;
  private dataServices: DataServicesHandle | undefined;
  private drainIntervalId: ReturnType<typeof setInterval> | undefined;
  private isInitialized = false;
  /** True after `dispose()` — IndexedDB is closed; `init()` becomes a no-op. */
  private disposed = false;
  /** Single-flight guard so concurrent `init()` calls share one bootstrap. */
  private initInFlight: Promise<void> | undefined;
  /** Cross-tab + same-tab change notifier. Posted to from `saveConfig`
   *  and `deleteConfig`; subscribed by `profiles.subscribe`. */
  private readonly changeNotifier: ChangeNotifier;
  /**
   * Single-row read cache keyed by `configId` (negative results cached
   * too, so a known-missing row doesn't re-hit Dexie). Write-through on
   * `saveConfig`, evicted on `deleteConfig`, and invalidated by the
   * change notifier on EVERY write — same-tab AND cross-tab (a sibling
   * tab's write broadcasts `configChanged` → the listener registered in
   * the constructor drops the key here, so the next read re-fetches the
   * shared IndexedDB row). This collapses the documented "read the whole
   * bundle 3-4× per profile save" into one Dexie hit without any staleness
   * window the existing notifier didn't already close.
   *
   * Bounded by the config keyspace (hundreds of rows — see
   * `docs/CONFIG_SERVICE_BASELINE.md` §3), with a hard cap as a backstop
   * so a pathological caller can't grow it without bound.
   */
  private readonly rowCache = new Map<string, AppConfigRow | undefined>();
  /** Backstop cap for {@link rowCache}; clears wholesale when exceeded. */
  private static readonly ROW_CACHE_MAX = 1000;
  /** First-class `profiles` namespace — see `./profiles.ts` and
   *  `docs/PROFILE-STATE-CONSOLIDATION.md` for the API. Backed by the
   *  same bundled row that `createConfigServiceStorage` writes. */
  readonly profiles: ProfilesNamespace;

  constructor(options: ConfigManagerOptions = {}) {
    this.db = new ConfigDatabase();
    this.seedConfigUrl = options.seedConfigUrl;
    this.seedConfigReload = options.seedConfigReload ?? 'empty-only';
    this.restUrl = options.configServiceRestUrl;
    this.appId = options.appId ?? DEFAULT_APP_ID;
    this.identity = options.identity ?? DEFAULT_IDENTITY;
    this.dataServices = options.dataServices;
    this.changeNotifier = new ChangeNotifier();
    // Evict the read cache on every write — local and cross-tab. The
    // notifier fires this for our own `notify` calls AND for inbound
    // BroadcastChannel messages from sibling tabs, so a row another tab
    // mutated never lingers stale here. Auto-released on `dispose()` when
    // the notifier clears its global listeners.
    this.changeNotifier.subscribeAll((configId) => {
      this.rowCache.delete(configId);
    });
    this.profiles = createProfilesNamespace(this, this.changeNotifier);
  }

  // ─── Identity accessors ──────────────────────────────────────────
  // Read-only views over the construction-time appId / identity. Every
  // write path that needs to stamp owner / audit fields (Session 3) and
  // every read path that needs to apply visibility (Session 4) goes
  // through these.

  /**
   * The app this ConfigManager belongs to. Defaults to `"dev-app"`
   * when the host doesn't supply `appId`.
   */
  getAppId(): string {
    return this.appId;
  }

  /**
   * The authenticated identity this ConfigManager was constructed
   * with. Defaults to `{ userId: "dev-user", displayName: "Dev User" }`
   * when the host doesn't supply `identity`.
   */
  getIdentity(): AppIdentity {
    return this.identity;
  }

  /**
   * Subscribe to any config row write or delete (same-tab + cross-tab).
   * Use to refresh worker-side caches after persistence without polling Dexie.
   */
  onConfigChanged(fn: (configId: string) => void): () => void {
    return this.changeNotifier.subscribeAll(fn);
  }

  // ─── ApplicationContext / data-services wiring (Session 7) ────────
  //
  // ConfigManager publishes a single named AppData row called
  // `"ApplicationContext"` whose `values` carry `AppId`,
  // `LoggedInUser`, `ImpersonatedUser`, and `LoggedInUserProfile`.
  // Every component (any window, any layer) reads identity sync via
  // the main-thread mirror — no prop drilling, no context plumbing.
  //
  // Two wiring shapes are supported:
  //   1. Construction-time:
  //      `createConfigManager({ identity, appId, dataServices })`.
  //   2. Late wiring:
  //      `const cm = createConfigManager({ identity, appId });`
  //      `cm.setDataServices(ds);`
  //      `await cm.init();`
  //   The late path exists because today's `bootstrapDataServices`
  //   takes a `ConfigManager` (it keeps the reference for editor
  //   flows). Without late wiring the host would have to construct
  //   two ConfigManagers — one to seed the bundle, one to publish
  //   ApplicationContext — which doubles the IndexedDB connection
  //   and splits ownership.

  /**
   * Wire (or rewire) the data-services bundle. When set BEFORE
   * `init()`, the four ApplicationContext keys are published as part
   * of init; AFTER `init()`, the next call needs to be made
   * explicitly via a future helper (Session 8 lands the impersonation
   * setter) — Session 7 only handles the seed-time publish.
   *
   * Passing `undefined` detaches the handle so init() becomes a
   * silent no-op for AppData. Mostly useful in tests.
   */
  setDataServices(handle: DataServicesHandle | undefined): void {
    this.dataServices = handle;
  }

  /**
   * Read the ApplicationContext keys published into AppData by
   * `init()`. Sync because the main-thread mirror is sync; throws
   * before init has run (or when no `dataServices` was wired).
   *
   * Components that want to reactively re-render on ApplicationContext
   * change should subscribe to the AppDataMirror directly via
   * `dataServices.appData.subscribe(...)` — this method is a
   * point-in-time read.
   */
  getApplicationContext(): ApplicationContext {
    if (!this.dataServices) {
      throw new Error(
        'ConfigManager.getApplicationContext requires dataServices to be configured. ' +
          'Pass `dataServices` in `createConfigManager(...)` or call `setDataServices(...)` ' +
          'before `init()`.',
      );
    }

    const appData = this.dataServices.appData;
    const appId = appData.get(APPLICATION_CONTEXT_NAME, 'AppId');
    const loggedInUser = appData.get(APPLICATION_CONTEXT_NAME, 'LoggedInUser');
    const impersonatedUser = appData.get(APPLICATION_CONTEXT_NAME, 'ImpersonatedUser');
    const loggedInUserProfile = appData.get(
      APPLICATION_CONTEXT_NAME,
      'LoggedInUserProfile',
    );

    if (
      typeof appId !== 'string' ||
      loggedInUser === undefined ||
      loggedInUserProfile === undefined
    ) {
      throw new Error(
        'ConfigManager.getApplicationContext called before init() published the ' +
          'ApplicationContext keys. Await `configManager.init()` first.',
      );
    }

    return {
      AppId: appId,
      LoggedInUser: loggedInUser as ApplicationContext['LoggedInUser'],
      ImpersonatedUser:
        (impersonatedUser as ApplicationContext['ImpersonatedUser']) ?? null,
      LoggedInUserProfile:
        loggedInUserProfile as ApplicationContext['LoggedInUserProfile'],
    };
  }

  // ─── Effective user / impersonation (Session 8) ──────────────────
  //
  // The framework exposes a single "effective user" slot that drives
  // visibility (Session 4) AND `AppConfigRow.userId` owner stamping
  // (Session 3). When `ImpersonatedUser` is set in
  // `ApplicationContext` (via `setImpersonatedUser` below), the
  // effective user becomes the impersonated user; otherwise it falls
  // back to the construction-time identity (which equals
  // `LoggedInUser`).
  //
  // Audit fields (`createdBy` / `updatedBy`) deliberately bypass this
  // helper — they always reflect the real signed-in user via
  // `this.identity.userId`, so impersonation can never rewrite history.

  /**
   * Resolve the user whose ownership / visibility applies to the next
   * write or read. Reads `ImpersonatedUser` live from the AppData
   * mirror so a flip via `setImpersonatedUser` is visible to the
   * subsequent call without any explicit refresh.
   *
   * No-op when `dataServices` isn't wired (back-compat for tests and
   * hosts that haven't opted into ApplicationContext): falls back to
   * `identity.userId`. Same fallback when AppData is wired but the
   * `ImpersonatedUser` slot is empty / null.
   */
  private getEffectiveUserId(): string {
    if (!this.dataServices) {
      return this.identity.userId;
    }
    const impersonated = this.dataServices.appData.get(
      APPLICATION_CONTEXT_NAME,
      'ImpersonatedUser',
    ) as ImpersonatedUser | null | undefined;
    if (impersonated && typeof impersonated === 'object' && impersonated.userId) {
      return impersonated.userId;
    }
    return this.identity.userId;
  }

  /**
   * Set or clear the impersonated user on `ApplicationContext`. After
   * the returned promise resolves, every subsequent visibility check
   * and owner stamp on this manager uses the new effective user; audit
   * fields keep tracking the real logged-in user.
   *
   * Pass `null` to clear impersonation. Throws if the manager wasn't
   * wired with `dataServices` — there's no AppData slot to write to.
   */
  async setImpersonatedUser(user: ImpersonatedUser | null): Promise<void> {
    if (!this.dataServices) {
      throw new Error(
        'ConfigManager.setImpersonatedUser requires dataServices to be ' +
          'configured. Pass `dataServices` in `createConfigManager(...)` ' +
          'or call `setDataServices(...)` before `init()`.',
      );
    }
    await this.dataServices.appData.set(
      APPLICATION_CONTEXT_NAME,
      'ImpersonatedUser',
      user,
    );
  }

  // ─── Visibility (Session 4) ───────────────────────────────────────
  //
  // Every list path that returns AppConfigRow[] runs the rows through
  // `isVisible(row, ctx)` so cross-app and not-mine-private rows never
  // leak. The effective user comes from `getEffectiveUserId()` so an
  // active impersonation flips visibility immediately.

  /**
   * The visibility context applied to every filtered read. Built fresh
   * each call so an impersonation swap (Session 8) is visible
   * immediately on the next list call.
   */
  private get visibilityContext(): VisibilityContext {
    return { appId: this.appId, effectiveUserId: this.getEffectiveUserId() };
  }

  // ─── Owner / audit field stamping (Session 3) ─────────────────────
  //
  // Every write path in this manager funnels its row through
  // `stampWrite` so audit fields (`createdBy`, `updatedBy`,
  // `creationTime`, `updatedTime`) follow a single rule:
  //
  //   - On insert: createdBy / creationTime default to the current
  //     identity / now if the caller didn't supply them.
  //   - On every write (insert OR update): updatedBy / updatedTime are
  //     stamped unconditionally from the current identity / now.
  //
  // Audit fields ALWAYS reflect the real logged-in user
  // (`identity.userId`). The OWNER slot (`AppConfigRow.userId`) flows
  // through `getEffectiveUserId()` so impersonation (Session 8) flips
  // ownership without ever touching audit. Owner stamping for
  // `AppConfigRow` happens inline in `saveConfig` / `saveSnapshot`;
  // the helper itself only handles the audit slots so it stays safe
  // to reuse on auth tables (`appRegistry`, `userProfile`, `roles`,
  // `permissions`) which have no owner concept.

  /**
   * Stamp audit fields (`createdBy`, `updatedBy`, `creationTime`,
   * `updatedTime`) on a row destined for any of the manager's tables.
   * Mutates the row in place and returns it for chaining.
   *
   * @param row - the row about to be persisted
   * @param isInsert - whether this is a first-time insert (controls
   *   whether `createdBy` / `creationTime` get defaulted)
   */
  /**
   * Stamp every `appConfig` write with this manager's deployment scope
   * (`appId` + seeded `identity.userId`). Global catalogue rows
   * (component registry, public data providers) keep `userId: 'system'`.
   */
  private stampAppConfigScope(config: AppConfigRow): void {
    const stamped = normalizeImportedAppConfigRow(config, {
      activeAppId: this.appId,
      activeUserId: this.identity.userId,
    });
    Object.assign(config, stamped);
  }

  private stampWrite<
    T extends {
      createdBy?: string;
      updatedBy?: string;
      creationTime?: string;
      updatedTime?: string;
    },
  >(row: T, isInsert: boolean): T {
    const auditUser = this.identity.userId;
    const now = new Date().toISOString();
    if (isInsert) {
      row.createdBy = row.createdBy ?? auditUser;
      row.creationTime = row.creationTime ?? now;
    }
    row.updatedBy = auditUser;
    row.updatedTime = now;
    return row;
  }

  // ─── Initialization ──────────────────────────────────────────────

  /**
   * Initialize the config service.
   *
   * On first run (empty database), this loads seed data from the
   * seed config URL. In REST mode, it also starts the background
   * loop that retries failed remote writes.
   *
   * Safe to call multiple times — only runs once.
   *
   * If `dispose()` runs while this promise is pending (e.g. React Strict
   * Mode effect cleanup), the bootstrap exits without throwing and
   * leaves `isInitialized` false so a fresh manager instance can own
   * the database on the next mount.
   */
  async init(options?: ConfigManagerInitOptions): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.isInitialized) {
      return;
    }
    if (this.initInFlight) {
      await this.initInFlight;
      return;
    }
    this.initInFlight = this.performInit(options);
    try {
      await this.initInFlight;
    } finally {
      this.initInFlight = undefined;
    }
  }

  private async performInit(options?: ConfigManagerInitOptions): Promise<void> {
    const attach = options?.mode === 'attach';
    try {
      // Seed the database if it's empty and a seed URL is provided.
      // Attach mode skips this — the provider window (or first tab) already seeded.
      if (!attach) {
        await this.seedIfEmpty();
      }
      if (this.disposed) {
        return;
      }

      // Publish ApplicationContext into AppData (Session 7). Sequenced
      // AFTER seeding so `LoggedInUserProfile` resolves against the
      // freshly-seeded auth tables on first run, and BEFORE the REST
      // drain so consumers reading via the mirror see identity from the
      // very first render.
      await this.publishApplicationContext();
      if (this.disposed) {
        return;
      }

      // In REST mode, start the background sync drain loop
      if (this.restUrl) {
        this.startSyncDrain();
      }

      this.isInitialized = true;
      const modeLabel = this.restUrl ? 'REST' : 'local';
      console.log(
        attach
          ? `ConfigManager initialized (mode: ${modeLabel}, attach)`
          : `ConfigManager initialized (mode: ${modeLabel})`,
      );
    } catch (err) {
      if (this.disposed) {
        return;
      }
      throw err;
    }
  }

  /**
   * Publish the four `ApplicationContext` keys into AppData. No-op
   * when `dataServices` wasn't wired — see option JSDoc.
   *
   * Awaits `appData.ready()` first so the worker's persisted snapshot
   * has been applied: otherwise the four sequential `set()` calls
   * each see an empty `byName` map and would fan-out four separate
   * configIds racing the snapshot. Once ready, each `set()` merges
   * into the same row by name.
   */
  private async publishApplicationContext(): Promise<void> {
    if (!this.dataServices) {
      return;
    }

    const appData = this.dataServices.appData;
    await appData.ready();
    if (this.disposed) {
      return;
    }

    const profile = await this.computeLoggedInUserProfile();
    const loggedInUser: ApplicationContext['LoggedInUser'] = {
      userId: this.identity.userId,
      ...(this.identity.displayName !== undefined
        ? { displayName: this.identity.displayName }
        : {}),
    };

    const contextValues: Record<string, unknown> = {
      AppId: this.appId,
      LoggedInUser: loggedInUser,
      ImpersonatedUser: null,
      LoggedInUserProfile: profile,
    };

    const publishRow = appData.publishNamedRow?.bind(appData);
    if (publishRow) {
      await publishRow(APPLICATION_CONTEXT_NAME, contextValues);
      return;
    }

    // Sequential — `AppDataMirror.set` reads `byName` after each
    // round-trip, so awaiting in order keeps the four keys on a
    // single row instead of racing four inserts. (Fallback when the
    // mirror does not implement `publishNamedRow`, e.g. minimal test
    // fakes.)
    await appData.set(APPLICATION_CONTEXT_NAME, 'AppId', this.appId);
    await appData.set(APPLICATION_CONTEXT_NAME, 'LoggedInUser', loggedInUser);
    await appData.set(APPLICATION_CONTEXT_NAME, 'ImpersonatedUser', null);
    await appData.set(APPLICATION_CONTEXT_NAME, 'LoggedInUserProfile', profile);
  }

  /**
   * Resolve the current identity into a `LoggedInUserProfile` payload
   * — the seeded user's roles + the union of those roles' permissions.
   *
   * If the user has no profile row yet (first-run, JIT provisioning
   * deferred per Decision 8), returns empty arrays so consumers see a
   * deterministic shape rather than `undefined`.
   */
  private async computeLoggedInUserProfile(): Promise<
    ApplicationContext['LoggedInUserProfile']
  > {
    const profile = await this.db.userProfile.get(this.identity.userId);
    if (!profile) {
      return { roles: [], permissions: [] };
    }

    const roles: RoleRow[] = [];
    const permissionIds = new Set<string>();
    for (const roleId of profile.roleIds) {
      const role = await this.db.roles.get(roleId);
      if (!role) continue;
      roles.push(role);
      for (const permId of role.permissionIds) {
        permissionIds.add(permId);
      }
    }

    const permissions: PermissionRow[] = [];
    for (const permId of permissionIds) {
      const perm = await this.db.permissions.get(permId);
      if (perm) permissions.push(perm);
    }

    return { roles, permissions };
  }

  /**
   * Clean up resources. Call this when the application is shutting down.
   * Stops the PENDING_SYNC drain loop and closes the database.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.isInitialized = false;
    if (this.drainIntervalId !== undefined) {
      clearInterval(this.drainIntervalId);
      this.drainIntervalId = undefined;
    }
    this.changeNotifier.dispose();
    this.rowCache.clear();
    this.db.close();
  }

  /**
   * Returns true if the ConfigManager is running in REST mode
   * (remote backend enabled), false for local-only mode.
   */
  isRestMode(): boolean {
    return this.restUrl !== undefined;
  }

  /**
   * The configured REST endpoint, or `undefined` in local-only mode.
   * Surfaces the live mode source-of-truth for diagnostic UIs (e.g.
   * the ConfigBrowser header chip) so they don't have to re-read
   * OpenFin customData independently — that path is unset for views
   * launched by the dock without a registry-driven `customData`.
   */
  getRestUrl(): string | undefined {
    return this.restUrl;
  }

  // ─── APP_CONFIG operations ────────────────────────────────────────

  /**
   * Get a single config by its ID.
   * Returns undefined if no config exists with that ID.
   *
   * Served from {@link rowCache} when warm; otherwise reads Dexie once and
   * memoizes the result (including a miss). The cache is invalidated on
   * every write via the change notifier, so a hit is never staler than the
   * shared IndexedDB row.
   */
  async getConfig(configId: string): Promise<AppConfigRow | undefined> {
    if (this.rowCache.has(configId)) {
      return this.rowCache.get(configId);
    }
    const row = await this.db.appConfig.get(configId);
    this.cacheRow(configId, row);
    return row;
  }

  /** Insert into {@link rowCache}, clearing wholesale past the cap. */
  private cacheRow(configId: string, row: AppConfigRow | undefined): void {
    if (
      this.rowCache.size >= ConfigManager.ROW_CACHE_MAX &&
      !this.rowCache.has(configId)
    ) {
      this.rowCache.clear();
    }
    this.rowCache.set(configId, row);
  }

  /**
   * Save a config (create or update).
   * In REST mode, also sends to the remote backend.
   *
   * Owner / audit stamping (Decisions 5 + 7):
   *   - On EVERY write: `appId` is stamped to this manager's deployment
   *     app; `userId` (owner) is stamped to `identity.userId` (the
   *     seeded signed-in user from bootstrap / `seed.json`), except
   *     global catalogue rows (component registry, public data providers)
   *     which keep `userId: 'system'`. Caller-supplied scope drift is
   *     overwritten — not honoured.
   *   - On INSERT: `createdBy` / `creationTime` default from the real
   *     identity / now if absent.
   *   - On EVERY write: `updatedBy` / `updatedTime` are unconditionally
   *     stamped from the current identity / now — audit fields always
   *     reflect the real logged-in user, never an impersonated one.
   *
   * The extra `getConfig` read on the write path is acceptable: config
   * writes are rare and the read is local Dexie.
   */
  async saveConfig(config: AppConfigRow, options?: SaveConfigOptions): Promise<void> {
    // Read the prior row through the cache: on the profile-save hot path
    // the bundle was already fetched by the caller, so this is a hit and
    // the optimistic-lock check below costs no extra Dexie round-trip.
    const existing = await this.getConfig(config.configId);
    const isInsert = existing === undefined;

    // Optimistic locking (Decision 12.5 / Session 6). When the caller
    // captured an `updatedTime` at edit-start, refuse the write if Dexie
    // has moved on. The same `expectedUpdatedTime` is forwarded to the
    // server as `If-Match` below so REST mode shares one rule.
    if (
      !isInsert &&
      options?.expectedUpdatedTime !== undefined &&
      existing !== undefined &&
      existing.updatedTime !== options.expectedUpdatedTime
    ) {
      throw new OptimisticLockError(existing);
    }

    this.stampAppConfigScope(config);
    this.stampWrite(config, isInsert);

    if (this.restUrl) {
      await this.syncToRest('upsert', 'configurations', config.configId, config, {
        ifMatch: options?.expectedUpdatedTime,
      });
    }
    await this.db.appConfig.put(config);
    // Cross-tab + same-tab notify (Session 3.2). Subscribers via
    // `profiles.subscribe(scope, fn)` get a callback whenever a write
    // touches their `configId`. Fired AFTER Dexie's write resolves so
    // a refetch from the listener sees the new row.
    this.changeNotifier.notify(config.configId);
    // Re-warm the cache with the row we just wrote. Ordered AFTER `notify`,
    // whose invalidation listener first drops the key — so we land on the
    // fresh row, not a value the eviction would clear.
    this.cacheRow(config.configId, config);
  }

  /**
   * Create a new config row, stamping `creationTime` / `updatedTime`.
   * Convenience over {@link saveConfig} for callers that hold everything
   * but the timestamps (e.g. widget layouts). Returns the persisted row.
   */
  async createConfig(input: CreateConfigInput): Promise<AppConfigRow> {
    const now = new Date().toISOString();
    const row: AppConfigRow = { ...input, creationTime: now, updatedTime: now };
    await this.saveConfig(row);
    return row;
  }

  /**
   * Patch an existing config row (read-modify-write). Throws
   * {@link ConfigNotFoundError} if the row is missing, and
   * {@link OptimisticLockError} when `expectedUpdatedTime` no longer
   * matches the stored row. Returns the merged, persisted row.
   */
  async updateConfig(
    configId: string,
    patch: Partial<AppConfigRow>,
    options?: UpdateConfigOptions,
  ): Promise<AppConfigRow> {
    const existing = await this.getConfig(configId);
    if (!existing) throw new ConfigNotFoundError(configId);
    if (
      options?.expectedUpdatedTime !== undefined &&
      existing.updatedTime !== options.expectedUpdatedTime
    ) {
      throw new OptimisticLockError(existing);
    }
    const next: AppConfigRow = {
      ...existing,
      ...patch,
      configId,
      updatedTime: new Date().toISOString(),
    };
    await this.saveConfig(next);
    return next;
  }

  /**
   * Get every visible row whose `componentType` matches (optionally also
   * `componentSubType`). Visibility-filtered — cross-app and not-mine
   * private rows are excluded. For the unfiltered, index-backed bulk read
   * used by the provider catalog, prefer
   * {@link getConfigsByComponentTypesUnfiltered}.
   */
  async findByComponentType(
    componentType: string,
    componentSubType?: string,
  ): Promise<AppConfigRow[]> {
    const rows = await this.getAllConfigs();
    return rows.filter((row) => {
      if (row.componentType !== componentType) return false;
      if (componentSubType !== undefined && row.componentSubType !== componentSubType) {
        return false;
      }
      return true;
    });
  }

  /**
   * Delete a config by its ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deleteConfig(configId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "configurations", configId, undefined);
    }
    await this.db.appConfig.delete(configId);
    this.changeNotifier.notify(configId);
    // `notify` already evicted via the invalidation listener; this is a
    // belt-and-braces drop in case the notifier was disabled.
    this.rowCache.delete(configId);
  }

  /**
   * Get all configs belonging to a specific app, filtered by visibility
   * (Decision 6 / Session 4): cross-app rows are excluded, and private
   * rows are returned only when owned by the current effective user.
   *
   * For admin / migration paths that need cross-app access, use
   * `getConfigsByAppUnfiltered` instead.
   */
  async getConfigsByApp(appId: string): Promise<AppConfigRow[]> {
    const rows = await this.db.appConfig.where("appId").equals(appId).toArray();
    return rows.filter((r) => isVisible(r, this.visibilityContext));
  }

  /**
   * Get all configs belonging to a specific user, filtered by
   * visibility (Decision 6 / Session 4): only rows under the manager's
   * `appId` are returned. For cross-app GC and migration paths use
   * `getConfigsByUserUnfiltered`.
   */
  async getConfigsByUser(userId: string): Promise<AppConfigRow[]> {
    const rows = await this.db.appConfig.where("userId").equals(userId).toArray();
    return rows.filter((r) => isVisible(r, this.visibilityContext));
  }

  /**
   * Get every row visible to the current caller. Use sparingly — prefer
   * the indexed queries (`getConfigsByApp`, `getConfigsByUser`, etc.).
   *
   * For admin / migration paths that need every row regardless of
   * visibility (cross-app re-stamping, exports, GC across apps), use
   * `getAllConfigsUnfiltered`.
   */
  async getAllConfigs(): Promise<AppConfigRow[]> {
    const rows = await this.db.appConfig.toArray();
    return rows.filter((r) => isVisible(r, this.visibilityContext));
  }

  /**
   * Get every row in the appConfig table, **bypassing the visibility
   * filter**. Reserved for admin and migration paths that need to see
   * rows across apps (e.g. realign-to-platform-scope, registry
   * migrations, full exports, the multi-app admin browser in Session
   * 12). New feature code should use `getAllConfigs` and let visibility
   * apply.
   */
  async getAllConfigsUnfiltered(): Promise<AppConfigRow[]> {
    return this.db.appConfig.toArray();
  }

  /**
   * Get every row owned by `userId`, **bypassing the visibility
   * filter**. Reserved for cross-app GC / migration paths where the
   * caller does its own appId narrowing after the read.
   */
  async getConfigsByUserUnfiltered(userId: string): Promise<AppConfigRow[]> {
    return this.db.appConfig.where("userId").equals(userId).toArray();
  }

  /**
   * Get every row under `appId`, **bypassing the visibility filter**.
   * Reserved for the multi-app admin browser and exports that show
   * private rows regardless of ownership.
   */
  async getConfigsByAppUnfiltered(appId: string): Promise<AppConfigRow[]> {
    return this.db.appConfig.where("appId").equals(appId).toArray();
  }

  /**
   * Get every row whose `componentType` is one of `types`, **bypassing the
   * visibility filter**, via the `[componentType+componentSubType]` index.
   *
   * Callers that want a single kind of config (data providers, AppData)
   * previously did `getAllConfigsUnfiltered()` + an in-memory `componentType`
   * filter — materialising the ENTIRE appConfig table (every grid profile,
   * etc.) just to keep a handful of provider rows. This narrows the read to
   * the matching componentTypes at the index, so it's O(matching rows) instead
   * of O(all rows). One indexed range scan per type (any `componentSubType`),
   * results concatenated; a row has exactly one componentType so the groups are
   * disjoint.
   */
  async getConfigsByComponentTypesUnfiltered(
    types: readonly string[],
  ): Promise<AppConfigRow[]> {
    if (types.length === 0) return [];
    const groups = await Promise.all(
      types.map((t) =>
        this.db.appConfig
          .where("[componentType+componentSubType]")
          .between([t, Dexie.minKey], [t, Dexie.maxKey], true, true)
          .toArray(),
      ),
    );
    return groups.flat();
  }

  /**
   * Get template configs, optionally filtered by component type and
   * subtype. Templates are base configurations that get cloned for new
   * instances.
   *
   * Visibility (Session 4) applies — cross-app templates and private
   * templates owned by other users are hidden.
   *
   * IndexedDB cannot index boolean values, so we scan via `toArray()`
   * and filter `isTemplate` in JS rather than querying the index.
   */
  async getTemplates(
    componentType?: string,
    componentSubType?: string,
  ): Promise<AppConfigRow[]> {
    const all = await this.db.appConfig.toArray();

    const ctx = this.visibilityContext;
    return all.filter((row) => {
      if (!row.isTemplate) return false;
      if (!isVisible(row, ctx)) return false;
      if (componentType && row.componentType !== componentType) return false;
      if (componentSubType && row.componentSubType !== componentSubType) return false;
      return true;
    });
  }

  /**
   * Check if a config exists with the given ID.
   */
  async configExists(configId: string): Promise<boolean> {
    const count = await this.db.appConfig.where("configId").equals(configId).count();
    return count > 0;
  }

  // ─── APP_REGISTRY operations ──────────────────────────────────────

  /**
   * Get an app registry entry by its ID.
   */
  async getAppRegistry(appId: string): Promise<AppRegistryRow | undefined> {
    return this.db.appRegistry.get(appId);
  }

  /**
   * Get all registered apps.
   */
  async getAllApps(): Promise<AppRegistryRow[]> {
    return this.db.appRegistry.toArray();
  }

  /**
   * Upsert an app registry entry.
   * In REST mode, also sends to the remote backend.
   *
   * Audit fields are stamped from the current identity via
   * `stampWrite`. There is no owner concept on this table — `appId` is
   * the primary key.
   */
  async saveAppRegistry(row: AppRegistryRow): Promise<void> {
    const existing = await this.db.appRegistry.get(row.appId);
    this.stampWrite(row, existing === undefined);

    if (this.restUrl) {
      await this.syncToRest("upsert", "app-registry", row.appId, row);
    }
    await this.db.appRegistry.put(row);
  }

  /**
   * Delete an app registry entry by ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deleteAppRegistry(appId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "app-registry", appId, undefined);
    }
    await this.db.appRegistry.delete(appId);
  }

  // ─── USER_PROFILE operations ──────────────────────────────────────

  /**
   * Get a user profile by user ID.
   */
  async getUserProfile(userId: string): Promise<UserProfileRow | undefined> {
    return this.db.userProfile.get(userId);
  }

  /**
   * Get all user profiles for a specific app.
   */
  async getUsersByApp(appId: string): Promise<UserProfileRow[]> {
    return this.db.userProfile.where("appId").equals(appId).toArray();
  }

  /** Get every row in the userProfile table. */
  async getAllUserProfiles(): Promise<UserProfileRow[]> {
    return this.db.userProfile.toArray();
  }

  /**
   * Upsert a user profile.
   * In REST mode, also sends to the remote backend.
   *
   * Audit fields are stamped from the current identity via
   * `stampWrite`. The row's `userId` is the user this profile belongs
   * to (the row's primary key), which is independent of `createdBy` /
   * `updatedBy` (audit — who last edited).
   */
  async saveUserProfile(row: UserProfileRow): Promise<void> {
    const existing = await this.db.userProfile.get(row.userId);
    row.appId = this.appId;
    this.stampWrite(row, existing === undefined);

    if (this.restUrl) {
      await this.syncToRest("upsert", "user-profiles", row.userId, row);
    }
    await this.db.userProfile.put(row);
  }

  /**
   * Delete a user profile by ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deleteUserProfile(userId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "user-profiles", userId, undefined);
    }
    await this.db.userProfile.delete(userId);
  }

  // ─── ROLES operations ─────────────────────────────────────────────

  /**
   * Get a role definition by its ID.
   */
  async getRole(roleId: string): Promise<RoleRow | undefined> {
    return this.db.roles.get(roleId);
  }

  /**
   * Get all role definitions.
   */
  async getAllRoles(): Promise<RoleRow[]> {
    return this.db.roles.toArray();
  }

  /**
   * Upsert a role definition.
   * In REST mode, also sends to the remote backend.
   *
   * Audit fields are stamped from the current identity via
   * `stampWrite`. There is no owner concept on this table — `roleId`
   * is the primary key.
   */
  async saveRole(row: RoleRow): Promise<void> {
    const existing = await this.db.roles.get(row.roleId);
    this.stampWrite(row, existing === undefined);

    if (this.restUrl) {
      await this.syncToRest("upsert", "roles", row.roleId, row);
    }
    await this.db.roles.put(row);
  }

  /**
   * Delete a role by ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deleteRole(roleId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "roles", roleId, undefined);
    }
    await this.db.roles.delete(roleId);
  }

  // ─── PERMISSIONS operations ────────────────────────────────────────

  /**
   * Get a permission definition by its ID.
   */
  async getPermission(permissionId: string): Promise<PermissionRow | undefined> {
    return this.db.permissions.get(permissionId);
  }

  /**
   * Get all permission definitions.
   */
  async getAllPermissions(): Promise<PermissionRow[]> {
    return this.db.permissions.toArray();
  }

  /**
   * Get all permissions in a specific category (e.g. "config", "admin").
   */
  async getPermissionsByCategory(category: string): Promise<PermissionRow[]> {
    return this.db.permissions.where("category").equals(category).toArray();
  }

  /**
   * Upsert a permission definition.
   * In REST mode, also sends to the remote backend.
   *
   * Audit fields are stamped from the current identity via
   * `stampWrite`. There is no owner concept on this table —
   * `permissionId` is the primary key.
   */
  async savePermission(row: PermissionRow): Promise<void> {
    const existing = await this.db.permissions.get(row.permissionId);
    this.stampWrite(row, existing === undefined);

    if (this.restUrl) {
      await this.syncToRest("upsert", "permissions", row.permissionId, row);
    }
    await this.db.permissions.put(row);
  }

  /**
   * Delete a permission by ID.
   * In REST mode, also deletes from the remote backend.
   */
  async deletePermission(permissionId: string): Promise<void> {
    if (this.restUrl) {
      await this.syncToRest("delete", "permissions", permissionId, undefined);
    }
    await this.db.permissions.delete(permissionId);
  }

  /**
   * Get all permissions that a user has across all their roles.
   *
   * Looks up the user's roles, collects all permissionIds from those
   * roles, deduplicates them, and returns the full PermissionRow for each.
   */
  async getUserPermissions(userId: string): Promise<PermissionRow[]> {
    const user = await this.db.userProfile.get(userId);
    if (!user) {
      return [];
    }

    // Collect all permissionIds from all of the user's roles.
    //
    // NOTE — N+1 query pattern: we make one DB call per role, then one
    // per permission. For the typical case (a few roles, ~10 permissions)
    // this is fast enough and much easier to read than a batched query.
    // If performance becomes an issue with many roles, consider fetching
    // all roles in one call using `.where("roleId").anyOf(user.roleIds)`.
    const allPermissionIds = new Set<string>();
    for (const roleId of user.roleIds) {
      const role = await this.db.roles.get(roleId);
      if (role) {
        for (const permId of role.permissionIds) {
          allPermissionIds.add(permId); // Set deduplicates automatically
        }
      }
    }

    // Fetch the full PermissionRow for each unique permissionId
    const permissions: PermissionRow[] = [];
    for (const permId of allPermissionIds) {
      const perm = await this.db.permissions.get(permId);
      if (perm) {
        permissions.push(perm);
      }
    }

    return permissions;
  }

  /**
   * Check if a user has a specific permission.
   * Returns true if any of the user's roles grant the permission.
   */
  async userHasPermission(userId: string, permissionId: string): Promise<boolean> {
    const user = await this.db.userProfile.get(userId);
    if (!user) {
      return false;
    }

    for (const roleId of user.roleIds) {
      const role = await this.db.roles.get(roleId);
      if (role && role.permissionIds.includes(permissionId)) {
        return true;
      }
    }

    return false;
  }

  // Note: dock + registry config persistence used to live here as
  // domain-specific shims (`saveDockConfig`, `loadDockConfig`, …).
  // They've been removed — ConfigManager stays a GENERIC (configId →
  // AppConfigRow) store, and domain helpers live in
  // `@wellsfargo-starui/openfin-platform/db.ts` alongside the types they
  // wrap. That file builds AppConfigRow instances directly and
  // passes them to `saveConfig`, matching the pattern MarketsGrid's
  // `createConfigServiceStorage` uses.

  // ─── Seeding ──────────────────────────────────────────────────────

  /**
   * Load seed data from `seedConfigUrl`.
   *
   * Default (`empty-only`): runs only when appRegistry and appConfig are both
   * empty. `when-changed`: also re-applies when the normalized deploy-bundle
   * digest differs from the last successful seed (dev: replace `seed.json` and
   * reload). Accepts the Config Browser rocket export shape — see
   * `parseSeedJson` + `normalizeSeedData`.
   */
  private async seedIfEmpty(): Promise<void> {
    if (!this.seedConfigUrl) {
      return;
    }
    // Serialize the seed across every same-origin context — all OpenFin
    // windows AND the SharedWorker — with a Web Lock keyed by the seed URL.
    // A cold start that opens several windows at once would otherwise have
    // each context (plus the worker) independently see an empty DB, fetch
    // seed.json, and run a bulkPut transaction. The lock collapses that to a
    // single fetch+seed: the emptiness check lives *inside* the lock, so late
    // acquirers find the rows already present and skip the fetch entirely.
    // Web Locks auto-release if a holder crashes mid-seed, so there is no
    // stale lock to time out (the cross-window warm-marker fallback in
    // ensurePlatformReady still guards the next-launch fast path).
    await this.runWithSeedLock(this.seedConfigUrl, () => this.seedIfEmptyLocked());
  }

  /**
   * Run `fn` while holding an exclusive same-origin Web Lock for this seed URL.
   * Falls back to running `fn` directly when `navigator.locks` is unavailable
   * (older runtimes, jsdom) — `bulkPut` is idempotent on primary key, so a
   * concurrent seed is wasteful but still correct.
   */
  private async runWithSeedLock(url: string, fn: () => Promise<void>): Promise<void> {
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

  /** The seed-config URL this manager was constructed with, if any. */
  getSeedConfigUrl(): string | undefined {
    return this.seedConfigUrl;
  }

  /**
   * Hard reset: replace EVERY config table with the contents of the seed
   * file at {@link seedConfigUrl}. Unlike {@link seedIfEmpty} this runs
   * unconditionally (regardless of `seedConfigReload` or whether the DB is
   * empty / the digest changed).
   *
   * The seed is fetched, parsed and normalized BEFORE anything is wiped, so a
   * network or parse failure throws and leaves the existing database
   * untouched — a reset never strands the user with an empty store.
   *
   * Callers (e.g. the Config Browser "Reset to seed" action) are expected to
   * force a backup first; this method itself performs no backup.
   *
   * @throws if the manager is disposed, has no `seedConfigUrl`, or the seed
   *   cannot be fetched / parsed.
   */
  async resetToSeed(): Promise<ResetToSeedResult> {
    if (this.disposed) {
      throw new Error('ConfigManager: cannot reset a disposed manager.');
    }
    const url = this.seedConfigUrl;
    if (!url) {
      throw new Error(
        'ConfigManager: no seedConfigUrl configured — there is no seed to reset to.',
      );
    }

    // Fetch + parse FIRST — a failure here must abort before any wipe.
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

    // Serialize against any concurrent seed/reset across windows + worker.
    let counts: ResetToSeedResult['counts'] | undefined;
    await this.runWithSeedLock(url, async () => {
      counts = await this.replaceAllWithSeed(seedData);
    });

    // Persist the digest so a subsequent `when-changed` boot doesn't re-seed
    // over the freshly-reset rows, and drop any stale cache entries.
    this.writeSeedDigest(seedDigestStorageKey(url), await computeSeedDigest(seedData));
    this.rowCache.clear();
    console.log(`ConfigManager: reset complete — re-seeded from ${url}.`);
    return { seedUrl: url, counts: counts! };
  }

  /**
   * Clear all config tables and bulkPut the seed rows in a single `rw`
   * transaction, so the replace is atomic. Returns per-table row counts.
   * Shared by {@link resetToSeed} and {@link seedIfEmptyLocked}.
   */
  private async replaceAllWithSeed(
    seedData: SeedData,
    options: { clearFirst?: boolean } = {},
  ): Promise<ResetToSeedResult['counts']> {
    const { clearFirst = true } = options;
    await this.db.transaction(
      'rw',
      [
        this.db.appRegistry,
        this.db.userProfile,
        this.db.roles,
        this.db.permissions,
        this.db.appConfig,
      ],
      async () => {
        if (clearFirst) {
          await Promise.all([
            this.db.appConfig.clear(),
            this.db.appRegistry.clear(),
            this.db.userProfile.clear(),
            this.db.roles.clear(),
            this.db.permissions.clear(),
          ]);
        }
        if (seedData.permissions.length > 0) {
          await this.db.permissions.bulkPut(seedData.permissions);
        }
        if (seedData.roles.length > 0) {
          await this.db.roles.bulkPut(seedData.roles);
        }
        if (seedData.appRegistry.length > 0) {
          await this.db.appRegistry.bulkPut(seedData.appRegistry);
        }
        if (seedData.userProfiles.length > 0) {
          await this.db.userProfile.bulkPut(seedData.userProfiles);
        }
        if (seedData.appConfig && seedData.appConfig.length > 0) {
          await this.db.appConfig.bulkPut(seedData.appConfig);
        }
      },
    );
    this.rowCache.clear();
    return {
      permissions: seedData.permissions.length,
      roles: seedData.roles.length,
      appRegistry: seedData.appRegistry.length,
      userProfiles: seedData.userProfiles.length,
      appConfig: seedData.appConfig?.length ?? 0,
    };
  }

  private async seedIfEmptyLocked(): Promise<void> {
    if (this.disposed || !this.seedConfigUrl) {
      return;
    }

    const [appCount, configCount] = await Promise.all([
      this.db.appRegistry.count(),
      this.db.appConfig.count(),
    ]);
    const hasData = appCount > 0 || configCount > 0;

    if (hasData && this.seedConfigReload === 'empty-only') {
      console.log('ConfigManager: Database already seeded, skipping.');
      return;
    }

    if (!hasData && this.seedConfigReload === 'empty-only') {
      console.log(`ConfigManager: Seeding database from ${this.seedConfigUrl}`);
    }

    try {
      const response = await fetch(this.seedConfigUrl, { cache: 'no-store' });
      if (!response.ok) {
        console.error(
          `ConfigManager: ⚠️ Failed to fetch seed data from ${this.seedConfigUrl} (HTTP ${response.status}). ` +
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
      const digestKey = seedDigestStorageKey(this.seedConfigUrl);
      const previousDigest = this.readSeedDigest(digestKey);

      if (hasData && this.seedConfigReload === 'when-changed') {
        if (previousDigest === digest) {
          console.log('ConfigManager: seed.json unchanged — skipping re-seed.');
          return;
        }
        console.log(
          `ConfigManager: seed.json changed — clearing config tables and re-seeding from ${this.seedConfigUrl}`,
        );
      }

      if (!hasData) {
        console.log(`ConfigManager: Seeding database from ${this.seedConfigUrl}`);
      }

      // Clear only on a `when-changed` re-seed of a non-empty DB; a cold seed
      // bulkPuts straight into the already-empty tables. `replaceAllWithSeed`
      // also flushes `rowCache` (seeded rows bypass `saveConfig`'s
      // write-through, so any negative cache hits from a pre-seed read must
      // be dropped).
      const seeded = await this.replaceAllWithSeed(seedData, {
        clearFirst: hasData && this.seedConfigReload === 'when-changed',
      });
      this.writeSeedDigest(digestKey, digest);
      console.log(
        `ConfigManager: Database seeding complete — ${seeded.permissions} permissions, ` +
        `${seeded.roles} roles, ${seeded.appRegistry} app registry, ` +
        `${seeded.userProfiles} user profiles, ${seeded.appConfig} component configs.`,
      );
    } catch (error) {
      console.error('ConfigManager: Error seeding database.', error);
    }
  }

  private readSeedDigest(key: string): string | null {
    try {
      if (typeof globalThis.localStorage === 'undefined') return null;
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeSeedDigest(key: string, digest: string): void {
    try {
      if (typeof globalThis.localStorage === 'undefined') return;
      globalThis.localStorage.setItem(key, digest);
    } catch {
      /* private mode / quota — seed still applied */
    }
  }

  // ─── REST sync ────────────────────────────────────────────────────

  /**
   * Attempt to sync a write operation to the remote REST backend.
   *
   * If the REST call fails, the operation is queued in PENDING_SYNC
   * for automatic retry later.
   */
  private async syncToRest(
    operation: "upsert" | "delete",
    tableName: string,
    recordId: string,
    payload: any,
    options?: { ifMatch?: string },
  ): Promise<void> {
    if (!this.restUrl) {
      return;
    }

    try {
      const url = `${this.restUrl}/${tableName}/${recordId}`;
      const method = operation === "delete" ? "DELETE" : "PUT";

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // Outbound auth (Decision 2 / Session 6). The host owns refresh —
      // we just call before each request and attach the bearer header.
      // The server doesn't verify yet (Decision 16 deferred) but
      // plumbing it now means later sessions don't have to revisit.
      if (this.identity.getAccessToken) {
        const token = await this.identity.getAccessToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
      }
      if (options?.ifMatch !== undefined) {
        headers["If-Match"] = options.ifMatch;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: operation === "delete" ? undefined : JSON.stringify(payload),
      });

      // 412 from the server means the row's `updatedTime` has moved on
      // since `expectedUpdatedTime` was captured. This is a USER-facing
      // error (the editor must reload); never queue it for retry.
      if (response.status === 412) {
        let currentRow: AppConfigRow | undefined;
        try {
          currentRow = (await response.json()) as AppConfigRow;
        } catch {
          currentRow = undefined;
        }
        throw new OptimisticLockError(currentRow);
      }

      if (!response.ok) {
        throw new Error(`REST sync failed with HTTP ${response.status}`);
      }
    } catch (error) {
      // Optimistic-lock failures are caller-visible; do not queue for retry.
      if (error instanceof OptimisticLockError) {
        throw error;
      }

      console.warn(
        `ConfigManager: REST sync failed for ${operation} ${tableName}/${recordId}. Queuing for retry.`,
        error,
      );

      // Queue the failed operation for retry
      const pendingEntry: PendingSyncRow = {
        operation,
        tableName,
        recordId,
        payload,
        createdAt: new Date().toISOString(),
        retries: 0,
      };
      await this.db.pendingSync.add(pendingEntry);
    }
  }

  /**
   * Start the background loop that retries failed REST writes.
   * Runs every 10 seconds. Only active in REST mode.
   */
  private startSyncDrain(): void {
    this.drainIntervalId = setInterval(async () => {
      await this.drainPendingSync();
    }, PENDING_SYNC_INTERVAL_MS);
  }

  /**
   * Process all entries in the PENDING_SYNC table.
   *
   * For each entry:
   *   - Retry the REST call
   *   - On success: delete the entry from PENDING_SYNC
   *   - On failure: increment the retry counter
   *   - After MAX_SYNC_RETRIES: log an error and stop retrying
   */
  private async drainPendingSync(): Promise<void> {
    if (!this.restUrl) {
      return;
    }

    const pendingEntries = await this.db.pendingSync.toArray();
    if (pendingEntries.length === 0) {
      return;
    }

    console.log(`ConfigManager: Draining ${pendingEntries.length} pending sync entries.`);

    for (const entry of pendingEntries) {
      // `id` is auto-assigned by Dexie on insert (++id primary key).
      // It should always be present on rows read from the database,
      // but we guard here so a corrupt row doesn't crash the drain loop.
      if (entry.id === undefined) {
        console.warn("ConfigManager: Skipping pending sync entry with no id.", entry);
        continue;
      }

      // Skip entries that have exceeded the retry limit
      if (entry.retries >= MAX_SYNC_RETRIES) {
        console.error(
          `ConfigManager: Giving up on sync for ${entry.tableName}/${entry.recordId} after ${entry.retries} retries.`,
        );
        continue;
      }

      try {
        const url = `${this.restUrl}/${entry.tableName}/${entry.recordId}`;
        const method = entry.operation === "delete" ? "DELETE" : "PUT";

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (this.identity.getAccessToken) {
          const token = await this.identity.getAccessToken();
          if (token) headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
          method,
          headers,
          body: entry.operation === "delete" ? undefined : JSON.stringify(entry.payload),
        });

        if (response.ok) {
          // Success — remove from the queue
          await this.db.pendingSync.delete(entry.id);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        // Failed again — increment the retry counter
        console.warn("Pending sync retry failed for entry", entry.id, err);
        await this.db.pendingSync.update(entry.id, {
          retries: entry.retries + 1,
        });
      }
    }
  }
}
