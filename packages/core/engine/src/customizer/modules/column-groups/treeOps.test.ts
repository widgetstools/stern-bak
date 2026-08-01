import { describe, expect, it } from 'vitest';
import type { ColumnGroupNode } from './state.js';
import {
  deleteGroupAtPath,
  findGroupByPath,
  flattenGroups,
  moveGroupAtPath,
  updateGroupAtPath,
} from './treeOps.js';

function node(groupId: string, children: ColumnGroupNode['children'] = []): ColumnGroupNode {
  return { groupId, headerName: groupId, children };
}

function tree(): ColumnGroupNode[] {
  return [
    node('a'),
    node('b', [
      { kind: 'col', colId: 'x' },
      { kind: 'group', group: node('b1') },
    ]),
    node('c'),
  ];
}

describe('flattenGroups', () => {
  it('returns depth and path for nested subgroups', () => {
    const flat = flattenGroups(tree());
    expect(flat.map((f) => ({ id: f.node.groupId, depth: f.depth, path: f.path }))).toEqual([
      { id: 'a', depth: 0, path: [0] },
      { id: 'b', depth: 0, path: [1] },
      { id: 'b1', depth: 1, path: [1, 0] },
      { id: 'c', depth: 0, path: [2] },
    ]);
  });
});

describe('findGroupByPath', () => {
  it('finds nested groups by subgroup index', () => {
    expect(findGroupByPath(tree(), [1, 0])?.groupId).toBe('b1');
  });

  it('returns null for invalid paths', () => {
    expect(findGroupByPath(tree(), [])).toBeNull();
    expect(findGroupByPath(tree(), [99])).toBeNull();
  });
});

describe('updateGroupAtPath', () => {
  it('updates a nested group immutably', () => {
    const next = updateGroupAtPath(tree(), [1, 0], (g) => ({ ...g, headerName: 'Renamed' }));
    expect(findGroupByPath(tree(), [1, 0])?.headerName).toBe('b1');
    expect(findGroupByPath(next, [1, 0])?.headerName).toBe('Renamed');
  });

  it('returns the original reference on empty path', () => {
    const original = tree();
    expect(updateGroupAtPath(original, [], (g) => g)).toBe(original);
  });
});

describe('deleteGroupAtPath', () => {
  it('removes a root group', () => {
    const next = deleteGroupAtPath(tree(), [0]);
    expect(next.map((g) => g.groupId)).toEqual(['b', 'c']);
  });

  it('removes a nested subgroup', () => {
    const next = deleteGroupAtPath(tree(), [1, 0]);
    expect(findGroupByPath(next, [1, 0])).toBeNull();
    expect(findGroupByPath(tree(), [1, 0])?.groupId).toBe('b1');
  });
});

describe('moveGroupAtPath', () => {
  it('swaps adjacent root groups', () => {
    const next = moveGroupAtPath(tree(), [2], -1);
    expect(next.map((g) => g.groupId)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op at boundaries', () => {
    const original = tree();
    expect(moveGroupAtPath(original, [0], -1)).toBe(original);
    expect(moveGroupAtPath(original, [2], 1)).toBe(original);
  });

  it('swaps nested subgroups among siblings', () => {
    const groups = [
      node('parent', [
        { kind: 'group', group: node('first') },
        { kind: 'col', colId: 'x' },
        { kind: 'group', group: node('second') },
      ]),
    ];
    const next = moveGroupAtPath(groups, [0, 1], -1);
    const subgroups = findGroupByPath(next, [0])!.children.filter((c) => c.kind === 'group');
    expect(subgroups.map((c) => (c.kind === 'group' ? c.group.groupId : ''))).toEqual([
      'second',
      'first',
    ]);
  });

  it('leaves tree content unchanged for invalid update/delete paths', () => {
    const original = tree();
    expect(updateGroupAtPath(original, [99], (g) => g)).toStrictEqual(original);
    expect(deleteGroupAtPath(original, [99])).toStrictEqual(original);
    expect(moveGroupAtPath(original, [0, 99], 1)).toStrictEqual(original);
  });
});
