/**
 * Set filters must ask the worker, not the rows this window holds.
 *
 * AG builds its checkbox list from client rows; under Perspective those are
 * the loaded blocks, so an untouched set filter shows whichever handful of
 * values happened to be on screen and presents them as the column's values.
 */

import { describe, expect, it, vi } from 'vitest';
import { withPerspectiveSetFilterValues } from './perspectiveSetFilterValues';

const values = async (colId: string) => [`${colId}-a`, `${colId}-b`];

/** Drive the `values` callback AG would call. */
function readValues(colDef: unknown): Promise<unknown[]> {
  const params = (colDef as { filterParams: { values: (p: unknown) => void } }).filterParams;
  return new Promise((resolve) => params.values({ success: resolve }));
}

describe('withPerspectiveSetFilterValues', () => {
  it('points a set filter at the supplier', async () => {
    const [out] = withPerspectiveSetFilterValues(
      [{ field: 'desk', filter: 'agSetColumnFilter' }],
      values,
    );

    await expect(readValues(out)).resolves.toEqual(['desk-a', 'desk-b']);
  });

  it('prefers colId over field', async () => {
    const [out] = withPerspectiveSetFilterValues(
      [{ colId: 'deskId', field: 'desk', filter: 'agSetColumnFilter' }],
      values,
    );

    await expect(readValues(out)).resolves.toEqual(['deskId-a', 'deskId-b']);
  });

  it('leaves non-set filters alone', () => {
    const input = [{ field: 'price', filter: 'agNumberColumnFilter' }];
    expect(withPerspectiveSetFilterValues(input, values)[0]).toBe(input[0]);
  });

  it('leaves a column that already declares its own values alone', () => {
    // A host that hard-coded a domain list meant it.
    const input = [
      { field: 'desk', filter: 'agSetColumnFilter', filterParams: { values: ['FX'] } },
    ];
    expect(withPerspectiveSetFilterValues(input, values)[0]).toBe(input[0]);
  });

  it('preserves other filterParams', async () => {
    const [out] = withPerspectiveSetFilterValues(
      [{ field: 'desk', filter: 'agSetColumnFilter', filterParams: { suppressMiniFilter: true } }],
      values,
    );

    expect((out as { filterParams: Record<string, unknown> }).filterParams.suppressMiniFilter)
      .toBe(true);
    await expect(readValues(out)).resolves.toEqual(['desk-a', 'desk-b']);
  });

  it('recurses into column groups', async () => {
    const [group] = withPerspectiveSetFilterValues(
      [{ headerName: 'Book', children: [{ field: 'desk', filter: 'agSetColumnFilter' }] }],
      values,
    );

    const child = (group as { children: unknown[] }).children[0];
    await expect(readValues(child)).resolves.toEqual(['desk-a', 'desk-b']);
  });

  it('calls success with an empty list when the worker refuses', async () => {
    const [out] = withPerspectiveSetFilterValues(
      [{ field: 'desk', filter: 'agSetColumnFilter' }],
      async () => null,
    );

    await expect(readValues(out)).resolves.toEqual([]);
  });

  it('still calls success when the supplier rejects', async () => {
    const [out] = withPerspectiveSetFilterValues(
      [{ field: 'desk', filter: 'agSetColumnFilter' }],
      async () => {
        throw new Error('worker gone');
      },
    );

    // AG wants `success` exactly once; a rejection that never calls it leaves
    // the filter menu spinning forever.
    await expect(readValues(out)).resolves.toEqual([]);
  });

  it('does not mutate the input column defs', () => {
    const input = [{ field: 'desk', filter: 'agSetColumnFilter' }] as Record<string, unknown>[];
    const supplier = vi.fn(values);

    withPerspectiveSetFilterValues(input, supplier);

    expect(input[0].filterParams).toBeUndefined();
  });
});
