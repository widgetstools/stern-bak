/**
 * Declarative field schema + renderer for the GridOptionsPanel.
 *
 * Why schema-driven: the v2-verbatim panel was 1400 LOC of hand-rolled
 * JSX for ~80 controls. Every field is a `<Row label control={...}>` with
 * the SAME row shape, just a different control underneath. Making fields
 * data lets us:
 *   - collapse 1400 LOC → ~150 LOC of schema data + this renderer,
 *   - test the renderer once instead of 80× separately,
 *   - extend a new tier by adding a record to the schema, not a new JSX block.
 *
 * Visual fidelity is guaranteed because the renderer emits the SAME
 * `<Band>` + `<Row label hint control>` markup v2 uses. The Cockpit
 * primitives (Band, Row, SubLabel, SharpBtn, ...) are unchanged from
 * v2-baseline, so the pixel-rendering is identical.
 */
import type { ReactNode } from 'react';
import {
  Band,
  IconInput,
  SettingsRow,
  SubLabel,
} from '../../ui/SettingsPanel';
import { Switch } from '@wellsfargo-starui/react';
import { Select } from '../../ui/NativeOptionsSelect';
import type { GeneralSettingsState } from '@wellsfargo-starui/core';
import { useCapabilityGate, type CapabilityName } from '../../hooks/useCapability';

// ─── Row primitive ────────────────────────────────────────────────────
//
// Re-export the shared `SettingsRow` under the `Row` name so the rest
// of this file (and consumers of the public `RowProps` type) keep
// reading naturally. Every editor in the Grid Customizer routes
// through the same primitive — same label gutter, same alignment, same
// hint placement.
const Row = SettingsRow;
export type { SettingsRowProps as RowProps } from '../../ui/SettingsPanel';

// ─── Control primitives ────────────────────────────────────────────────
//
// Each thin control aligns v2's inline patterns. Size + padding + colour
// come from the Cockpit `--ck-*` token system on `.ds-sheet-v2` so the
// look is unchanged from v2-baseline.

export function BoolControl({ checked, onChange, testId, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  );
}

export function NumberControl({
  value,
  onChange,
  min,
  suffix,
  testId,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  suffix?: string;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <IconInput
      value={String(value)}
      numeric
      suffix={suffix}
      disabled={disabled}
      onCommit={(raw) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (min != null && n < min) return onChange(min);
        onChange(n);
      }}
      data-testid={testId}
      className="max-w-[180px]"
    />
  );
}

/**
 * Optional-number control — emits `undefined` on empty / invalid, a number
 * otherwise. Used for DEFAULT COLDEF's max-width / width / flex which
 * have no sensible default value.
 */
function OptNumberControl({
  value,
  onChange,
  min,
  max,
  suffix,
  testId,
  placeholder = 'auto',
  disabled,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  suffix?: string;
  testId?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <IconInput
      value={value === undefined ? '' : String(value)}
      numeric
      suffix={suffix}
      placeholder={placeholder}
      disabled={disabled}
      onCommit={(raw) => {
        if (raw.trim() === '') return onChange(undefined);
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (min != null && n < min) return;
        if (max != null && n > max) return;
        onChange(n);
      }}
      data-testid={testId}
      className="max-w-[180px]"
    />
  );
}

function TextControl({
  value,
  onChange,
  placeholder,
  testId,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <IconInput
      value={value}
      onCommit={onChange}
      placeholder={placeholder}
      disabled={disabled}
      data-testid={testId}
      className="max-w-[280px]"
    />
  );
}

// ─── Select with sentinel-encoded `undefined` / `''` values ────────────
//
// HTML `<select>` values are strings. Grid Options state carries
// `undefined` (e.g. `rowSelection: undefined` = "off") and `''`
// (e.g. `clipboardDelimiter: '\t'` where empty means "tab"). Encode
// those through sentinels so the select round-trips without losing
// the narrowed union type.

const SEL_NONE = '__none__';
const SEL_EMPTY = '__empty__';

