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
import { useEffect, useMemo, useRef } from 'react';
import {
  usePlatformIdentityOrNull,
  type StaruiIdentity,
} from '@wellsfargo-starui/react/data/runtime';
import { useHostedIdentity } from './useHostedIdentity.js';
import type { ConfigManager } from './types.js';

/** One-shot `marketsgrid-view-state::*` cleanup marker (pre-profile rows). */
const LEGACY_CLEANUP_SENTINEL = 'hosted-mg.legacy-cleanup';

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
  /**
   * Allow the shared dev constants (`'TestApp'` / `'dev1'`) to stand in
   * when neither the platform bootstrap context nor the ConfigManager
   * yields a real appId / userId. Default **false**: without a real
   * source the hook stays not-ready and logs one error, so dev identity
   * can never silently key production config rows.
   */
  devDefaults?: boolean;
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
  const { defaultGridId, configManager, componentName = 'StarGrid', devDefaults = false } = args;

  const { identity: hosted, ready: identityReady } = useHostedIdentity({
    defaultInstanceId: defaultGridId,
    withStorage: true,
    configManager,
    componentName,
  });

  // Dev-default gate. `useHostedIdentity` falls back to the shared dev
  // constants as its terminal resolution step; this bridge only accepts
  // an appId / userId that came from a REAL source — the platform
  // bootstrap context or the ConfigManager — unless `devDefaults: true`.
  const platformIdentity = usePlatformIdentityOrNull();
  const cm = hosted.configManager as
    | (ConfigManager & { getIdentity?: () => { userId?: string } })
    | null;
  const appIdReal =
    Boolean(platformIdentity?.appId)
    || Boolean(typeof cm?.getAppId === 'function' && cm.getAppId());
  const userIdReal =
    Boolean(platformIdentity?.userId)
    || Boolean(typeof cm?.getIdentity === 'function' && cm.getIdentity()?.userId);
  const identityAllowed = devDefaults || (appIdReal && userIdReal);

  const warnedRef = useRef(false);
  useEffect(() => {
    if (identityAllowed || !identityReady || warnedRef.current) return;
    warnedRef.current = true;
    console.error(
      `[useHostedStarui:${componentName}] no real appId/userId source resolved ` +
      '(platform bootstrap context or ConfigManager). Refusing the dev-default ' +
      "identity — pass { devDefaults: true } to opt in for local development.",
    );
  }, [identityAllowed, identityReady, componentName]);

  const identity = useMemo<StaruiIdentity | null>(() => {
    if (!hosted.storage || !identityAllowed) return null;
    return {
      appId: hosted.appId,
      userId: hosted.userId,
      storage: hosted.storage,
    };
  }, [hosted.appId, hosted.userId, hosted.storage, identityAllowed]);

  // One-shot legacy `marketsgrid-view-state::*` cleanup (carried over from
  // HostedMarketsGrid). Sentinel-gated so it runs once per browser no
  // matter how many hosted grids mount.
  useEffect(() => {
    if (!hosted.configManager || !hosted.instanceId) return;
    try {
      if (window.localStorage.getItem(LEGACY_CLEANUP_SENTINEL) === '1') return;
    } catch {
      // localStorage unavailable (private mode, SSR) — best-effort skip.
      return;
    }
    const cm = hosted.configManager as ConfigManager & {
      deleteConfig?: (id: string) => Promise<void>;
    };
    if (typeof cm.deleteConfig !== 'function') return;
    void cm
      .deleteConfig(`marketsgrid-view-state::${hosted.instanceId}`)
      .catch(() => {
        /* no row to clean — fine */
      })
      .finally(() => {
        try {
          window.localStorage.setItem(LEGACY_CLEANUP_SENTINEL, '1');
        } catch {
          /* ignore */
        }
      });
  }, [hosted.configManager, hosted.instanceId]);

  return {
    gridId: hosted.instanceId,
    identity,
    ready: identityReady && identity !== null && hosted.configManager !== null,
  };
}
