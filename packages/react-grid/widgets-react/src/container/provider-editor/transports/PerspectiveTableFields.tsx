/**
 * The five settings a `*-perspective` provider adds over its classic twin.
 *
 * Both perspective configs extend their twin by exactly the same five fields
 * (`StompPerspectiveProviderConfig extends Omit<StompProviderConfig,
 * 'providerType'>`, and the mock one likewise), so this component owns those
 * five and nothing else. `StompPerspectiveFields` / `MockPerspectiveFields`
 * compose it alongside the twin's own form rather than forking it — a fork
 * would mean re-stating 116 lines of STOMP wire settings to add five, and the
 * two copies would drift on the first change to either.
 *
 * Two of the five are worth more than a label, and the UI says so:
 *
 *   - `integerColumns` is presented as the exception it is. Perspective
 *     TRUNCATES a float that lands in an integer column, one outlier row is
 *     enough to make a sampled type wrong, and a float represents every
 *     integer to 2^53 exactly — so there is nothing to gain and a silent
 *     wrong number to lose. It is a picker over the declared columns rather
 *     than free text so a typo cannot name a column that does not exist.
 *
 *   - the declared schema is the difference between a blotter that paints on
 *     open and one that waits out a whole snapshot first. With columns
 *     declared the Table is created EMPTY and IMMEDIATELY; without them it
 *     cannot exist until the snapshot has been observed, and there is nothing
 *     for a window to attach to until then.
 *
 * `keyColumn` is not edited here — it lives in the Columns tab — but it is
 * CHECKED here, because it is load-bearing on these types in a way it is not
 * on their twins: Perspective indexes by one scalar column, so anything else
 * makes the provider silently push-only. The refusal is the worker's own
 * sentence, from the foundation layer, so authoring time and attach time
 * cannot disagree.
 */

import { Button, Input, Label, Switch } from '@wellsfargo-starui/react';
import { AlertTriangle } from 'lucide-react';
import {
  describePerspectiveKeyColumnRefusal,
  type ColumnDefinition,
  type FieldInfo,
} from '@wellsfargo-starui/types/shared';
import { MultiSelect, type MultiSelectOption } from '../MultiSelect.js';

/** The slice of a perspective config this component owns. */
export interface PerspectiveTableCfg {
  tableName?: string;
  integerColumns?: string[];
  inferDates?: boolean;
  inferredFields?: FieldInfo[];
  buildAfterRows?: number;
  keyColumn?: string | readonly string[];
  columnDefinitions?: ColumnDefinition[];
}

export interface PerspectiveTableFieldsProps {
  cfg: PerspectiveTableCfg;
  onChange(next: Partial<PerspectiveTableCfg>): void;
  /** Named in the keyColumn refusal so it reads like the worker's own. */
  providerLabel: string;
  /** Shown as the Table-name placeholder — the name used when it is blank. */
  providerId?: string | null;
}

/** `ColumnDefinition.cellDataType` is a renderer hint; `FieldInfo.type` is a type. */
function toFieldType(cellDataType: string | undefined): FieldInfo['type'] {
  switch (cellDataType) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'dateString':
      return 'date';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}

export function PerspectiveTableFields({
  cfg,
  onChange,
  providerLabel,
  providerId,
}: PerspectiveTableFieldsProps) {
  const columns = cfg.columnDefinitions ?? [];
  const declaredFields = cfg.inferredFields ?? [];
  const keyRefusal = describePerspectiveKeyColumnRefusal(providerLabel, cfg.keyColumn);

  // Only numeric columns can be integers; offering the rest invites a
  // declaration Perspective would reject or, worse, coerce.
  const numericOptions: MultiSelectOption[] = columns
    .filter((c) => c.cellDataType === 'number')
    .map((c) => ({ value: c.field, label: c.field, hint: 'number' }));

  const declareFromColumns = () => {
    onChange({
      inferredFields: columns.map((c) => ({
        path: c.field,
        type: toFieldType(c.cellDataType),
        nullable: true,
      })),
    });
  };

  return (
    <Card title="Perspective Table">
      {keyRefusal && (
        <div
          role="alert"
          data-testid="perspective-key-column-error"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-destructive">{keyRefusal}</p>
            <p className="text-[11px] text-muted-foreground">
              Pick a single key column in the Columns tab. Saved as-is, this provider
              runs push-only — no Table is built and no window can attach to one.
            </p>
          </div>
        </div>
      )}

      <Field label="Table Name">
        <Input
          className="h-8 text-sm font-mono"
          value={cfg.tableName ?? ''}
          onChange={(e) => onChange({ tableName: e.target.value })}
          placeholder={providerId ?? 'defaults to the provider id'}
        />
        <Help>
          What a window passes to <code className="bg-muted px-1 rounded text-[10px]">open_table</code>.
          One Table per provider; leave it blank to use the provider id.
        </Help>
      </Field>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Declared Schema</Label>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={columns.length === 0}
            onClick={declareFromColumns}
          >
            Declare from columns
          </Button>
          {declaredFields.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onChange({ inferredFields: [] })}
            >
              Clear
            </Button>
          )}
        </div>
        <Help>
          {declaredFields.length > 0 ? (
            <>
              <strong>{declaredFields.length} declared field{declaredFields.length === 1 ? '' : 's'}</strong>
              {' '}— the Table is created empty and immediately, so a blotter paints on
              open instead of waiting out the first snapshot.
            </>
          ) : columns.length > 0 ? (
            <>
              Falling back to the {columns.length} column definition{columns.length === 1 ? '' : 's'}.
              Declaring fields is preferred: a field carries a real type where a column
              def carries a cell-renderer hint.
            </>
          ) : (
            <>
              <strong>Nothing declared.</strong> The Table cannot be built until a whole
              snapshot has arrived and been sampled, so the blotter stays empty until
              then. Select columns in the Fields tab first.
            </>
          )}
        </Help>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="perspective-infer-dates"
          checked={cfg.inferDates ?? true}
          onCheckedChange={(v) => onChange({ inferDates: v })}
        />
        <Label
          htmlFor="perspective-infer-dates"
          className="text-xs font-normal text-muted-foreground"
        >
          Map ISO date strings onto Perspective date columns
        </Label>
      </div>
      <Help>
        On by default. Off leaves them as text, which loses server-side date sorting
        and range filtering.
      </Help>

      <Field label="Integer Columns">
        <MultiSelect
          options={numericOptions}
          value={cfg.integerColumns ?? []}
          onChange={(next) => onChange({ integerColumns: next })}
          placeholder="None — every numeric column is a float"
          emptyMessage="No numeric columns defined"
        />
        <Help>
          Rarely worth setting. Perspective <strong>silently truncates</strong> a float
          that lands in an integer column, and one outlier row is enough to make the
          declaration wrong. A float already represents every integer up to 2^53
          exactly, so the default costs nothing.
        </Help>
      </Field>

      <Field label="Build After Rows">
        <Input
          type="number"
          className="h-8 text-sm"
          value={cfg.buildAfterRows ?? ''}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            onChange({ buildAfterRows: Number.isFinite(parsed) ? parsed : undefined });
          }}
          placeholder="(none — wait for the snapshot end token)"
        />
        <Help>
          Backstop for a feed that never signals the end of its snapshot: build the
          Table once this many rows have buffered. Leave empty when the provider sends
          an end token.
        </Help>
      </Field>
    </Card>
  );
}

// ─── shared layout primitives — kept in this file so each transport
//      can drop them in without an extra abstraction layer ──────────

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}
