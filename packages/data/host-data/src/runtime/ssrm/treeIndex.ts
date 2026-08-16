/**
 * Tree-data index builders for the SSRM query plane.
 *
 * Split out of `QueryEngine.ts`, which was 834 LOC against this repo's 800
 * ceiling (WORKLOG item 15 named exactly this split). These are the parts
 * that turn a FLAT row store into a hierarchy — the block orchestration
 * (filter → index → sort → page → enrich) stays with the engine, because it
 * shares sorting and aggregation with every other block path.
 *
 * Two shapes are supported, matching {@link TreeDataConfig.mode}:
 *  - `parent` — each row names its parent's key;
 *  - `path`   — each row carries its ancestry as an array (CSRM `getDataPath`).
 *
 * Both keep the CSRM expand-after-filter feel: a row that matches the filter
 * pulls in its ancestors so the expand path stays intact, and a MATCHED
 * parent exposes all of its store children rather than only the matching ones.
 */
import { getPathAccessor } from "@wellsfargo-starui/types";
import type { RowStore } from "./RowStore.js";
import type { Row, TreeDataConfig } from "./types.js";

export interface TreeIndex {
  roots: Row[];
  childrenOf: Map<string, Row[]>;
}

/** Node id field for a tree query — the config's own, else the store key. */
export function treeKeyField(
  tree: TreeDataConfig | null,
  store: RowStore,
): string {
  return tree?.keyField ?? store.keyColumn;
}

/**
 * Master-detail probe: a row has detail records when it carries a non-empty
 * array of objects, or has been stamped as such upstream.
 */
export function rowHasDetail(row: Row): boolean {
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("__")) continue;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
      return true;
    }
  }
  return Boolean(row.__ssrmHasDetail);
}

export function buildTreeIndex(
  store: RowStore,
  tree: TreeDataConfig | null,
  filtered: Row[],
  keyField: string,
): TreeIndex {
  const mode = tree?.mode ?? "parent";
  if (mode === "path") {
    return buildPathTreeIndex(store, tree, filtered, keyField);
  }
  return buildParentTreeIndex(store, tree, filtered, keyField);
}

function buildParentTreeIndex(
  store: RowStore,
  tree: TreeDataConfig | null,
  filtered: Row[],
  keyField: string,
): TreeIndex {
  const parentField = tree?.parentField ?? "parentId";
  const readKey = getPathAccessor(keyField);
  const readParent = getPathAccessor(parentField);

  // Universe: filtered rows + their ancestors (so expand paths stay intact).
  const byKey = new Map<string, Row>();
  const matchKeys = new Set<string>();
  for (const row of filtered) {
    const k = readKey(row);
    if (k == null) continue;
    const key = String(k);
    byKey.set(key, row);
    matchKeys.add(key);
  }
  for (const key of [...matchKeys]) {
    const seed = byKey.get(key);
    let parentId = seed === undefined ? undefined : readParent(seed);
    while (parentId != null && parentId !== "") {
      const pk = String(parentId);
      const known = byKey.get(pk);
      if (known !== undefined) {
        parentId = readParent(known);
        continue;
      }
      const ancestor = store.getRow(pk);
      if (!ancestor) break;
      byKey.set(pk, ancestor);
      parentId = readParent(ancestor);
    }
  }

  const childrenOf = new Map<string, Row[]>();
  const roots: Row[] = [];

  for (const row of byKey.values()) {
    const parentId = readParent(row);
    if (parentId == null || parentId === "") {
      roots.push(row);
      continue;
    }
    const pk = String(parentId);
    if (!byKey.has(pk)) {
      // Orphan under current filter — surface as root.
      roots.push(row);
      continue;
    }
    let list = childrenOf.get(pk);
    if (!list) {
      list = [];
      childrenOf.set(pk, list);
    }
    list.push(row);
  }

  // Matched parents expose all store children (CSRM-like expand-after-filter).
  for (const pk of matchKeys) {
    const kids: Row[] = [];
    const seen = new Set<string>();
    for (const row of store.iterate()) {
      const parent = readParent(row);
      if (String(parent ?? "") !== pk) continue;
      const ck = readKey(row);
      if (ck == null) continue;
      const cks = String(ck);
      if (seen.has(cks)) continue;
      seen.add(cks);
      kids.push(byKey.get(cks) ?? row);
    }
    if (kids.length) childrenOf.set(pk, kids);
  }

  return { roots, childrenOf };
}

function buildPathTreeIndex(
  store: RowStore,
  tree: TreeDataConfig | null,
  filtered: Row[],
  keyField: string,
): TreeIndex {
  const pathField = tree?.pathField ?? "orgHierarchy";
  const readKey = getPathAccessor(keyField);
  const readPath = getPathAccessor(pathField);
  const byKey = new Map<string, Row>();
  const pathOf = new Map<string, string[]>();

  const ensureRow = (row: Row): string | null => {
    const k = readKey(row);
    if (k == null) return null;
    const key = String(k);
    byKey.set(key, row);
    const path = readPath(row);
    if (Array.isArray(path)) pathOf.set(key, path.map(String));
    return key;
  };

  for (const row of filtered) ensureRow(row);

  // Pull ancestors by path prefix from the full store
  for (const row of store.iterate()) {
    const path = readPath(row);
    if (!Array.isArray(path) || path.length === 0) continue;
    ensureRow(row);
  }

  // Restrict to matches + ancestors (path prefixes of matches)
  const matchKeys = new Set<string>();
  for (const row of filtered) {
    const k = readKey(row);
    if (k != null) matchKeys.add(String(k));
  }
  const keep = new Set<string>();
  for (const mk of matchKeys) {
    const path = pathOf.get(mk);
    if (!path) {
      keep.add(mk);
      continue;
    }
    // Keep every node whose path is a prefix of this match path
    for (const [key, p] of pathOf) {
      if (p.length <= path.length && p.every((seg, i) => seg === path[i])) {
        keep.add(key);
      }
    }
  }

  const childrenOf = new Map<string, Row[]>();
  const roots: Row[] = [];

  for (const key of keep) {
    const row = byKey.get(key) ?? store.getRow(key);
    if (!row) continue;
    const path = pathOf.get(key) ?? [];
    if (path.length <= 1) {
      roots.push(row);
      continue;
    }
    // Parent = node with path.slice(0,-1)
    const parentPath = path.slice(0, -1);
    let parentKey: string | null = null;
    for (const [k, p] of pathOf) {
      if (
        p.length === parentPath.length &&
        p.every((seg, i) => seg === parentPath[i])
      ) {
        parentKey = k;
        break;
      }
    }
    if (!parentKey) {
      roots.push(row);
      continue;
    }
    let list = childrenOf.get(parentKey);
    if (!list) {
      list = [];
      childrenOf.set(parentKey, list);
    }
    list.push(row);
  }

  // Matched parents: include all store children under their path
  for (const mk of matchKeys) {
    const parentPath = pathOf.get(mk);
    if (!parentPath) continue;
    const kids: Row[] = [];
    for (const [k, p] of pathOf) {
      if (p.length !== parentPath.length + 1) continue;
      if (!parentPath.every((seg, i) => seg === p[i])) continue;
      const row = byKey.get(k) ?? store.getRow(k);
      if (row) kids.push(row);
    }
    if (kids.length) childrenOf.set(mk, kids);
  }

  return { roots, childrenOf };
}
