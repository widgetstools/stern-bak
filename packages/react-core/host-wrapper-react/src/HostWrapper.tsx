import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { IdentitySnapshot, Theme } from '@wellsfargo-starui/types';
import type { RuntimePort } from '@wellsfargo-starui/host';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import { HostContext, type HostContextValue } from './HostContext.js';

export interface HostWrapperProps {
  /**
   * The runtime port. Pass an instance directly, or a Promise (e.g.,
   * `OpenFinRuntime.create()`). The wrapper renders `loading` until the
   * promise resolves.
   */
  readonly runtime: RuntimePort | Promise<RuntimePort>;

  /**
   * The config manager (any backend). Pass an instance or a Promise.
   * Wrapper awaits before rendering children.
   */
  readonly configManager: ConfigManager | Promise<ConfigManager>;

  /** Optional URL of the config-service backend for downstream consumers. */
  readonly configUrl?: string;

  /** Render while the runtime + configManager promises resolve. Defaults to `null`. */
  readonly loading?: ReactNode;

  /** Hosted component tree. */
  readonly children: ReactNode;
}

/**
 * `HostWrapper` — the only component-side seam between a hosted React
 * component and the surrounding runtime / framework / persistence
 * choices.
 *
 * Wires up:
 *   - identity resolution from the `RuntimePort`
 *   - theme tracking (current value + change subscription)
 *   - delegation methods for the runtime's other lifecycle events
 *
 * Does NOT mount the runtime or the configManager — those are passed
 * in by the host. That keeps `HostWrapper` runtime-agnostic and
 * persistence-agnostic, satisfying the architectural principle "every
 * component is an app".
 */
export function HostWrapper({
  runtime: runtimeOrPromise,
  configManager: configManagerOrPromise,
  configUrl,
  loading = null,
  children,
}: HostWrapperProps): ReactNode {
  const [resolved, setResolved] = useState<{ runtime: RuntimePort; configManager: ConfigManager } | null>(null);

  // Resolve runtime + configManager (each may be a Promise).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      Promise.resolve(runtimeOrPromise),
      Promise.resolve(configManagerOrPromise),
    ])
      .then(([runtime, configManager]) => {
        if (cancelled) return;
        setResolved({ runtime, configManager });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[HostWrapper] failed to resolve runtime/configManager:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [runtimeOrPromise, configManagerOrPromise]);

  // Identity snapshot — captured once when runtime resolves.
  const identity = useMemo<IdentitySnapshot | null>(
    () => (resolved ? resolved.runtime.resolveIdentity() : null),
    [resolved],
  );

  // Theme — initial value from runtime; updates from onThemeChanged.
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    if (!resolved) return;
    setTheme(resolved.runtime.getTheme());
    return resolved.runtime.onThemeChanged(setTheme);
  }, [resolved]);

  const value = useMemo<HostContextValue | null>(() => {
    if (!resolved || !identity) return null;
    const { runtime, configManager } = resolved;
    return {
      // Identity (spread from snapshot)
      instanceId: identity.instanceId,
      appId: identity.appId,
      userId: identity.userId,
      componentType: identity.componentType,
      componentSubType: identity.componentSubType,
      isTemplate: identity.isTemplate,
      singleton: identity.singleton,
      roles: identity.roles,
      permissions: identity.permissions,
      customData: identity.customData,
      // Platform services
      runtime,
      configManager,
      theme,
      configUrl,
      // Runtime delegations — bound for stable identity (`runtime` itself
      // is stable per `resolved`, so `bind` produces a function we can
      // safely include in the memoized value without thrashing
      // consumers that put these in dependency arrays).
      setTheme: runtime.setTheme.bind(runtime),
      onThemeChanged: runtime.onThemeChanged.bind(runtime),
      onWindowShown: runtime.onWindowShown.bind(runtime),
      onWindowClosing: runtime.onWindowClosing.bind(runtime),
      onWorkspaceSave: runtime.onWorkspaceSave.bind(runtime),
      onCustomDataChanged: runtime.onCustomDataChanged.bind(runtime),
    };
  }, [resolved, identity, theme, configUrl]);

  if (!value) return loading;

  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}
