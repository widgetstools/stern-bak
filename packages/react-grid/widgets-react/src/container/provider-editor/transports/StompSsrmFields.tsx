import { Input, Label } from '@wellsfargo-starui/react';
import type { StompProviderConfig, StompSsrmProviderConfig } from '@wellsfargo-starui/types/shared';
import { StompFields } from './StompFields.js';

export interface StompSsrmFieldsProps {
  cfg: StompSsrmProviderConfig;
  onChange(next: Partial<StompSsrmProviderConfig>): void;
}

export function StompSsrmFields({ cfg, onChange }: StompSsrmFieldsProps) {
  const stompOnChange = onChange as (next: Partial<StompProviderConfig>) => void;
  return (
    <div className="space-y-4">
      <StompFields cfg={cfg as unknown as StompProviderConfig} onChange={stompOnChange} />
      <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SSRM</h3>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Block size</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            min={20}
            max={5000}
            step={20}
            value={cfg.blockSize ?? 200}
            onChange={(e) => onChange({ blockSize: Number(e.target.value) || 200 })}
          />
          <p className="text-[11px] text-muted-foreground">
            AG Grid <code className="bg-muted px-1 rounded text-[10px]">cacheBlockSize</code> — rows per SSRM window.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Publish window (ms)</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            min={20}
            max={2000}
            step={10}
            value={cfg.publishWindowMs ?? 100}
            onChange={(e) => onChange({ publishWindowMs: Number(e.target.value) || 100 })}
          />
          <p className="text-[11px] text-muted-foreground">
            WASM tick / shared-delta poll interval. Default 100.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Search columns</Label>
          <Input
            className="h-8 text-sm font-mono"
            value={(cfg.searchColumns ?? []).join(',')}
            onChange={(e) => onChange({
              searchColumns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            })}
            placeholder="desk,trader,ticker"
          />
          <p className="text-[11px] text-muted-foreground">
            Comma-separated columns included in worker quick-filter matching.
          </p>
        </div>
      </section>
    </div>
  );
}
