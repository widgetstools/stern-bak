import { LOGGED_IN_USER_ID, type IdentitySnapshot } from '@wellsfargo-starui/types';
import { resolveBrowserIdentity, type IdentityOverrides } from '@wellsfargo-starui/core/host/browser';

/**
 * Identity resolution for OpenFin views.
 *
 * Order of precedence (highest first):
 *   1. View customData (`fin.View.getCurrentSync().getOptions()` →
 *      `options.customData`).
 *   2. URL search params (e.g., a popped-out view that received params).
 *   3. Mount-prop overrides.
 *   4. Auto defaults (UUID instanceId, empty strings, empty arrays).
 *
 * `instanceId` prefers the view's `identity.name` over any other source —
 * that's the OpenFin-canonical identifier and it's stable across the view's
 * lifetime.
 */

interface FinViewIdentity {
  readonly name?: string;
  readonly uuid?: string;
}

interface FinViewOptions {
  readonly customData?: unknown;
  readonly url?: string;
}

interface FinViewLike {
  identity?: FinViewIdentity;
  getOptions(): Promise<FinViewOptions> | FinViewOptions;
  on?(event: string, handler: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, handler: (...args: unknown[]) => void): unknown;
}

/**
 * THE canonical OpenFin runtime predicate: true when the `fin` global is
 * present. Every package-level "are we in OpenFin?" question goes through
 * this one function; capability-specific probes (`fin.me.getCurrentWindow`,
 * `fin.Window.create`, …) stay private to the seam that needs them.
 *
 * The `fin` namespace (including `fin.View`) is injected atomically by the
 * runtime, so a bare presence check is equivalent to the old
 * `fin && fin.View` probe in every real OpenFin context while also
 * answering correctly in window (non-view) contexts.
 */
export function isOpenFin(): boolean {
  if (typeof globalThis === 'undefined') return false;
  return typeof (globalThis as { fin?: unknown }).fin !== 'undefined';
}

/**
 * Narrow structural view of `fin.me` — the current OpenFin entity (view in a
 * view context, window in a window context). Every member is optional so
 * callers degrade gracefully on runtimes that lack an API.
 */
export interface FinEntityLike {
  identity?: { uuid?: string; name?: string };
  getOptions?: () => Promise<{ customData?: unknown; [key: string]: unknown }>;
  updateOptions?: (patch: { customData?: Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => unknown;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => unknown;
  getCurrentWindow?: () => Promise<unknown>;
  interop?: unknown;
}

/** `fin.me` — the current OpenFin entity — or null outside OpenFin. */
export function getFinMe(): FinEntityLike | null {
  if (!isOpenFin()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const me = (globalThis as any).fin?.me;
  return me && typeof me === 'object' ? (me as FinEntityLike) : null;
}

/**
 * This window/view's OpenFin identity strings (`fin.me.identity`), or null
 * outside OpenFin. Unique per view — safe as an echo-suppression source id.
 */
export function getOpenFinWindowIdentity(): { uuid?: string; name?: string } | null {
  const id = getFinMe()?.identity;
  if (!id || (!id.uuid && !id.name)) return null;
  return { uuid: id.uuid, name: id.name };
}

/** Get the current OpenFin view, or null when not in OpenFin. */
export function getCurrentView(): FinViewLike | null {
  if (!isOpenFin()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).fin.View.getCurrentSync() as FinViewLike;
  } catch {
    return null;
  }
}

export interface OpenFinIdentitySources {
  /** OpenFin view (defaults to `fin.View.getCurrentSync()`). */
  readonly view?: FinViewLike | null;
  /** URL to parse (defaults to `window.location.href`). */
  readonly url?: string;
  /** Mount-prop fallbacks. */
  readonly overrides?: IdentityOverrides;
}

/**
 * Resolve identity from an OpenFin context. Async because reading view
 * options requires `await`. When the view's customData carries any of
 * the known identity keys, those win over URL/overrides for the
 * corresponding field.
 */
export async function resolveOpenFinIdentity(
  sources: OpenFinIdentitySources = {},
): Promise<IdentitySnapshot> {
  const view = sources.view ?? getCurrentView();
  const url = sources.url ?? (typeof window !== 'undefined' ? window.location.href : '');
  const search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';

  let customData: Readonly<Record<string, unknown>> = {};
  let viewName: string | undefined;

  if (view) {
    viewName = view.identity?.name;
    try {
      const options = await view.getOptions();
      const cd = options?.customData;
      if (cd && typeof cd === 'object' && !Array.isArray(cd)) {
        customData = cd as Readonly<Record<string, unknown>>;
      }
    } catch {
      // View options unavailable — fall through with empty customData.
    }
  }

  // Start from URL+overrides (which already merges customData),
  // then layer view customData on top so it wins for known keys.
  const base = resolveBrowserIdentity(search, sources.overrides);
  const merged: IdentitySnapshot = {
    instanceId: stringFrom(customData, 'instanceId') ?? viewName ?? base.instanceId,
    appId: stringFrom(customData, 'appId') ?? base.appId,
    userId: stringFrom(customData, 'userId') ?? base.userId ?? LOGGED_IN_USER_ID,
    componentType: stringFrom(customData, 'componentType') ?? base.componentType,
    componentSubType: stringFrom(customData, 'componentSubType') ?? base.componentSubType,
    isTemplate: boolFrom(customData, 'isTemplate') ?? base.isTemplate,
    singleton: boolFrom(customData, 'singleton') ?? base.singleton,
    roles: arrayFrom(customData, 'roles') ?? base.roles,
    permissions: arrayFrom(customData, 'permissions') ?? base.permissions,
    customData: { ...base.customData, ...customData },
  };
  return merged;
}

function stringFrom(cd: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const v = cd[key];
  return typeof v === 'string' ? v : undefined;
}

function boolFrom(cd: Readonly<Record<string, unknown>>, key: string): boolean | undefined {
  const v = cd[key];
  return typeof v === 'boolean' ? v : undefined;
}

function arrayFrom(cd: Readonly<Record<string, unknown>>, key: string): readonly string[] | undefined {
  const v = cd[key];
  if (!Array.isArray(v)) return undefined;
  return v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;
}
