import { X } from 'lucide-react';
import { IconInput } from '../../../ui/SettingsPanel';
import { Switch } from '@wellsfargo-starui/react';
import { Select } from '../../../ui/NativeOptionsSelect';
import type {
  ColumnFilterConfig,
  FilterKind,
  MultiFilterEntry,
  SetFilterOptions,
} from '../state';
import { ChromeButton } from '../../../ui/ChromeButton';
import { Row } from './Row';

/**
 * Filter-kind editor trio — extracted from ColumnSettingsPanel.tsx during
 * the AUDIT M3 split. Covers:
 *
 *   - FilterEditor       — master enable / kind / floating / buttons /
 *                          debounce / closeOnApply for every filter.
 *   - SetFilterOptionsEditor — set-filter-specific toggles.
 *   - MultiFilterEditor  — sub-filter list with display-mode picker.
 *
 * All three reuse the `Row` primitive and write into `ColumnFilterConfig`
 * via the `onChange` callback the parent editor provides. Pure
 * presentational — draft / save orchestration stays in the parent.
 */

export const FILTER_KIND_OPTIONS: Array<{ value: FilterKind; label: string }> = [
  { value: 'agTextColumnFilter', label: 'Text' },
  { value: 'agNumberColumnFilter', label: 'Number' },
  { value: 'agDateColumnFilter', label: 'Date' },
  { value: 'agSetColumnFilter', label: 'Set (Enterprise)' },
  { value: 'agMultiColumnFilter', label: 'Multi (Enterprise)' },
  // Synthetic — emits agMultiColumnFilter + column-level streamSafeText
  // floating filter (typeable input, clear button, comma-token routing).
  { value: 'streamSafeMultiColumnFilter', label: 'Multi + Stream-Safe Floating Filter (Text)' },
  // Same idea, number-flavoured — operator parser (>100, 100-150,
  // >0 and <50, =100 or =200) plus CSV-as-set-values routing.
  { value: 'streamSafeMultiNumberColumnFilter', label: 'Multi + Stream-Safe Floating Filter (Number)' },
  // Date-flavoured — smart date parsing (ISO, slash/dot, month-name,
  // quarter, year-only, Unix-epoch, today/yesterday) with the same
  // operator + range + and/or compound grammar.
  { value: 'streamSafeMultiDateColumnFilter', label: 'Multi + Stream-Safe Floating Filter (Date)' },
];

const BUTTONS_ALL = ['apply', 'clear', 'reset', 'cancel'] as const;

