import { useMemo, useState } from 'react';
import { ChevronDown, RemoveFormatting } from 'lucide-react';
import { FormatColorPicker, FormatDropdown, FormatPopover } from '../format-editor';
import type { BorderSpec } from '@wellsfargo-starui/core';
import { ChromeButton } from '../ChromeButton';

/**
 * Token-driven stylesheet for `BorderStyleEditor`.
 *
 * Authored as a string + injected once at module load (rather than as
 * a separate `.css` file imported from the TSX) because Vite's
 * chunk-splitting can place the CSS import in an arbitrary lazy chunk.
 * In the OpenFin reference app build, BorderStyleEditor.css landed in
 * the ColumnGroupsPanel chunk — panels that reach BorderStyleEditor
 * through other entry points (column-customization, conditional-styling,
 * calculated-columns) rendered unstyled. Inlining the CSS via a
 * <style> tag injected at module load makes the styles self-contained
 * and immune to chunk-splitting, matching the pattern already used by
 * GhostIconButton.
 */
const BORDER_STYLE_EDITOR_CSS = `
/* BorderStyleEditor — scoped to .ds-be-editor.
   All values reference --ds-* vars from @wellsfargo-starui/design-system/css. */

.ds-be-editor {
  /* Local variable shortcuts for readability */
  --be-bg-card:     var(--ds-surface-secondary);
  --be-bg-sunken:   var(--ds-surface-tertiary);
  --be-bg-hover:    var(--ds-state-hover-overlay);
  --be-line:        var(--ds-border-secondary);
  --be-line-strong: var(--ds-border-primary);
  --be-ink-0:       var(--ds-text-primary);
  --be-ink-1:       var(--ds-text-secondary);
  --be-ink-2:       var(--ds-text-muted);
  --be-ink-3:       var(--ds-text-faint);
  --be-accent:      var(--ds-primary);
  --be-red:         var(--ds-accent-negative);
  --be-r:           var(--ds-radius-sm);
  --be-h-ctrl:      26px;
  --be-h-preview:   26px;
  --be-font-mono:   var(--ds-font-mono);
  --be-font-sans:   var(--ds-font-sans);

  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  row-gap: 6px;
  padding: 6px 8px;
  background: var(--be-bg-card);
  border: 1px solid var(--be-line-strong);
  border-radius: var(--be-r);
  font-family: var(--be-font-mono);
  font-feature-settings: 'tnum' 1;
  color: var(--be-ink-0);
}

.ds-be-editor .ds-be-preview {
  width: 56px;
  height: var(--be-h-preview);
  border: 1px solid var(--be-line-strong);
  border-radius: var(--be-r);
  background: var(--be-bg-sunken);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 4px;
}

.ds-be-editor .ds-be-preview-inner {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ds-be-editor .ds-be-div {
  width: 1px;
  height: 18px;
  background: var(--be-line-strong);
  flex-shrink: 0;
}

.ds-be-editor .ds-be-sides {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 2px;
  background: var(--be-bg-sunken);
  border: 1px solid var(--be-line);
  border-radius: var(--be-r);
  height: var(--be-h-ctrl);
}

.ds-be-editor .ds-be-side {
  width: 24px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  cursor: pointer;
  padding: 0;
  color: var(--be-ink-1);
  font-family: var(--be-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1;
  border: 1px dashed var(--be-line);
  border-radius: 2px;
  transition: color 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}

.ds-be-editor .ds-be-side:hover:not(:disabled) {
  background: var(--be-bg-hover);
  color: var(--be-ink-0);
}

.ds-be-editor .ds-be-side[data-on='true'] {
  color: var(--be-accent);
  border-color: transparent;
}

.ds-be-editor .ds-be-side[data-on='true'][data-side='A'] {
  border: 2px solid var(--be-accent);
}

.ds-be-editor .ds-be-side[data-on='true'][data-side='T'] {
  border-top: 2px solid var(--be-accent);
}

.ds-be-editor .ds-be-side[data-on='true'][data-side='B'] {
  border-bottom: 2px solid var(--be-accent);
}

.ds-be-editor .ds-be-side[data-on='true'][data-side='L'] {
  border-left: 2px solid var(--be-accent);
}

.ds-be-editor .ds-be-side[data-on='true'][data-side='R'] {
  border-right: 2px solid var(--be-accent);
}

.ds-be-editor .ds-be-side[data-selected='true'] {
  background: color-mix(in srgb, var(--be-accent) 16%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--be-accent) 60%, transparent),
              0 0 0 2px var(--be-bg-card);
  color: var(--be-accent);
}

.ds-be-editor .ds-be-color {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--be-h-ctrl);
  padding: 0 6px 0 4px;
  background: var(--be-bg-sunken);
  border: 1px solid var(--be-line);
  border-radius: var(--be-r);
  cursor: pointer;
  color: var(--be-ink-0);
  font-family: var(--be-font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  flex-shrink: 0;
  transition: border-color 120ms ease, background 120ms ease;
}

.ds-be-editor .ds-be-color:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--be-accent) 45%, transparent);
}

.ds-be-editor .ds-be-color .ds-be-swatch {
  width: 18px;
  height: 18px;
  border-radius: 2px;
  border: 1px solid var(--be-line-strong);
  flex-shrink: 0;
}

.ds-be-editor .ds-be-color .ds-be-caret,
.ds-be-editor .ds-be-chip .ds-be-caret {
  width: 9px;
  height: 9px;
  color: var(--be-ink-2);
  flex-shrink: 0;
}

.ds-be-editor .ds-be-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--be-h-ctrl);
  padding: 0 6px 0 8px;
  background: var(--be-bg-sunken);
  border: 1px solid var(--be-line);
  border-radius: var(--be-r);
  cursor: pointer;
  color: var(--be-ink-0);
  font-family: var(--be-font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1;
  flex-shrink: 0;
  transition: border-color 120ms ease, background 120ms ease;
}

.ds-be-editor .ds-be-chip:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--be-accent) 45%, transparent);
}

.ds-be-editor .ds-be-stroke {
  width: 18px;
  height: 2px;
  background: currentColor;
  color: var(--be-ink-0);
  flex-shrink: 0;
  align-self: center;
}

.ds-be-editor .ds-be-stroke[data-style='dashed'] {
  background: none;
  border-top: 2px dashed var(--be-ink-0);
  height: 0;
}

.ds-be-editor .ds-be-stroke[data-style='dotted'] {
  background: none;
  border-top: 2px dotted var(--be-ink-0);
  height: 0;
}

.ds-be-editor .ds-be-clear {
  width: 26px;
  height: var(--be-h-ctrl);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--be-red);
  cursor: pointer;
  padding: 0;
  margin-left: auto;
  flex-shrink: 0;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  border-radius: var(--be-r);
}

.ds-be-editor .ds-be-clear:hover:not(:disabled) {
  background: color-mix(in srgb, var(--be-red) 12%, transparent);
  border-color: color-mix(in srgb, var(--be-red) 35%, transparent);
}

.ds-be-editor .ds-be-clear:disabled {
  color: var(--be-ink-3);
  opacity: 0.45;
  cursor: default;
}

.ds-be-editor button:focus-visible {
  outline: 2px solid var(--be-accent);
  outline-offset: 1px;
}
`;

