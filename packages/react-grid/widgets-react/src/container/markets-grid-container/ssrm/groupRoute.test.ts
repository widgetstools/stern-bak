import { describe, expect, it } from 'vitest';
import { resolveGroupRoute, type RouteNode } from './groupRoute.js';

const node = (
  level: number,
  key: string | null,
  data: Record<string, unknown> | null,
  parent: RouteNode | null = null,
): RouteNode => ({ level, key, data, parent });

describe('resolveGroupRoute', () => {
  it('returns [] at the root', () => {
    expect(resolveGroupRoute({ parentNode: null, groupColumns: ['a'], requestKeys: [] })).toEqual([]);
    // AG Grid's synthetic root node has level -1.
    expect(
      resolveGroupRoute({ parentNode: node(-1, null, null), groupColumns: ['a'], requestKeys: [] }),
    ).toEqual([]);
  });

  it('prefers the typed value off the row data over AG Grid stringified keys', () => {
    const parent = node(0, '1700000000000', { tradeDate: 1700000000000 });
    expect(
      resolveGroupRoute({ parentNode: parent, groupColumns: ['tradeDate'], requestKeys: ['1700000000000'] }),
    ).toEqual([1700000000000]);
  });

  it('repairs a route truncated by a null-keyed ancestor', () => {
    // getRoute() stops at a null key, so the request said [] — the node chain
    // still knows the truth: [null, 'Rates'].
    const root = node(0, null, { region: null });
    const child = node(1, 'Rates', { desk: 'Rates' }, root);
    expect(
      resolveGroupRoute({ parentNode: child, groupColumns: ['region', 'desk'], requestKeys: [] }),
    ).toEqual([null, 'Rates']);
  });

  it('falls back to node.key, then to same-depth request keys', () => {
    const noData = node(0, 'EMEA', null);
    expect(
      resolveGroupRoute({ parentNode: noData, groupColumns: ['region'], requestKeys: [] }),
    ).toEqual(['EMEA']);

    const bare = node(0, null, null);
    expect(
      resolveGroupRoute({ parentNode: bare, groupColumns: ['region'], requestKeys: ['fallback'] }),
    ).toEqual(['fallback']);

    // A SHORTER request is exactly the truncation this repairs — not trusted.
    const deep = node(1, null, null, node(0, null, null));
    expect(
      resolveGroupRoute({ parentNode: deep, groupColumns: ['a', 'b'], requestKeys: ['only-one'] }),
    ).toEqual([null, null]);
  });
});
