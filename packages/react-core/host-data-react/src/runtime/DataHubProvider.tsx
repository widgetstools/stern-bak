/**
 * Hub-first React provider — wraps `ensurePlatformReady` / hub bundle output.
 *
 * Prefer over legacy {@link DataServicesProvider} for new apps:
 *   - `platform` from `ensurePlatformReady()` (markets-grid-lab pattern)
 *   - OR `bootstrapConfig` + `workerScriptUrl` (self-bootstrapping tree)
 *
 * Existing hooks (`useDataServices`, `useProviderStream`, …) work unchanged.
 */

import {
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ensurePlatformReady,
  type PlatformBootstrapConfig,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/data';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import { DataServicesProvider } from './DataServicesProvider.js';
import { HubInspectorHost } from './HubInspectorHost.js';

function defaultHubInspectorEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

function hubToDataServices(platform: ResolvedDataServicesHubBundle): DataServices {
  return {
    client: platform.client,
    appData: platform.appData,
    configManager: platform.configManager,
    // `DataServices.ready` is the AppData-mirror snapshot signal (templates).
    // Phase 2: map it to `appDataReady` (not the combined `ready`) so eager
    // mode suspends only on AppData hydration, never the catalog preload.
    ready: platform.appDataReady,
    dispose: () => platform.dispose(),
  };
}

interface DataHubProviderCommonProps {
  mode?: 'eager' | 'lazy';
  /** Override session user id; defaults to bootstrap config or legacy pin. */
  userId?: string;
  /**
   * Mount the Alt+Shift+S hub inspector drawer. Defaults to on when
   * `NODE_ENV === 'development'`; pass `true` to force-enable in production builds.
   */
  hubInspector?: boolean;
  children?: ReactNode;
}

export interface DataHubProviderWithPlatformProps extends DataHubProviderCommonProps {
  /** Result of `ensurePlatformReady()` / `ensureDataServicesHub()`. */
  platform: ResolvedDataServicesHubBundle;
  bootstrapConfig?: never;
  workerScriptUrl?: never;
}

export interface DataHubProviderWithBootstrapProps extends DataHubProviderCommonProps {
  platform?: never;
  bootstrapConfig: PlatformBootstrapConfig;
  /** Optional — omit to use the library's own bundled worker entry. */
  workerScriptUrl?: string;
}

export type DataHubProviderProps =
  | DataHubProviderWithPlatformProps
  | DataHubProviderWithBootstrapProps;

function DataHubProviderInner({
  platform,
  mode = 'lazy',
  userId,
  hubInspector,
  children,
}: DataHubProviderWithPlatformProps): ReactNode {
  const services = useMemo(() => hubToDataServices(platform), [platform]);
  const effectiveUserId = userId ?? LOGGED_IN_USER_ID;
  const showInspector = hubInspector ?? defaultHubInspectorEnabled();

  return (
    <DataServicesProvider services={services} mode={mode} userId={effectiveUserId}>
      {showInspector ? <HubInspectorHost /> : null}
      {children}
    </DataServicesProvider>
  );
}

function DataHubProviderBootstrap({
  bootstrapConfig,
  workerScriptUrl,
  mode = 'lazy',
  userId,
  children,
}: DataHubProviderWithBootstrapProps): ReactNode {
  const bootstrapPromise = useMemo(
    () => ensurePlatformReady(bootstrapConfig, { workerScriptUrl }),
    [
      bootstrapConfig.appId,
      bootstrapConfig.userId,
      bootstrapConfig.useRest,
      bootstrapConfig.configServiceRestUrl,
      bootstrapConfig.seedConfigUrl,
      workerScriptUrl,
    ],
  );

  const sessionUserId = userId ?? bootstrapConfig.userId;

  if (mode === 'eager') {
    return (
      <DataHubProviderEagerBootstrap
        bootstrapPromise={bootstrapPromise}
        userId={sessionUserId}
        mode={mode}
      >
        {children}
      </DataHubProviderEagerBootstrap>
    );
  }

  return (
    <DataHubProviderLazyBootstrap
      bootstrapPromise={bootstrapPromise}
      userId={sessionUserId}
      mode={mode}
    >
      {children}
    </DataHubProviderLazyBootstrap>
  );
}

function DataHubProviderEagerBootstrap({
  bootstrapPromise,
  userId,
  mode,
  children,
}: {
  bootstrapPromise: Promise<ResolvedDataServicesHubBundle>;
  userId: string;
  mode: 'eager' | 'lazy';
  children?: ReactNode;
}): ReactNode {
  const platform = use(bootstrapPromise);
  return (
    <DataHubProviderInner platform={platform} mode={mode} userId={userId}>
      {children}
    </DataHubProviderInner>
  );
}

function DataHubProviderLazyBootstrap({
  bootstrapPromise,
  userId,
  mode,
  children,
}: {
  bootstrapPromise: Promise<ResolvedDataServicesHubBundle>;
  userId: string;
  mode: 'eager' | 'lazy';
  children?: ReactNode;
}): ReactNode {
  const [platform, setPlatform] = useState<ResolvedDataServicesHubBundle | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrapPromise
      .then((resolved) => { if (!cancelled) setPlatform(resolved); })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => { cancelled = true; };
  }, [bootstrapPromise]);

  if (error) throw error;
  if (!platform) return null;

  return (
    <DataHubProviderInner platform={platform} mode={mode} userId={userId}>
      {children}
    </DataHubProviderInner>
  );
}

/** Hub-first provider; {@link PlatformProvider} is an alias during migration. */
export function DataHubProvider(props: DataHubProviderProps): ReactNode {
  if ('platform' in props && props.platform) {
    return <DataHubProviderInner {...props} />;
  }
  return <DataHubProviderBootstrap {...props} />;
}

/** @deprecated Alias for {@link DataHubProvider} — prefer `DataHubProvider` in new code. */
export const PlatformProvider = DataHubProvider;
