/**
 * BehaviourFields — per-transport "behaviour" knobs.
 *
 * Every transport gets a Start-up section: `autoStart` — start the provider
 * in the data worker when the platform warms (dock / app load) so the first
 * view attaches to a running provider.
 *
 * `stomp` and `stomp-ssrm` get the same ingest knobs, because they are the
 * same transport: `registry.ts` maps both to `startStomp`, and nothing in it
 * branches on `providerType`. Reconnect delay, trailing-edge throttle,
 * conflation, snapshot chunk size and field projection all act upstream of
 * whatever consumes the rows — the worker cache under CSRM, the WASM engine
 * under SSRM — so both modes render the SAME section components.
 *
 * SSRM omits exactly two, and only these two:
 *   - `thinDeltas`  — field-level diffing of the worker→client ROW broadcast
 *                     (`providerEmit.applyThinDelta`); an SSRM client pulls
 *                     blocks and never receives it.
 *   - `wireFormat`  — codec for worker→window row frames; the SSRM block path
 *                     never references it.
 *
 * Other transports: the Start-up section only.
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
  return (
    <div className="space-y-4">
      <StartupSection cfg={cfg} onChange={onChange} />
      {cfg.providerType === 'stomp-ssrm' && (
        <StompSsrmBehaviour cfg={cfg as unknown as StompProviderConfig} onChange={onChange as (n: Partial<StompProviderConfig>) => void} />
      )}
      {cfg.providerType === 'stomp' && (
        <StompBehaviour cfg={cfg as StompProviderConfig} onChange={onChange as (n: Partial<StompProviderConfig>) => void} />
      )}
    </div>
  );
}

/** `autoStart` — the dock / app warm-up starts this provider before any view asks for it. */
function StartupSection({ cfg, onChange }: BehaviourFieldsProps) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5 max-w-md">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Start-up</h3>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Switch
            id="autoStart"
            checked={cfg.autoStart === true}
            onCheckedChange={(v) => onChange({ autoStart: v ? true : undefined })}
          />
          <Label htmlFor="autoStart" className="text-xs font-medium text-muted-foreground">
            Start with the platform
          </Label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Start this provider in the data worker when the platform warms up (OpenFin dock
          load / app load), so the first view that opens attaches to a running provider
          and paints from the worker cache instead of waiting for connect + snapshot.
          Off: the first view to use the provider starts it.
        </p>
      </div>
    </section>
  );
}

/** Column names available for conflation, from column defs then inferred fields. */
function conflateFieldOptions(cfg: StompProviderConfig): string[] {
  const fromCols = (cfg.columnDefinitions ?? []).map((c) => c.field);
  if (fromCols.length > 0) return [...new Set(fromCols)];
  return [...new Set((cfg.inferredFields ?? []).map((f) => f.path))];
}

interface SectionProps {
  cfg: StompProviderConfig;
  onChange(next: Partial<StompProviderConfig>): void;
}

/**
 * `stomp` and `stomp-ssrm` share ONE transport — `registry.ts` maps both to
 * `startStomp`, and nothing in it branches on `providerType`. So every knob
 * below acts at INGEST, upstream of whatever consumes the rows: for CSRM the
 * worker cache it fans out from, for SSRM the WASM engine it feeds. That is
 * why the sections are shared rather than reimplemented per mode — a copy
 * would drift, and the SSRM tab previously offered only Reconnect on the
 * mistaken grounds that the rest was CSRM-only.
 *
 * Two knobs are genuinely CSRM-only and are gated off for SSRM:
 *   - `thinDeltas`  — field-level diffing of the worker→client ROW broadcast
 *                     (`providerEmit.applyThinDelta`). An SSRM client pulls
 *                     blocks; it never receives that broadcast.
 *   - `wireFormat`  — codec for worker→window row frames. The SSRM block path
 *                     does not reference it at all.
 */

function ReconnectSection({ cfg, onChange }: SectionProps) {
  return (
    <div className="space-y-3.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reconnect</h3>
      <div className="space-y-1.5">
        <Label htmlFor="reconnectInitialDelayMs" className="text-xs font-medium text-muted-foreground">Initial Delay (ms)</Label>
        <Input
          id="reconnectInitialDelayMs"
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
  );
}

