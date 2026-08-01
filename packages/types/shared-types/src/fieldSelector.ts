/**
 * FieldSelector — type definitions and utilities for the STOMP field tree.
 */

import type { FieldInfo } from './dataProvider.js';

export interface FieldNode {
  path: string;
  name: string;
  type: FieldInfo['type'];
  nullable: boolean;
  sample?: any;
  children?: FieldNode[];
  /** Tree depth (root = 0). Computed when walking the tree; optional on
   *  raw nodes parsed from server schema. */
  depth?: number;
}

/**
 * Convert a FieldInfo (server schema) to a FieldNode (UI tree node).
 */
export function convertFieldInfoToNode(info: FieldInfo): FieldNode {
  const parts = info.path.split('.');
  const name = parts[parts.length - 1];

  const node: FieldNode = {
    path: info.path,
    name,
    type: info.type,
    nullable: info.nullable,
    sample: info.sample,
  };

  if (info.children && Object.keys(info.children).length > 0) {
    node.children = Object.values(info.children).map(convertFieldInfoToNode);
  }

  return node;
}

/**
 * Convert a FieldNode (UI) back to a FieldInfo (server schema).
 */
export function convertFieldNodeToInfo(node: FieldNode): FieldInfo {
  const info: FieldInfo = {
    path: node.path,
    type: node.type,
    nullable: node.nullable,
    sample: node.sample,
  };

  if (node.children && node.children.length > 0) {
    info.children = {};
    node.children.forEach(child => {
      const parts = child.path.split('.');
      const key = parts[parts.length - 1];
      info.children![key] = convertFieldNodeToInfo(child);
    });
  }

  return info;
}

/**
 * Collect all non-object leaf field paths from a node.
 */
export function collectNonObjectLeaves(node: FieldNode): string[] {
  const leaves: string[] = [];

  function walk(n: FieldNode) {
    if (!n.children || n.children.length === 0) {
      if (n.type !== 'object') {
        leaves.push(n.path);
      }
    } else {
      n.children.forEach(walk);
    }
  }

  if (node.children) {
    node.children.forEach(walk);
  } else if (node.type !== 'object') {
    leaves.push(node.path);
  }

  return leaves;
}

/**
 * Find a FieldNode by its dot-separated path in a list of field trees.
 */
export function findFieldByPath(path: string, fields: FieldNode[]): FieldNode | undefined {
  for (const field of fields) {
    if (field.path === path) return field;
    if (field.children) {
      const found = findFieldByPath(path, field.children);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Filter a list of FieldNodes by a search query (matches name or path).
 */
export function filterFields(fields: FieldNode[], query: string): FieldNode[] {
  if (!query.trim()) return fields;
  const lowerQuery = query.toLowerCase();

  return fields.reduce<FieldNode[]>((acc, field) => {
    const nameMatch = field.name.toLowerCase().includes(lowerQuery);
    const pathMatch = field.path.toLowerCase().includes(lowerQuery);

    if (field.children && field.children.length > 0) {
      const filteredChildren = filterFields(field.children, query);
      if (filteredChildren.length > 0 || nameMatch || pathMatch) {
        acc.push({
          ...field,
          children: filteredChildren.length > 0 ? filteredChildren : field.children,
        });
      }
    } else if (nameMatch || pathMatch) {
      acc.push(field);
    }

    return acc;
  }, []);
}
