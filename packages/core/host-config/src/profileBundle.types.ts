/**
 * Types for the bundled profile-set row — the single AppConfigRow that
 * carries every MarketsGrid profile (plus gridLevelData) for one
 * instance. Shared by the `profiles` namespace, the StorageAdapter
 * factory, and the ConfigPort adapter (all in `profileBundle.ts`).
 */

import type { ProfileSnapshot } from '@wellsfargo-starui/core';

/** ComponentType used on the AppConfigRow that holds a whole
 *  instance's bundle of profiles. Singular "profile-set" (not
 *  "profile") — the row IS the set. */
export const MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE = 'markets-grid-profile-set';

/** Back-compat re-export of the old component-type name so callers
 *  that imported `MARKETS_GRID_PROFILE_COMPONENT_TYPE` don't break —
 *  it now just points at the set-style constant. */
export const MARKETS_GRID_PROFILE_COMPONENT_TYPE = MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE;

/**
 * Thrown by the ConfigService storage adapter when a `saveProfile`,
 * `deleteProfile`, or other write observes that the backing row's
 * version has advanced since it was loaded — meaning another writer
 * (another tab, another device) beat this one to the row.
 */
export class ProfileSetVersionConflictError extends Error {
  readonly name = 'ProfileSetVersionConflictError';
  constructor(
    public readonly expected: number,
    public readonly actual: number,
    public readonly instanceId: string,
  ) {
    super(
      `Profile set for instance "${instanceId}" was modified by another writer. `
      + `Expected version ${expected}, found ${actual}. Reload to see the latest state.`,
    );
  }
}

/**
 * Identity of the registered component this MarketsGrid instance is
 * persisting state for — propagated onto the saved AppConfigRow so
 * its `componentType` / `componentSubType` / `isTemplate` /
 * `singleton` fields reflect the registered entry, not a hardcoded
 * "markets-grid-profile-set" placeholder.
 */
export interface RegisteredComponentIdentity {
  componentType: string;
  componentSubType: string;
  isTemplate?: boolean;
  singleton?: boolean;
}

/** Decoded payload of a profile-set row. */
export interface ProfileSetPayload {
  version: number;
  profiles: ProfileSnapshot[];
  gridLevelData?: unknown;
}

/** Scope identifying which row to read / write. */
export interface ProfileSetScope {
  instanceId: string;
  appId: string;
  userId: string;
}

/** Optional knobs handed to `saveSet` so the persisted row carries the
 *  correct identity-bound `componentType`/`componentSubType` and the
 *  caller's `displayText` prefix. */
export interface ProfileSetSaveOptions {
  identity?: RegisteredComponentIdentity;
  displayTextPrefix?: string;
}

/** Scope identifying which row to read / write. `appId` and `userId`
 *  default to the manager's own identity / appId so the typical caller
 *  passes only `instanceId`. */
export interface ProfilesScope {
  instanceId: string;
  appId?: string;
  userId?: string;
}

/** Optional knobs that flow through `save` to the persisted row. */
export interface ProfilesSaveOptions {
  identity?: RegisteredComponentIdentity;
  displayTextPrefix?: string;
}

/**
 * The shape returned from `ConfigManager.profiles`.
 *
 * Mirrors `StorageAdapter` semantically but works in scope terms
 * (`{ instanceId, appId, userId }`) rather than the legacy `gridId`
 * positional argument.
 */
export interface ProfilesNamespace {
  list(scope: ProfilesScope): Promise<readonly ProfileSnapshot[]>;
  save(
    scope: ProfilesScope,
    snapshot: ProfileSnapshot,
    options?: ProfilesSaveOptions,
  ): Promise<void>;
  delete(
    scope: ProfilesScope,
    profileId: string,
    options?: ProfilesSaveOptions,
  ): Promise<void>;
  loadGridLevelData(scope: ProfilesScope): Promise<unknown | null>;
  saveGridLevelData(
    scope: ProfilesScope,
    data: unknown,
    options?: ProfilesSaveOptions,
  ): Promise<void>;
  subscribe(scope: ProfilesScope, fn: () => void): () => void;
}
