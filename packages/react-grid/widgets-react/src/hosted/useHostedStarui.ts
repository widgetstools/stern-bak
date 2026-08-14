/**
 * useHostedStarui — the workspace-host bridge to the StarGrid front door.
 *
 * A hosted view (OpenFin workspace, multi-view browser layouts) resolves
 * its identity from the environment: per-view grid id from OpenFin
 * `customData` / the URL `?instanceId=` param, appId / userId from the
 * platform bootstrap, and ConfigService-backed storage carrying the
 * registered-component metadata. This hook runs exactly that resolution
 * (via {@link useHostedIdentity}) and shapes the result for
 * `<StaruiIdentityProvider>` + `<StarGrid>`:
 *
 * ```tsx
 * const { gridId, identity, ready } = useHostedStarui({
 *   defaultGridId: 'my-blotter',
 *   configManager,
 * });
 * if (!ready || !identity || !gridId) return <Connecting />;
 * return (
 *   <StaruiIdentityProvider identity={identity}>
 *     <StarGrid gridId="my-blotter" providerId="dp-1"
 *       advanced={{ instanceId: gridId }} />
 *   </StaruiIdentityProvider>
 * );
 * ```
 *
 * `gridId` is the RESOLVED per-view id (a restored workspace view keeps
 * its own saved profiles); pass it as `advanced.instanceId` when the
 * grid-level row should stay keyed by the logical grid name, or as
 * `gridId` when one view = one grid.
 */
import { useMemo } from 'react';
import type { StaruiIdentity } from '@wellsfargo-starui/react/data/runtime';
import { useHostedIdentity } from './useHostedIdentity.js';
import type { ConfigManager } from './types.js';

export interface UseHostedStaruiArgs {
  /** Grid id used when neither OpenFin customData nor the URL resolves one. */
  defaultGridId: string;
  /**
   * ConfigManager for the ConfigService storage factory. Omit under an
   * OpenFin host to resolve the host singleton lazily.
   */
  configManager?: ConfigManager;
  /** Logical component name for storage diagnostics. Default `'StarGrid'`. */
  componentName?: string;
}

export interface UseHostedStaruiResult {
  /** Resolved per-view grid id; `null` while OpenFin customData is in flight. */
  gridId: string | null;
  /** StarGrid identity (appId / userId / storage); `null` until storage resolves. */
  identity: StaruiIdentity | null;
  /** True once both the grid id and the storage factory have resolved. */
  ready: boolean;
}

export function useHostedStarui(args: UseHostedStaruiArgs): UseHostedStaruiResult {
  const { defaultGridId, configManager, componentName = 'StarGrid' } = args;

  const { identity: hosted, ready: identityReady } = useHostedIdentity({
    defaultInstanceId: defaultGridId,
    withStorage: true,
    configManager,
    componentName,
  });

  const identity = useMemo<StaruiIdentity | null>(() => {
    if (!hosted.storage) return null;
    return {
      appId: hosted.appId,
      userId: hosted.userId,
      storage: hosted.storage,
    };
  }, [hosted.appId, hosted.userId, hosted.storage]);

  return {
    gridId: hosted.instanceId,
    identity,
    ready: identityReady && identity !== null && hosted.configManager !== null,
  };
}
