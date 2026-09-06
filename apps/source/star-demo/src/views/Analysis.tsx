/**
 * Analysis — the standalone window with room to actually draw.
 *
 * The popout target for `openAnalysisPopout()`, mirroring how
 * `AiAssistant.tsx` is the target for `openAssistantPopout()`. It mounts no
 * MarketsGrid, so none of the blotter's visibility-guard render hazards apply
 * here, and it lives outside the chat transcript, so nothing here redraws
 * while the model streams tokens.
 *
 * A single render path: a plain query handoff is turned into a one-block
 * report, so `ReportCanvas` draws everything and there is no second layout to
 * keep in step with the first.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from '@wellsfargo-starui/react';
import type { DataQuery, ReportSpec } from '@wellsfargo-starui/data';
import { validateReportSpec } from '@wellsfargo-starui/data';
import { useDataServices, useDataProvider } from '@wellsfargo-starui/react/data/runtime';
import { usePlatformBootstrap } from '../platformBootstrap';
import { useOpenFinThemeSync } from '../useOpenFinThemeSync';
import { readHandoff, type AnalysisHandoff, listAnalysisWindows, reopenAnalysisWindow } from '../analysisPopout';
import { readDashboardSpec, saveDashboardLayout } from '../aiAssistant/dashboardTools';
import { resolveGridEntry, resolveGridForInstance } from '../aiAssistant/gridProfiles';
import { fetchGridRows, type DataHubClient, type RowSet } from '../aiAssistant/dataAccess';
import { createLiveRowSource, type LiveRowSource } from '@wellsfargo-starui/grid';
import { composeRowId, normalizeKeyColumns } from '@wellsfargo-starui/types';
import { gridScopeId } from '../aiAssistant/gridProfiles';
import { ReportCanvas } from '../analysis/ReportCanvas';

/**
 * A bare query becomes a two-block report — the chart above the table, which
 * is the shape the chat's own result cell uses and the one people already
 * read. `chart` degrades to "nothing chartable" on its own when a result has
 * no chartable shape, so a wide pivot simply shows as the table it is.
 */
function reportForQuery(query: DataQuery, chart: string | undefined, title: string | undefined): ReportSpec {
  return {
    title: title ?? 'Analysis',
    blocks: [
      { kind: 'chart', region: 'main', query, chart: chart as never },
      { kind: 'table', region: 'main', query },
    ],
  };
}

function specFrom(payload: AnalysisHandoff): { spec: ReportSpec | null; error?: string } {
  if (payload.kind === 'query') {
    return { spec: reportForQuery(payload.query, payload.chart, payload.title) };
  }
  // A spec that arrived through storage is revalidated rather than trusted:
  // it was written by another window and may be from an older build.
  const outcome = validateReportSpec(payload.spec);
  return outcome.ok ? { spec: outcome.value } : { spec: null, error: outcome.error };
}