function encode(v: unknown): string {
  if (v === undefined) return SEL_NONE;
  if (v === '') return SEL_EMPTY;
  return String(v);
}

function decode<T>(encoded: string, options: ReadonlyArray<{ value: T }>): T {
  if (encoded === SEL_NONE) return undefined as unknown as T;
  if (encoded === SEL_EMPTY) return '' as unknown as T;
  const hit = options.find((o) => encode(o.value) === encoded);
  return hit ? hit.value : (encoded as unknown as T);
}

function SelectControl<T extends string | undefined | boolean | number>({
  value,
  onChange,
  options,
  testId,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={encode(value)}
      onChange={(e) => onChange(decode<T>(e.target.value, options))}
      disabled={disabled}
      data-testid={testId}
      style={{ maxWidth: 240, flex: '1 1 auto' }}
    >
      {options.map((opt) => (
        <option key={encode(opt.value)} value={encode(opt.value)}>
          {opt.label}
        </option>
      ))}
    </Select>
  );
}

// ─── Field schema ─────────────────────────────────────────────────────

type StateKey = keyof GeneralSettingsState;

/**
 * Deep-typed helper: asserts that the given `key` is of type T on the
 * state object. Guards the rendering functions against accidental
 * mismatched keys at the schema level.
 */
type KeyOfType<S, T> = { [K in keyof S]: S[K] extends T ? K : never }[keyof S];

export type Field =
  | {
      kind: 'bool';
      key: KeyOfType<GeneralSettingsState, boolean>;
      label: string;
      hint?: string;
      testId: string;
      /** When true, the UI switch shows the INVERSE of the state value.
       *  Used for tokens like `suppressGroupRowsSticky` where the label
       *  in the UI is "STICKY GROUPS" (positive) but the underlying
       *  option is a suppress-flag. */
      invert?: boolean;
    }
  | { kind: 'num'; key: KeyOfType<GeneralSettingsState, number>; label: string; hint?: string; testId: string; min?: number; suffix?: string }
  | { kind: 'optNum'; key: KeyOfType<GeneralSettingsState, number | undefined>; label: string; hint?: string; testId: string; min?: number; max?: number; suffix?: string; placeholder?: string }
  | { kind: 'text'; key: KeyOfType<GeneralSettingsState, string>; label: string; hint?: string; testId: string; placeholder?: string }
  | {
      kind: 'select';
      key: StateKey;
      label: string;
      hint?: string;
      testId: string;
      options: ReadonlyArray<{ value: unknown; label: string }>;
    }
  | { kind: 'subsection'; title: string; fields: ReadonlyArray<Field> }
  | {
      kind: 'conditional';
      /** Show these fields only when `show(state)` is true. */
      show: (state: GeneralSettingsState) => boolean;
      fields: ReadonlyArray<Field>;
    }
  | {
      /**
       * Fields AG-Grid only honours where a `platform.data` capability holds.
       *
       * The panel emits every grid option to whichever surface is mounted, so
       * an option the row model ignores is a control that accepts input and
       * does nothing — the silent no-op this roadmap phase exists to remove.
       * Declaring the requirement here rather than branching keeps the module
       * free of row-model knowledge (binding constraint 3): it names the
       * condition, and the platform answers it.
       *
       * Fields stay VISIBLE and become disabled, with the verdict's own
       * user-facing copy taking over the hint. Hiding them would lose a
       * setting the user has already saved, and would make the panel's
       * contents depend on which grid it was opened over.
       */
      kind: 'capability';
      capability: CapabilityName;
      /** Which side of the verdict these fields need. Default `true`. */
      expect?: boolean;
      /** Control-specific copy. Defaults to the verdict's own wording, and is
       *  the only copy available in the `expect: false` direction. */
      unavailableReason?: string;
      fields: ReadonlyArray<Field>;
    }
  | {
      /** Custom control escape hatch. Renders an arbitrary React element.
       *  Used for the one-off PAGINATION page-size + auto row where the
       *  row's right column contains two controls side-by-side. */
      kind: 'custom';
      label: string;
      hint?: string;
      testId: string;
      render: (
        state: GeneralSettingsState,
        update: <K extends StateKey>(key: K, value: GeneralSettingsState[K]) => void,
      ) => ReactNode;
    };

