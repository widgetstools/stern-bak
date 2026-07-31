/**
 * 05 · EDITOR & FILTER — quick-pick cell editor + primary filter kind
 * + floating-filter toggle.
 *
 * Compact surface so the user doesn't have to open the column-settings
 * panel for the common case. Granular config (params, debounce, set-
 * filter options, multi-filter sub-list) stays in the settings panel —
 * a "Custom" badge on the filter dropdown signals when the column
 * carries a non-quick-pickable shape and the dropdown would overwrite
 * it.
 *
 * Filter convention: the dropdown only exposes the platform's
 * streamSafe wrappers (text + number). Both wrappers already bundle
 * `agMultiColumnFilter` with a typed primary + `agSetColumnFilter`,
 * AND wire in a typeable floating-filter input that survives live
 * data updates. Date / boolean / raw AG-Grid kinds aren't quick-
 * pickable here — they belong in the column-settings panel.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Filter, FilterX, MoreVertical, Pencil, X } from 'lucide-react';
import { spacing, typography } from '@wellsfargo-starui/design-system/tokens';
import {
  Input,
  PopoverCompat as Popover,
  Select,
  Tooltip as CustomizerTooltip,
  parseValuesSource,
  useAppDataKeys,
  useAppDataLookup,
  useAppDataProviders,
  type CellEditorKind,
  type FilterKind,
} from '../../../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { Hair, Module, Pill, PillButton, ToolbarSelect, pillClasses } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

const SELECT_KINDS: ReadonlySet<CellEditorKind> = new Set([
  'agSelectCellEditor',
  'agRichSelectCellEditor',
]);

const EDITOR_OPTIONS: ReadonlyArray<{ kind: CellEditorKind; label: string }> = [
  { kind: 'agTextCellEditor',       label: 'Text'        },
  { kind: 'agNumberCellEditor',     label: 'Number'      },
  { kind: 'agSelectCellEditor',     label: 'Select'      },
  { kind: 'agRichSelectCellEditor', label: 'Rich Select' },
  { kind: 'agLargeTextCellEditor',  label: 'Large Text'  },
  { kind: 'agDateCellEditor',       label: 'Date'        },
  { kind: 'agCheckboxCellEditor',   label: 'Checkbox'    },
];

const FILTER_OPTIONS: ReadonlyArray<{ kind: FilterKind; label: string }> = [
  { kind: 'streamSafeMultiColumnFilter',       label: 'Text'   },
  { kind: 'streamSafeMultiNumberColumnFilter', label: 'Number' },
  { kind: 'streamSafeMultiDateColumnFilter',   label: 'Date'   },
];

export function ModuleEditorFilter({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const {
    disabled,
    isHeader,
    cellEditorKind,
    cellEditorValues,
    cellEditorValuesSource,
    filterPrimaryKind,
    filterIsCustom,
    floatingFilterOn,
  } = state;
  // Editor + filter only make sense on cell target — disable when
  // the formatter is in header mode (and when nothing is selected).
  const moduleDisabled = disabled || isHeader;
  const showValuesSource = !moduleDisabled && cellEditorKind != null && SELECT_KINDS.has(cellEditorKind);

  const [valuesOpen, setValuesOpen] = useState(false);

  const editorSelectValue = cellEditorKind ?? '';
  const filterSelectValue = filterIsCustom ? 'custom' : (filterPrimaryKind ?? '');

  return (
    <Module index="05" label="Editor & Filter" testId="fmt-module-editor-filter">
      <div className="inline-flex items-center gap-1.5">
        <ToolbarSelect
          value={editorSelectValue}
          onValueChange={(next) => actions.setCellEditorKind(next as CellEditorKind | undefined)}
          disabled={moduleDisabled}
          icon={<Pencil size={12} strokeWidth={1.75} />}
          placeholder="Editor"
          tooltip="Choose cell editor type (text, number, select, date, …)"
          aria-label="Cell editor"
          data-testid="fmt-editor-select"
          options={[
            { value: '', label: 'None' },
            ...EDITOR_OPTIONS.map((o) => ({ value: o.kind, label: o.label })),
          ]}
        />
        {showValuesSource ? (
          <Popover
            open={valuesOpen}
            onOpenChange={setValuesOpen}
            trigger={
              <CustomizerTooltip content="Configure editor values (static list or app-data binding)">
                <PillButton
                  type="button"
                  aria-label="Configure editor values"
                  className={pillClasses('narrow')}
                  data-testid="fmt-editor-values-trigger"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  <MoreVertical size={11} strokeWidth={2} />
                </PillButton>
              </CustomizerTooltip>
            }
          >
            <ValuesSourcePopover
              key={valuesOpen ? 'open' : 'closed'}
              values={cellEditorValues}
              valuesSource={cellEditorValuesSource}
              onClose={() => setValuesOpen(false)}
              onCommit={(patch) => {
                actions.setCellEditorValues(patch);
                setValuesOpen(false);
              }}
            />
          </Popover>
        ) : null}
      </div>

      <Hair />

      <ToolbarSelect
        value={filterSelectValue}
        onValueChange={(next) => {
          if (next === 'custom') return;
          actions.setFilterPrimaryKind(next ? (next as FilterKind) : undefined);
        }}
        disabled={moduleDisabled || filterIsCustom}
        icon={<Filter size={12} strokeWidth={1.75} />}
        placeholder="Filter"
        tooltip={
          filterIsCustom
            ? 'Filter is custom-configured (open column settings to tune)'
            : 'Choose filter type (text, number, or date — all add a Set filter)'
        }
        aria-label="Column filter"
        data-testid="fmt-filter-select"
        options={[
          { value: '', label: 'None' },
          ...FILTER_OPTIONS.map((o) => ({
            value: o.kind,
            label: (
              <span className="inline-flex w-full items-center gap-2">
                <span className="flex-1">{o.label}</span>
                <span className="font-mono text-[10px] text-[color:var(--ds-text-secondary)]">+ Set</span>
              </span>
            ),
          })),
          ...(filterIsCustom ? [{ value: 'custom', label: 'Custom', disabled: true }] : []),
        ]}
      />

      {/* Floating filter row toggle. */}
      <Pill
        disabled={moduleDisabled}
        active={!moduleDisabled && floatingFilterOn}
        tooltip={floatingFilterOn ? 'Hide floating filter row' : 'Show floating filter row'}
        onClick={actions.toggleFloatingFilter}
        data-testid="fmt-floating-filter-toggle"
      >
        <FilterX size={13} strokeWidth={1.75} />
      </Pill>
    </Module>
  );
}

