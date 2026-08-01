import type { ColDef, ColGroupDef } from 'ag-grid-community';
// Relative on purpose — package self-imports create a barrel cycle.
import type { AnyColDef } from '../../../platform/types';
import type { ColumnGroupChild, ColumnGroupNode, GroupHeaderStyle } from './state';
import { cssEscapeColId } from '../column-customization/transforms';

/**
 * True when any facet of the style object is defined. Used to decide whether
 * to attach a `headerClass` at all — groups without styling never get the
 * class so the theme default applies cleanly.
 */
export function hasHeaderStyle(s: GroupHeaderStyle | undefined): boolean {
  if (!s) return false;
  return (
    !!s.bold || !!s.italic || !!s.underline ||
    s.fontSize != null || s.color !== undefined ||
    s.background !== undefined || s.align !== undefined ||
    hasHeaderBorders(s)
  );
}

/** True when any side of the borders object has a usable spec (width > 0). */
export function hasHeaderBorders(s: GroupHeaderStyle | undefined): boolean {
  const b = s?.borders;
  if (!b) return false;
  return (
    (!!b.top && b.top.width > 0) ||
    (!!b.right && b.right.width > 0) ||
    (!!b.bottom && b.bottom.width > 0) ||
    (!!b.left && b.left.width > 0)
  );
}

/** Build the CSS declaration body for a group header style. Empty string
 *  when the style is a no-op. Borders are NOT included here — they live
 *  on the `::after` pseudo-element via `groupHeaderBorderOverlayCSS`. */
export function groupHeaderStyleToCSS(s: GroupHeaderStyle | undefined): string {
  if (!hasHeaderStyle(s)) return '';
  const parts: string[] = [];
  if (s!.bold) parts.push('font-weight: bold');
  if (s!.italic) parts.push('font-style: italic');
  if (s!.underline) parts.push('text-decoration: underline');
  if (s!.fontSize != null) parts.push(`font-size: ${s!.fontSize}px`);
  if (s!.color !== undefined) parts.push(`color: ${s!.color}`);
  if (s!.background !== undefined) parts.push(`background-color: ${s!.background}`);
  // AG-Grid's header group cell is flex; align the inner text container.
  if (s!.align !== undefined) parts.push(`justify-content: ${{ left: 'flex-start', center: 'center', right: 'flex-end' }[s!.align]}`);
  return parts.join('; ');
}

/**
 * Build the `::after` border-overlay rule for a group header.
 *
 * AG-Grid's column separators, overflow-hidden header cells, and flex
 * children make emitting real borders on the header cell itself fragile —
 * they fight AG-Grid's own separator rendering and get clipped on the
 * trailing edge. The overlay approach (matches `conditional-styling` and
 * `column-customization`) avoids all of that by painting each side as a
 * `border-{side}` on a `position: absolute; inset: 0; box-sizing:
 * border-box` pseudo-element that sits on top of the cell.
 *
 * Returns an empty string when the style has no usable borders.
 */
export function groupHeaderBorderOverlayCSS(selector: string, s: GroupHeaderStyle | undefined): string {
  if (!hasHeaderBorders(s)) return '';
  const b = s!.borders!;
  const parts: string[] = [];
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const spec = b[side];
    if (spec && spec.width > 0) {
      parts.push(`border-${side}: ${spec.width}px ${spec.style} ${spec.color}`);
    }
  }
  if (parts.length === 0) return '';
  return `${selector}::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-sizing: border-box; z-index: 1; ${parts.join('; ')}; }`;
}

