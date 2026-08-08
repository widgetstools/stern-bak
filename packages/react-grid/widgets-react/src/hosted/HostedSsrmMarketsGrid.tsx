/**
 * HostedSsrmMarketsGrid — smoke / hosted entry for SSRM MarketsGrid.
 * Mirrors HostedMarketsGrid identity/storage/theme bootstrap with the SSRM container.
 */
import { useMemo, type ReactNode } from 'react';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import type { ResolvedDataServicesHubBundle } from '@wellsfargo-starui/data';
import {
  DataServicesProvider,
  DataHubProvider,
} from '@wellsfargo-starui/react/data/runtime';
import {
  SsrmMarketsGridContainer,
  type SsrmMarketsGridContainerProps,
} from '../container/ssrm-markets-grid-container/index.js';
import { useHostedView } from './useHostedView.js';
import type { AgGridThemeMode } from './useAgGridTheme.js';
import type { ConfigManager } from './types.js';

type ContainerOwnedKeys =
  | 'instanceId'
  | 'appId'
  | 'userId'
  | 'storage'
  | 'theme';

const LOADING_STYLE = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  height: '100%',
  fontSize: 12,
  color: 'var(--ds-text-muted)',
};

export interface HostedSsrmMarketsGridProps
  extends Omit<SsrmMarketsGridContainerProps, ContainerOwnedKeys | 'providerId'> {
  /** Required `stomp-ssrm` catalog provider id. */
  providerId: string;
  /** Logical component name — used for hosted identity / storage diagnostics. */
  componentName: string;
  /** Default `instanceId` when neither OpenFin customData nor URL param resolves one. */
  defaultInstanceId: string;
  /** Default `appId` when OpenFin customData doesn't supply one. */
  defaultAppId?: string;
  /** Default `userId` when OpenFin customData doesn't supply one. */
  defaultUserId?: string;
  /** When true, resolve ConfigService-backed storage from the host ConfigManager. */
  withStorage?: boolean;
  /** Optional ConfigManager override (tests / non-OpenFin runtimes). */
  configManager?: ConfigManager;
  /** AG-Grid theme mode. Defaults to `'auto'`. */
  theme?: AgGridThemeMode;
  /** Optional pre-bootstrapped data services (tests / host shells). */
  dataServices?: DataServices;
  /** Optional hub bundle when using DataHubProvider path. */
  platform?: ResolvedDataServicesHubBundle;
  /** Hydration mode for the AppData mirror when mounting a data-services provider. */
  dataServicesMode?: 'eager' | 'lazy';
  children?: ReactNode;
}

/**
 * Drop-in hosted shell for SSRM MarketsGrid + SharedWorker data hub.
 */
export function HostedSsrmMarketsGrid(props: HostedSsrmMarketsGridProps) {
  const {
    componentName,
    defaultInstanceId,
    defaultAppId,
    defaultUserId,
    withStorage = false,
    configManager,
    theme = 'auto',
    dataServices,
    platform,
    dataServicesMode = 'lazy',
    children,
    ...containerProps
  } = props;

  const { identity, ready, agTheme } = useHostedView({
    defaultInstanceId,
    defaultAppId,
    defaultUserId,
    withStorage,
    configManager,
    componentName,
    theme,
  });

  const containerNode = useMemo(() => {
    if (!ready || !identity.configManager || !identity.instanceId) {
      return <div style={LOADING_STYLE}>Connecting to ConfigService…</div>;
    }
    if (withStorage && !identity.storage) {
      return <div style={LOADING_STYLE}>Connecting to ConfigService…</div>;
    }
    return (
      <SsrmMarketsGridContainer
        {...containerProps}
        instanceId={identity.instanceId}
        appId={identity.appId}
        userId={identity.userId}
        storage={identity.storage ?? undefined}
        theme={agTheme}
      />
    );
    // containerProps changes per render; spread is shallow so we depend
    // on the underlying primitives indirectly via React's normal flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    identity.configManager,
    identity.instanceId,
    identity.appId,
    identity.userId,
    identity.storage,
    withStorage,
    agTheme,
    containerProps,
  ]);

  const grid = (
    <div style={{ height: '100%', width: '100%', minHeight: 0 }}>
      {containerNode}
      {children}
    </div>
  );

  const dataServicesWrapped = identity.configManager
    ? platform
      ? (
        <DataHubProvider platform={platform} mode={dataServicesMode} userId={identity.userId}>
          {grid}
        </DataHubProvider>
      )
      : dataServices
        ? (
          <DataServicesProvider
            services={dataServices}
            mode={dataServicesMode}
            userId={identity.userId}
          >
            {grid}
          </DataServicesProvider>
        )
        : grid
    : grid;

  return dataServicesWrapped;
}
