/**
 * DiagnosticsTab — live runtime stats for an existing provider plus
 * the explicit Stop / Restart controls.
 *
 * Only renders when editing a saved provider (the providerId is the
 * ConfigManager rowId, which the worker keys on). For new (unsaved)
 * providers we tell the user to save first.
 *
 * The "Stop" button is the ONLY way to tear down an upstream
 * connection in the new data plane — providers never auto-detach.
 */

import { useState } from 'react';
import { Badge, Button, Separator } from '@wellsfargo-starui/react';
import { Loader2, RefreshCw, Square } from 'lucide-react';
import { useDataServices, useProviderStats, type ProviderStats, type ProviderStatus } from '@wellsfargo-starui/react/data/runtime';
import type { ProviderConfig } from '@wellsfargo-starui/types/shared';

export interface DiagnosticsTabProps {
  providerId: string | null;
  cfg: ProviderConfig | null;
}

export function DiagnosticsTab({ providerId, cfg }: DiagnosticsTabProps) {
  if (!providerId) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-sm text-xs text-muted-foreground">
          Save the provider first — diagnostics show live stats from the worker once the
          provider has a stable id.
        </div>
      </div>
    );
  }
  return <Live providerId={providerId} cfg={cfg} />;
}

function Live({ providerId, cfg }: { providerId: string; cfg: ProviderConfig | null }) {
  const { client } = useDataServices();
  const [stats, setStats] = useState<ProviderStats | null>(null);
  const [stopping, setStopping] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ status: ProviderStatus; error?: string } | null>(null);

  useProviderStats(providerId, { onStats: setStats });

  const onRestart = () => {
    // Send a no-op data attach with __refresh; the Hub forwards into
    // provider.restart(extra) when running, or uses cfg to cold-start
    // a stopped provider. We discard the subId immediately.
    const noop = { onDelta: () => undefined, onStatus: (s: ProviderStatus, err?: string) => setStatusBanner({ status: s, error: err }) };
    const sub = client.attach(providerId, cfg ?? undefined, noop, { extra: { __refresh: Date.now() } });
    setTimeout(() => client.detach(sub), 200);
  };

  const onStop = () => {
    setStopping(true);
    client.stop(providerId);
    // Optimistic — the Hub releases provider state on next tick. The
    // stats stream will report rowCount=0 + subscriberCount=0 shortly.
    setTimeout(() => setStopping(false), 800);
  };

  const status = statusBanner?.status ?? null;
  const error = statusBanner?.error ?? null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <span className="text-xs text-muted-foreground">
            <span className="font-mono">{providerId}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRestart} title="Re-attach + replay">
            <RefreshCw className="h-3 w-3 mr-1" /> Restart
          </Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={onStop} disabled={stopping} title="Tear down upstream connection">
            {stopping ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Square className="h-3 w-3 mr-1" />}
            Stop
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin p-4 space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <Card title="Snapshot">
          <Stat
            label="Fetch time"
            value={fmtSnapshotFetch(stats?.snapshotFetchMs, status)}
          />
          <Stat label="Rows loaded" value={fmtInt(stats?.rowCount)} />
          {/* Serialized size of the worker cache — the number field
              projection shrinks ("Bytes received" below is upstream
              wire traffic, which client-side pruning can't reduce). */}
          <Stat label="Cache size (serialized)" value={fmtBytes(stats?.cacheBytes)} />
        </Card>

        <Card title="Connection latency">
          {/* Time from the Restart click until the upstream request
              (e.g. STOMP trigger frame) is sent — includes WebSocket
              dial + handshake. Only populated after a Restart click. */}
          <Stat label="Restart → request sent" value={fmtLatency(stats?.restartRequestMs, status)} />
          {/* Time from the request being sent until the first message
              arrives back from the server. */}
          <Stat label="Request → first message" value={fmtLatency(stats?.firstMessageMs, status)} />
        </Card>

        <Card title="Throughput">
          <Stat label="Messages (upstream)" value={fmtInt(stats?.msgCount)} />
          <Stat label="Upstream rate" value={stats ? `${stats.msgPerSec.toFixed(1)} msg/s` : '—'} />
          <Stat label="Bytes received" value={fmtBytes(stats?.byteCount)} />
        </Card>

        <Card title="Client publishing">
          <Stat label="Published" value={fmtInt(stats?.publishCount)} />
          <Stat label="Publish rate" value={stats ? `${stats.publishPerSec.toFixed(1)} msg/s` : '—'} />
          <Stat label="Publish rate (1m avg)" value={stats ? `${stats.publishPerMin.toFixed(1)} msg/min` : '—'} />
          <Stat label="Subscribers" value={fmtInt(stats?.subscriberCount)} />
        </Card>

        <Card title="Lifecycle">
          <Stat label="Started" value={fmtTime(stats?.startedAt)} />
          <Stat label="Last message" value={stats?.lastMessageAt ? fmtTime(stats.lastMessageAt) : '—'} />
          <Stat label="Errors" value={fmtInt(stats?.errorCount)} />
        </Card>

        {stats?.lastError && (
          <Card title="Last Error">
            <p className="text-xs font-mono text-destructive col-span-full">{stats.lastError}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProviderStatus | null }) {
  const tone =
    status === 'ready' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
    status === 'loading' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
    status === 'error' ? 'bg-destructive/15 text-destructive' :
    'bg-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={`${tone} text-[10px] font-medium`}>
      {status ?? 'idle'}
    </Badge>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <Separator />
      <div className="grid grid-cols-2 gap-3 pt-1">
        {children}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-mono font-medium">{value}</div>
    </div>
  );
}

function fmtInt(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtBytes(n: number | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDuration(ms: number | undefined | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtSnapshotFetch(ms: number | null | undefined, status: ProviderStatus | null): string {
  if (ms != null) return fmtDuration(ms);
  if (status === 'loading') return 'In progress…';
  return '—';
}

function fmtLatency(ms: number | null | undefined, status: ProviderStatus | null): string {
  if (ms != null) return fmtDuration(ms);
  if (status === 'loading') return 'Waiting…';
  return '—';
}

function fmtTime(epochMs: number | undefined | null): string {
  if (!epochMs) return '—';
  const d = new Date(epochMs);
  return d.toLocaleTimeString();
}
