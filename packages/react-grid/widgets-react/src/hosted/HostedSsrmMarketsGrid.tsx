/**
 * HostedSsrmMarketsGrid — smoke / hosted entry for SSRM MarketsGrid.
 * Mirrors HostedMarketsGrid bootstrap with the SSRM container.
 */
import type { ReactNode } from 'react';
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

export interface HostedSsrmMarketsGridProps
  extends Omit<SsrmMarketsGridContainerProps, 'providerId'> {
  /** Required `stomp-ssrm` catalog provider id. */
  providerId: string;
  /** Optional pre-bootstrapped data services (tests / host shells). */
  dataServices?: DataServices;
  /** Optional hub bundle when using DataHubProvider path. */
  platform?: ResolvedDataServicesHubBundle;
  children?: ReactNode;
}

/**
 * Drop-in hosted shell for SSRM MarketsGrid + SharedWorker data hub.
 */
export function HostedSsrmMarketsGrid(props: HostedSsrmMarketsGridProps) {
  const { dataServices, platform, children, ...containerProps } = props;

  const grid = (
    <div style={{ height: '100%', width: '100%', minHeight: 0 }}>
      <SsrmMarketsGridContainer {...containerProps} />
      {children}
    </div>
  );

  if (platform) {
    return <DataHubProvider platform={platform}>{grid}</DataHubProvider>;
  }
  if (dataServices) {
    return (
      <DataServicesProvider services={dataServices}>{grid}</DataServicesProvider>
    );
  }
  // Host app must wrap with DataServicesProvider / ensurePlatformReady.
  return grid;
}
