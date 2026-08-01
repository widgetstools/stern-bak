/**
 * HubInspectorDrawer — dev/operator view of SharedWorker hub state.
 *
 * Open with Alt+Shift+S (Option+Shift+S on macOS). Polls `hub-introspect`
 * while open so subscriber + cache counts stay live.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  TableCell,
  TableHead,
  TableRow,
} from '@wellsfargo-starui/react';
import { ChevronDown, ChevronRight, Loader2, RefreshCw, X } from 'lucide-react';
import type {
  HubAppDataIntrospectRow,
  HubIntrospectSnapshot,
  HubProviderIntrospectRow,
  ProviderStatus,
} from '@wellsfargo-starui/data/runtime';
import {
  HubInspectorVirtualSection,
  type HubInspectorRowMeasureProps,
} from './HubInspectorVirtualSection.js';
// Import the provider hook directly — going through './index.js' closed
// a runtime barrel cycle (index → DataHubProvider → HubInspectorHost →
// this file → index).
import { useDataServicesContext } from './DataServicesProvider.js';

const POLL_MS = 1000;
const PROVIDER_COLUMN_COUNT = 6;
const APP_DATA_COLUMN_COUNT = 4;

export interface HubInspectorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HubInspectorDrawer({ open, onOpenChange }: HubInspectorDrawerProps): React.ReactNode {
  const { client } = useDataServicesContext();
  const [snapshot, setSnapshot] = useState<HubIntrospectSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [expandedAppDataId, setExpandedAppDataId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await client.getHubIntrospect();
      setSnapshot(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  const totalRows = snapshot?.providers.reduce((sum, p) => sum + (p.rowCount ?? 0), 0) ?? 0;
  const providers = snapshot?.providers ?? [];
  const appDataRows = snapshot?.appData.rows ?? [];

  const getProviderId = useCallback((row: HubProviderIntrospectRow) => row.providerId, []);
  const canExpandProvider = useCallback((row: HubProviderIntrospectRow) => row.cfg != null, []);
  const getAppDataId = useCallback((row: HubAppDataIntrospectRow) => row.configId, []);
  const canExpandAppData = useCallback(() => true, []);

  const toggleProvider = useCallback((providerId: string) => {
    setExpandedProviderId((prev) => (prev === providerId ? null : providerId));
  }, []);

  const toggleAppData = useCallback((configId: string) => {
    setExpandedAppDataId((prev) => (prev === configId ? null : configId));
  }, []);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent hideHandle className="left-auto right-0 top-0 mt-0 h-full w-full max-w-2xl rounded-none border-l">
        <DrawerHeader className="shrink-0 border-b border-border pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle className="text-base">Data Services Hub</DrawerTitle>
              <DrawerDescription className="text-xs">
                SharedWorker runtime — providers, loaded configs, subscribers, and cache sizes
              </DrawerDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => { void refresh(); }}
                disabled={loading}
                title="Refresh now"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <DrawerClose asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Close">
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          {error && (
            <div className="shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <HubSummaryBar snapshot={snapshot} totalRows={totalRows} />

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <HubInspectorVirtualSection
              title="Providers"
              rows={providers}
              expandedId={expandedProviderId}
              getRowId={getProviderId}
              canExpand={canExpandProvider}
              emptyMessage="No providers in catalog or runtime"
              columnCount={PROVIDER_COLUMN_COUNT}
              colGroup={
                <colgroup>
                  <col style={{ width: '2rem' }} />
                  <col style={{ width: '38%' }} />
                  <col style={{ width: '4.5rem' }} />
                  <col style={{ width: '5.5rem' }} />
                  <col style={{ width: '3.5rem' }} />
                  <col style={{ width: '4.5rem' }} />
                </colgroup>
              }
              tableHeader={
                <TableRow className="hover:bg-background">
                  <TableHead className="h-8 w-8 bg-background px-2 text-[11px]" />
                  <TableHead className="h-8 bg-background px-2 text-[11px]">Provider</TableHead>
                  <TableHead className="h-8 bg-background px-2 text-[11px]">Type</TableHead>
                  <TableHead className="h-8 bg-background px-2 text-[11px]">Status</TableHead>
                  <TableHead className="h-8 bg-background px-2 text-right text-[11px]">Subs</TableHead>
                  <TableHead className="h-8 bg-background px-2 text-right text-[11px]">Rows</TableHead>
                </TableRow>
              }
              renderMainRow={(row, measure) => (
                <ProviderMainRow
                  row={row}
                  expanded={expandedProviderId === row.providerId}
                  onToggle={() => toggleProvider(row.providerId)}
                  measure={measure}
                />
              )}
              renderDetailRow={(row, measure) => (
                <ProviderDetailRow
                  row={row}
                  measure={measure}
                />
              )}
            />

            <HubInspectorVirtualSection
              title="AppData"
              rows={appDataRows}
              expandedId={expandedAppDataId}
              getRowId={getAppDataId}
              canExpand={canExpandAppData}
              emptyMessage="No AppData rows loaded"
              columnCount={APP_DATA_COLUMN_COUNT}
              colGroup={
                <colgroup>
                  <col style={{ width: '2rem' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '3.5rem' }} />
                </colgroup>
              }
              tableHeader={
                <TableRow className="hover:bg-background">
                  <TableHead className="h-8 w-8 bg-background px-2 text-[11px]" />
                  <TableHead className="h-8 bg-background px-2 text-[11px]">Name</TableHead>
                  <TableHead className="h-8 bg-background px-2 text-[11px]">Config id</TableHead>
                  <TableHead className="h-8 bg-background px-2 text-right text-[11px]">Keys</TableHead>
                </TableRow>
              }
              renderMainRow={(row, measure) => (
                <AppDataMainRow
                  row={row}
                  expanded={expandedAppDataId === row.configId}
                  onToggle={() => toggleAppData(row.configId)}
                  measure={measure}
                />
              )}
              renderDetailRow={(row, measure) => (
                <AppDataDetailRow row={row} measure={measure} />
              )}
            />
          </div>

          <p className="shrink-0 text-[10px] text-muted-foreground">
            Alt+Shift+S toggles this panel. Expand a row to inspect the worker-loaded config JSON.
            Running providers show the live slot cfg; idle catalog rows show the cached transport cfg.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ProviderMainRow({
  row,
  expanded,
  onToggle,
  measure,
}: {
  row: HubProviderIntrospectRow;
  expanded: boolean;
  onToggle: () => void;
  measure: HubInspectorRowMeasureProps;
}): React.ReactNode {
  const hasCfg = row.cfg != null;
  return (
    <TableRow
      ref={measure.measureRef}
      data-index={measure.virtualIndex}
      className={hasCfg ? 'cursor-pointer hover:bg-muted/40' : undefined}
      onClick={hasCfg ? onToggle : undefined}
    >
      <TableCell className="w-8 py-2 text-muted-foreground">
        {hasCfg ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
        ) : null}
      </TableCell>
      <TableCell className="py-2">
        {row.name ? (
          <div className="truncate text-xs font-medium leading-tight" title={row.name}>
            {row.name}
          </div>
        ) : null}
        <div
          className="truncate font-mono text-[10px] leading-tight text-muted-foreground"
          title={row.providerId}
        >
          {row.providerId}
        </div>
      </TableCell>
      <TableCell className="py-2 text-xs">{row.providerType}</TableCell>
      <TableCell className="py-2">
        <StatusBadge running={row.running} status={row.status} />
      </TableCell>
      <TableCell className="py-2 text-right font-mono text-xs">
        {row.running ? fmtInt(row.subscriberCount) : '—'}
      </TableCell>
      <TableCell className="py-2 text-right font-mono text-xs">
        {row.running ? fmtInt(row.rowCount) : '—'}
      </TableCell>
    </TableRow>
  );
}

function ProviderDetailRow({
  row,
  measure,
}: {
  row: HubProviderIntrospectRow;
  measure: HubInspectorRowMeasureProps;
}): React.ReactNode {
  return (
    <TableRow ref={measure.measureRef} data-index={measure.virtualIndex} className="hover:bg-transparent">
      <TableCell colSpan={PROVIDER_COLUMN_COUNT} className="bg-muted/20 p-0">
        <ConfigJsonBlock
          title={row.running ? 'Runtime provider cfg' : 'Catalog provider cfg'}
          value={row.cfg}
        />
      </TableCell>
    </TableRow>
  );
}

function AppDataMainRow({
  row,
  expanded,
  onToggle,
  measure,
}: {
  row: HubAppDataIntrospectRow;
  expanded: boolean;
  onToggle: () => void;
  measure: HubInspectorRowMeasureProps;
}): React.ReactNode {
  return (
    <TableRow
      ref={measure.measureRef}
      data-index={measure.virtualIndex}
      className="cursor-pointer hover:bg-muted/40"
      onClick={onToggle}
    >
      <TableCell className="w-8 py-2 text-muted-foreground">
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </TableCell>
      <TableCell className="truncate py-2 font-mono text-xs" title={row.name}>
        {row.name}
      </TableCell>
      <TableCell className="truncate py-2 font-mono text-[11px] text-muted-foreground" title={row.configId}>
        {row.configId}
      </TableCell>
      <TableCell className="py-2 text-right font-mono text-xs">{row.keyCount}</TableCell>
    </TableRow>
  );
}

function AppDataDetailRow({
  row,
  measure,
}: {
  row: HubAppDataIntrospectRow;
  measure: HubInspectorRowMeasureProps;
}): React.ReactNode {
  return (
    <TableRow ref={measure.measureRef} data-index={measure.virtualIndex} className="hover:bg-transparent">
      <TableCell colSpan={APP_DATA_COLUMN_COUNT} className="bg-muted/20 p-0">
        <ConfigJsonBlock title="AppData values" value={row.values} />
      </TableCell>
    </TableRow>
  );
}

function ConfigJsonBlock({ title, value }: { title: string; value: unknown }): React.ReactNode {
  return (
    <div className="space-y-1 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <pre className="max-h-64 overflow-auto rounded border border-border bg-background px-2 py-2 text-[11px] font-mono leading-relaxed text-foreground whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function StatusBadge({ running, status }: { running: boolean; status?: ProviderStatus }): React.ReactNode {
  if (!running) {
    return (
      <Badge variant="outline" className="bg-muted text-[10px] text-muted-foreground">
        idle
      </Badge>
    );
  }
  const tone =
    status === 'ready' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
    status === 'loading' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
    status === 'error' ? 'bg-destructive/15 text-destructive' :
    'bg-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={`${tone} text-[10px] font-medium`}>
      {status ?? 'unknown'}
    </Badge>
  );
}

function HubSummaryBar({
  snapshot,
  totalRows,
}: {
  snapshot: HubIntrospectSnapshot | null;
  totalRows: number;
}): React.ReactNode {
  const items = [
    { label: 'Ports', value: fmtInt(snapshot?.connectedPorts) },
    { label: 'Catalog', value: snapshot?.catalogReady ? 'ready' : 'pending' },
    {
      label: 'Providers',
      value: `${fmtInt(snapshot?.runningProviderCount)} running / ${fmtInt(snapshot?.catalogProviderCount)} catalog`,
    },
    { label: 'Cached rows', value: fmtInt(totalRows) },
    { label: 'AppData listeners', value: fmtInt(snapshot?.appData?.listenerCount) },
  ];

  return (
    <section
      className="shrink-0 rounded-md border border-border bg-muted/20 px-2.5 py-1.5"
      aria-label="Hub summary"
    >
      <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline gap-1.5 whitespace-nowrap">
            <dt className="text-[10px] text-muted-foreground">{item.label}</dt>
            <dd className="m-0 font-mono text-xs font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function fmtInt(n: number | undefined | null): string {
  if (n == null) return '—';
  return n.toLocaleString();
}