/**
 * Pure tree-composition function.
 *
 * Given:
 *   - `defs`          — the flat `(ColDef | ColGroupDef)[]` produced by the
 *                        pipeline so far (after column-customization,
 *                        calculated-columns, etc.). May already contain groups
 *                        introduced by the host app's static columnDefs.
 *   - `groups`        — the user's authored group tree from module state.
 *   - `openGroupIds`  — runtime expand/collapse memory keyed by `groupId`.
 *
 * Returns a new `(ColDef | ColGroupDef)[]` tree where:
 *   - Columns named in any group (at any depth) are nested under their group
 *     in the correct order.
 *   - Top-level groups are **inserted at the position of their first child
 *     in the base defs' display order**, NOT at the end. Ungrouped columns
 *     stay in their original positions.
 *
 *     Why: AG-Grid v35 preserves each column's prior position across
 *     `columnDefs` updates. If we moved groups to the end and ungrouped
 *     columns to "the rest", AG-Grid's diff would yank ungrouped columns
 *     back to their original slots — which SPLITS our groups apart,
 *     producing the "Time header sitting above Spread column" bug. Emitting
 *     groups at their first-leaf position keeps AG-Grid's diff happy.
 *
 *   - Every emitted ColGroupDef has a stable `groupId` so AG-Grid preserves
 *     expand/collapse state across re-renders (required by v35).
 *   - `openByDefault` = runtime override from `openGroupIds[groupId]` when
 *     present, else the editor's static `ColumnGroupNode.openByDefault`.
 *
 * Ungroupable states we silently tolerate (never throw — the grid must keep
 * rendering):
 *   - A `ColumnGroupChild` references a colId that isn't in `defs` (column
 *     was hidden elsewhere, data changed): skip that child.
 *   - A group ends up with zero children after skipping: omit the group
 *     entirely. Otherwise AG-Grid throws a runtime warning.
 *   - The same colId appears in multiple groups: first occurrence wins;
 *     subsequent occurrences are skipped. Authoring UI should prevent this
 *     but defensive handling avoids mysterious "column vanished" bugs.
 */