function Analysis() {
  const [params] = useSearchParams();
  const handoffId = params.get('handoff') ?? undefined;
  // A SAVED dashboard, opened from its dock button. Unlike a handoff — which
  // lives in localStorage for ten minutes — this is a config row, so the
  // window can be closed and reopened days later.
  const dashboardId = params.get('dashboard') ?? undefined;
  const gridParam = params.get('grid') ?? undefined;
  const instanceParam = params.get('instance') ?? undefined;
  const nameParam = params.get('name') ?? undefined;
  // Set only for an ADDITIONAL window; the main one carries no `w`.
  const windowId = params.get('w') ?? undefined;

  useOpenFinThemeSync();

  const { platform } = usePlatformBootstrap();
  const { configStore, client } = useDataServices();
  const configManager = platform?.configManager;

  const handoff = useMemo(() => (handoffId ? readHandoff(handoffId) : null), [handoffId]);
  const [savedSpec, setSavedSpec] = useState<ReportSpec | null>(null);
  const [savedError, setSavedError] = useState<string | undefined>();
  useEffect(() => {
    if (!dashboardId || !configManager) return;
    let cancelled = false;
    void readDashboardSpec(configManager, dashboardId).then((found) => {
      if (cancelled) return;
      if (found) setSavedSpec(found);
      else setSavedError(`No saved dashboard "${dashboardId}" — it may have been deleted.`);
    });
    return () => {
      cancelled = true;
    };
  }, [dashboardId, configManager]);

  const { spec, error: specError } = useMemo(() => {
    if (dashboardId) return { spec: savedSpec, error: savedError };
    return handoff ? specFrom(handoff.payload) : { spec: null, error: undefined };
  }, [dashboardId, savedSpec, savedError, handoff]);

  const [rowSet, setRowSet] = useState<RowSet | null>(null);
  const [error, setError] = useState<string | undefined>(specError);
  const [ranAt, setRanAt] = useState<Date | undefined>();
  const [busy, setBusy] = useState(false);
  // Guards against a slow fetch landing after a newer one — the refresh
  // cadence makes overlapping runs a real possibility, not a theoretical one.
  const runId = useRef(0);

  // Extract asOf from the handoff if provided (model-supplied time, not browser time)
  const modelSuppliedAsOf = useMemo(() => {
    if (!handoff?.payload) return undefined;
    const payload = handoff.payload;
    if (payload.kind === 'query' && payload.asOf) {
      return new Date(payload.asOf);
    }
    if (payload.kind === 'report' && payload.spec.asOf) {
      return new Date(payload.spec.asOf);
    }
    return undefined;
  }, [handoff?.payload]);

  const gridId = handoff?.gridId ?? gridParam;
  const instanceId = handoff?.instanceId ?? instanceParam;
  const displayName = handoff?.displayName ?? nameParam;

  const load = useCallback(async () => {
    if (!configManager || !configStore) return;
    const mine = ++runId.current;
    setBusy(true);
    try {
      const entry = gridId
        ? await resolveGridEntry(gridId)
        : instanceId
          ? await resolveGridForInstance(configManager, instanceId)
          : undefined;
      if (!entry) {
        if (mine === runId.current) setError('No blotter to analyse — this window was opened without one.');
        return;
      }
      const fetched = await fetchGridRows(configManager, configStore, entry, client as DataHubClient | undefined, {
        allowSample: true,
      });
      if (mine !== runId.current) return;
      if (!fetched.ok) {
        setError(fetched.error);
        return;
      }
      setRowSet(fetched.value);
      // Use model-supplied asOf if available; otherwise stamp at load time.
      // Model-supplied is preferred because it's honest (the time the model chose)
      // rather than "whenever the window happened to open". Reloads also preserve
      // the original time — the report stays pegged to that moment.
      setRanAt(modelSuppliedAsOf ?? new Date());
      setError(undefined);
    } catch (err) {
      if (mine === runId.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mine === runId.current) setBusy(false);
    }
  }, [configManager, configStore, client, gridId, instanceId, modelSuppliedAsOf]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Live rows ────────────────────────────────────────────────────────────
  //
  // The report used to be a POLL: `setInterval` → `fetchGridRows`, which
  // subscribes to the provider, awaits a full snapshot and unsubscribes — that
  // whole cycle every `refreshMs`, re-running every block's query over every
  // row. A 16-block report did sixteen full-row queries per tick, and a
  // report with no `refreshMs` never updated at all.
  //
  // Now it subscribes to the provider once and lets it push. Same
  // `LiveRowSource` the summary panel uses: one array, mutated in place,
  // change reported by a version counter. `refreshMs` becomes unnecessary —
  // and is ignored — whenever a live source is available.
  const [binding, setBinding] = useState<{ providerId: string; keyColumn?: string | readonly string[] } | null>(null);

  useEffect(() => {
    if (!configManager || !configStore) return;
    let cancelled = false;
    void (async () => {
      const entry = gridId
        ? await resolveGridEntry(gridId)
        : instanceId
          ? await resolveGridForInstance(configManager, instanceId)
          : undefined;
      if (!entry || cancelled) return;
      const gridLevelData = (await configManager.profiles.loadGridLevelData({
        instanceId: gridScopeId(entry),
      })) as { provider?: { liveProviderId?: string } } | null;
      const providerId = gridLevelData?.provider?.liveProviderId;
      if (cancelled || !providerId) return;
      const cfg = await configStore.get(providerId);
      if (cancelled) return;
      setBinding({
        providerId,
        keyColumn: (cfg?.config as { keyColumn?: string | readonly string[] } | undefined)?.keyColumn,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [configManager, configStore, gridId, instanceId]);

  // `trackStatus: false` — this window renders rows, not connection state, and
  // status churn would re-render the whole canvas for nothing.
  const { provider } = useDataProvider(binding?.providerId ?? null, { trackStatus: false });

  // In an EFFECT, never in render: `createLiveRowSource` ATTACHES to the
  // provider as it is constructed, and a provider that throws while connecting
  // would then throw during render and take the whole window down. A failure
  // degrades to the one-shot fetch below rather than to a blank report.
  const [liveSource, setLiveSource] = useState<LiveRowSource | null>(null);
  useEffect(() => {
    if (!provider) {
      setLiveSource(null);
      return;
    }
    const keyCols = normalizeKeyColumns(binding?.keyColumn);
    let source: ReturnType<typeof createLiveRowSource>;
    try {
      source = createLiveRowSource({
        onSnapshot: (handler) =>
          provider.onSnapshotData((rows) => handler(rows as readonly Record<string, unknown>[])),
        onTick: (handler) => provider.onTick((rows) => handler(rows as readonly Record<string, unknown>[])),
        keyOf: keyCols ? (row) => composeRowId(row, keyCols) : undefined,
        initial:
          typeof provider.getData === 'function'
            ? (provider.getData() as readonly Record<string, unknown>[])
            : undefined,
      });
    } catch (err) {
      console.warn('[Analysis] live rows unavailable; falling back to a one-shot fetch:', err);
      setLiveSource(null);
      return;
    }
    setLiveSource(source);
    return () => source.dispose();
  }, [provider, binding?.keyColumn]);

  const [liveVersion, setLiveVersion] = useState(0);
  useEffect(() => {
    if (!liveSource) return;
    // A backgrounded report window does no work at all. This is its own
    // OpenFin window, so `document.visibilityState` is the whole story —
    // minimised or behind another window means nobody is reading it, and the
    // moment it comes back it syncs to the current version.
    const sync = () => {
      setLiveVersion(liveSource.getVersion());
      // The "ran at" stamp has to move with the data. Left at the value
      // `load()` set on mount, a pushed dashboard showed the time the WINDOW
      // opened next to numbers from an hour later — a stale timestamp beside
      // live figures is worse than no timestamp. A model-supplied `asOf` is
      // deliberately pegged to a moment, so it is never overwritten.
      if (!modelSuppliedAsOf) setRanAt(new Date());
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    sync();
    const unsubscribe = liveSource.subscribe(() => {
      if (document.visibilityState === 'visible') sync();
    });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [liveSource, modelSuppliedAsOf]);

  // The polling fallback, for a blotter with no bound live provider — which
  // still renders (fetchGridRows allows sample rows). Disabled entirely once a
  // live source exists, so the two never both drive the canvas.
  useEffect(() => {
    if (liveSource || !spec?.refreshMs) return;
    const timer = window.setInterval(() => void load(), spec.refreshMs);
    return () => window.clearInterval(timer);
  }, [liveSource, spec?.refreshMs, load]);

  // Live source wins; the one-shot fetch is the fallback for a blotter with no
  // bound live provider (which still renders — `fetchGridRows` allows sample
  // rows). `rowsVersion` is what every block's query memoises on, because a
  // live array is stable by reference and its identity never changes.
  const effectiveRows = liveSource ? liveSource.getRows() : (rowSet?.rows ?? null);
  const effectiveVersion = liveSource ? liveVersion : (rowSet ? 1 : 0);
  const effectiveProvenance = liveSource
    ? `live from the blotter's data provider — pushed, not polled`
    : (rowSet?.provenance ?? '');

  useEffect(() => {
    const prev = document.title;
    const suffix = windowId ? ` (${windowId})` : '';
    document.title = spec?.title ? `${spec.title}${suffix} · Markets UI` : `Analysis${suffix} · Markets UI`;
    return () => {
      document.title = prev;
    };
  }, [spec?.title, windowId]);

  // Same flush-viewport treatment as the other popout routes — the shell's
  // `body { padding: 10px }` leaks into popouts otherwise. `overflow` is left
  // alone here: unlike the chat window, this one is meant to scroll.
  useEffect(() => {
    const bodyStyle = document.body.style;
    const prevPadding = bodyStyle.padding;
    const prevMargin = bodyStyle.margin;
    bodyStyle.padding = '0';
    bodyStyle.margin = '0';
    return () => {
      bodyStyle.padding = prevPadding;
      bodyStyle.margin = prevMargin;
    };
  }, []);

  // List other windows for this grid that the user can reopen
  const otherWindows = useMemo(() => {
    if (!gridId) return [];
    const all = listAnalysisWindows(gridId);
    return all.filter((w) => w.id !== (windowId || 'main'));
  }, [gridId, windowId]);

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border/60 flex-shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
        <span className="flex items-baseline gap-3 text-[11px] tracking-wide text-muted-foreground">
          {displayName && <span className="font-mono text-[10px] text-foreground/70">{displayName}</span>}
          <span className="font-medium">Analysis</span>
          {windowId && (
            <span
              className="font-mono text-[9px] px-1 py-px rounded border border-border/60 text-muted-foreground"
              title={`This is an additional analysis window. Ask the assistant to update window "${windowId}".`}
            >
              {windowId}
            </span>
          )}
          {otherWindows.length > 0 && (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  title="Other open windows for this grid"
                  aria-label="View other windows"
                >
                  +{otherWindows.length}
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <span className="block px-2 py-1.5 text-[10px] text-muted-foreground font-medium">Other windows</span>
                {otherWindows.map((w) => (
                  <ContextMenuItem
                    key={w.id}
                    onClick={async () => {
                      // Use reopenAnalysisWindow to properly stage the handoff and navigate
                      if (w.payload) {
                        try {
                          const outcome = await reopenAnalysisWindow({
                            gridId,
                            instanceId: instanceParam,
                            displayName,
                            windowId: w.id,
                          });
                          if (outcome.ok) {
                            // In browser context, just focus/navigate; OpenFin handles window switching
                            window.location.href = `${window.location.origin}/#/analysis?handoff=cached&grid=${gridId}&instance=${instanceParam}&name=${displayName}&w=${w.id}`;
                          }
                        } catch (err) {
                          console.error('Failed to reopen window:', err);
                        }
                      }
                    }}
                    className="text-[10px]"
                  >
                    {w.title || w.id}
                  </ContextMenuItem>
                ))}
              </ContextMenuContent>
            </ContextMenu>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => void load()}
            disabled={busy}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
          </Button>
        </span>
      </header>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex-1 min-h-0 overflow-auto">
        {!handoffId || (!spec && !error) ? (
          <p className="p-8 text-sm text-muted-foreground">
            Nothing to show. Open this window from an analysis result or ask the assistant for a report.
          </p>
        ) : error && !effectiveRows ? (
          <p className="p-8 text-sm text-[var(--ds-accent-negative)]">{error}</p>
        ) : spec && effectiveRows ? (
          <ReportCanvas
            spec={spec}
            rows={effectiveRows}
            rowsVersion={effectiveVersion}
            provenance={effectiveProvenance}
            ranAt={ranAt}
            liveness={liveSource ? 'streaming' : spec?.refreshMs ? 'polled' : 'static'}
            // Editing is offered only where the result can be KEPT. An
            // ephemeral analysis window has nowhere to write a layout back to,
            // and handles that save nothing are worse than none.
            onSaveLayout={
              dashboardId && configManager
                ? async (blocks) => {
                    const saved = await saveDashboardLayout(configManager, dashboardId, blocks);
                    if (saved) setSavedSpec((prev) => (prev ? { ...prev, blocks } : prev));
                  }
                : undefined
            }
          />
        ) : (
          <p className="p-8 text-sm text-muted-foreground">Loading…</p>
        )}
          </div>
        </ContextMenuTrigger>
        {/* Right-click anywhere in the report. "Re-run" fetches rows and
            recomputes every block in place; "Reload window" remounts the route,
            which also re-reads the handoff — the way back when a spec has been
            replaced under a window that is already open. */}
        <ContextMenuContent className="w-52">
          <ContextMenuItem onSelect={() => void load()} disabled={busy}>
            Re-run queries
            <ContextMenuShortcut>data</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => window.location.reload()}>
            Reload window
            <ContextMenuShortcut>full</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => window.close()}>Close window</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

export default Analysis;
