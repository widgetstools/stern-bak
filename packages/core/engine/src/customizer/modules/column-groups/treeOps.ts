/**
 * Pure tree-manipulation helpers for the column-groups module.
 *
 * Kept out of the panel so they're independently testable and the panel
 * file can focus on rendering + wiring. Every operation is immutable:
 * callers pass `groups`, get a new array back; a no-op path returns the
 * original reference unchanged.
 *
 * Path convention — a depth-addressed index trail where each entry is
 * the index among groups at that level (NOT the raw `children` index).
 * Siblings that aren't groups (column entries) are skipped when counting.
 * This lets the list rail's flat DFS iteration and the editor's path
 * lookups share the same addressing.
 */
import type { ColumnGroupChild, ColumnGroupNode } from './state';

export type Path = number[];

/** Flattened row for the list rail — tracks depth so the UI can indent
 *  and path so Move / Delete operate on the real tree shape. */
export interface FlatGroup {
  readonly node: ColumnGroupNode;
  readonly depth: number;
  readonly path: Path;
  readonly siblings: number;
  readonly siblingIndex: number;
}

export function flattenGroups(
  groups: ColumnGroupNode[],
  depth = 0,
  prefix: Path = [],
): FlatGroup[] {
  const out: FlatGroup[] = [];
  groups.forEach((node, i) => {
    const path = [...prefix, i];
    out.push({ node, depth, path, siblings: groups.length, siblingIndex: i });
    const subgroups = node.children.filter(
      (c) => c.kind === 'group',
    ) as Array<{ kind: 'group'; group: ColumnGroupNode }>;
    const nestedGroups = subgroups.map((sg) => sg.group);
    out.push(...flattenGroups(nestedGroups, depth + 1, path));
  });
  return out;
}

export function findGroupByPath(
  groups: ColumnGroupNode[],
  path: Path,
): ColumnGroupNode | null {
  if (path.length === 0) return null;
  let current: ColumnGroupNode | undefined = groups[path[0]];
  for (let i = 1; i < path.length; i++) {
    if (!current) return null;
    const subgroups = current.children.filter(
      (c) => c.kind === 'group',
    ) as Array<{ kind: 'group'; group: ColumnGroupNode }>;
    current = subgroups[path[i]]?.group;
  }
  return current ?? null;
}

export function updateGroupAtPath(
  groups: ColumnGroupNode[],
  path: Path,
  updater: (node: ColumnGroupNode) => ColumnGroupNode,
): ColumnGroupNode[] {
  if (path.length === 0) return groups;
  const [idx, ...rest] = path;
  return groups.map((g, i) => {
    if (i !== idx) return g;
    if (rest.length === 0) return updater(g);
    return { ...g, children: updateChildGroup(g.children, rest, updater) };
  });
}

function updateChildGroup(
  children: ColumnGroupChild[],
  path: Path,
  updater: (node: ColumnGroupNode) => ColumnGroupNode,
): ColumnGroupChild[] {
  const [nestedIdx, ...rest] = path;
  let seen = -1;
  return children.map((child) => {
    if (child.kind !== 'group') return child;
    seen += 1;
    if (seen !== nestedIdx) return child;
    if (rest.length === 0) return { kind: 'group', group: updater(child.group) };
    return {
      kind: 'group',
      group: { ...child.group, children: updateChildGroup(child.group.children, rest, updater) },
    };
  });
}

export function deleteGroupAtPath(
  groups: ColumnGroupNode[],
  path: Path,
): ColumnGroupNode[] {
  if (path.length === 0) return groups;
  if (path.length === 1) return groups.filter((_, i) => i !== path[0]);
  const [idx, ...rest] = path;
  return groups.map((g, i) =>
    i === idx ? { ...g, children: deleteChildGroup(g.children, rest) } : g,
  );
}

function deleteChildGroup(children: ColumnGroupChild[], path: Path): ColumnGroupChild[] {
  const [nestedIdx, ...rest] = path;
  if (rest.length === 0) {
    let seen = -1;
    return children.filter((child) => {
      if (child.kind !== 'group') return true;
      seen += 1;
      return seen !== nestedIdx;
    });
  }
  let seen = -1;
  return children.map((child) => {
    if (child.kind !== 'group') return child;
    seen += 1;
    if (seen !== nestedIdx) return child;
    return {
      kind: 'group',
      group: { ...child.group, children: deleteChildGroup(child.group.children, rest) },
    };
  });
}

export function moveGroupAtPath(
  groups: ColumnGroupNode[],
  path: Path,
  direction: -1 | 1,
): ColumnGroupNode[] {
  if (path.length === 0) return groups;
  if (path.length === 1) {
    const idx = path[0];
    const next = idx + direction;
    if (next < 0 || next >= groups.length) return groups;
    const copy = groups.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    return copy;
  }
  const [idx, ...rest] = path;
  return groups.map((g, i) =>
    i === idx ? { ...g, children: moveChildGroup(g.children, rest, direction) } : g,
  );
}

function moveChildGroup(
  children: ColumnGroupChild[],
  path: Path,
  direction: -1 | 1,
): ColumnGroupChild[] {
  const [nestedIdx, ...rest] = path;
  if (rest.length === 0) {
    const groupIndices: number[] = [];
    children.forEach((c, i) => {
      if (c.kind === 'group') groupIndices.push(i);
    });
    if (nestedIdx < 0 || nestedIdx >= groupIndices.length) return children;
    const nextGroupIdx = nestedIdx + direction;
    if (nextGroupIdx < 0 || nextGroupIdx >= groupIndices.length) return children;
    const a = groupIndices[nestedIdx];
    const b = groupIndices[nextGroupIdx];
    const copy = children.slice();
    [copy[a], copy[b]] = [copy[b], copy[a]];
    return copy;
  }
  let seen = -1;
  return children.map((child) => {
    if (child.kind !== 'group') return child;
    seen += 1;
    if (seen !== nestedIdx) return child;
    return {
      kind: 'group',
      group: { ...child.group, children: moveChildGroup(child.group.children, rest, direction) },
    };
  });
}
