import { useEffect, useState } from 'react';
import { HostedMarketsGrid } from '@wellsfargo-starui/grid/widgets/hosted';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/react/data/runtime';
import { getPlatform } from './bootstrap.js';
import { gridEventHandlers } from './platform/gridEventHandlers.js';
import { gridHandlerMeta } from './platform/hooksMeta.js';
import {
  stompHistoricalProviderDraft,
  stompProviderDraft,
  STOMP_PROVIDER_CFG_VERSION,
  STOMP_LIVE_PROVIDER_ID,
  STOMP_HISTORICAL_PROVIDER_ID,
} from './stompProvider.js';

/**
 * Phase 3 — seed catalog row (programmatic, no provider editor UI).
 * Phase 4 — cfg-free grid attach via defaultLiveProviderId.
 *
 * Requires DataHubProvider ancestor (main.tsx) so useDataServices resolves.
 */
export function App() {
  // useDataServices — React context from DataHubProvider → DataServicesProvider.
  // configStore wraps main-thread ConfigManager (IndexedDB writes for provider rows).
  const { configStore } = useDataServices();

  // useUserIdFromContext — session user from DataHubProvider (matches app-config.json).
  const userId = useUserIdFromContext();

  const [providerId, setProviderId] = useState<string | null>(null);
  const [historicalProviderId, setHistoricalProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // We seed TWO catalog rows: the live provider and a separate
      // historical provider (date-templated destinations — see
      // stompProvider.ts). Both are needed so the grid can switch
      // between them when the toolbar date picker changes.
      //
      // Both drafts carry DETERMINISTIC providerIds (STOMP_*_PROVIDER_ID),
      // so configStore.save() upserts a fixed row rather than minting a
      // random id. That makes this effect idempotent under React
      // StrictMode's double-invoke: two concurrent runs that both observe
      // an empty catalog now write the SAME two rows instead of four.
      const rows = await configStore.list(userId, { subtype: 'stomp' });
      const liveExists = rows.some((p) => p.providerId === STOMP_LIVE_PROVIDER_ID);
      const histExists = rows.some((p) => p.providerId === STOMP_HISTORICAL_PROVIDER_ID);

      const storedVersion = localStorage.getItem('stomp-marketsgrid-minimal.stomp-cfg-version');
      const shouldRefresh = storedVersion !== String(STOMP_PROVIDER_CFG_VERSION);

      if (shouldRefresh || !liveExists) await configStore.save(stompProviderDraft, userId);
      if (shouldRefresh || !histExists) await configStore.save(stompHistoricalProviderDraft, userId);

      // Self-heal: remove any same-name rows left by the old random-id
      // seeding (the duplicate "STOMP Positions" / "(Historical)" rows that
      // accumulated before deterministic ids). Anything sharing a draft name
      // but not the canonical id is a stale duplicate. Idempotent and
      // race-safe — a concurrent run deleting the same id is a no-op.
      const stale = rows.filter(
        (p) =>
          (p.name === stompProviderDraft.name && p.providerId !== STOMP_LIVE_PROVIDER_ID) ||
          (p.name === stompHistoricalProviderDraft.name &&
            p.providerId !== STOMP_HISTORICAL_PROVIDER_ID),
      );
      for (const dup of stale) {
        if (dup.providerId) await configStore.remove(dup.providerId);
      }

      if (shouldRefresh) {
        localStorage.setItem(
          'stomp-marketsgrid-minimal.stomp-cfg-version',
          String(STOMP_PROVIDER_CFG_VERSION),
        );
      }

      if (!cancelled) {
        setProviderId(STOMP_LIVE_PROVIDER_ID);
        setHistoricalProviderId(STOMP_HISTORICAL_PROVIDER_ID);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  // Wait until catalog rows exist and worker cache has been invalidated.
  if (!providerId || !historicalProviderId) return null;

  // HostedMarketsGrid: cfg-free attach via defaultLiveProviderId; hub lazy-starts STOMP.
  // withStorage + configManager: grid layout via main-thread ConfigManager from getPlatform().
  //
  // ─── Historical data: how the date picker drives the fetch ──────────
  // The app only declares THREE props below; the grid library does the
  // work (MarketsGridContainer + the worker-side STOMP provider).
  //
  //   • defaultLiveProviderId        — provider used by default (live tail).
  //   • defaultHistoricalProviderId  — provider the grid switches to when a
  //     PAST date is picked. Its config has `{{positions.asOfDate}}`
  //     tokens in the broker destinations (see stompProvider.ts).
  //   • historicalDateAppDataRef     — "name.key" path the picked date is
  //     written to in AppData. Must match the token used in the
  //     historical destinations ("positions.asOfDate").
  //
  // Runtime sequence when the user picks a past date in the toolbar:
  //   1. ToolbarDatePicker → MarketsGrid.onToolbarDateChange → the
  //      container's handleToolbarDateChange.
  //   2. Container detects a past date → enters historical mode, writes
  //      the date to AppData at `historicalDateAppDataRef`, and switches
  //      the active provider id to `defaultHistoricalProviderId`.
  //   3. Container restarts that provider with overlay `{ asOfDate }`.
  //   4. Worker STOMP provider substitutes `{{positions.asOfDate}}` in
  //      its listener/trigger with the date and re-subscribes; the broker
  //      returns that day's snapshot (no live tail). Picking "today"
  //      switches back to the live provider.
  // (Library refs: MarketsGridContainer.tsx handleToolbarDateChange /
  //  reloadFromSource; host-data stomp.ts resolveStompDestinations.)
  return (
    <HostedMarketsGrid
      gridId="stomp-blotter"
      componentName="STOMP Positions"
      defaultInstanceId="stomp-blotter"
      defaultLiveProviderId={providerId}
      defaultHistoricalProviderId={historicalProviderId}
      historicalDateAppDataRef="positions.asOfDate"
      withStorage
      configManager={getPlatform().configManager}
      gridEventHandlers={gridEventHandlers}
      handlerMeta={gridHandlerMeta}
      showFiltersToolbar
      showFormattingToolbar
      showEditingToolbar
    />
  );
}
