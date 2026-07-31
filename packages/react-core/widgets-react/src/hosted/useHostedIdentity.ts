/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useMemo, useState } from 'react';
import { DEV_PLATFORM_BOOTSTRAP } from '@wellsfargo-starui/host-data';
import { usePlatformIdentityOrNull } from '@wellsfargo-starui/host-data-react/runtime';
import { createConfigServiceStorage } from '@wellsfargo-starui/host-config';
import type {
  ConfigManager,
  HostedContext,
  RegisteredComponentMetadata,
  StorageAdapterFactory,
} from './types.js';

/**
 * Arguments for {@link useHostedIdentity}.
 */
export interface UseHostedIdentityArgs {
  /**
   * Default `instanceId` used when neither OpenFin customData nor the
   * URL `?instanceId=` query param resolves one. Required so first-run
   * / refresh scenarios converge on a stable id.
   */
  defaultInstanceId: string;
  /** Default `appId` when platform bootstrap context is unavailable. */
  defaultAppId?: string;
  /** Default `userId` when platform bootstrap context is unavailable. */
  defaultUserId?: string;
  /**
   * When true, build a ConfigService-backed StorageAdapterFactory and
   * expose it on `identity.storage`. The factory is wrapped so every
   * adapter call automatically carries the resolved
   * {@link RegisteredComponentMetadata}.
   */
  withStorage?: boolean;
  /**
   * Optional ConfigManager override. When omitted and `withStorage` is
   * true, the hook attempts to resolve the host singleton via the
   * `@wellsfargo-starui/openfin-platform/config` entry point. Pass an explicit
   * ConfigManager in tests or in non-OpenFin runtimes.
   */
  configManager?: ConfigManager;
  /**
   * Logical component name — currently used in diagnostic logs only,
   * but reserved as a future hook into storage diagnostics.
   */
  componentName: string;
}

/**
 * Result of {@link useHostedIdentity}.
 */
export interface UseHostedIdentityResult {
  /** Resolved identity bundle. `instanceId` may be `null` while OpenFin
   *  `customData` is in flight; ConfigManager / storage resolve shortly after. */
  identity: HostedContext;
  /**
   * `true` once `instanceId` is resolved. In OpenFin without a stamped
   * `?instanceId=` / `?id=` URL param this stays `false` until
   * `fin.me.getOptions().customData` settles (or times out). Browser
   * paths and URL-stamped OpenFin views are ready on first paint.
   */
  ready: boolean;
}

// ─── Identity resolution helpers ─────────────────────────────────────

/**
 * Hard bound on the OpenFin `fin.me.getOptions()` round-trip. A wedged
 * runtime (the original "Connecting to ConfigService…" stall) must never
 * strand the window — after this we keep the synchronously-seeded id.
 */
const HOST_OPTIONS_TIMEOUT_MS = 3_000;

/**
 * Diagnostic bound on host ConfigManager resolution. We never *drop* the
 * manager (that would strand persistence); exceeding this only logs a warning
 * so a slow ConfigService backend is visible without breaking the gate.
 */
const CONFIG_MANAGER_SLOW_MS = 8_000;

/** Reject after `ms` so a hung host call can't block identity resolution. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

interface HostCustomData {
  instanceId?: string;
  componentType?: string;
  componentSubType?: string;
  isTemplate?: boolean;
  singleton?: boolean;
}

/** Synchronously derive `instanceId` from URL query params. */
function readUrlInstanceId(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromInstanceId = params.get('instanceId');
    if (fromInstanceId && fromInstanceId.length > 0) return fromInstanceId;
    const fromId = params.get('id');
    if (fromId && fromId.length > 0) return fromId;
    return null;
  } catch {
    /* SSR / no window */
    return null;
  }
}

function isOpenFinRuntime(): boolean {
  return typeof fin !== 'undefined';
}

/**
 * Initial `instanceId` state. Browser and URL-stamped OpenFin views seed
 * synchronously; bare OpenFin views start `null` so the grid does not mount
 * under the host default before `customData` arrives.
 */
function initialInstanceId(defaultId: string): string | null {
  const fromUrl = readUrlInstanceId();
  if (fromUrl) return fromUrl;
  if (isOpenFinRuntime()) return null;
  return defaultId;
}

