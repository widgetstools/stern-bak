/**
 * Unit tests for pure tree-manipulation helpers.
 *
 * These used to live inline in `ColumnGroupsPanel.tsx` — extracted into
 * `treeOps.ts` during the v4 rewrite so each op is individually exercised
 * instead of only being hit through the panel.
 */
import { describe, expect, it } from 'vitest';
import type { ColumnGroupNode } from './state';
import {
  deleteGroupAtPath,
  findGroupByPath,
  flattenGroups,
  moveGroupAtPath,
  updateGroupAtPath,
} from './treeOps';

/** Build a small 3-level fixture: A (→ A1 → A1a), B (→ B1). */
function makeTree(): ColumnGroupNode[] {
  const a1a: ColumnGroupNode = { groupId: 'A1a', headerName: 'A·1·a', children: [] };
  const a1: ColumnGroupNode = {
    groupId: 'A1',
    headerName: 'A·1',
    children: [
      { kind: 'col', colId: 'colX' },
      { kind: 'group', group: a1a },
    ],
  };
  const a: ColumnGroupNode = {
    groupId: 'A',
    headerName: 'A',
    children: [
      { kind: 'col', colId: 'colA' },
      { kind: 'group', group: a1 },
    ],
  };
  const b1: ColumnGroupNode = { groupId: 'B1', headerName: 'B·1', children: [] };
  const b: ColumnGroupNode = {
    groupId: 'B',
    headerName: 'B',
    children: [{ kind: 'group', group: b1 }],
  };
  return [a, b];
}

describe('flattenGroups', () => {
  it('DFS walks the full tree and tracks depth + path', () => {
    const flat = flattenGroups(makeTree());
    expect(flat.map((f) => f.node.groupId)).toEqual(['A', 'A1', 'A1a', 'B', 'B1']);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 0, 1]);
    expect(flat.map((f) => f.path)).toEqual([
      [0],
      [0, 0],
      [0, 0, 0],
      [1],
      [1, 0],
    ]);
  });

  it('records siblings count + siblingIndex at each level', () => {
    const flat = flattenGroups(makeTree());
    const a = flat.find((f) => f.node.groupId === 'A')!;
    const b = flat.find((f) => f.node.groupId === 'B')!;
    expect(a.siblings).toBe(2);
    expect(a.siblingIndex).toBe(0);
    expect(b.siblings).toBe(2);
    expect(b.siblingIndex).toBe(1);
  });
});

describe('findGroupByPath', () => {
  it('returns the node at an exact path', () => {
    const groups = makeTree();
    expect(findGroupByPath(groups, [0])?.groupId).toBe('A');
    expect(findGroupByPath(groups, [0, 0])?.groupId).toBe('A1');
    expect(findGroupByPath(groups, [0, 0, 0])?.groupId).toBe('A1a');
    expect(findGroupByPath(groups, [1, 0])?.groupId).toBe('B1');
  });

  it('returns null for a missing path', () => {
    expect(findGroupByPath(makeTree(), [9])).toBeNull();
    expect(findGroupByPath(makeTree(), [0, 9])).toBeNull();
    expect(findGroupByPath([], [])).toBeNull();
  });
});

describe('updateGroupAtPath', () => {
  it('applies the updater at the exact node', () => {
    const groups = makeTree();
    const updated = updateGroupAtPath(groups, [0, 0], (n) => ({
      ...n,
      headerName: 'Renamed',
    }));
    expect(findGroupByPath(updated, [0, 0])?.headerName).toBe('Renamed');
    // Untouched siblings should keep the same reference.
    expect(updated[1]).toBe(groups[1]);
  });

  it('returns the original array for an empty path', () => {
    const groups = makeTree();
    expect(updateGroupAtPath(groups, [], (n) => n)).toBe(groups);
  });
});

describe('deleteGroupAtPath', () => {
  it('removes a top-level group', () => {
    const groups = makeTree();
    const out = deleteGroupAtPath(groups, [0]);
    expect(out.map((g) => g.groupId)).toEqual(['B']);
  });

  it('removes a nested subgroup while keeping leaf siblings', () => {
    const groups = makeTree();
    const out = deleteGroupAtPath(groups, [0, 0]);
    const aChildren = findGroupByPath(out, [0])!.children;
    // Should still have the `colA` leaf but not the A1 subgroup.
    expect(aChildren.find((c) => c.kind === 'col' && c.colId === 'colA')).toBeDefined();
    expect(aChildren.find((c) => c.kind === 'group' && c.group.groupId === 'A1')).toBeUndefined();
  });
});

describe('moveGroupAtPath', () => {
  it('swaps two top-level siblings', () => {
    const groups = makeTree();
    const out = moveGroupAtPath(groups, [0], 1);
    expect(out.map((g) => g.groupId)).toEqual(['B', 'A']);
  });

  it('no-op when moving past bounds', () => {
    const groups = makeTree();
    expect(moveGroupAtPath(groups, [0], -1)).toBe(groups);
    expect(moveGroupAtPath(groups, [1], 1)).toBe(groups);
  });

  it('swaps nested sibling subgroups without touching leaves', () => {
    // Construct A with two subgroups so we can swap.
    const x: ColumnGroupNode = { groupId: 'X', headerName: 'X', children: [] };
    const y: ColumnGroupNode = { groupId: 'Y', headerName: 'Y', children: [] };
    const a: ColumnGroupNode = {
      groupId: 'A',
      headerName: 'A',
      children: [
        { kind: 'col', colId: 'leaf1' },
        { kind: 'group', group: x },
        { kind: 'col', colId: 'leaf2' },
        { kind: 'group', group: y },
      ],
    };

    const out = moveGroupAtPath([a], [0, 0], 1);
    // Nested subgroup order swaps (X ↔ Y) but the leaf siblings keep
    // their raw-child positions.
    const aChildren = findGroupByPath(out, [0])!.children;
    const subgroupIds = aChildren
      .filter((c): c is { kind: 'group'; group: ColumnGroupNode } => c.kind === 'group')
      .map((c) => c.group.groupId);
    expect(subgroupIds).toEqual(['Y', 'X']);
    // Leaves still in place.
    expect(aChildren[0]).toMatchObject({ kind: 'col', colId: 'leaf1' });
    expect(aChildren[2]).toMatchObject({ kind: 'col', colId: 'leaf2' });
  });
});
