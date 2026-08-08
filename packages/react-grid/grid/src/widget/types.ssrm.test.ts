import { describe, expect, it } from 'vitest';
import type { MarketsGridProps, MarketsGridSsrmProps } from './types.js';

/** Runtime guard used by host/surface — implement in types.ts next to the types. */
import { isMarketsGridSsrmMode } from './types.js';

describe('isMarketsGridSsrmMode', () => {
  it('is true when ssrm.provider is present', () => {
    const ssrm: MarketsGridSsrmProps = {
      provider: { id: 'p1' } as MarketsGridSsrmProps['provider'],
      keyColumn: 'positionId',
    };
    const props = { gridId: 'g1', columnDefs: [], ssrm } as MarketsGridProps;
    expect(isMarketsGridSsrmMode(props)).toBe(true);
  });

  it('is false for CSRM rowData props', () => {
    const props = {
      gridId: 'g1',
      columnDefs: [],
      rowData: [],
    } as MarketsGridProps;
    expect(isMarketsGridSsrmMode(props)).toBe(false);
  });
});
