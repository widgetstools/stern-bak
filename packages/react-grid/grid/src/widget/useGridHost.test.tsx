import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { generalSettingsModule } from '@wellsfargo-starui/grid/customizer';
import { useGridHost } from './useGridHost';

function makeFakeApi() {
  const options: Record<string, unknown> = {};
  const api = {
    setGridOption: vi.fn((key: string, value: unknown) => {
      options[key] = value;
    }),
    getGridOption: vi.fn((key: string) => options[key]),
    isDestroyed: () => false,
  } as unknown as GridApi;
  return { api, options };
}

describe('useGridHost', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  it('constructs a platform and exposes transformed columnDefs/gridOptions', () => {
    const { result } = renderHook(() =>
      useGridHost({
        gridId: 'g1',
        modules: [generalSettingsModule],
        baseColumnDefs: [{ field: 'price' }],
      }),
    );

    expect(result.current.platform).toBeTruthy();
    expect(result.current.columnDefs).toEqual([{ field: 'price' }]);
    expect(result.current.gridOptions).toBeTruthy();
  });

  it('onGridReady binds the api and syncs changed grid options', () => {
    const { result } = renderHook(() =>
      useGridHost({
        gridId: 'g1',
        modules: [generalSettingsModule],
        baseColumnDefs: [{ field: 'price' }],
      }),
    );
    const { api } = makeFakeApi();

    act(() => {
      result.current.onGridReady({ api } as never);
    });

    act(() => {
      result.current.platform.store.setModuleState('general-settings', () => ({
        rowHeight: 28,
        headerHeight: 30,
      }));
    });

    expect(api.setGridOption).toHaveBeenCalled();
  });

  it('onGridPreDestroyed destroys the platform', () => {
    const { result } = renderHook(() =>
      useGridHost({
        gridId: 'g1',
        modules: [generalSettingsModule],
        baseColumnDefs: [],
      }),
    );
    const destroySpy = vi.spyOn(result.current.platform, 'destroy');
    act(() => {
      result.current.onGridPreDestroyed();
    });
    expect(destroySpy).toHaveBeenCalled();
  });
});