/** True while an OpenFin view awaits `customData` without a URL-stamped id. */
function initialIdentityPending(): boolean {
  return isOpenFinRuntime() && readUrlInstanceId() === null;
}

/**
 * Read OpenFin `customData` with a hard timeout. Returns `null` outside
 * OpenFin, on error, or on timeout — callers then keep the synchronous seed.
 */
async function readHostCustomData(timeoutMs: number): Promise<HostCustomData | null> {
  if (typeof fin === 'undefined') return null;
  try {
    const options = await withTimeout(
      fin.me.getOptions() as Promise<{ customData?: HostCustomData }>,
      timeoutMs,
      'fin.me.getOptions()',
    );
    return options?.customData ?? null;
  } catch {
    return null;
  }
}

function toRegisteredIdentity(cd: HostCustomData | null): RegisteredComponentMetadata | null {
  if (!cd || typeof cd.componentType !== 'string' || cd.componentType.length === 0) return null;
  return {
    componentType: cd.componentType,
    componentSubType: cd.componentSubType ?? '',
    isTemplate: cd.isTemplate === true,
    singleton: cd.singleton === true,
  };
}

/**
 * Lazily import the host's ConfigManager singleton. Kept dynamic so
 * widgets-react does not pull `@wellsfargo-starui/openfin-platform` (and its
 * `@openfin/core` dep) into browser-only consumer bundles. Returns
 * `null` when the entry point is unavailable — the caller will then
 * surface a `null` configManager and consumers can fall back to
 * passing their own.
 *
 * Resolution is **peek-first**: `peekConfigManager()` returns the
 * already-initialized singleton synchronously (Provider realm), avoiding the
 * async `getConfigManager()` fallback entirely. Only when no instance is set
 * (child windows, fresh realms) do we await `getConfigManager()`, which is
 * diagnostically bounded by {@link CONFIG_MANAGER_SLOW_MS}.
 */
async function loadHostConfigManager(componentName: string): Promise<ConfigManager | null> {
  try {
    // Dynamic specifier — the package is an optional runtime peer, not
    // a build-time dep.
    const mod = (await import(
      /* @vite-ignore */ '@wellsfargo-starui/openfin-platform/config' as string
    )) as {
      getConfigManager?: () => Promise<ConfigManager>;
      peekConfigManager?: () => ConfigManager | undefined;
    };
    const peeked = mod.peekConfigManager?.();
    if (peeked) return peeked;
    if (typeof mod.getConfigManager !== 'function') return null;
    const pending = mod.getConfigManager();
    // Warn (don't drop) when the host CM is slow to resolve.
    void withTimeout(pending, CONFIG_MANAGER_SLOW_MS, 'getConfigManager()').catch((err) => {
      if (err instanceof Error && err.message.includes('timed out')) {
        console.warn(
          `[useHostedIdentity:${componentName}] host ConfigManager resolve exceeded ${CONFIG_MANAGER_SLOW_MS}ms; still awaiting`,
        );
      }
    });
    return await pending;
  } catch {
    return null;
  }
}

function readConfigManagerAppId(configManager: ConfigManager | null | undefined): string | undefined {
  if (!configManager || typeof configManager.getAppId !== 'function') return undefined;
  return configManager.getAppId();
}

function readConfigManagerUserId(configManager: ConfigManager | null | undefined): string | undefined {
  if (!configManager || typeof configManager.getIdentity !== 'function') return undefined;
  return configManager.getIdentity().userId;
}

/**
 * Resolve the per-instance identity, host ConfigManager, and (optional)
 * storage factory used by hosted features such as
 * `<HostedMarketsGrid>`. Mirrors the resolution rules previously
 * embedded in `apps/markets-ui-react-reference`'s `HostedComponent`.
 *
 *   1. **OpenFin path** — `fin.me.getOptions().customData` supplies
 *      `instanceId` plus the four registered-component fields
 *      (componentType, componentSubType, isTemplate, singleton).
 *   2. **Browser path** — `window.location.search`'s `?instanceId=`
 *      wins, otherwise the supplied defaults are used.
 *   3. **`appId` / `userId`** — from {@link DataHubProvider} bootstrap
 *      context when present; otherwise `defaultAppId` / `defaultUserId`
 *      args, then an explicit `configManager`, then
 *      {@link DEV_PLATFORM_BOOTSTRAP}.
 *
 * When `withStorage` is true and a ConfigManager is available, the
 * returned `identity.storage` is a wrapped `StorageAdapterFactory`
 * that injects the registered-component identity into every call.
 */
