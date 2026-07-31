import { describe, expect, it } from 'vitest';
import type { DockMenuItem } from './dockConfig.js';
import {
  addMenuItem, countItems, deleteMenuItem, duplicateMenuItem, findMenuItem,
  getAllItemIds, moveMenuItem, updateMenuItem,
} from './dockTreeUtils.js';

/**
 * These are the immutable tree operations behind the dock editor. The
 * properties that matter are that they recurse to any depth and never mutate
 * the input — a mutation here would corrupt the caller's undo stack.
 */

function item(id: string, caption = id, children?: DockMenuItem[]): DockMenuItem {
  return { id, caption, ...(children ? { children } : {}) } as DockMenuItem;
}

/** a ├ b(├ c, ├ d(├ e)) ├ f */
function tree(): DockMenuItem[] {
  return [
    item('a'),
    item('b', 'B', [item('c'), item('d', 'D', [item('e')])]),
    item('f'),
  ];
}

describe('findMenuItem', () => {
  it('finds a root item', () => {
    expect(findMenuItem(tree(), 'a')?.id).toBe('a');
  });

  it('finds a deeply nested item', () => {
    expect(findMenuItem(tree(), 'e')?.id).toBe('e');
  });

  it('returns null when the id is absent', () => {
    expect(findMenuItem(tree(), 'nope')).toBeNull();
  });

  it('returns null for an empty tree', () => {
    expect(findMenuItem([], 'a')).toBeNull();
  });
});

describe('updateMenuItem', () => {
  it('merges updates into the matching item', () => {
    const next = updateMenuItem(tree(), 'a', { caption: 'Renamed' });
    expect(findMenuItem(next, 'a')?.caption).toBe('Renamed');
  });

  it('updates a nested item', () => {
    const next = updateMenuItem(tree(), 'e', { caption: 'Deep' });
    expect(findMenuItem(next, 'e')?.caption).toBe('Deep');
  });

  it('leaves the input tree untouched', () => {
    const original = tree();
    updateMenuItem(original, 'e', { caption: 'Deep' });
    expect(findMenuItem(original, 'e')?.caption).toBe('e');
  });

  it('is a no-op when the id is absent', () => {
    expect(updateMenuItem(tree(), 'ghost', { caption: 'x' })).toEqual(tree());
  });
});

describe('deleteMenuItem', () => {
  it('removes a root item', () => {
    expect(getAllItemIds(deleteMenuItem(tree(), 'a'))).not.toContain('a');
  });

  it('removes a nested item', () => {
    expect(getAllItemIds(deleteMenuItem(tree(), 'c'))).not.toContain('c');
  });

  it('removes descendants along with the item', () => {
    const ids = getAllItemIds(deleteMenuItem(tree(), 'd'));
    expect(ids).not.toContain('d');
    expect(ids).not.toContain('e');
  });

  it('leaves the input tree untouched', () => {
    const original = tree();
    deleteMenuItem(original, 'd');
    expect(getAllItemIds(original)).toContain('e');
  });

  it('is a no-op when the id is absent', () => {
    expect(deleteMenuItem(tree(), 'ghost')).toEqual(tree());
  });
});

describe('addMenuItem', () => {
  it('appends at root when no parent is given', () => {
    const next = addMenuItem(tree(), item('z'));
    expect(next.map((i) => i.id)).toEqual(['a', 'b', 'f', 'z']);
  });

  it('appends under the named parent', () => {
    const next = addMenuItem(tree(), item('z'), 'b');
    expect(findMenuItem(next, 'b')?.children?.map((c) => c.id)).toEqual(['c', 'd', 'z']);
  });

  it('creates the children array for a previously childless parent', () => {
    const next = addMenuItem(tree(), item('z'), 'a');
    expect(findMenuItem(next, 'a')?.children?.map((c) => c.id)).toEqual(['z']);
  });

  it('appends under a deeply nested parent', () => {
    const next = addMenuItem(tree(), item('z'), 'd');
    expect(findMenuItem(next, 'd')?.children?.map((c) => c.id)).toEqual(['e', 'z']);
  });

  it('leaves the tree unchanged when the parent is absent', () => {
    expect(getAllItemIds(addMenuItem(tree(), item('z'), 'ghost'))).not.toContain('z');
  });
});

