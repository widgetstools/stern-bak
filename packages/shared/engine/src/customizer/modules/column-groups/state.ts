/**
 * Column Groups module state — v2.
 *
 * Lets the user compose base columns into named, nestable groups (AG-Grid's
 * `ColGroupDef`) from a settings-panel editor. Groups persist into the active
 * profile; reloading the app with the same profile restores them.
 *
 * State shape mirrors AG-Grid's own `(ColDef | ColGroupDef)[]` tree so the
 * transform is almost a direct map:
 *
 *   - `groups[]` is the ordered list of top-level groups. Columns NOT
 *     mentioned in any group render ungrouped, in their original order from
 *     the base column defs.
 *
 *   - Each `ColumnGroupNode` has `children` that are either:
 *       `{ kind: 'col', colId }`   — a leaf column reference
 *       `{ kind: 'group', group }` — a nested subgroup (arbitrary depth)
 *
 *   - `openGroupIds` captures the user's RUNTIME expand/collapse choices:
 *     when they click a group's chevron in the grid header, AG-Grid fires
 *     `columnGroupOpened`, we record `{ [groupId]: isExpanded }`, and the
 *     next render applies it to `ColGroupDef.openByDefault`. This means
 *     reloading the app restores the exact open/closed layout the user left.
 *     Overrides the static `openByDefault` from the editor when present.
 */

/**
 * Per-child visibility mode. Maps 1:1 to AG-Grid's native
 * `ColDef.columnGroupShow`:
 *   - `'always'`  → shown whether the group is open OR closed (AG-Grid:
 *                   leave `columnGroupShow` undefined).
 *   - `'open'`    → shown only when the parent group is expanded.
 *   - `'closed'`  → shown only when the parent group is collapsed (typical
 *                   for an aggregate / total column that stands in for the
 *                   detail columns).
 *
 * We store `'always'` explicitly (instead of `undefined`) in state so the
 * authoring UI has a clear tri-state selector; the transform maps `'always'`
 * back to `undefined` when emitting the ColDef so AG-Grid sees the native
 * default.
 */
export type GroupChildShow = 'always' | 'open' | 'closed';

/** Discriminated union so `children` can mix leaf columns and subgroups.
 *  Leaf columns optionally carry a `show` override — subgroups don't (AG-Grid
 *  doesn't support `columnGroupShow` on nested ColGroupDefs, only on leaf
 *  columns within a group). */
export type ColumnGroupChild =
  | { kind: 'col'; colId: string; show?: GroupChildShow }
  | { kind: 'group'; group: ColumnGroupNode };

/**
 * Per-side border spec, identical in shape to
 * `column-customization/state.ts:BorderSpec`. Duplicated here so this module
 * stays free of cross-module type imports (enforced elsewhere via
 * `module.dependencies`); the shape is deliberately kept byte-for-byte
 * compatible with the customization module's borders so the shared
 * `<BorderStyleEditor>` accepts either value as-is.
 */
export interface GroupHeaderBorderSpec {
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

/**
 * Optional visual overrides for a group header. Mirrors the existing
 * `CellStyleOverrides.typography` / `.colors` / `.borders` shape from
 * column-customization so the panel UI can reuse the same primitives.
 * `undefined` means "use the theme default" — no CSS is emitted for that
 * facet.
 */
export interface GroupHeaderStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Font size in px. */
  fontSize?: number;
  /** Text color (any CSS color string — hex, rgba, var(--...), etc.). */
  color?: string;
  /** Background color for the group header cell. */
  background?: string;
  /** `'left' | 'center' | 'right'` — horizontal alignment of the label. */
  align?: 'left' | 'center' | 'right';
  /** Per-side border overrides. Rendered via a `::after` overlay on the
   *  group header cell so dashed / dotted / per-side styles are honoured
   *  (CSS `box-shadow` can't render non-solid strokes). */
  borders?: {
    top?: GroupHeaderBorderSpec;
    right?: GroupHeaderBorderSpec;
    bottom?: GroupHeaderBorderSpec;
    left?: GroupHeaderBorderSpec;
  };
}

export interface ColumnGroupNode {
  /** Stable id. Emitted as AG-Grid's `ColGroupDef.groupId` so expand/collapse
   *  state survives every `columnDefs` update (AG-Grid explicitly requires
   *  a groupId for retention — see v35 docs, "Updating Column Groups"). */
  groupId: string;
  headerName: string;
  children: ColumnGroupChild[];
  /** Initial expanded state when the group is first rendered and the user
   *  has no runtime override stored in `openGroupIds`. */
  openByDefault?: boolean;
  /** When true, AG-Grid prevents users from dragging columns out of the
   *  group in the header bar. */
  marryChildren?: boolean;
  /** Optional visual styling for the group's header cell. Omitted when
   *  every facet is undefined — keeps serialized state lean. */
  headerStyle?: GroupHeaderStyle;
}

export interface ColumnGroupsState {
  groups: ColumnGroupNode[];
  /** Runtime expand/collapse memory keyed by `groupId`. Overrides
   *  `ColumnGroupNode.openByDefault` when present. Pruned automatically
   *  when a group is deleted from `groups`. */
  openGroupIds: Record<string, boolean>;
}

export const INITIAL_COLUMN_GROUPS: ColumnGroupsState = {
  groups: [],
  openGroupIds: {},
};

// ─── Defensive deserialize shape check ─────────────────────────────────────
//
// The module's `deserialize` uses this so we never crash on a malformed
// profile snapshot (e.g. schema drift, hand-edited IndexedDB, etc.).

export function isColumnGroupsState(value: unknown): value is ColumnGroupsState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return Array.isArray(s.groups) && s.openGroupIds !== null && typeof s.openGroupIds === 'object';
}