export function useHostedIdentity(args: UseHostedIdentityArgs): UseHostedIdentityResult {
  const {
    defaultInstanceId,
    defaultAppId = DEV_PLATFORM_BOOTSTRAP.appId,
    defaultUserId = DEV_PLATFORM_BOOTSTRAP.userId,
    withStorage = false,
    configManager: configManagerOverride,
    componentName,
  } = args;

  const platformIdentity = usePlatformIdentityOrNull();

  const [instanceId, setInstanceId] = useState<string | null>(() =>
    initialInstanceId(defaultInstanceId),
  );
  const [identityPending, setIdentityPending] = useState(initialIdentityPending);
  const [resolvedConfigManager, setResolvedConfigManager] = useState<ConfigManager | null>(
    () => configManagerOverride ?? null,
  );
  const [registeredIdentity, setRegisteredIdentity] = useState<RegisteredComponentMetadata | null>(
    null,
  );

  const appId =
    platformIdentity?.appId
    ?? readConfigManagerAppId(configManagerOverride)
    ?? readConfigManagerAppId(resolvedConfigManager)
    ?? defaultAppId;

  const userId =
    platformIdentity?.userId
    ?? readConfigManagerUserId(configManagerOverride)
    ?? readConfigManagerUserId(resolvedConfigManager)
    ?? defaultUserId;

  // OpenFin refine — `customData` supplies instanceId + registered-component
  // metadata. Bounded by HOST_OPTIONS_TIMEOUT_MS; on timeout/error fall back
  // to the host default when no URL-stamped id is present.
  useEffect(() => {
    if (!isOpenFinRuntime()) return;
    let cancelled = false;
    readHostCustomData(HOST_OPTIONS_TIMEOUT_MS)
      .then((cd) => {
        if (cancelled) return;
        if (typeof cd?.instanceId === 'string' && cd.instanceId.length > 0) {
          setInstanceId(cd.instanceId);
        } else if (!readUrlInstanceId()) {
          setInstanceId(defaultInstanceId);
        }
        const reg = toRegisteredIdentity(cd);
        if (reg) setRegisteredIdentity(reg);
      })
      .catch((err) => {
        console.error(`[useHostedIdentity:${componentName}] identity resolution failed:`, err);
        if (!cancelled && !readUrlInstanceId()) {
          setInstanceId(defaultInstanceId);
        }
      })
      .finally(() => {
        if (!cancelled) setIdentityPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [componentName, defaultInstanceId]);

  // ConfigManager — explicit override wins; otherwise resolve the host
  // singleton lazily (peek-first, then bounded getConfigManager fallback).
  useEffect(() => {
    if (configManagerOverride) {
      setResolvedConfigManager(configManagerOverride);
      return;
    }
    let cancelled = false;
    loadHostConfigManager(componentName)
      .then((cm) => {
        if (!cancelled) setResolvedConfigManager(cm);
      })
      .catch((err) => {
        console.error(`[useHostedIdentity:${componentName}] ConfigManager resolve failed:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [configManagerOverride, componentName]);

  // Storage factory wrap. Identical wrapping rules as the previous
  // HostedComponent: registeredIdentity is injected per-call when
  // present; otherwise the underlying factory's legacy hardcoded
  // discriminator is used.
  const storage = useMemo<StorageAdapterFactory | null>(() => {
    if (!withStorage || !resolvedConfigManager) return null;
    const innerFactory = createConfigServiceStorage({ configManager: resolvedConfigManager });
    if (!registeredIdentity) return innerFactory;
    return (opts) => innerFactory({ ...opts, registeredIdentity });
  }, [withStorage, resolvedConfigManager, registeredIdentity]);

  const identity = useMemo<HostedContext>(
    () => ({
      instanceId,
      appId,
      userId,
      configManager: resolvedConfigManager,
      storage,
    }),
    [instanceId, appId, userId, resolvedConfigManager, storage],
  );

  const ready = !identityPending && instanceId !== null;
  return { identity, ready };
}
