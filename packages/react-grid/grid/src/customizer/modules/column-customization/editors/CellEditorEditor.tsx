import { useEffect, useMemo, useState } from 'react';
import { IconInput } from '../../../ui/SettingsPanel';
import { Select } from '../../../ui/NativeOptionsSelect';
import { useGridPlatform } from '../../../hooks/GridProvider';
import type { AppDataLookup } from '@wellsfargo-starui/core';
import type { CellEditorKind, ColumnCellEditorConfig } from '../state';
import { Row } from './Row';

/**
 * Authoring UI for `ColumnAssignment.cellEditor`. Picker for the editor
 * kind, then editor-specific param controls. For select-style editors
 * the values come from one of two sources:
 *
 *   - **Static list** — comma-separated literals typed into a textarea
 *   - **App data source** — `{{providerName.key}}` resolved at edit
 *     time via `platform.resources.appData()`. The picker uses two
 *     dropdowns (provider name + key) populated from the live
 *     `AppDataLookup`, so the user composes a binding without typing
 *     the syntax. The composed token is stored back as the canonical
 *     `valuesSource` string — degrades gracefully if the AppData
 *     lookup isn't available (the picker falls back to a free-text
 *     input that accepts the same syntax).
 *
 * No live preview yet — the picker shows what's available; resolved
 * values appear when the user actually opens the cell editor in the
 * grid. Future: surface a 3-line preview of the current resolved
 * array so authors can sanity-check their binding.
 */

const EDITOR_KIND_OPTIONS: Array<{ value: CellEditorKind; label: string; hint: string }> = [
  { value: 'agTextCellEditor',       label: 'Text',         hint: 'Single-line text input.' },
  { value: 'agLargeTextCellEditor',  label: 'Large text',   hint: 'Multi-line text area for long strings.' },
  { value: 'agNumberCellEditor',     label: 'Number',       hint: 'Numeric input with optional min/max/step.' },
  { value: 'agDateCellEditor',       label: 'Date',         hint: 'Native date picker.' },
  { value: 'agCheckboxCellEditor',   label: 'Checkbox',     hint: 'True/false toggle.' },
  { value: 'agSelectCellEditor',     label: 'Select',       hint: 'Dropdown with a fixed list of values.' },
  { value: 'agRichSelectCellEditor', label: 'Rich select',  hint: 'Dropdown with search + virtualised options.' },
];

const SELECT_KINDS: ReadonlySet<CellEditorKind> = new Set([
  'agSelectCellEditor',
  'agRichSelectCellEditor',
]);

