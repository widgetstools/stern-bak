import { Caps, IconInput } from '../../../ui/SettingsPanel';
import { Switch, Textarea } from '@wellsfargo-starui/react';
import { Select } from '../../../ui/NativeOptionsSelect';
import { useModuleState } from '../../../hooks/useModuleState';
import type { GeneralSettingsState } from '@wellsfargo-starui/core';
import type { AggFuncName, RowGroupingConfig } from '@wellsfargo-starui/core';
import { Row } from './Row';

/**
 * Row-grouping / aggregation editor — extracted from ColumnSettingsPanel
 * during the AUDIT M3 split. Drives `RowGroupingConfig` for the column and
 * a handful of grid-level controls on `general-settings` (groupDisplayType,
 * groupTotalRow, grandTotalRow, suppressAggFuncInHeader) so the user can
 * see + tune both layers in one place.
 */

const AGG_FUNC_OPTIONS: Array<{ value: AggFuncName | ''; label: string }> = [
  { value: '', label: '— none —' },
  { value: 'sum', label: 'Sum' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'avg', label: 'Average' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
  { value: 'custom', label: 'Custom expression…' },
];

export function RowGroupingEditor({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: RowGroupingConfig | undefined;
  onChange: (next: RowGroupingConfig | undefined) => void;
}) {
  const [gridOpts, setGridOpts] = useModuleState<GeneralSettingsState>('general-settings');

  const cfg = value ?? {};
  const update = (patch: Partial<RowGroupingConfig>) => {
    const next: RowGroupingConfig = { ...cfg, ...patch };
    // Drop empty keys so the assignment can still collapse to undefined.
    (Object.keys(next) as Array<keyof RowGroupingConfig>).forEach((k) => {
      const v = next[k];
      if (v === undefined) delete next[k];
      if (Array.isArray(v) && v.length === 0) delete next[k];
    });
    onChange(Object.keys(next).length === 0 ? undefined : next);
  };

  const patchGrid = (patch: Partial<GeneralSettingsState>) => {
    setGridOpts((prev) => ({ ...(prev ?? ({} as GeneralSettingsState)), ...patch }) as GeneralSettingsState);
  };

  return (
    <>
      <Row
        label="ENABLE ROW GROUP"
        hint="Show this column as a drop target in the Row Groups tool panel"
        control={
          <Switch
            checked={cfg.enableRowGroup ?? false}
            onCheckedChange={(checked) => update({ enableRowGroup: checked || undefined })}
            data-testid={`cols-${colId}-rg-enable-rowgroup`}
          />
        }
      />
      <Row
        label="GROUP ON LOAD"
        hint="Start the grid with this column actively row-grouped"
        control={
          <Switch
            checked={cfg.rowGroup ?? false}
            onCheckedChange={(checked) => update({ rowGroup: checked || undefined })}
            data-testid={`cols-${colId}-rg-rowgroup`}
          />
        }
      />
      {(cfg.rowGroup ?? false) && (
        <Row
          label="GROUP ORDER"
          hint="0-based ordering when multiple columns are grouped"
          control={
            <IconInput
              value={cfg.rowGroupIndex != null ? String(cfg.rowGroupIndex) : ''}
              numeric
              onCommit={(raw) => {
                if (!raw.trim()) return update({ rowGroupIndex: undefined });
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 0) update({ rowGroupIndex: Math.floor(n) });
              }}
              data-testid={`cols-${colId}-rg-rowgroup-index`}
              className="max-w-[120px]"
            />
          }
        />
      )}

      <Row
        label="ENABLE VALUE"
        hint="Allow this column to be used as an aggregation value in the tool panel"
        control={
          <Switch
            checked={cfg.enableValue ?? false}
            onCheckedChange={(checked) => update({ enableValue: checked || undefined })}
            data-testid={`cols-${colId}-rg-enable-value`}
          />
        }
      />
      <Row
        label="AGG FUNCTION"
        hint="Built-in aggregation or a custom expression"
        control={
          <Select
            value={cfg.aggFunc ?? ''}
            onChange={(e) => {
              const v = e.target.value as AggFuncName | '';
              update({ aggFunc: v === '' ? undefined : v });
            }}
            data-testid={`cols-${colId}-rg-aggfunc`}
            style={{ maxWidth: 220 }}
          >
            {AGG_FUNC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        }
      />
      {cfg.aggFunc === 'custom' && (
        <Row
          label="CUSTOM EXPRESSION"
          hint={`Aggregate values array = [value] · try "SUM([value]) * 1.1"`}
          control={
            // shadcn Textarea — no native `<textarea>` anywhere in
            // settings-panel surfaces (per the v4 UI-primitives rule).
            <Textarea
              value={cfg.customAggExpression ?? ''}
              onChange={(e) => update({ customAggExpression: e.target.value || undefined })}
              data-testid={`cols-${colId}-rg-custom-expr`}
              placeholder="SUM([value])"
              spellCheck={false}
              style={{
                width: '100%',
                minHeight: 56,
                fontFamily: 'var(--ds-font-mono)',
                fontSize: 11,
                lineHeight: 1.5,
                resize: 'vertical',
              }}
            />
          }
        />
      )}

      <Row
        label="ENABLE PIVOT"
        hint="Allow this column to be used as a pivot in the tool panel"
        control={
          <Switch
            checked={cfg.enablePivot ?? false}
            onCheckedChange={(checked) => update({ enablePivot: checked || undefined })}
            data-testid={`cols-${colId}-rg-enable-pivot`}
          />
        }
      />
      <Row
        label="PIVOT ON LOAD"
        hint="Start the grid with this column actively pivoted"
        control={
          <Switch
            checked={cfg.pivot ?? false}
            onCheckedChange={(checked) => update({ pivot: checked || undefined })}
            data-testid={`cols-${colId}-rg-pivot`}
          />
        }
      />
      {(cfg.pivot ?? false) && (
        <Row
          label="PIVOT ORDER"
          hint="0-based ordering when multiple columns are pivoted"
          control={
            <IconInput
              value={cfg.pivotIndex != null ? String(cfg.pivotIndex) : ''}
              numeric
              onCommit={(raw) => {
                if (!raw.trim()) return update({ pivotIndex: undefined });
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 0) update({ pivotIndex: Math.floor(n) });
              }}
              data-testid={`cols-${colId}-rg-pivot-index`}
              className="max-w-[120px]"
            />
          }
        />
      )}

      {/* ── Grid-level controls ─────────────────────────────────────────
         These settings apply globally to the whole grid (not just this
         column) but are surfaced here because they directly affect how
         the per-column aggFunc values show up. They read / write the
         general-settings module state — same source as the Grid Options
         panel. */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 8,
          borderTop: '1px dashed var(--ds-border-primary)',
        }}
      >
        <Caps size="2xs" color="var(--ds-text-muted)">
          Grid-level · applies to every column
        </Caps>
      </div>

      <Row
        label="GROUP DISPLAY"
        hint='"groupRows" shows aggs inline on the value columns of each group row'
        control={
          <Select
            value={gridOpts?.groupDisplayType ?? ''}
            onChange={(e) => {
              const v = e.target.value as GeneralSettingsState['groupDisplayType'] | '';
              patchGrid({ groupDisplayType: v === '' ? undefined : v });
            }}
            data-testid={`cols-${colId}-rg-grid-groupdisplay`}
            style={{ maxWidth: 220 }}
          >
            <option value="">AG-Grid default</option>
            <option value="singleColumn">singleColumn</option>
            <option value="multipleColumns">multipleColumns</option>
            <option value="groupRows">groupRows</option>
            <option value="custom">custom</option>
          </Select>
        }
      />
      <Row
        label="GROUP SUBTOTAL ROW"
        hint="Insert an aggregate row per group (subtotal)"
        control={
          <Select
            value={gridOpts?.groupTotalRow ?? ''}
            onChange={(e) => {
              const v = e.target.value as GeneralSettingsState['groupTotalRow'] | '';
              patchGrid({ groupTotalRow: v === '' ? undefined : v });
            }}
            data-testid={`cols-${colId}-rg-grid-grouptotal`}
            style={{ maxWidth: 180 }}
          >
            <option value="">Off</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </Select>
        }
      />
      <Row
        label="GRAND TOTAL ROW"
        hint="Insert an aggregate row for the whole dataset"
        control={
          <Select
            value={gridOpts?.grandTotalRow ?? ''}
            onChange={(e) => {
              const v = e.target.value as GeneralSettingsState['grandTotalRow'] | '';
              patchGrid({ grandTotalRow: v === '' ? undefined : v });
            }}
            data-testid={`cols-${colId}-rg-grid-grandtotal`}
            style={{ maxWidth: 200 }}
          >
            <option value="">Off</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="pinnedTop">Pinned top</option>
            <option value="pinnedBottom">Pinned bottom</option>
          </Select>
        }
      />
      <Row
        label="HIDE AGG IN HEADER"
        hint='Hides the "Sum(Price)" / "Avg(Yield)" prefix — header shows the column name only'
        control={
          <Switch
            checked={gridOpts?.suppressAggFuncInHeader ?? false}
            onCheckedChange={(checked) => patchGrid({ suppressAggFuncInHeader: checked })}
            data-testid={`cols-${colId}-rg-grid-suppressaggheader`}
          />
        }
      />
    </>
  );
}
