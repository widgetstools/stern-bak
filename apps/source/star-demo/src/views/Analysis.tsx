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
import { useDataServices } from '@wellsfargo-starui/react/data/runtime';
import { usePlatformBootstrap } from '../platformBootstrap';
import { useOpenFinThemeSync } from '../useOpenFinThemeSync';
import { readHandoff, type AnalysisHandoff, listAnalysisWindows, reopenAnalysisWindow } from '../analysisPopout';
import { resolveGridEntry, resolveGridForInstance } from '../aiAssistant/gridProfiles';
import { fetchGridRows, type DataHubClient, type RowSet } from '../aiAssistant/dataAccess';
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
  const { spec, error: specError } = useMemo(
    () => (handoff ? specFrom(handoff.payload) : { spec: null, error: undefined }),
    [handoff],
  );

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

  // The cadence. `refreshMs` is already clamped by `validateReportSpec`, so a
  // report cannot ask to re-query faster than anyone could read it.
  useEffect(() => {
    if (!spec?.refreshMs) return;
    const timer = window.setInterval(() => void load(), spec.refreshMs);
    return () => window.clearInterval(timer);
  }, [spec?.refreshMs, load]);

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
        ) : error && !rowSet ? (
          <p className="p-8 text-sm text-[var(--ds-accent-negative)]">{error}</p>
        ) : spec && rowSet ? (
          <ReportCanvas spec={spec} rows={rowSet.rows} provenance={rowSet.provenance} ranAt={ranAt} />
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