export function CellEditorEditor({
  colId,
  value,
  onChange,
}: {
  colId: string;
  value: ColumnCellEditorConfig | undefined;
  onChange: (next: ColumnCellEditorConfig | undefined) => void;
}) {
  const cfg = value;
  const update = (patch: Partial<ColumnCellEditorConfig>) => {
    if (!cfg) {
      // Caller is committing on a previously-undefined config → kind
      // must be present in the patch for the result to be meaningful.
      if (!patch.kind) return;
      onChange({ ...(patch as ColumnCellEditorConfig), kind: patch.kind });
      return;
    }
    const next: ColumnCellEditorConfig = { ...cfg, ...patch };
    // Drop empty optional keys so isEmptyAssignment can still collapse.
    if (next.values && next.values.length === 0) delete next.values;
    if (next.valuesSource === '') delete next.valuesSource;
    if (next.params && Object.keys(next.params).length === 0) delete next.params;
    onChange(next);
  };

  const kind = cfg?.kind;

  return (
    <>
      <Row
        label="EDITOR"
        hint={
          kind
            ? EDITOR_KIND_OPTIONS.find((o) => o.value === kind)?.hint ?? ''
            : 'No editor — column inherits its host default'
        }
        control={
          <Select
            value={kind ?? ''}
            onChange={(e) => {
              const v = e.target.value as CellEditorKind | '';
              if (!v) {
                onChange(undefined);
                return;
              }
              // Switching away from a select-style editor clears the
              // values / valuesSource so they don't ride along into
              // a kind that doesn't consume them.
              const wasSelect = kind && SELECT_KINDS.has(kind);
              const isSelect = SELECT_KINDS.has(v);
              if (wasSelect && !isSelect) {
                onChange({ kind: v });
              } else {
                update({ kind: v });
              }
            }}
            data-testid={`cols-${colId}-celleditor-kind`}
            style={{ maxWidth: 220 }}
          >
            <option value="">None</option>
            {EDITOR_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        }
      />

      {kind && SELECT_KINDS.has(kind) && (
        <SelectValuesEditor colId={colId} cfg={cfg!} update={update} />
      )}

      {kind === 'agTextCellEditor' && (
        <TextParamsEditor colId={colId} cfg={cfg!} update={update} />
      )}

      {kind === 'agNumberCellEditor' && (
        <NumberParamsEditor colId={colId} cfg={cfg!} update={update} />
      )}

      {kind === 'agLargeTextCellEditor' && (
        <LargeTextParamsEditor colId={colId} cfg={cfg!} update={update} />
      )}
    </>
  );
}

// ─── Select-editor values authoring ────────────────────────────────────────

function SelectValuesEditor({
  colId,
  cfg,
  update,
}: {
  colId: string;
  cfg: ColumnCellEditorConfig;
  update: (patch: Partial<ColumnCellEditorConfig>) => void;
}) {
  // Source picker — static literal list vs AppData binding. Stored
  // implicitly: when valuesSource is set, we're in 'appdata' mode.
  const sourceMode: 'static' | 'appdata' = cfg.valuesSource ? 'appdata' : 'static';
  const appData = useAppDataLookup();
  const providers = useAppDataProviders(appData);

  return (
    <>
      <Row
        label="VALUE SOURCE"
        hint={
          sourceMode === 'appdata'
            ? 'Resolved at edit time from AppData. Edits to the source reflect on next open.'
            : 'Comma-separated literals used as-is.'
        }
        control={
          <Select
            value={sourceMode}
            onChange={(e) => {
              const next = e.target.value as 'static' | 'appdata';
              if (next === 'static') {
                update({ valuesSource: undefined });
              } else {
                update({ values: undefined });
              }
            }}
            data-testid={`cols-${colId}-celleditor-value-source`}
            style={{ maxWidth: 200 }}
          >
            <option value="static">Static list</option>
            <option value="appdata">App data source</option>
          </Select>
        }
      />

      {sourceMode === 'static' && (
        <Row
          label="VALUES"
          hint='Comma-separated. e.g. "BUY, SELL, HOLD"'
          control={
            <IconInput
              value={(cfg.values ?? []).map((v) => String(v)).join(', ')}
              onCommit={(raw) => {
                const tokens = raw.split(',').map((t) => t.trim()).filter((t) => t !== '');
                update({ values: tokens });
              }}
              data-testid={`cols-${colId}-celleditor-static-values`}
              className="max-w-[360px]"
            />
          }
        />
      )}

      {sourceMode === 'appdata' && (
        <AppDataSourcePicker
          colId={colId}
          valuesSource={cfg.valuesSource}
          providers={providers}
          appData={appData}
          onChange={(next) => update({ valuesSource: next })}
        />
      )}
    </>
  );
}

function AppDataSourcePicker({
  colId,
  valuesSource,
  providers,
  appData,
  onChange,
}: {
  colId: string;
  valuesSource: string | undefined;
  providers: string[];
  appData: AppDataLookup | undefined;
  onChange: (next: string | undefined) => void;
}) {
  // Decompose the current `{{name.key}}` so the dropdowns reflect it.
  const parsed = useMemo(() => parseValuesSource(valuesSource), [valuesSource]);
  const keys = useAppDataKeys(appData, parsed.providerName);

  // Free-text fallback when the lookup isn't available. The user can
  // still hand-author a {{name.key}} binding; we just can't help them
  // pick from a list.
  if (!appData || !appData.listProviders) {
    return (
      <Row
        label="VALUE BINDING"
        hint='Format: {{providerName.key}}. AppData not available in this grid.'
        control={
          <IconInput
            value={valuesSource ?? ''}
            onCommit={(v) => onChange(v.trim() === '' ? undefined : v.trim())}
            data-testid={`cols-${colId}-celleditor-source-text`}
            className="max-w-[360px]"
          />
        }
      />
    );
  }

  return (
    <>
      <Row
        label="PROVIDER"
        hint="Named AppData provider"
        control={
          <Select
            value={parsed.providerName ?? ''}
            onChange={(e) => {
              const name = e.target.value;
              if (!name) {
                onChange(undefined);
                return;
              }
              // Switching providers nukes the key so we don't carry a
              // dangling reference into the new provider's namespace.
              onChange(`{{${name}.}}`);
            }}
            data-testid={`cols-${colId}-celleditor-source-provider`}
            className="max-w-[240px]"
          >
            <option value="">— pick a provider —</option>
            {providers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        }
      />

      {parsed.providerName && (
        <Row
          label="KEY"
          hint="Key within the provider whose value is the dropdown list"
          control={
            <Select
              value={parsed.key ?? ''}
              onChange={(e) => {
                const k = e.target.value;
                if (!k) {
                  onChange(`{{${parsed.providerName}.}}`);
                  return;
                }
                onChange(`{{${parsed.providerName}.${k}}}`);
              }}
              data-testid={`cols-${colId}-celleditor-source-key`}
              className="max-w-[240px]"
            >
              <option value="">— pick a key —</option>
              {keys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
          }
        />
      )}
    </>
  );
}

// ─── Text / number / large-text param panels ───────────────────────────────

function TextParamsEditor({
  colId,
  cfg,
  update,
}: {
  colId: string;
  cfg: ColumnCellEditorConfig;
  update: (patch: Partial<ColumnCellEditorConfig>) => void;
}) {
  const params = cfg.params ?? {};
  return (
    <Row
      label="MAX LENGTH"
      hint="Maximum character count. Blank = no limit."
      control={
        <IconInput
          value={params.maxLength != null ? String(params.maxLength) : ''}
          numeric
          onCommit={(raw) => {
            const next = { ...params };
            if (!raw.trim()) delete next.maxLength;
            else {
              const n = Number(raw);
              if (Number.isFinite(n) && n > 0) next.maxLength = n;
            }
            update({ params: next });
          }}
          data-testid={`cols-${colId}-celleditor-text-maxlength`}
          className="max-w-[160px]"
        />
      }
    />
  );
}

function NumberParamsEditor({
  colId,
  cfg,
  update,
}: {
  colId: string;
  cfg: ColumnCellEditorConfig;
  update: (patch: Partial<ColumnCellEditorConfig>) => void;
}) {
  const params = cfg.params ?? {};
  const setNumeric = (key: string, raw: string) => {
    const next = { ...params };
    if (!raw.trim()) delete next[key];
    else {
      const n = Number(raw);
      if (Number.isFinite(n)) next[key] = n;
    }
    update({ params: next });
  };
  return (
    <>
      <Row
        label="MIN"
        hint="Minimum allowed value (inclusive)."
        control={
          <IconInput
            value={params.min != null ? String(params.min) : ''}
            numeric
            onCommit={(v) => setNumeric('min', v)}
            data-testid={`cols-${colId}-celleditor-num-min`}
            className="max-w-[160px]"
          />
        }
      />
      <Row
        label="MAX"
        hint="Maximum allowed value (inclusive)."
        control={
          <IconInput
            value={params.max != null ? String(params.max) : ''}
            numeric
            onCommit={(v) => setNumeric('max', v)}
            data-testid={`cols-${colId}-celleditor-num-max`}
            className="max-w-[160px]"
          />
        }
      />
      <Row
        label="STEP"
        hint="Increment for arrow keys. Blank = native default."
        control={
          <IconInput
            value={params.step != null ? String(params.step) : ''}
            numeric
            onCommit={(v) => setNumeric('step', v)}
            data-testid={`cols-${colId}-celleditor-num-step`}
            className="max-w-[160px]"
          />
        }
      />
      <Row
        label="PRECISION"
        hint="Decimal places stored on commit. Blank = no rounding."
        control={
          <IconInput
            value={params.precision != null ? String(params.precision) : ''}
            numeric
            onCommit={(v) => setNumeric('precision', v)}
            data-testid={`cols-${colId}-celleditor-num-precision`}
            className="max-w-[160px]"
          />
        }
      />
    </>
  );
}

function LargeTextParamsEditor({
  colId,
  cfg,
  update,
}: {
  colId: string;
  cfg: ColumnCellEditorConfig;
  update: (patch: Partial<ColumnCellEditorConfig>) => void;
}) {
  const params = cfg.params ?? {};
  const setNumeric = (key: string, raw: string) => {
    const next = { ...params };
    if (!raw.trim()) delete next[key];
    else {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) next[key] = n;
    }
    update({ params: next });
  };
  return (
    <>
      <Row
        label="ROWS"
        control={
          <IconInput
            value={params.rows != null ? String(params.rows) : ''}
            numeric
            onCommit={(v) => setNumeric('rows', v)}
            data-testid={`cols-${colId}-celleditor-lt-rows`}
            className="max-w-[160px]"
          />
        }
      />
      <Row
        label="COLS"
        control={
          <IconInput
            value={params.cols != null ? String(params.cols) : ''}
            numeric
            onCommit={(v) => setNumeric('cols', v)}
            data-testid={`cols-${colId}-celleditor-lt-cols`}
            className="max-w-[160px]"
          />
        }
      />
      <Row
        label="MAX LENGTH"
        hint="Maximum character count. Blank = no limit."
        control={
          <IconInput
            value={params.maxLength != null ? String(params.maxLength) : ''}
            numeric
            onCommit={(v) => setNumeric('maxLength', v)}
            data-testid={`cols-${colId}-celleditor-lt-maxlength`}
            className="max-w-[160px]"
          />
        }
      />
    </>
  );
}

// ─── AppData hooks ─────────────────────────────────────────────────────────

/** Read the platform's AppData adapter. May be undefined when the host
 *  didn't plumb one in — callers must handle that gracefully. */
export function useAppDataLookup(): AppDataLookup | undefined {
  const platform = useGridPlatform();
  return platform.resources.appData?.();
}

/** Reactive snapshot of provider names. Uses useState+useEffect rather
 *  than useSyncExternalStore because `lookup.listProviders()` returns a
 *  fresh array each call — useSyncExternalStore requires getSnapshot to
 *  return a stable reference for unchanged state, which we can't
 *  guarantee through a pure-fn boundary. The store-fed pattern below
 *  caches the array in component state and only updates it when the
 *  subscribe-notify fires. */
export function useAppDataProviders(lookup: AppDataLookup | undefined): string[] {
  const [providers, setProviders] = useState<string[]>(() =>
    lookup?.listProviders ? lookup.listProviders() : [],
  );
  useEffect(() => {
    if (!lookup) {
      setProviders([]);
      return;
    }
    const refresh = () => {
      setProviders(lookup.listProviders ? lookup.listProviders() : []);
    };
    refresh();
    return lookup.subscribe?.(refresh);
  }, [lookup]);
  return providers;
}

/** Reactive snapshot of available keys for a given provider. Empty
 *  array when the provider name is undefined or the lookup doesn't
 *  expose `keysOf`. Same useState+useEffect pattern as
 *  useAppDataProviders for the same reason. */
export function useAppDataKeys(lookup: AppDataLookup | undefined, providerName: string | undefined): string[] {
  const [keys, setKeys] = useState<string[]>(() =>
    lookup?.keysOf && providerName ? lookup.keysOf(providerName) : [],
  );
  useEffect(() => {
    if (!lookup || !providerName) {
      setKeys([]);
      return;
    }
    const refresh = () => {
      setKeys(lookup.keysOf && providerName ? lookup.keysOf(providerName) : []);
    };
    refresh();
    return lookup.subscribe?.(refresh);
  }, [lookup, providerName]);
  return keys;
}

// ─── Source-string parsing ─────────────────────────────────────────────────

export function parseValuesSource(source: string | undefined): { providerName: string | undefined; key: string | undefined } {
  if (!source) return { providerName: undefined, key: undefined };
  const m = /^\s*\{\{\s*([^.{}]+?)\s*\.\s*([^{}]*?)\s*\}\}\s*$/.exec(source);
  if (!m) return { providerName: undefined, key: undefined };
  return { providerName: m[1], key: m[2] || undefined };
}
