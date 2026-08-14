/**
 * StompSsrmFields — Connection-tab inputs for `stomp-ssrm` providers.
 * Reuses STOMP connection fields and adds SSRM block-size.
 */
import { Input, Label } from '@wellsfargo-starui/react';
import type { StompSsrmProviderConfig } from '@wellsfargo-starui/types/shared';
import { STOMP_TUNING_DEFAULTS } from '@wellsfargo-starui/types/shared';
import { StompFields } from './StompFields.js';

export interface StompSsrmFieldsProps {
  cfg: StompSsrmProviderConfig;
  onChange(next: Partial<StompSsrmProviderConfig>): void;
}

export function StompSsrmFields({ cfg, onChange }: StompSsrmFieldsProps) {
  return (
    <div className="space-y-4">
      <StompFields
        cfg={cfg as never}
        onChange={onChange as never}
      />
      <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          SSRM
        </h3>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Cache block size
          </Label>
          <Input
            className="h-8 text-sm font-mono"
            type="number"
            min={20}
            max={5000}
            value={cfg.blockSize ?? 100}
            onChange={(e) =>
              onChange({
                blockSize: Math.max(20, Number(e.target.value) || 100),
              })
            }
          />
          <p className="text-[11px] text-muted-foreground">
            Hint for AG Grid <code className="bg-muted px-1 rounded text-[10px]">cacheBlockSize</code>
            {' '}(worker pages by each getRows request).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Publish window (ms)
          </Label>
          <Input
            className="h-8 text-sm font-mono"
            type="number"
            min={0}
            max={5000}
            step={50}
            value={cfg.publishWindowMs ?? STOMP_TUNING_DEFAULTS.publishWindowMs}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              onChange({ publishWindowMs: v > 0 ? v : undefined });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Worker-side flush window for SSRM ticks — accumulate row updates and fan
            them out at most once per window. Unset/0 = flush per tick. Previously
            seed-file-only; a Restart applies changes.
          </p>
        </div>
      </section>
    </div>
  );
}
