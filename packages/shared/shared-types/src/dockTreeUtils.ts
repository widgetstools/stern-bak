/**
 * Tree Utilities — immutable operations on DockMenuItem[] trees.
 */

import type { DockMenuItem } from './dockConfig.js';

/** Recursively find a menu item by id. */
export function findMenuItem(items: DockMenuItem[], id: string): DockMenuItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children?.length) {
      const found = findMenuItem(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** Update a menu item's properties by id (deep). */
export function updateMenuItem(
  items: DockMenuItem[],
  id: string,
  updates: Partial<DockMenuItem>,
): DockMenuItem[] {
  return items.map((item) => {
    if (item.id === id) return { ...item, ...updates };
    if (item.children?.length) {
      return { ...item, children: updateMenuItem(item.children, id, updates) };
    }
    return item;
  });
}

/** Delete a menu item by id (deep, removes all descendants). */
export function deleteMenuItem(items: DockMenuItem[], id: string): DockMenuItem[] {
  return items
    .filter((item) => item.id !== id)
    .map((item) =>
      item.children?.length
        ? { ...item, children: deleteMenuItem(item.children, id) }
        : item,
    );
}

/** Add a child item under a parent (or at root if no parentId). */
export function addMenuItem(
  items: DockMenuItem[],
  newItem: DockMenuItem,
  parentId?: string,
): DockMenuItem[] {
  if (!parentId) return [...items, newItem];
  return items.map((item) => {
    if (item.id === parentId) {
      return { ...item, children: [...(item.children || []), newItem] };
    }
    if (item.children?.length) {
      return { ...item, children: addMenuItem(item.children, newItem, parentId) };
    }
    return item;
  });
}

/** Duplicate a menu item (placed as sibling after original). */
export function duplicateMenuItem(
  items: DockMenuItem[],
  id: string,
  newId: string,
): DockMenuItem[] {
  const result: DockMenuItem[] = [];
  for (const item of items) {
    if (item.id === id) {
      result.push(item);
      result.push({
        ...item,
        id: newId,
        caption: `${item.caption} (Copy)`,
        children: item.children ? deepCloneChildren(item.children) : undefined,
      });
    } else {
      result.push(
        item.children?.length
          ? { ...item, children: duplicateMenuItem(item.children, id, newId) }
          : item,
      );
    }
  }
  return result;
}

function deepCloneChildren(items: DockMenuItem[]): DockMenuItem[] {
  return items.map((item) => ({
    ...item,
    id: `${item.id}-copy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    children: item.children ? deepCloneChildren(item.children) : undefined,
  }));
}

/** Move a menu item before/after/inside a target. */
export function moveMenuItem(
  items: DockMenuItem[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after' | 'inside',
): DockMenuItem[] {
  const source = findMenuItem(items, sourceId);
  if (!source) return items;

  let result = deleteMenuItem(items, sourceId);

  if (position === 'inside') {
    return addMenuItem(result, source, targetId);
  }

  return insertRelative(result, source, targetId, position);
}

function insertRelative(
  items: DockMenuItem[],
  source: DockMenuItem,
  targetId: string,
  position: 'before' | 'after',
): DockMenuItem[] {
  const result: DockMenuItem[] = [];
  for (const item of items) {
    if (item.id === targetId) {
      if (position === 'before') {
        result.push(source, item);
      } else {
        result.push(item, source);
      }
    } else {
      result.push(
        item.children?.length
          ? { ...item, children: insertRelative(item.children, source, targetId, position) }
          : item,
      );
    }
  }
  return result;
}

/** Count all items recursively. */
export function countItems(items: DockMenuItem[]): number {
  let count = 0;
  for (const item of items) {
    count += 1;
    if (item.children?.length) count += countItems(item.children);
  }
  return count;
}

/** Collect all item IDs recursively. */
export function getAllItemIds(items: DockMenuItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    ids.push(item.id);
    if (item.children?.length) ids.push(...getAllItemIds(item.children));
  }
  return ids;
}
