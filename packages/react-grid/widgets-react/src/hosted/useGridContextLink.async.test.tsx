/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Awaitable selection builders. SSRM's builder must ask the worker for
 * group / select-all keys, so `buildContext` may return a Promise. The
 * publish path awaits it behind a sequence guard: a build that resolves
 * after a newer selection fired is discarded, never broadcast.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { GridApi } from 'ag-grid-community';
import { useGridContextLink } from './useGridContextLink.js';
import type { GridLinkSelectionContext } from './gridContextLink.js';

function fakeApi(selectedNodes: unknown[] = []): GridApi {
  const listeners = new Map<string, Set<() => void>>();
  return {
    getSelectedNodes: () => selectedNodes,
    getFilterModel: () => ({}),
    setFilterModel: vi.fn(),
    setGridOption: vi.fn(),
    onFilterChanged: vi.fn(),
    getColumn: (id: string) => ({ colId: id }),
    addEventListener: (event: string, fn: () => void) => {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(fn);
    },
    removeEventListener: (event: string, fn: () => void) => {
      listeners.get(event)?.delete(fn);
    },
    __fireSelection: () => listeners.get('selectionChanged')?.forEach((fn) => fn()),
  } as unknown as GridApi & { __fireSelection: () => void };
}

function fakeFdc3() {
  const handlers = new Map<string, Set<(ctx: unknown) => void>>();
  return {
    current: 'purple' as string | null,
    broadcast: vi.fn().mockResolvedValue(undefined),
    join: vi.fn(),
    leave: vi.fn(),
    addContextListener: (type: string, handler: (ctx: unknown) => void) => {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      set.add(handler);
      return () => set!.delete(handler);
    },
    __emit: (type: string, ctx: unknown) => handlers.get(type)?.forEach((h) => h(ctx)),
  };
}

afterEach(() => {
  cleanup();
  delete (window as any).fin;
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('async selection builders', () => {
  it('awaits a promise-returning builder and broadcasts its result', async () => {
    const api = fakeApi();
    const fdc3 = fakeFdc3();
    const build = vi.fn(async (): Promise<GridLinkSelectionContext> => ({
      type: 'starui.gridSelection',
      criteria: { positionId: ['P1'] },
    }));
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        transport: fdc3,
        instanceId: 'grid-a',
        config: { enabled: true, mode: 'fields', advanced: { buildContext: build } },
      }),
    );

    await act(async () => {
      (api as any).__fireSelection();
      await flush();
    });

    expect(fdc3.broadcast).toHaveBeenCalledTimes(1);
    expect(fdc3.broadcast.mock.calls[0][0].criteria).toEqual({ positionId: ['P1'] });
  });

  it('discards a stale in-flight build when a newer selection lands', async () => {
    const api = fakeApi();
    const fdc3 = fakeFdc3();
    let release1!: () => void;
    const gate = new Promise<void>((r) => {
      release1 = r;
    });
    let call = 0;
    const build = vi.fn(async (): Promise<GridLinkSelectionContext> => {
      call += 1;
      if (call === 1) {
        await gate; // first build resolves only after the second fired
        return { type: 't', criteria: { positionId: ['STALE'] } };
      }
      return { type: 't', criteria: { positionId: ['FRESH'] } };
    });
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        transport: fdc3,
        instanceId: 'grid-a',
        config: { enabled: true, mode: 'fields', advanced: { buildContext: build } },
      }),
    );

    await act(async () => {
      (api as any).__fireSelection(); // build 1 parks on the gate
      (api as any).__fireSelection(); // build 2 resolves immediately
      await flush();
      release1(); // build 1 resolves now — too late
      await flush();
    });

    expect(fdc3.broadcast).toHaveBeenCalledTimes(1);
    expect(fdc3.broadcast.mock.calls[0][0].criteria).toEqual({ positionId: ['FRESH'] });
  });

  it('publishes nothing when the builder rejects, and recovers on the next selection', async () => {
    const api = fakeApi();
    const fdc3 = fakeFdc3();
    let call = 0;
    const build = vi.fn(async (): Promise<GridLinkSelectionContext> => {
      call += 1;
      if (call === 1) throw new Error('worker unavailable');
      return { type: 't', criteria: { positionId: ['OK'] } };
    });
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        transport: fdc3,
        instanceId: 'grid-a',
        config: { enabled: true, mode: 'fields', advanced: { buildContext: build } },
      }),
    );

    await act(async () => {
      (api as any).__fireSelection();
      await flush();
    });
    expect(fdc3.broadcast).not.toHaveBeenCalled();

    await act(async () => {
      (api as any).__fireSelection();
      await flush();
    });
    expect(fdc3.broadcast).toHaveBeenCalledTimes(1);
  });

  it('still supports plain synchronous builders', async () => {
    const api = fakeApi();
    const fdc3 = fakeFdc3();
    renderHook(() =>
      useGridContextLink({
        gridApi: api,
        transport: fdc3,
        instanceId: 'grid-a',
        config: {
          enabled: true,
          mode: 'fields',
          advanced: {
            buildContext: () => ({ type: 't', criteria: { positionId: ['SYNC'] } }),
          },
        },
      }),
    );

    await act(async () => {
      (api as any).__fireSelection();
      await flush();
    });

    expect(fdc3.broadcast).toHaveBeenCalledTimes(1);
    expect(fdc3.broadcast.mock.calls[0][0].criteria).toEqual({ positionId: ['SYNC'] });
  });
});