export interface BandSchema {
  index: string;
  title: string;
  fields: ReadonlyArray<Field>;
}

export interface FieldRendererProps {
  field: Field;
  state: GeneralSettingsState;
  update: <K extends StateKey>(key: K, value: GeneralSettingsState[K]) => void;
  /** Set by an enclosing `capability` container whose requirement is unmet.
   *  Threaded through containers so a nested field is disabled too. */
  disabled?: boolean;
  /** The reason copy that container carries, shown in place of the field's
   *  own hint — the panel's hint slot already means "what this control does",
   *  and for a control that cannot act, the reason IS that. */
  disabledHint?: string;
}

// ─── Renderer ─────────────────────────────────────────────────────────

/**
 * Walk a band's field tree and return every declared `state` key that the
 * panel writes to. Subsection / conditional containers are recursed into;
 * `custom` fields are skipped (their key mapping is owned by the panel —
 * see `CUSTOM_FIELD_STATE_KEYS` in GridOptionsPanel).
 *
 * Used to compute per-band "overrides" badges in the sidebar nav.
 */
export function collectFieldKeys(
  fields: ReadonlyArray<Field>,
): Array<keyof GeneralSettingsState> {
  const out: Array<keyof GeneralSettingsState> = [];
  for (const f of fields) {
    switch (f.kind) {
      case 'bool':
      case 'num':
      case 'optNum':
      case 'text':
      case 'select':
        out.push(f.key as keyof GeneralSettingsState);
        break;
      case 'subsection':
      case 'conditional':
      case 'capability':
        out.push(...collectFieldKeys(f.fields));
        break;
      case 'custom':
        break;
    }
  }
  return out;
}

export function FieldRenderer({
  field,
  state,
  update,
  disabled,
  disabledHint,
}: FieldRendererProps) {
  const hintOf = (own?: string) => (disabled && disabledHint ? disabledHint : own);
  switch (field.kind) {
    case 'bool': {
      const stored = state[field.key] as boolean;
      const shown = field.invert ? !stored : stored;
      return (
        <Row label={field.label} hint={hintOf(field.hint)} control={
          <BoolControl
            checked={shown}
            onChange={(v) => update(field.key, (field.invert ? !v : v) as GeneralSettingsState[typeof field.key])}
            testId={field.testId}
            disabled={disabled}
          />
        } />
      );
    }
    case 'num':
      return (
        <Row label={field.label} hint={hintOf(field.hint)} control={
          <NumberControl
            value={state[field.key]}
            onChange={(v) => update(field.key, v as GeneralSettingsState[typeof field.key])}
            min={field.min}
            suffix={field.suffix}
            testId={field.testId}
            disabled={disabled}
          />
        } />
      );
    case 'optNum':
      return (
        <Row label={field.label} hint={hintOf(field.hint)} control={
          <OptNumberControl
            value={state[field.key]}
            onChange={(v) => update(field.key, v as GeneralSettingsState[typeof field.key])}
            min={field.min}
            max={field.max}
            suffix={field.suffix}
            testId={field.testId}
            placeholder={field.placeholder}
            disabled={disabled}
          />
        } />
      );
    case 'text':
      return (
        <Row label={field.label} hint={hintOf(field.hint)} control={
          <TextControl
            value={state[field.key]}
            onChange={(v) => update(field.key, v as GeneralSettingsState[typeof field.key])}
            placeholder={field.placeholder}
            testId={field.testId}
            disabled={disabled}
          />
        } />
      );
    case 'select':
      return (
        <Row label={field.label} hint={hintOf(field.hint)} control={
          <SelectControl
            value={state[field.key] as never}
            onChange={(v) => update(field.key, v as GeneralSettingsState[typeof field.key])}
            options={field.options as ReadonlyArray<{ value: never; label: string }>}
            testId={field.testId}
            disabled={disabled}
          />
        } />
      );
    case 'subsection':
      return (
        <>
          <SubLabel>{field.title}</SubLabel>
          {field.fields.map((f, i) => (
            <FieldRenderer key={i} field={f} state={state} update={update} disabled={disabled} disabledHint={disabledHint} />
          ))}
        </>
      );
    case 'conditional':
      if (!field.show(state)) return null;
      return (
        <>
          {field.fields.map((f, i) => (
            <FieldRenderer key={i} field={f} state={state} update={update} disabled={disabled} disabledHint={disabledHint} />
          ))}
        </>
      );
    case 'capability':
      // A separate component because it reads a hook, and a hook cannot be
      // called from one arm of a switch.
      return <CapabilityFields field={field} state={state} update={update} />;
    case 'custom':
      return (
        <Row label={field.label} hint={hintOf(field.hint)} control={field.render(state, update)} />
      );
  }
}