export function composeGroups(
  defs: AnyColDef[],
  groups: ColumnGroupNode[],
  openGroupIds: Record<string, boolean>,
): AnyColDef[] {
  if (groups.length === 0) return defs;

  // 1) Flatten `defs` into a Map<colId, ColDef> plus a display-order array.
  //    Recursive walk — same pattern used by column-customization and
  //    calculated-columns. Only LEAF ColDefs end up in the map; existing
  //    ColGroupDefs from the host are broken apart so we can recompose them
  //    under our user-authored groups.
  const byId = new Map<string, ColDef>();
  const order: string[] = [];

  const walk = (list: AnyColDef[]): void => {
    for (const def of list) {
      if ('children' in def && Array.isArray(def.children)) {
        walk(def.children);
        continue;
      }
      const col = def as ColDef;
      const id = col.colId ?? col.field;
      if (!id) continue;
      if (!byId.has(id)) {
        byId.set(id, col);
        order.push(id);
      }
    }
  };
  walk(defs);

  // 2) Track which colIds are consumed by any group (at any depth) so they
  //    don't also appear as ungrouped.
  const assigned = new Set<string>();

  // 3) Recursively materialize each ColumnGroupNode into a ColGroupDef.
  const buildGroup = (node: ColumnGroupNode): ColGroupDef | null => {
    const children: AnyColDef[] = [];
    for (const child of node.children) {
      const built = buildChild(child);
      if (built) children.push(built);
    }
    // Drop empty groups — AG-Grid warns on them and they're never useful.
    if (children.length === 0) return null;

    // Runtime override wins over editor-static default.
    const runtime = openGroupIds[node.groupId];
    const openByDefault = typeof runtime === 'boolean' ? runtime : (node.openByDefault ?? false);

    const group: ColGroupDef = {
      groupId: node.groupId,
      headerName: node.headerName,
      children,
      openByDefault,
    };
    if (node.marryChildren) group.marryChildren = true;
    // Header styling is injected via CSS on `.ds-hdr-grp-{groupId}`; the class
    // is only attached when the style object has anything set, so unstyled
    // groups render at theme default.
    if (hasHeaderStyle(node.headerStyle)) {
      // Encode groupId with the shared CSS-safe helper. Today's
      // generateGroupId only emits [a-z0-9_], so the encoding is a
      // no-op in practice — but defense-in-depth for snapshots loaded
      // from older code paths and parity with column-customization /
      // conditional-styling.
      group.headerClass = `ds-hdr-grp-${cssEscapeColId(node.groupId)}`;
    }
    return group;
  };

  const buildChild = (child: ColumnGroupChild): AnyColDef | null => {
    if (child.kind === 'col') {
      if (assigned.has(child.colId)) return null; // already placed in another group
      const col = byId.get(child.colId);
      if (!col) return null; // column no longer exists
      assigned.add(child.colId);
      // Attach the `columnGroupShow` override if the authoring UI set one.
      // 'always' maps to undefined — AG-Grid's default (always visible).
      // Leaving `col` untouched when 'always' or undefined avoids stripping
      // any columnGroupShow that a host app set explicitly on the base def.
      if (child.show === 'open' || child.show === 'closed') {
        return { ...col, columnGroupShow: child.show };
      }
      return col;
    }
    // Nested group.
    return buildGroup(child.group);
  };

  // Build a reverse lookup: colId → top-level group node that owns it.
  // "Top-level" = the outermost authored group containing that col; subgroups
  // emit as children of their parent so we only track the root.
  const topGroupByColId = new Map<string, ColumnGroupNode>();
  const collectLeafCols = (node: ColumnGroupNode, root: ColumnGroupNode) => {
    for (const child of node.children) {
      if (child.kind === 'col') {
        // First occurrence wins (matches buildGroup's dedupe).
        if (!topGroupByColId.has(child.colId)) topGroupByColId.set(child.colId, root);
      } else {
        collectLeafCols(child.group, root);
      }
    }
  };
  for (const g of groups) collectLeafCols(g, g);

  // Walk base cols in display order. Each col either:
  //   (a) belongs to a top-level group not yet emitted → materialize the
  //       whole group here and mark it emitted. The group carries its own
  //       declared-order children (which may differ from base-def order —
  //       that's intentional user authoring).
  //   (b) belongs to a group already emitted → skip (it was included above).
  //   (c) isn't in any group → emit the leaf def at this slot.
  //
  // This keeps ungrouped cols anchored to their prior positions (so AG-Grid
  // doesn't fight us) while grouped cols cluster at their first-leaf slot.
  const emittedGroups = new Set<ColumnGroupNode>();
  const topLevel: AnyColDef[] = [];
  for (const id of order) {
    const owner = topGroupByColId.get(id);
    if (owner) {
      if (emittedGroups.has(owner)) continue; // already inserted earlier
      const built = buildGroup(owner);
      if (built) topLevel.push(built);
      emittedGroups.add(owner);
      continue;
    }
    const col = byId.get(id);
    if (col) topLevel.push(col);
  }

  // Safety net: if a group referenced only colIds that don't exist in `defs`
  // (so it never triggered the walk branch above), emit it at the end.
  // `buildGroup` will return null if it ends up empty, so no phantom groups.
  for (const node of groups) {
    if (emittedGroups.has(node)) continue;
    const built = buildGroup(node);
    if (built) topLevel.push(built);
  }

  return topLevel;
}

/**
 * Collect every `groupId` referenced anywhere in the authored group tree.
 * Used by the module's state reducer to prune stale entries from
 * `openGroupIds` after a group is deleted.
 */
export function collectGroupIds(groups: ColumnGroupNode[]): Set<string> {
  const out = new Set<string>();
  const visit = (node: ColumnGroupNode) => {
    out.add(node.groupId);
    for (const child of node.children) {
      if (child.kind === 'group') visit(child.group);
    }
  };
  for (const g of groups) visit(g);
  return out;
}

/**
 * Return every leaf `colId` referenced anywhere in the tree. Used by the
 * editor panel to compute which columns are already assigned (so the chip
 * picker can show only the remaining ones).
 */
export function collectAssignedColIds(groups: ColumnGroupNode[]): Set<string> {
  const out = new Set<string>();
  const visit = (node: ColumnGroupNode) => {
    for (const child of node.children) {
      if (child.kind === 'col') out.add(child.colId);
      else visit(child.group);
    }
  };
  for (const g of groups) visit(g);
  return out;
}
