import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ValueFormatterParams, ValueGetterParams } from 'ag-grid-community';
import { applyDelta } from './applyDelta';
import { labStorage } from './storage';
import { useDebouncedValue } from './useDebouncedValue';
import { useMockStream } from './useMockStream';
import {
  LAB_DEMO_PROFILES_FLAG_VERSION,
  useLabDemoProfiles,
} from './useLabDemoProfiles';
import { mockGridApi, mockMarketsGridHandle, mockStreamControls } from '../testSetupMocks';
import type { LabRow } from './types';

describe('applyDelta', () => {
  it('merges updates and appends new rows', () => {
    const base = [{ id: '1', v: 1 }, { id: '2', v: 2 }];
    const incoming = [{ id: '2', v: 20 }, { id: '3', v: 3 }];
    expect(applyDelta(base, incoming, 'id')).toEqual([
      { id: '1', v: 1 },
      { id: '2', v: 20 },
      { id: '3', v: 3 },
    ]);
  });

  it('returns snapshot when incoming is empty', () => {
    const base = [{ id: '1', v: 1 }];
    expect(applyDelta(base, [], 'id')).toBe(base);
  });
});

describe('labStorage', () => {
  it('is created from grid storage factory', () => {
    expect(labStorage).toBeDefined();
    expect(typeof labStorage.load).toBe('function');
    expect(typeof labStorage.save).toBe('function');
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces value updates', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 100, delay: 300 } },
    );
    expect(result.current).toBe(100);
    rerender({ value: 500, delay: 300 });
    expect(result.current).toBe(100);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(500);
  });
});

describe('useMockStream', () => {
  beforeEach(() => {
    mockStreamControls.reset();
  });

  it('applies full snapshots to row state', async () => {
    const gridApiRef = { current: null as typeof mockGridApi | null };
    const rows: LabRow[] = [
      { id: '1', bidPrice: 100 } as LabRow,
      { id: '2', bidPrice: 101 } as LabRow,
    ];

    const { result } = renderHook(() =>
      useMockStream('mock-test', { rowCount: 2 }, { gridApiRef }),
    );

    act(() => mockStreamControls.emitDelta(rows, true));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.snapshotRowCount).toBe(2);
  });

  it('routes tick deltas through grid api when ready', () => {
    const gridApiRef = { current: mockGridApi };
    renderHook(() => useMockStream('mock-ticks', {}, { gridApiRef }));

    act(() =>
      mockStreamControls.emitDelta([{ id: '1', bidPrice: 99 } as LabRow], false),
    );
    expect(mockGridApi.applyTransactionAsync).toHaveBeenCalled();
  });

  it('clears rows when provider id changes', async () => {
    const gridApiRef = { current: mockGridApi };
    const { rerender } = renderHook(
      ({ providerId }) => useMockStream(providerId, {}, { gridApiRef }),
      { initialProps: { providerId: 'a' } },
    );

    rerender({ providerId: 'b' });
    expect(mockGridApi.setGridOption).toHaveBeenCalledWith('rowData', []);
  });
});

describe('useLabDemoProfiles', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMarketsGridHandle.setConfig.mockClear().mockResolvedValue(undefined);
  });

  it('installs demo profiles on first mount', async () => {
    const profiles = [
      { id: 'p1', name: 'One', blurb: 'b', seed: { 'general-settings': { activeDurationMs: 100 } } },
    ];
    const { result } = renderHook(() =>
      useLabDemoProfiles('grid-test', profiles, 'p1'),
    );

    await act(async () => {
      result.current(mockMarketsGridHandle as never);
    });

    expect(mockMarketsGridHandle.setConfig).toHaveBeenCalled();
    expect(localStorage.getItem(`lab-demo-profiles-${LAB_DEMO_PROFILES_FLAG_VERSION}:grid-test`)).toBe('1');
  });

  it('skips install when already seeded', async () => {
    localStorage.setItem(`lab-demo-profiles-${LAB_DEMO_PROFILES_FLAG_VERSION}:grid-seeded`, '1');
    const { result } = renderHook(() =>
      useLabDemoProfiles('grid-seeded', [], 'p1'),
    );

    await act(async () => {
      result.current(mockMarketsGridHandle as never);
    });

    expect(mockMarketsGridHandle.setConfig).not.toHaveBeenCalled();
  });

  it('warns when setConfig is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = { ...mockMarketsGridHandle, setConfig: undefined };
    const { result } = renderHook(() =>
      useLabDemoProfiles('grid-no-config', [{ id: 'p', name: 'n', blurb: 'b', seed: {} }], 'p'),
    );

    await act(async () => {
      result.current(handle as never);
    });

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
