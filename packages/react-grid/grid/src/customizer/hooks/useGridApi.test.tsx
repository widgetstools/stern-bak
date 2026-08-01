/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from './GridProvider.js';
import { useGridApi, useGridEvent } from './useGridApi.js';

function wrap(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GridProvider platform={platform}>{children}</GridProvider>;
  };
}

describe('useGridApi', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    platform = new GridPlatform({ gridId: 'api-hook-grid', modules: [] });
  });

  it('returns null before grid ready', () => {
    const { result } = renderHook(() => useGridApi(), { wrapper: wrap(platform) });
    expect(result.current).toBeNull();
  });

  it('returns api after onGridReady', () => {
    const api = { refreshCells: vi.fn() } as unknown as GridApi;
    const { result } = renderHook(() => useGridApi(), { wrapper: wrap(platform) });
    act(() => platform.onGridReady(api));
    expect(result.current).toBe(api);
  });
});

describe('useGridEvent', () => {
  it('subscribes and cleans up on unmount', () => {
    const platform = new GridPlatform({ gridId: 'evt-grid', modules: [] });
    const handler = vi.fn();
    const api = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as GridApi;
    platform.onGridReady(api);

    const { unmount } = renderHook(() => useGridEvent('sortChanged', handler), {
      wrapper: wrap(platform),
    });
    expect(api.addEventListener).toHaveBeenCalledWith('sortChanged', handler);
    unmount();
  });
});
