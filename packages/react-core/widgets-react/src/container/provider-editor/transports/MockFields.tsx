/**
 * MockFields — for the Mock provider type. Useful in dev when the
 * upstream services aren't running.
 */

import { Input, Label, Switch } from '@wellsfargo-starui/ui';
import type { MockProviderConfig } from '@wellsfargo-starui/shared-types';

export interface MockFieldsProps {
  cfg: MockProviderConfig;
  onChange(next: Partial<MockProviderConfig>): void;
}

export function MockFields({ cfg, onChange }: MockFieldsProps) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mock Settings</h3>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Row Count</Label>
        <Input
          type="number"
          className="h-8 text-sm"
          value={cfg.rowCount ?? 50}
          onChange={(e) => onChange({ rowCount: parseInt(e.target.value, 10) || 0 })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Update Interval (ms)</Label>
        <Input
          type="number"
          className="h-8 text-sm"
          value={cfg.updateIntervalMs ?? cfg.updateInterval ?? 2000}
          onChange={(e) => onChange({ updateIntervalMs: parseInt(e.target.value, 10) || 0 })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="enableUpdates"
          checked={cfg.enableUpdates ?? true}
          onCheckedChange={(v) => onChange({ enableUpdates: v })}
        />
        <Label htmlFor="enableUpdates" className="text-xs font-normal text-muted-foreground">
          Tick rows after the snapshot
        </Label>
      </div>
    </section>
  );
}