export function FilterEditor({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: ColumnFilterConfig | undefined;
  onChange: (next: ColumnFilterConfig | undefined) => void;
}) {
  const cfg = value ?? {};

  // Normalise: if the user clears everything the config collapses to undefined
  // so the assignment stays minimal.
  const update = (patch: Partial<ColumnFilterConfig>) => {
    const next: ColumnFilterConfig = { ...cfg, ...patch };
    // Drop empty keys so `isEmptyAssignment` can still collapse.
    (Object.keys(next) as Array<keyof ColumnFilterConfig>).forEach((k) => {
      const v = next[k];
      if (v === undefined) delete next[k];
      if (Array.isArray(v) && v.length === 0) delete next[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
        delete next[k];
      }
    });
    onChange(Object.keys(next).length === 0 ? undefined : next);
  };

  const kind = cfg.kind;
  const enabledState: 'default' | 'on' | 'off' =
    cfg.enabled === false ? 'off' : cfg.enabled === true || kind ? 'on' : 'default';

  return (
    <>
      <Row
        label="FILTER"
        hint='"On" uses the kind below · "Off" disables filtering · "Default" inherits'
        control={
          <Select
            value={enabledState}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'on') update({ enabled: true, kind: kind ?? 'agTextColumnFilter' });
              else if (v === 'off') update({ enabled: false });
              else update({ enabled: undefined });
            }}
            data-testid={`cols-${colId}-filter-enabled`}
            style={{ maxWidth: 180 }}
          >
            <option value="default">Host default</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </Select>
        }
      />

      {enabledState !== 'off' && (
        <>
          <Row
            label="FILTER KIND"
            hint="AG-Grid filter registration name"
            control={
              <Select
                value={kind ?? ''}
                onChange={(e) => {
                  const v = e.target.value as FilterKind | '';
                  // 'streamSafeMulti…ColumnFilter' kinds only do
                  // anything useful with floatingFilter: true (the
                  // whole point is the typeable floating filter).
                  // Auto-enable when the user picks either kind,
                  // unless they had previously disabled the switch.
                  const patch: Partial<ColumnFilterConfig> = { kind: v || undefined };
                  if (
                    (v === 'streamSafeMultiColumnFilter' ||
                      v === 'streamSafeMultiNumberColumnFilter' ||
                      v === 'streamSafeMultiDateColumnFilter') &&
                    cfg.floatingFilter !== false
                  ) {
                    patch.floatingFilter = true;
                  }
                  update(patch);
                }}
                data-testid={`cols-${colId}-filter-kind`}
                style={{ maxWidth: 220 }}
              >
                <option value="">Inherit default</option>
                {FILTER_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({o.value})
                  </option>
                ))}
              </Select>
            }
          />

          <Row
            label="FLOATING FILTER"
            hint="Show the compact filter input under the header"
            control={
              <Switch
                checked={cfg.floatingFilter ?? false}
                onCheckedChange={(checked) => update({ floatingFilter: checked || undefined })}
                data-testid={`cols-${colId}-filter-floating`}
              />
            }
          />

          <Row
            label="BUTTONS"
            hint="Popup buttons shown under the filter controls"
            control={
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {BUTTONS_ALL.map((b) => {
                  const active = (cfg.buttons ?? []).includes(b);
                  return (
                    <ChromeButton
                      key={b}
                      type="button"
                      onClick={() => {
                        const cur = cfg.buttons ?? [];
                        const next = active
                          ? cur.filter((x) => x !== b)
                          : [...cur, b].sort(
                              (a, z) =>
                                BUTTONS_ALL.indexOf(a as typeof BUTTONS_ALL[number]) -
                                BUTTONS_ALL.indexOf(z as typeof BUTTONS_ALL[number]),
                            );
                        update({ buttons: next as ColumnFilterConfig['buttons'] });
                      }}
                      data-testid={`cols-${colId}-filter-btn-${b}`}
                      data-active={active ? 'true' : 'false'}
                      style={{
                        height: 24,
                        padding: '0 10px',
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: active ? 'var(--ds-primary)' : 'var(--ds-border-primary)',
                        background: active
                          ? 'var(--ds-primary-soft)'
                          : 'transparent',
                        color: active ? 'var(--ds-primary)' : 'var(--ds-text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 120ms',
                      }}
                    >
                      {b}
                    </ChromeButton>
                  );
                })}
              </div>
            }
          />

          {kind !== 'agSetColumnFilter' && (
            <Row
              label="DEBOUNCE (MS)"
              hint="Wait N ms after typing before firing · blank = default"
              control={
                <IconInput
                  value={cfg.debounceMs != null ? String(cfg.debounceMs) : ''}
                  numeric
                  suffix="MS"
                  onCommit={(raw) => {
                    if (!raw.trim()) return update({ debounceMs: undefined });
                    const n = Number(raw);
                    if (Number.isFinite(n) && n >= 0) update({ debounceMs: n });
                  }}
                  data-testid={`cols-${colId}-filter-debounce`}
                  className="max-w-[160px]"
                />
              }
            />
          )}

          <Row
            label="CLOSE ON APPLY"
            hint="Auto-close the filter popup when Apply is clicked"
            control={
              <Switch
                checked={cfg.closeOnApply ?? false}
                onCheckedChange={(checked) => update({ closeOnApply: checked || undefined })}
                data-testid={`cols-${colId}-filter-closeonapply`}
              />
            }
          />

          {kind === 'agSetColumnFilter' && (
            <SetFilterOptionsEditor
              colId={colId}
              value={cfg.setFilterOptions}
              onChange={(next) => update({ setFilterOptions: next })}
            />
          )}

          {(
            kind === 'agMultiColumnFilter' ||
            kind === 'streamSafeMultiColumnFilter' ||
            kind === 'streamSafeMultiNumberColumnFilter' ||
            kind === 'streamSafeMultiDateColumnFilter'
          ) && (
            <MultiFilterEditor
              colId={colId}
              value={cfg.multiFilters}
              onChange={(next) => update({ multiFilters: next })}
            />
          )}
        </>
      )}
    </>
  );
}