// ─── Values-source popover (select / rich-select editors) ──────────
//
// Two modes:
//   - Static list — comma-separated literals → cellEditor.values
//   - AppData     — provider+key pickers → cellEditor.valuesSource =
//                   `{{providerName.key}}` (resolved at edit time)
//
// Holds a local draft so the user can experiment without committing.
// Confirm (✓) commits the draft + closes; Cancel (✕) discards +
// closes. The parent re-mounts on each open via `key={open ? 'open' :
// 'closed'}` so the draft is always seeded from the latest props.

function ValuesSourcePopover({
  values,
  valuesSource,
  onClose,
  onCommit,
}: {
  values: ReadonlyArray<string | number> | undefined;
  valuesSource: string | undefined;
  onClose: () => void;
  onCommit: (patch: { values?: Array<string | number> | undefined; valuesSource?: string | undefined }) => void;
}) {
  const lookup = useAppDataLookup();
  const providers = useAppDataProviders(lookup);

  const [draftMode, setDraftMode] = useState<'static' | 'appdata'>(valuesSource ? 'appdata' : 'static');
  const [draftCsv, setDraftCsv] = useState<string>(() => (values ?? []).map(String).join(', '));
  const [draftSource, setDraftSource] = useState<string>(valuesSource ?? '');

  const draftParsed = useMemo(() => parseValuesSource(draftSource), [draftSource]);
  const keys = useAppDataKeys(lookup, draftParsed.providerName);

  // When switching mode, prepopulate the destination field with a
  // sensible default but don't lose the other side's draft (the user
  // can still flip back). The other side's commit just won't fire.
  useEffect(() => {
    if (draftMode === 'appdata' && !draftSource) setDraftSource('{{.}}');
  }, [draftMode, draftSource]);

  const handleConfirm = () => {
    if (draftMode === 'static') {
      const tokens = draftCsv.split(',').map((t) => t.trim()).filter((t) => t !== '');
      onCommit({ values: tokens.length === 0 ? undefined : tokens, valuesSource: undefined });
    } else {
      const trimmed = draftSource.trim();
      // Empty / placeholder binding → treat as cleared.
      const next = trimmed && trimmed !== '{{.}}' ? trimmed : undefined;
      onCommit({ valuesSource: next, values: undefined });
    }
  };

  return (
    <div
      className="fx-menu"
      style={{ width: 320, padding: spacing[2.5], display: 'flex', flexDirection: 'column', gap: spacing[2.5] }}
      data-testid="fmt-editor-values-popover"
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
        else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      }}
    >
      {/* Mode toggle row */}
      <div style={{ display: 'flex', gap: spacing[1.5] }}>
        <PillButton
          type="button"
          className={pillClasses('text')}
          data-on={draftMode === 'static' ? 'true' : undefined}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraftMode('static'); }}
          style={{ flex: 1, justifyContent: 'center' }}
          data-testid="fmt-editor-values-mode-static"
        >
          Static list
        </PillButton>
        <PillButton
          type="button"
          className={pillClasses('text')}
          data-on={draftMode === 'appdata' ? 'true' : undefined}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraftMode('appdata'); }}
          style={{ flex: 1, justifyContent: 'center' }}
          data-testid="fmt-editor-values-mode-appdata"
        >
          App data
        </PillButton>
      </div>

      {draftMode === 'static' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: spacing[1] }}>
          <span style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, letterSpacing: 0.4, opacity: 0.7 }}>
            VALUES (comma-separated)
          </span>
          <Input
            value={draftCsv}
            onChange={(e) => setDraftCsv(e.target.value)}
            placeholder='e.g. BUY, SELL, HOLD'
            data-testid="fmt-editor-values-static-input"
            autoFocus
          />
        </label>
      )}

      {draftMode === 'appdata' && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: spacing[1] }}>
            <span style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, letterSpacing: 0.4, opacity: 0.7 }}>
              PROVIDER
            </span>
            {lookup ? (
              <Select
                value={draftParsed.providerName ?? ''}
                onChange={(e) => {
                  const name = e.target.value;
                  // New provider → reset key so we don't carry a
                  // dangling key into the new namespace.
                  setDraftSource(name ? `{{${name}.}}` : '{{.}}');
                }}
                data-testid="fmt-editor-values-provider"
              >
                <option value="">— pick a provider —</option>
                {providers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            ) : (
              <Input
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value)}
                placeholder="{{providerName.key}}"
                data-testid="fmt-editor-values-source-text"
              />
            )}
          </label>

          {lookup && draftParsed.providerName && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: spacing[1] }}>
              <span style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, letterSpacing: 0.4, opacity: 0.7 }}>
                KEY
              </span>
              <Select
                value={draftParsed.key ?? ''}
                onChange={(e) => {
                  const k = e.target.value;
                  setDraftSource(k ? `{{${draftParsed.providerName}.${k}}}` : `{{${draftParsed.providerName}.}}`);
                }}
                data-testid="fmt-editor-values-key"
              >
                <option value="">— pick a key —</option>
                {keys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Select>
            </label>
          )}
        </>
      )}

      {/* Confirm / Cancel footer — explicit commit so accidental dropdown
          changes don't write to the column until the user confirms. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing[1], marginTop: spacing[0.5] }}>
        <PillButton
          type="button"
          className={pillClasses()}
          aria-label="Cancel"
          title="Cancel (Esc)"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
          data-testid="fmt-editor-values-cancel"
          style={{ color: 'var(--ds-accent-negative)' }}
        >
          <X size={13} strokeWidth={2.25} />
        </PillButton>
        <PillButton
          type="button"
          className={pillClasses()}
          aria-label="Confirm"
          title="Confirm (Enter)"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirm(); }}
          data-testid="fmt-editor-values-confirm"
          style={{ color: 'var(--ds-accent-positive)' }}
        >
          <Check size={13} strokeWidth={2.25} />
        </PillButton>
      </div>
    </div>
  );
}