const STYLE_TAG_ID = 'ds-border-style-editor-styles';

/** Inject the stylesheet once per document. SSR-safe (no-op when
 *  `document` is undefined) and idempotent under React StrictMode's
 *  double-render. */
function ensureStylesInjected(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = BORDER_STYLE_EDITOR_CSS;
  document.head.appendChild(style);
}

ensureStylesInjected();

/**
 * Shared border style editor — the single source of truth for every
 * "turn border sides on/off + pick width / style / colour" interaction
 * in the app.
 *
 * Visual design (matches the v2 terminal spec):
 *
 *   ┌─────┐ │ [A T B L R] │ [◼ #26C5B3 ▾] │ [—— SOLID ▾] │ [1 PX ▾] │ [×]
 *   │ pre │
 *   └─────┘
 *
 * Single row when the host is wide enough; wraps to two rows inside
 * narrow popovers (the FormattingToolbar's Borders popover caps at
 * ~400px, which forces the color/style/width/close group onto a
 * second line).
 *
 * Side buttons (A T B L R):
 *   - Each button renders its letter + a dashed outline on the sides
 *     it controls.
 *   - When that side is ON, its outline turns solid accent-color.
 *   - When that side is the current edit-target, the whole button
 *     gets an accent halo (box-shadow ring) so the control row's
 *     reads go to it.
 *
 * Data shape is a plain `{ top?, right?, bottom?, left?: BorderSpec }`
 * map. Callers translate to/from their native state
 * (`StyleEditorValue.borders` in the customizer,
 * `CellStyleOverrides.borders` in the formatting toolbar — both
 * identical shapes).
 */