function SetFilterOptionsEditor({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: SetFilterOptions | undefined;
  onChange: (next: SetFilterOptions | undefined) => void;
}) {
  const s = value ?? {};
  const patch = (next: Partial<SetFilterOptions>) => {
    const merged: SetFilterOptions = { ...s, ...next };
    (Object.keys(merged) as Array<keyof SetFilterOptions>).forEach((k) => {
      if (merged[k] === undefined) delete merged[k];
    });
    onChange(Object.keys(merged).length === 0 ? undefined : merged);
  };
  return (
    <>
      <Row
        label="MINI FILTER"
        hint="Quick-search box at the top of the set-filter popup"
        control={
          <Switch
            checked={!s.suppressMiniFilter}
            onCheckedChange={(checked) => patch({ suppressMiniFilter: !checked || undefined })}
            data-testid={`cols-${colId}-setfilter-minifilter`}
          />
        }
      />
      <Row
        label="SELECT-ALL CHECKBOX"
        control={
          <Switch
            checked={!s.suppressSelectAll}
            onCheckedChange={(checked) => patch({ suppressSelectAll: !checked || undefined })}
            data-testid={`cols-${colId}-setfilter-selectall`}
          />
        }
      />
      <Row
        label="ALPHABETICAL SORT"
        hint="Uncheck to preserve data order"
        control={
          <Switch
            checked={!s.suppressSorting}
            onCheckedChange={(checked) => patch({ suppressSorting: !checked || undefined })}
            data-testid={`cols-${colId}-setfilter-sorting`}
          />
        }
      />
      <Row
        label="EXCEL MODE"
        hint="Mimic Excel's Windows / Mac auto-filter semantics"
        control={
          <Select
            value={s.excelMode ?? 'off'}
            onChange={(e) => {
              const v = e.target.value;
              patch({ excelMode: v === 'windows' || v === 'mac' ? v : undefined });
            }}
            data-testid={`cols-${colId}-setfilter-excel`}
            style={{ maxWidth: 180 }}
          >
            <option value="off">Off</option>
            <option value="windows">Windows</option>
            <option value="mac">Mac</option>
          </Select>
        }
      />
      <Row
        label="DEFAULT TO NOTHING"
        hint="Start with no values selected (otherwise all selected)"
        control={
          <Switch
            checked={s.defaultToNothingSelected ?? false}
            onCheckedChange={(checked) => patch({ defaultToNothingSelected: checked || undefined })}
            data-testid={`cols-${colId}-setfilter-dtn`}
          />
        }
      />
    </>
  );
}

function MultiFilterEditor({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: MultiFilterEntry[] | undefined;
  onChange: (next: MultiFilterEntry[] | undefined) => void;
}) {
  const entries = value ?? [];
  const commit = (next: MultiFilterEntry[]) =>
    onChange(next.length === 0 ? undefined : next);

  return (
    <>
      <Row
        label="SUB-FILTERS"
        hint="Ordered list of filters stacked inside agMultiColumnFilter"
        control={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            {entries.map((entry, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  padding: '4px 6px',
                  borderRadius: 2,
                  border: '1px solid var(--ds-border-primary)',
                  background: 'var(--ds-surface-secondary)',
                }}
              >
                <Select
                  value={entry.filter}
                  onChange={(e) => {
                    const next = [...entries];
                    next[idx] = { ...entry, filter: e.target.value as FilterKind };
                    commit(next);
                  }}
                  data-testid={`cols-${colId}-multi-${idx}-kind`}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {FILTER_KIND_OPTIONS.filter((o) =>
  o.value !== 'agMultiColumnFilter' &&
  o.value !== 'streamSafeMultiColumnFilter' &&
  o.value !== 'streamSafeMultiNumberColumnFilter' &&
  o.value !== 'streamSafeMultiDateColumnFilter'
).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={entry.display ?? 'inline'}
                  onChange={(e) => {
                    const next = [...entries];
                    next[idx] = {
                      ...entry,
                      display: e.target.value as MultiFilterEntry['display'],
                    };
                    commit(next);
                  }}
                  data-testid={`cols-${colId}-multi-${idx}-display`}
                  style={{ maxWidth: 120 }}
                >
                  <option value="inline">Inline</option>
                  <option value="subMenu">Sub-menu</option>
                  <option value="accordion">Accordion</option>
                </Select>
                <ChromeButton
                  type="button"
                  onClick={() => commit(entries.filter((_, i) => i !== idx))}
                  title="Remove sub-filter"
                  data-testid={`cols-${colId}-multi-${idx}-remove`}
                  style={{
                    width: 22,
                    height: 22,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ds-text-muted)',
                    cursor: 'pointer',
                    borderRadius: 2,
                  }}
                >
                  <X size={12} strokeWidth={2} />
                </ChromeButton>
              </div>
            ))}
            <Select
              value=""
              onChange={(e) => {
                const v = e.target.value as FilterKind | '';
                if (!v) return;
                commit([...entries, { filter: v, display: 'inline' }]);
              }}
              data-testid={`cols-${colId}-multi-add`}
              style={{ maxWidth: 280 }}
            >
              <option value="">Add sub-filter…</option>
              {FILTER_KIND_OPTIONS.filter((o) =>
  o.value !== 'agMultiColumnFilter' &&
  o.value !== 'streamSafeMultiColumnFilter' &&
  o.value !== 'streamSafeMultiNumberColumnFilter' &&
  o.value !== 'streamSafeMultiDateColumnFilter'
).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        }
      />
    </>
  );
}
