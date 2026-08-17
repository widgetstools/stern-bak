/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../../hooks/GridProvider';
import { paintsHeaders, useHeaderPaintGate } from './useHeaderPaintGate';

const ssrmSource = () => ({
  source: {
    getRows: async () => ({ rowData: [], rowCount: 0 }),
    getSetFilterValues: async () => [],
    getStatusBar: async () => ({ totalRows: 0, filteredRows: 0, aggregations: [] }),
  },
});

function wrapper(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(GridProvider, { platform }, children);
  };
}

describe('paintsHeaders', () => {
  it('names the two targets that paint a header', () => {
    expect(paintsHeaders('headers')).toBe(true);
    expect(paintsHeaders('cells+headers')).toBe(true);
    // CELLS evaluates per row against the row in hand — correct under either
    // row model, and never gated.
    expect(paintsHeaders('cells')).toBe(false);
  });
});

describe('useHeaderPaintGate', () => {
  it('allows header paint where the grid holds every row', () => {
    const platform = new GridPlatform({ gridId: 'hdr-csrm', modules: [] });
    const { result } = renderHook(() => useHeaderPaintGate(), { wrapper: wrapper(platform) });
    expect(result.current.disabled).toBe(false);
    platform.destroy();
  });

  it('blocks it with control-specific copy where it does not', () => {
    // `forEachNodeAfterFilter` is `_getClientSideRowModel(beans)?.…` in
    // AG-Grid — under the server-side row model the callback never runs and
    // the painter concludes "no row matches" for every rule, silently. The
    // verdict's own copy says "scroll them into view first", which is no help
    // to someone wondering why a header never lights, so this control writes
    // its own and points at the target that does work.
    const platform = new GridPlatform({ gridId: 'hdr-ssrm', modules: [] });
    const { result } = renderHook(() => useHeaderPaintGate(), { wrapper: wrapper(platform) });

    act(() => platform.data.bindSsrm(ssrmSource() as never));
    expect(result.current.disabled).toBe(true);
    expect(result.current.reason).toMatch(/use CELLS instead/i);
    platform.destroy();
  });
});
