/**
 * The one mock-ssrm provider every tab shares.
 *
 * The CSRM lab runs one mock provider per tab; here one engine cache serves
 * all tabs (they mount one grid at a time), so tab switches are warm-cache
 * attaches instead of re-seeds. Per-tab stream options (`LabFeatureConfig.
 * stream`) and the demo rail both apply through `restart(extra)` — the mock
 * transport soft-restarts for interval/pause changes and re-seeds only when
 * the row count actually moves.
 */
import { useEffect, useState } from 'react';
import type { DataProviderConfig, MockSsrmProviderConfig } from '@wellsfargo-starui/types';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/react/data/runtime';
import type { LabStreamOptions } from '../../../markets-grid-lab/src/demo/types';
import { labSsrmColumnDefinitions } from './columnTypes';

export const LAB_SSRM_PROVIDER_ID = 'markets-grid-lab-ssrm:positions';

/** Matches the CSRM lab's per-tab default (`LabFeatureTab`). */
export const DEFAULT_STREAM: Required<Pick<LabStreamOptions, 'rowCount' | 'updateIntervalMs'>> & {
  enableUpdates: boolean;
} = { rowCount: 500, updateIntervalMs: 500, enableUpdates: true };

export function buildLabSsrmConfig(): MockSsrmProviderConfig {
  return {
    providerType: 'mock-ssrm',
    dataType: 'positions',
    rowCount: DEFAULT_STREAM.rowCount,
    updateIntervalMs: DEFAULT_STREAM.updateIntervalMs,
    enableUpdates: DEFAULT_STREAM.enableUpdates,
    keyColumn: 'id',
    blockSize: 200,
    publishWindowMs: 100,
    // No searchColumns: the quick search covers every text column, the way
    // AG Grid's own quick filter does under CSRM.
    columnDefinitions: labSsrmColumnDefinitions(),
  };
}

export const labSsrmProviderDraft: DataProviderConfig = {
  providerId: LAB_SSRM_PROVIDER_ID,
  name: 'Lab SSRM Positions (mock)',
  providerType: 'mock-ssrm',
  userId: 'dev1',
  public: false,
  config: buildLabSsrmConfig(),
};

/**
 * Seed the catalog row once, re-saving ONLY on a real config difference —
 * a byte-equal re-save restarts the provider and re-streams the snapshot
 * (the cold-start lesson from stomp-ssrm-minimal). Returns the providerId
 * once the row is in place, null while seeding.
 */
export function useSeedLabSsrmProvider(): string | null {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [providerId, setProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'mock-ssrm' });
      const existing = rows.find((p) => p.providerId === LAB_SSRM_PROVIDER_ID);
      const differs = !existing
        || JSON.stringify(existing.config ?? null) !== JSON.stringify(labSsrmProviderDraft.config);
      if (differs) await configStore.save(labSsrmProviderDraft, userId);
      if (!cancelled) setProviderId(LAB_SSRM_PROVIDER_ID);
    })();
    return () => { cancelled = true; };
  }, [configStore, userId]);

  return providerId;
}

/**
 * The `restart(extra)` overlay for a tab's stream options (or a rail
 * change). Returns null when the options already match the defaults — the
 * hub skips restarts whose extra equals the active one, so returning null
 * for defaults keeps the first tab mount from restarting a fresh provider.
 */
export function streamRestartExtra(opts: LabStreamOptions | undefined): Record<string, unknown> | null {
  const rowCount = opts?.rowCount ?? DEFAULT_STREAM.rowCount;
  const updateIntervalMs = opts?.updateIntervalMs ?? DEFAULT_STREAM.updateIntervalMs;
  const enableUpdates = opts?.enableUpdates ?? DEFAULT_STREAM.enableUpdates;
  if (
    rowCount === DEFAULT_STREAM.rowCount
    && updateIntervalMs === DEFAULT_STREAM.updateIntervalMs
    && enableUpdates === DEFAULT_STREAM.enableUpdates
  ) {
    return null;
  }
  return { rowCount, updateIntervalMs, enableUpdates };
}