/**
 * The fields inside a `capability` container, disabled where its requirement
 * is unmet.
 *
 * Live: `useCapabilityGate` re-reads on `data:capabilitiesChanged`, so a panel
 * left open while a provider binds or detaches follows the answer rather than
 * showing the one that was true when it opened.
 */
function CapabilityFields({
  field,
  state,
  update,
}: {
  field: Extract<Field, { kind: 'capability' }>;
  state: GeneralSettingsState;
  update: <K extends StateKey>(key: K, value: GeneralSettingsState[K]) => void;
}) {
  const gate = useCapabilityGate(field.capability, {
    expect: field.expect,
    reason: field.unavailableReason,
  });
  return (
    <>
      {field.fields.map((f, i) => (
        <FieldRenderer
          key={i}
          field={f}
          state={state}
          update={update}
          disabled={gate.disabled}
          disabledHint={gate.reason}
        />
      ))}
    </>
  );
}

/**
 * Filter a band's schema by a free-text query. Matches band title,
 * subsection title, field label, or field hint (case-insensitive). A
 * matching container surfaces all of its children; a non-matching
 * container surfaces only matching descendants. Conditional groups are
 * preserved so the renderer's `show(state)` predicate still applies.
 * Returns `null` when nothing in the band matches.
 */
export function filterBand(band: BandSchema, query: string): BandSchema | null {
  const q = query.trim().toLowerCase();
  if (!q) return band;
  if (band.title.toLowerCase().includes(q)) return band;
  const fields = filterFields(band.fields, q);
  return fields.length ? { ...band, fields } : null;
}

function filterFields(fields: ReadonlyArray<Field>, q: string): Field[] {
  const out: Field[] = [];
  for (const f of fields) {
    const kept = filterField(f, q);
    if (kept) out.push(kept);
  }
  return out;
}

function filterField(field: Field, q: string): Field | null {
  switch (field.kind) {
    case 'subsection': {
      if (field.title.toLowerCase().includes(q)) return field;
      const inner = filterFields(field.fields, q);
      return inner.length ? { ...field, fields: inner } : null;
    }
    case 'conditional':
    case 'capability': {
      const inner = filterFields(field.fields, q);
      return inner.length ? { ...field, fields: inner } : null;
    }
    default: {
      const label = field.label.toLowerCase();
      const hint = field.hint?.toLowerCase() ?? '';
      const key = 'key' in field ? String(field.key).toLowerCase() : '';
      return label.includes(q) || hint.includes(q) || key.includes(q)
        ? field
        : null;
    }
  }
}

export function BandRenderer({
  band,
  state,
  update,
}: {
  band: BandSchema;
  state: GeneralSettingsState;
  update: <K extends StateKey>(key: K, value: GeneralSettingsState[K]) => void;
}) {
  return (
    <Band index={band.index} title={band.title}>
      {band.fields.map((f, i) => (
        <FieldRenderer key={i} field={f} state={state} update={update} />
      ))}
    </Band>
  );
}
