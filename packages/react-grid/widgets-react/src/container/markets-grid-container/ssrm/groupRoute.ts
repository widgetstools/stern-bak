/**
 * Recovering the path to the level a request is asking for.
 *
 * `IServerSideGetRowsRequest.groupKeys` is declared `string[]` but AG Grid fills
 * it from `RowNode.getRoute()`, which pushes each `key` **raw** — so a datetime
 * group arrives as epoch milliseconds and a boolean group as a boolean. That
 * part is fine. The problem is the walk itself:
 *
 *     getRoute() {
 *       if (this.key == null) return undefined
 *       while (pointer?.key != null) { res.push(pointer.key); pointer = pointer.parent }
 *     }
 *
 * A null key ends the route. Expanding a group whose value is null therefore
 * sends `groupKeys: []` — and the datasource, asked for the children of
 * nothing, serves the *top level again inside that group*. A null-keyed
 * ancestor truncates just as silently: the children of `[null, 'Rates']` are
 * requested as `['Rates']`, which is a different set of rows.
 *
 * The parent node itself is handed to the datasource on every request, and our
 * own group rows carry the key in `data[groupColumn]`. Walking it back up
 * recovers the whole route with its types intact, nulls included.
 */

/** The part of `IRowNode` this needs, so it can be tested without a grid. */
export type RouteNode = {
  level: number;
  key: string | null;
  data?: Record<string, unknown> | null;
  parent?: RouteNode | null;
};

export type ResolveRouteOptions = {
  /** The node whose children are being requested. */
  parentNode: RouteNode | null | undefined;
  /** Row-group column ids in order. */
  groupColumns: readonly string[];
  /** What AG Grid sent, used only when it is not truncated. */
  requestKeys: readonly unknown[];
};

/**
 * The group path to `parentNode`, one entry per level, each in the type the
 * engine grouped by.
 */
export function resolveGroupRoute({
  parentNode,
  groupColumns,
  requestKeys,
}: ResolveRouteOptions): unknown[] {
  const chain: RouteNode[] = [];
  for (let node = parentNode; node && node.level >= 0; node = node.parent ?? null) {
    chain.unshift(node);
  }

  if (chain.length === 0) return [];

  return chain.map((node, level) => {
    // Prefer the value off the row, which is what the engine returned and what
    // `mapGroupRows` wrote; `key` is AG Grid's copy of the same thing.
    const column = groupColumns[level] ?? groupColumns[groupColumns.length - 1];
    if (column && node.data && column in node.data) return node.data[column];
    if (node.key !== null && node.key !== undefined) return node.key;

    /*
     * Fall back to the request only when it is the same depth. A shorter one is
     * exactly the truncation this exists to repair, so trusting it there would
     * reintroduce the bug.
     */
    if (requestKeys.length === chain.length) return requestKeys[level];
    return null;
  });
}