export interface BordersValue {
  top?: BorderSpec;
  right?: BorderSpec;
  bottom?: BorderSpec;
  left?: BorderSpec;
}

export interface BorderStyleEditorProps {
  value: BordersValue;
  onChange: (next: BordersValue) => void;
  /** Optional small label shown inside the preview cell. Retained
   *  for API back-compat; the new compact preview no longer renders
   *  the label visually. */
  previewLabel?: string;
  /** Optional test id for the outer wrapper. */
  'data-testid'?: string;
}

type Edge = 'top' | 'right' | 'bottom' | 'left';
type BorderStyle = BorderSpec['style'];

const EDGES: ReadonlyArray<Edge> = ['top', 'right', 'bottom', 'left'];

const STYLE_OPTIONS: ReadonlyArray<{ value: BorderStyle; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];
const WIDTH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '1 px' },
  { value: 2, label: '2 px' },
  { value: 3, label: '3 px' },
  { value: 4, label: '4 px' },
  { value: 5, label: '5 px' },
];

// Default spec used when the user toggles on an edge with no prior
// history. A thin accent-colored line so the change is instantly
// visible against any background.
const DEFAULT_SPEC: BorderSpec = { width: 1, color: '#2dd4bf', style: 'solid' };

/** Side-button order matches the spec: All, then T B L R in box-wise order. */
const SIDE_BUTTONS: ReadonlyArray<{
  key: 'all' | Edge;
  letter: 'A' | 'T' | 'B' | 'L' | 'R';
}> = [
  { key: 'all', letter: 'A' },
  { key: 'top', letter: 'T' },
  { key: 'bottom', letter: 'B' },
  { key: 'left', letter: 'L' },
  { key: 'right', letter: 'R' },
];

