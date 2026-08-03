/**
 * MockPerspectiveFields — the Mock form, the Table, and the one setting the
 * STOMP twin has no equivalent of.
 *
 * It is its own component rather than a second use of `StompPerspectiveFields`
 * because of `rowShape`. A Perspective schema is a flat map of typed columns
 * and the generated positions row is deeply nested (ratings, key-rate
 * durations, exposure breakdowns), so the rows have to be flattened onto
 * literal dotted keys before they can reach a Table at all. The transport
 * defaults it to `'flat'` for exactly that reason — which is why it is shown
 * here rather than left to the default: a config that never records the
 * setting reads, correctly, as a config that never decided it.
 *
 * The five fields shared with the STOMP twin come from `PerspectiveTableFields`.
 */

import { Label, Switch } from '@wellsfargo-starui/react';
import { AlertTriangle } from 'lucide-react';
import type { MockPerspectiveProviderConfig } from '@wellsfargo-starui/types/shared';
import { MockFields } from './MockFields.js';
import { Card, Help, PerspectiveTableFields } from './PerspectiveTableFields.js';

export interface MockPerspectiveFieldsProps {
  cfg: MockPerspectiveProviderConfig;
  onChange(next: Partial<MockPerspectiveProviderConfig>): void;
  /** Named in the keyColumn refusal. */
  providerLabel: string;
  providerId?: string | null;
}

export function MockPerspectiveFields({
  cfg,
  onChange,
  providerLabel,
  providerId,
}: MockPerspectiveFieldsProps) {
  const flat = (cfg.rowShape ?? 'flat') === 'flat';
  const columnCount = cfg.columnDefinitions?.length ?? 0;

  return (
    <div className="space-y-4">
      <MockFields cfg={cfg} onChange={onChange} />

      <Card title="Row Shape">
        <div className="flex items-center gap-2">
          <Switch
            id="mock-perspective-flat"
            checked={flat}
            onCheckedChange={(v) => onChange({ rowShape: v ? 'flat' : 'nested' })}
          />
          <Label
            htmlFor="mock-perspective-flat"
            className="text-xs font-normal text-muted-foreground"
          >
            Flatten rows before they reach the Table
          </Label>
        </div>
        <Help>
          The generated positions row is deeply nested; a Perspective schema is a flat
          map of typed columns. Flattening lifts each column definition&rsquo;s path onto a
          literal top-level key, so <code className="bg-muted px-1 rounded text-[10px]">rating.moody</code>{' '}
          arrives as the key <code className="bg-muted px-1 rounded text-[10px]">&quot;rating.moody&quot;</code>.
          It derives its paths from the column definitions, so it has nothing to lift
          without them.
        </Help>
        {!flat && (
          <div
            role="alert"
            data-testid="mock-perspective-nested-warning"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
            <p className="text-[11px] text-destructive">
              Nested rows cannot populate a Perspective Table — every nested column is
              dropped from the schema, and a blotter reading this provider sees empty
              columns.
            </p>
          </div>
        )}
        {flat && columnCount === 0 && (
          <div
            role="alert"
            data-testid="mock-perspective-no-columns-warning"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
            <p className="text-[11px] text-destructive">
              No column definitions, so the flatten has no paths to lift and rows pass
              through nested and unchanged. Select columns in the Fields tab.
            </p>
          </div>
        )}
      </Card>

      <PerspectiveTableFields
        cfg={cfg}
        onChange={onChange}
        providerLabel={providerLabel}
        providerId={providerId}
      />
    </div>
  );
}
