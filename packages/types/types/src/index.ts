/**
 * Runtime-agnostic foundation types for StarGrid host ports.
 * Ported from @wellsfargo-starui/runtime-port — no legacy imports.
 */

/** @deprecated Use `PlatformBootstrapConfig.userId` from `app-config.json` or OpenFin manifest `customSettings`, then `DataHubProvider` / `useUserIdFromContext`. */
export const LOGGED_IN_USER_ID = 'dev1';

export type Theme = 'light' | 'dark';

// NOTE: intentionally byte-equal to the declaration in
// `shared-types/src/theme.ts` (`@wellsfargo-starui/types/shared`) — the two
// subpath builds can't share a source file, so a drift-guard test
// (`themeKeyParity.test.ts`) pins them together. Change BOTH or neither.
export const THEME_STORAGE_KEY = 'starui:theme';

export const THEME_BROADCAST_CHANNEL = 'starui:theme';

export type Unsubscribe = () => void;

export interface IdentitySnapshot {
  readonly instanceId: string;
  readonly appId: string;
  readonly userId: string;
  readonly componentType: string;
  readonly componentSubType: string;
  readonly isTemplate: boolean;
  readonly singleton: boolean;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly customData: Readonly<Record<string, unknown>>;
}

export type SurfaceKind = 'popout' | 'modal' | 'inpage';

export interface SurfaceSpec {
  readonly kind: SurfaceKind;
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  readonly title?: string;
  readonly windowName?: string;
  readonly customData?: Readonly<Record<string, unknown>>;
}

export interface SurfaceHandle {
  readonly kind: SurfaceKind;
  readonly id: string;
  close(): void;
  focus?(): void;
  onClosed(fn: () => void): Unsubscribe;
}

/**
 * Versioned per-module state envelope — what `GridPlatform.serializeAll()`
 * produces for every customizer module. Hosted here so the ONE
 * `ProfileSnapshot` contract can be shared by the engine's StorageAdapter
 * and the host layer's StoragePort without an engine dependency.
 */
export interface SerializedState {
  v: number;
  data: unknown;
}

/** Opaque profile blob — engine interprets; host adapters store. */
export interface ProfileSnapshot {
  readonly id: string;
  readonly gridId: string;
  name: string;
  state: Record<string, SerializedState>;
  createdAt: number;
  updatedAt: number;
}

export type AppDataLookup = (name: string, key: string) => unknown;

export interface AppDataSnapshot {
  readonly revision: number;
  lookup(name: string, key: string): unknown;
}

export {
  COMPOSITE_KEY_SEPARATOR,
  composeRowId,
  getPathAccessor,
  getPathSetter,
  getValueByPath,
  normalizeKeyColumns,
  __resetPathAccessorCaches,
} from './rowPath.js';

export * from './dataProvider.js';
export * from './fieldSelector.js';
export * from './configuration.js';
