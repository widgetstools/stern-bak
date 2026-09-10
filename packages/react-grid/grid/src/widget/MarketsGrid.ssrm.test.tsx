import { describe, expect, it } from 'vitest';
import type { MarketsGridProps } from './types.js';

describe('MarketsGrid ssrm prop', () => {
  it('is optional and discriminated from CSRM rowData', () => {
    const props: MarketsGridProps = {
      gridId: 'g1',
      rowData: [],
      columnDefs: [],
    };
    expect(props.ssrm).toBeUndefined();
  });
});
