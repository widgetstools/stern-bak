/**
 * BehaviourFields — per-transport "behaviour" knobs.
 *
 * STOMP gets:
 *   - Reconnect initial delay (full backoff is tracked but unimplemented
 *     — stompjs's static `reconnectDelay`).
 *   - Realtime conflation + trailing-edge throttle (`conflateByKey` /
 *     `throttleMs`) — coalesce live deltas in the worker before fanning
 *     out. These are also settable in code on the provider config.
 *   - Snapshot chunk size (`snapshotChunkSize`) — rows per worker→main
 *     postMessage during the snapshot flush.
 * Other transports: no behaviour knobs today.
 */

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@wellsfargo-starui/react';
import type { ProviderConfig, StompProviderConfig } from '@wellsfargo-starui/types/shared';

export interface BehaviourFieldsProps {
  cfg: ProviderConfig;
  onChange(next: Partial<ProviderConfig>): void;
}

/** Sentinel for "no conflation column" — Radix Select forbids empty-string values. */
const CONFLATE_NONE = '__none__';

export function BehaviourFields({ cfg, onChange }: BehaviourFieldsProps) {
  if (cfg.providerType === 'stomp') {
    return <StompBehaviour cfg={cfg as StompProviderConfig} onChange={onChange as (n: Partial<StompProviderConfig>) => void} />;
  }
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
      No behaviour settings for {cfg.providerType.toUpperCase()} providers.
    </section>
  );
}

/** Column names available for conflation, from column defs then inferred fields. */
function conflateFieldOptions(cfg: StompProviderConfig): string[] {
  const fromCols = (cfg.columnDefinitions ?? []).map((c) => c.field);
  if (fromCols.length > 0) return [...new Set(fromCols)];
  return [...new Set((cfg.inferredFields ?? []).map((f) => f.path))];
}

function StompBehaviour({ cfg, onChange }: { cfg: StompProviderConfig; onChange(next: Partial<StompProviderConfig>): void }) {
  const fieldOptions = conflateFieldOptions(cfg);
  // Both default ON: undefined / true → enabled, only explicit false disables.
  const throttleEnabled = cfg.throttleEnabled !== false;
  const conflateEnabled = cfg.conflateEnabled !== false;
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-5 max-w-md">
      {/* Reconnect */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reconnect</h3>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Initial Delay (ms)</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            min={0}
            max={60_000}
            step={500}
            value={cfg.reconnect?.initialDelayMs ?? 5000}
            onChange={(e) => onChange({
              reconnect: { ...(cfg.reconnect ?? {}), initialDelayMs: Number(e.target.value) || 0 },
            })}
          />
          <p className="text-[11px] text-muted-foreground">
            Static delay between reconnect attempts. Full exponential backoff + jitter +
            max-attempts are reserved in the schema; not yet implemented.
          </p>
        </div>
      </div>

      {/* Realtime updates — conflation + throttle */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Realtime updates</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch
              id="throttleEnabled"
              checked={throttleEnabled}
              onCheckedChange={(v) => onChange({ throttleEnabled: v })}
            />
            <Label htmlFor="throttleEnabled" className="text-xs font-medium text-muted-foreground">
              Throttle updates
            </Label>
          </div>
          <Label className="text-xs font-medium text-muted-foreground">Throttle (ms)</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            min={0}
            max={10_000}
            step={50}
            disabled={!throttleEnabled}
            value={cfg.throttleMs ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              onChange({ throttleMs: v > 0 ? v : undefined });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Coalesce live deltas into a trailing-edge burst every N ms. 0 = immediate
            (no batching). Turn the switch off to fan out every delta immediately while
            keeping this value. Conflation below only applies when throttling is on.
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch
              id="thinDeltas"
              checked={cfg.thinDeltas === true}
              onCheckedChange={(v) => onChange({ thinDeltas: v ? true : undefined })}
            />
            <Label htmlFor="thinDeltas" className="text-xs font-medium text-muted-foreground">
              Thin field-level deltas
            </Label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ship only the fields that changed per row on live updates instead of full
            replacement rows — big wire saving when ticks touch a few fields of a wide
            row. Requires a key column; snapshots always ship full rows. Changing this
            requires a provider Restart.
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch
              id="dataPlane"
              checked={cfg.dataPlane !== 'hub'}
              onCheckedChange={(v) => onChange({ dataPlane: v ? undefined : 'hub' })}
            />
            <Label htmlFor="dataPlane" className="text-xs font-medium text-muted-foreground">
              Dedicated transport worker
            </Label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            On by default: this provider&apos;s connection, frame parsing, conflation, row
            cache and replay run in their own worker thread, so a busy feed cannot starve
            the hub&apos;s fan-out to windows (or the reverse). Falls back to the hub thread
            automatically where such workers are unavailable. Turn off to force the hub
            thread. Requires a provider Restart.
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch
              id="conflateEnabled"
              checked={conflateEnabled}
              onCheckedChange={(v) => onChange({ conflateEnabled: v })}
            />
            <Label htmlFor="conflateEnabled" className="text-xs font-medium text-muted-foreground">
              Conflate updates
            </Label>
          </div>
          <Label className="text-xs font-medium text-muted-foreground">Conflate by key</Label>
          <Select
            value={cfg.conflateByKey ?? CONFLATE_NONE}
            disabled={!conflateEnabled}
            onValueChange={(v) => onChange({ conflateByKey: v === CONFLATE_NONE ? undefined : v })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="(use key column)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CONFLATE_NONE}>(use key column)</SelectItem>
              {fieldOptions.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Within each throttle window, collapse repeated updates for the same key to
            the latest. Defaults to the provider's key column when left unset. Turn the
            switch off to deliver every update even when a key column exists.
          </p>
        </div>
      </div>

      {/* Snapshot */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Snapshot</h3>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Chunk size (rows)</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            min={1}
            max={100_000}
            step={100}
            value={cfg.snapshotChunkSize ?? 500}
            onChange={(e) => {
              const v = Math.floor(Number(e.target.value) || 0);
              onChange({ snapshotChunkSize: v > 0 ? v : undefined });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Rows per worker→client frame when flushing the snapshot. Smaller chunks keep
            each main-thread message under the long-task budget. Default 500.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Wire format</Label>
          <Select
            value={cfg.wireFormat ?? 'json'}
            onValueChange={(v) => onChange({ wireFormat: v === 'columnar' ? 'columnar' : undefined })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON (default)</SelectItem>
              <SelectItem value="columnar">Columnar (typed arrays)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Codec for binary worker→window frames (snapshot replay, restarts, large live
            batches). Columnar ships numbers as raw Float64 and booleans as bitmaps —
            several-fold faster to decode on number-heavy feeds. Changing this requires
            a provider Restart.
          </p>
        </div>
      </div>

      {/* Row fields */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Row fields</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch
              id="projectFields"
              checked={cfg.projectFields === true}
              onCheckedChange={(v) => onChange({ projectFields: v ? true : undefined })}
            />
            <Label htmlFor="projectFields" className="text-xs font-medium text-muted-foreground">
              Keep only column fields
            </Label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Prune each incoming row to the column definition fields (plus the key column)
            before it enters the cache. Big win when the feed sends many more fields than
            the blotter shows. Adding or removing columns requires a provider Restart.
            Infer Fields always sees the full row.
          </p>
        </div>
      </div>
    </section>
  );
}