function ThrottleField({ cfg, onChange, sink }: SectionProps & { sink: string }) {
  const throttleEnabled = cfg.throttleEnabled !== false;
  return (
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
      <Label htmlFor="throttleMs" className="text-xs font-medium text-muted-foreground">Throttle (ms)</Label>
      <Input
        id="throttleMs"
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
        Coalesce live deltas into a trailing-edge burst every N ms before they reach
        {' '}{sink}. 0 = immediate (no batching). Turn the switch off to pass every
        delta straight through while keeping this value. Conflation below only applies
        when throttling is on.
      </p>
    </div>
  );
}

function ConflateField({ cfg, onChange }: SectionProps) {
  const conflateEnabled = cfg.conflateEnabled !== false;
  const fieldOptions = conflateFieldOptions(cfg);
  return (
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
      <Label htmlFor="conflateByKey" className="text-xs font-medium text-muted-foreground">Conflate by key</Label>
      <Select
        value={cfg.conflateByKey ?? CONFLATE_NONE}
        disabled={!conflateEnabled}
        onValueChange={(v) => onChange({ conflateByKey: v === CONFLATE_NONE ? undefined : v })}
      >
        <SelectTrigger id="conflateByKey" className="h-8 text-sm">
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
        the latest. Defaults to the provider&apos;s key column when left unset. Turn the
        switch off to deliver every update even when a key column exists.
      </p>
    </div>
  );
}

function ThinDeltasField({ cfg, onChange }: SectionProps) {
  return (
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
  );
}

function ChunkSizeField({ cfg, onChange, sink }: SectionProps & { sink: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="snapshotChunkSize" className="text-xs font-medium text-muted-foreground">Chunk size (rows)</Label>
      <Input
        id="snapshotChunkSize"
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
        Rows per frame when flushing the snapshot into {sink}. Smaller chunks keep each
        message under the long-task budget. Default 500.
      </p>
    </div>
  );
}

function WireFormatField({ cfg, onChange }: SectionProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="wireFormat" className="text-xs font-medium text-muted-foreground">Wire format</Label>
      <Select
        value={cfg.wireFormat ?? 'json'}
        onValueChange={(v) => onChange({ wireFormat: v === 'columnar' ? 'columnar' : undefined })}
      >
        <SelectTrigger id="wireFormat" className="h-8 text-sm">
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
  );
}

function RowFieldsSection({ cfg, onChange, sink }: SectionProps & { sink: string }) {
  return (
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
          at frame-parse time, before it reaches {sink}. Big win when the feed sends many
          more fields than the blotter shows. Adding or removing columns requires a
          provider Restart. Infer Fields always sees the full row.
        </p>
      </div>
    </div>
  );
}

function StompSsrmBehaviour({ cfg, onChange }: SectionProps) {
  const sink = 'the engine';
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-5 max-w-md">
      <ReconnectSection cfg={cfg} onChange={onChange} />

      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Realtime updates</h3>
        <ThrottleField cfg={cfg} onChange={onChange} sink={sink} />
        <ConflateField cfg={cfg} onChange={onChange} />
      </div>

      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Snapshot</h3>
        <ChunkSizeField cfg={cfg} onChange={onChange} sink={sink} />
      </div>

      <RowFieldsSection cfg={cfg} onChange={onChange} sink={sink} />

      <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
        Thin field-level deltas and Wire format are not offered here: both shape the
        worker→client ROW broadcast, and an SSRM grid pulls blocks instead of receiving
        it. Block sizing lives on the Connection tab.
      </p>
    </section>
  );
}

function StompBehaviour({ cfg, onChange }: SectionProps) {
  const sink = 'the worker cache';
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-5 max-w-md">
      <ReconnectSection cfg={cfg} onChange={onChange} />

      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Realtime updates</h3>
        <ThrottleField cfg={cfg} onChange={onChange} sink={sink} />
        <ThinDeltasField cfg={cfg} onChange={onChange} />
        <ConflateField cfg={cfg} onChange={onChange} />
      </div>

      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Snapshot</h3>
        <ChunkSizeField cfg={cfg} onChange={onChange} sink={sink} />
        <WireFormatField cfg={cfg} onChange={onChange} />
      </div>

      <RowFieldsSection cfg={cfg} onChange={onChange} sink={sink} />
    </section>
  );
}