export function BorderStyleEditor({
  value,
  onChange,
  previewLabel: _previewLabel,
  ...rest
}: BorderStyleEditorProps) {
  const borders = value ?? {};

  const hasT = Boolean(borders.top);
  const hasR = Boolean(borders.right);
  const hasB = Boolean(borders.bottom);
  const hasL = Boolean(borders.left);
  const hasAny = hasT || hasR || hasB || hasL;
  const allOn = hasT && hasR && hasB && hasL;

  // Edit-target selection. 'all' = batch-edit every currently-on side
  // (useful to set a uniform look); a specific Edge = edit only that
  // side, leaving the others alone.
  const [selectedEdge, setSelectedEdge] = useState<Edge | 'all'>('all');

  // Spec that the controls (color swatch, style dropdown, width
  // dropdown) read from. Preference order:
  //   1. The explicitly selected side, if it's on.
  //   2. First defined side (so controls still show something useful
  //      when selectedEdge is 'all' or points at an off side).
  //   3. DEFAULT_SPEC.
  const anchor: BorderSpec = useMemo(() => {
    if (selectedEdge !== 'all') {
      const b = borders[selectedEdge];
      if (b && b.width > 0) return b;
    }
    for (const e of EDGES) {
      const b = borders[e];
      if (b && b.width > 0) return b;
    }
    return DEFAULT_SPEC;
  }, [borders, selectedEdge]);

  // Last-known spec per edge so toggling off and on doesn't flatten
  // the look. Seeded from the incoming value.
  const [memory, setMemory] = useState<Partial<Record<Edge, BorderSpec>>>(() => ({
    ...borders,
  }));

  const emit = (next: BordersValue) => {
    // Normalize — if every side is undefined, emit an empty object (not
    // undefined) so the caller can still round-trip through its state.
    const cleaned: BordersValue = {};
    for (const e of EDGES) {
      if (next[e]) cleaned[e] = next[e];
    }
    onChange(cleaned);
  };

  /**
   * Side-button click. Implements the tri-state cycle:
   *   OFF                → turn ON  and SELECT
   *   ON, not selected   → SELECT (no toggle off)
   *   ON, selected       → turn OFF (move selection to another on side or 'all')
   *
   * Turning on restores the edge's last-known spec from `memory` so
   * the colour/style/width chosen for a side survive a quick off/on.
   */
  const handleEdgeClick = (edge: Edge) => {
    const current = borders[edge];
    if (!current) {
      const nextSpec = memory[edge] ?? { ...anchor };
      emit({ ...borders, [edge]: nextSpec });
      setSelectedEdge(edge);
      return;
    }
    if (selectedEdge !== edge) {
      setSelectedEdge(edge);
      return;
    }
    setMemory((m) => ({ ...m, [edge]: current }));
    const nextBorders = { ...borders };
    delete nextBorders[edge];
    emit(nextBorders);
    const nextOn = EDGES.find((e) => e !== edge && borders[e]);
    setSelectedEdge(nextOn ?? 'all');
  };

  /**
   * A-button click — dual purpose:
   *   - If every side is already on AND we're already in all-mode,
   *     clear everything (convenient single-click reset).
   *   - Otherwise, turn every side on with the anchor spec AND
   *     switch the edit-target to 'all' so subsequent control edits
   *     apply uniformly.
   */
  const handleAllClick = () => {
    if (allOn && selectedEdge === 'all') {
      emit({});
      setSelectedEdge('all');
      return;
    }
    const spec = { ...anchor };
    emit({ top: spec, right: spec, bottom: spec, left: spec });
    setSelectedEdge('all');
  };

  /**
   * Route a BorderSpec patch to the correct target(s):
   *   - selectedEdge === 'all'       → every currently-on side, or seed
   *     `top` when none are on (so the first control change produces
   *     instant visible feedback).
   *   - selectedEdge is a specific Edge → only that side. If the side
   *     is currently off, enable it with the patched spec (auto-turn-on
   *     on first edit — matches the "edit target that's off" intent).
   */
  const patchSelected = (patch: Partial<BorderSpec>) => {
    if (selectedEdge === 'all') {
      const onEdges = EDGES.filter((e) => Boolean(borders[e]));
      if (onEdges.length === 0) {
        const seeded: BorderSpec = { ...anchor, ...patch };
        emit({ ...borders, top: seeded });
        setMemory((m) => ({ ...m, top: seeded }));
        setSelectedEdge('top');
        return;
      }
      const nextBorders = { ...borders };
      for (const e of onEdges) {
        nextBorders[e] = { ...(nextBorders[e] as BorderSpec), ...patch };
      }
      emit(nextBorders);
      setMemory((m) => ({
        ...m,
        ...Object.fromEntries(onEdges.map((e) => [e, nextBorders[e]])),
      }));
      return;
    }
    const current = borders[selectedEdge];
    const nextSpec: BorderSpec = { ...(current ?? anchor), ...patch };
    emit({ ...borders, [selectedEdge]: nextSpec });
    setMemory((m) => ({ ...m, [selectedEdge]: nextSpec }));
  };

  const clearAll = () => {
    emit({});
    setSelectedEdge('all');
  };

  const normalizedHex = anchor.color.startsWith('#')
    ? anchor.color.toUpperCase().replace(/^#/, '')
    : anchor.color;

  // Preview: render each side's own spec so per-side differences are
  // visible. Off sides show a faint dashed hairline so the empty-state
  // outline remains readable.
  const previewSide = (spec: BorderSpec | undefined) =>
    spec
      ? `${spec.width}px ${spec.style} ${spec.color}`
      : '1px dashed var(--ds-border-secondary)';

  const edgeIsOn = (key: 'all' | Edge): boolean =>
    key === 'all' ? allOn : Boolean(borders[key]);

  const edgeIsSelected = (key: 'all' | Edge): boolean =>
    selectedEdge === key &&
    (key === 'all' ? true : Boolean(borders[key]) || selectedEdge === key);

  return (
    <div className="ds-be-editor" data-v2-border-host="" data-testid={rest['data-testid']}>
      {/* ── Preview ────────────────────────────────────────────── */}
      <div className="ds-be-preview" data-testid="ds-be-preview">
        <span
          className="ds-be-preview-inner"
          style={{
            borderTop: previewSide(borders.top),
            borderRight: previewSide(borders.right),
            borderBottom: previewSide(borders.bottom),
            borderLeft: previewSide(borders.left),
          }}
        />
      </div>

      <span aria-hidden className="ds-be-div" />

      {/* ── Side preset buttons: A T B L R ────────────────────── */}
      <div className="ds-be-sides" role="group" aria-label="Border sides">
        {SIDE_BUTTONS.map(({ key, letter }) => {
          const on = edgeIsOn(key);
          const selected = edgeIsSelected(key);
          const title =
            key === 'all'
              ? allOn && selectedEdge === 'all'
                ? 'Clear all sides'
                : 'Turn on all sides + batch-edit'
              : on
                ? selectedEdge === key
                  ? `${key[0].toUpperCase()}${key.slice(1)} (click to remove)`
                  : `Select ${key} for editing`
                : `Add ${key} border`;
          return (
            <ChromeButton
              key={key}
              type="button"
              className="ds-be-side"
              data-side={letter}
              data-on={on ? 'true' : undefined}
              data-selected={selected ? 'true' : undefined}
              data-testid={`ds-be-side-${letter.toLowerCase()}`}
              title={title}
              aria-pressed={on}
              onClick={() => (key === 'all' ? handleAllClick() : handleEdgeClick(key))}
              onMouseDown={(e) => e.preventDefault()}
            >
              {letter}
            </ChromeButton>
          );
        })}
      </div>

      <span aria-hidden className="ds-be-div" />

      {/* ── Color trigger ──────────────────────────────────────── */}
      <FormatPopover
        width={240}
        trigger={
          <ChromeButton
            type="button"
            className="ds-be-color"
            title="Border colour"
            data-testid="ds-be-color"
            onMouseDown={(e) => e.preventDefault()}
          >
            <span
              className="ds-be-swatch"
              aria-hidden
              style={{ background: anchor.color }}
            />
            <span>{normalizedHex}</span>
            <ChevronDown className="ds-be-caret" strokeWidth={1.75} />
          </ChromeButton>
        }
      >
        <FormatColorPicker
          value={anchor.color || DEFAULT_SPEC.color}
          onChange={(c) => {
            if (c) patchSelected({ color: c });
          }}
          allowClear={false}
        />
      </FormatPopover>

      <span aria-hidden className="ds-be-div" />

      {/* ── Style dropdown ─────────────────────────────────────── */}
      <FormatDropdown<BorderStyle>
        value={anchor.style}
        onChange={(v) => patchSelected({ style: v })}
        options={STYLE_OPTIONS.map((o) => ({ ...o }))}
        width={140}
        trigger={
          <ChromeButton
            type="button"
            className="ds-be-chip"
            title="Border style"
            data-testid="ds-be-style"
            onMouseDown={(e) => e.preventDefault()}
          >
            <span
              className="ds-be-stroke"
              aria-hidden
              data-style={anchor.style}
            />
            <span>{STYLE_OPTIONS.find((o) => o.value === anchor.style)?.label ?? 'Solid'}</span>
            <ChevronDown className="ds-be-caret" strokeWidth={1.75} />
          </ChromeButton>
        }
      />

      <span aria-hidden className="ds-be-div" />

      {/* ── Width dropdown ─────────────────────────────────────── */}
      <FormatDropdown<number>
        value={Math.max(1, Math.min(5, anchor.width || 1))}
        onChange={(v) => patchSelected({ width: v })}
        options={WIDTH_OPTIONS.map((o) => ({ ...o }))}
        width={110}
        trigger={
          <ChromeButton
            type="button"
            className="ds-be-chip"
            title="Border width"
            data-testid="ds-be-width"
            onMouseDown={(e) => e.preventDefault()}
          >
            <span>{Math.max(1, Math.min(5, anchor.width || 1))} PX</span>
            <ChevronDown className="ds-be-caret" strokeWidth={1.75} />
          </ChromeButton>
        }
      />

      {/* ── Clear-all-borders action (far right, `margin-left: auto`) ─
          RemoveFormatting glyph + destructive color — reads as
          "clear styles" rather than the ambiguous generic X. */}
      <ChromeButton
        type="button"
        className="ds-be-clear"
        onClick={clearAll}
        onMouseDown={(e) => e.preventDefault()}
        disabled={!hasAny}
        aria-label="Clear all borders"
        title="Clear all borders"
        data-testid="ds-be-clear"
      >
        <RemoveFormatting size={14} strokeWidth={1.75} />
      </ChromeButton>
    </div>
  );
}