describe('duplicateMenuItem', () => {
  it('inserts the copy directly after the original', () => {
    const next = duplicateMenuItem(tree(), 'a', 'a2');
    expect(next.map((i) => i.id)).toEqual(['a', 'a2', 'b', 'f']);
  });

  it('marks the copy in its caption', () => {
    const next = duplicateMenuItem(tree(), 'a', 'a2');
    expect(findMenuItem(next, 'a2')?.caption).toBe('a (Copy)');
  });

  it('duplicates a nested item as a sibling', () => {
    const next = duplicateMenuItem(tree(), 'c', 'c2');
    expect(findMenuItem(next, 'b')?.children?.map((i) => i.id)).toEqual(['c', 'c2', 'd']);
  });

  it('deep-clones descendants with fresh ids', () => {
    const next = duplicateMenuItem(tree(), 'd', 'd2');
    const copy = findMenuItem(next, 'd2');
    expect(copy?.children).toHaveLength(1);
    // The clone must not reuse 'e', or the tree would hold duplicate ids.
    expect(copy?.children?.[0].id).not.toBe('e');
    expect(copy?.children?.[0].caption).toBe('e');
  });

  it('leaves a childless item without a children array', () => {
    expect(findMenuItem(duplicateMenuItem(tree(), 'a', 'a2'), 'a2')?.children).toBeUndefined();
  });

  it('is a no-op when the id is absent', () => {
    expect(duplicateMenuItem(tree(), 'ghost', 'x')).toEqual(tree());
  });
});

describe('moveMenuItem', () => {
  it('moves an item before a root target', () => {
    expect(moveMenuItem(tree(), 'f', 'a', 'before').map((i) => i.id)).toEqual(['f', 'a', 'b']);
  });

  it('moves an item after a root target', () => {
    expect(moveMenuItem(tree(), 'a', 'f', 'after').map((i) => i.id)).toEqual(['b', 'f', 'a']);
  });

  it('moves an item inside a target', () => {
    const next = moveMenuItem(tree(), 'f', 'b', 'inside');
    expect(next.map((i) => i.id)).toEqual(['a', 'b']);
    expect(findMenuItem(next, 'b')?.children?.map((c) => c.id)).toEqual(['c', 'd', 'f']);
  });

  it('moves a nested item out to the root', () => {
    const next = moveMenuItem(tree(), 'e', 'a', 'before');
    expect(next.map((i) => i.id)).toEqual(['e', 'a', 'b', 'f']);
    expect(findMenuItem(next, 'd')?.children ?? []).toHaveLength(0);
  });

  it('moves a root item into a nested target', () => {
    const next = moveMenuItem(tree(), 'a', 'e', 'after');
    expect(findMenuItem(next, 'd')?.children?.map((c) => c.id)).toEqual(['e', 'a']);
  });

  it('returns the tree unchanged when the source is absent', () => {
    expect(moveMenuItem(tree(), 'ghost', 'a', 'before')).toEqual(tree());
  });

  it('preserves the total item count', () => {
    expect(countItems(moveMenuItem(tree(), 'f', 'b', 'inside'))).toBe(countItems(tree()));
  });
});

describe('countItems', () => {
  it('counts every node at every depth', () => {
    expect(countItems(tree())).toBe(6);
  });

  it('returns 0 for an empty tree', () => {
    expect(countItems([])).toBe(0);
  });

  it('ignores an empty children array', () => {
    expect(countItems([item('x', 'x', [])])).toBe(1);
  });
});

describe('getAllItemIds', () => {
  it('collects ids depth-first', () => {
    expect(getAllItemIds(tree())).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('returns an empty array for an empty tree', () => {
    expect(getAllItemIds([])).toEqual([]);
  });
});
