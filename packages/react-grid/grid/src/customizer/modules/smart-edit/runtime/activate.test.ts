/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { activateSmartEdit } from './activate.js';

describe('activateSmartEdit', () => {
  test('ignores +/- when plus-minus module is enabled', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    let cellKeyDownHandler: ((e: { event?: Event }) => void) | null = null;

    const api = {
      getEditingCells: () => [],
      getCellRanges: () => [],
      getFocusedCell: () => ({ rowIndex: 0, column: { getColId: () => 'qty' } }),
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', qty: 10 } }),
      getRowNode: () => ({ data: { id: 'r1', qty: 10 } }),
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'qty', cellDataType: 'number' }),
      }),
      getCellValue: () => 10,
      applyTransactionAsync,
      addEventListener: (name: string, fn: typeof cellKeyDownHandler) => {
        if (name === 'cellKeyDown') cellKeyDownHandler = fn;
      },
      removeEventListener: vi.fn(),
    };

    const platform = {
      getState: () => ({
        settings: {
          enabled: true,
          incrementStep: 2,
          magnitudeShortcutsEnabled: true,
          enabledOps: ['add'],
          confirmThreshold: 0,
          recordHistory: true,
        },
      }),
      getModuleState: (id: string) => {
        if (id === 'plus-minus') return { settings: { enabled: true }, nudges: [] };
        throw new Error(id);
      },
      api: {
        onReady: (cb: (api: typeof api) => void) => {
          cb(api);
          return () => {};
        },
      },
    };

    activateSmartEdit(platform as never);
    await cellKeyDownHandler!({
      event: { key: '+', preventDefault: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('handles cellKeyDown + and applies increment', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    let cellKeyDownHandler: ((e: { event?: Event }) => void) | null = null;

    const api = {
      getEditingCells: () => [],
      getCellRanges: () => [],
      getFocusedCell: () => ({ rowIndex: 0, column: { getColId: () => 'qty' } }),
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', qty: 10 } }),
      getRowNode: () => ({ data: { id: 'r1', qty: 10, ticker: 'ABC' } }),
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'qty', cellDataType: 'number' }),
      }),
      getCellValue: () => 10,
      applyTransactionAsync,
      addEventListener: (name: string, fn: typeof cellKeyDownHandler) => {
        if (name === 'cellKeyDown') cellKeyDownHandler = fn;
      },
      removeEventListener: vi.fn(),
    };

    const platform = {
      getState: () => ({
        settings: {
          enabled: true,
          incrementStep: 2,
          magnitudeShortcutsEnabled: true,
          enabledOps: ['add'],
          confirmThreshold: 0,
          recordHistory: true,
        },
      }),
      getModuleState: (id: string) => {
        if (id === 'plus-minus') throw new Error('missing');
        throw new Error(id);
      },
      gridId: 'g1',
      api: {
        onReady: (cb: (api: typeof api) => void) => {
          cb(api);
          return () => {};
        },
      },
    };

    const dispose = activateSmartEdit(platform as never);
    expect(cellKeyDownHandler).toBeTruthy();

    await cellKeyDownHandler!({
      event: { key: '+', preventDefault: vi.fn() } as unknown as KeyboardEvent,
    });

    expect(applyTransactionAsync).toHaveBeenCalled();
    dispose();
  });

  it('applies subtract on - and treats = as increment', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    let cellKeyDownHandler: ((e: { event?: Event }) => void) | null = null;

    const api = {
      getEditingCells: () => [],
      getCellRanges: () => [],
      getFocusedCell: () => ({ rowIndex: 0, column: { getColId: () => 'qty' } }),
      getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', qty: 10 } }),
      getRowNode: () => ({ data: { id: 'r1', qty: 10 } }),
      getColumn: () => ({
        getColDef: () => ({ editable: true, field: 'qty', cellDataType: 'number' }),
      }),
      getCellValue: () => 10,
      applyTransactionAsync,
      addEventListener: (name: string, fn: typeof cellKeyDownHandler) => {
        if (name === 'cellKeyDown') cellKeyDownHandler = fn;
      },
      removeEventListener: vi.fn(),
    };

    const platform = {
      getState: () => ({
        settings: {
          enabled: true,
          incrementStep: 3,
          magnitudeShortcutsEnabled: true,
          enabledOps: ['add', 'subtract'],
          confirmThreshold: 0,
          recordHistory: true,
        },
      }),
      getModuleState: () => { throw new Error('missing'); },
      gridId: 'g-sub',
      api: {
        onReady: (cb: (api: typeof api) => void) => {
          cb(api);
          return () => {};
        },
      },
    };

    const dispose = activateSmartEdit(platform as never);
    await cellKeyDownHandler!({
      event: { key: '-', preventDefault: vi.fn() } as unknown as KeyboardEvent,
    });
    await cellKeyDownHandler!({
      event: { key: '=', preventDefault: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('ignores when editing, no cells, or getEditingCells throws', async () => {
    const applyTransactionAsync = vi.fn();
    let cellKeyDownHandler: ((e: { event?: Event }) => void) | null = null;

    const api = {
      getEditingCells: () => [],
      getCellRanges: () => [],
      getFocusedCell: () => null as never,
      addEventListener: (name: string, fn: typeof cellKeyDownHandler) => {
        if (name === 'cellKeyDown') cellKeyDownHandler = fn;
      },
      removeEventListener: vi.fn(),
      applyTransactionAsync,
    };

    const platform = {
      getState: () => ({
        settings: {
          enabled: true,
          incrementStep: 1,
          magnitudeShortcutsEnabled: true,
          enabledOps: ['add'],
          confirmThreshold: 0,
        },
      }),
      api: {
        onReady: (cb: (api: typeof api) => void) => {
          cb(api);
          return () => {};
        },
      },
    };

    activateSmartEdit(platform as never);
    await cellKeyDownHandler!({
      event: { key: '+', preventDefault: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();

    api.getEditingCells = () => { throw new Error('teardown'); };
    await cellKeyDownHandler!({
      event: { key: '+', preventDefault: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('ignores when disabled', async () => {
    const applyTransactionAsync = vi.fn();
    let cellKeyDownHandler: ((e: { event?: Event }) => void) | null = null;

    const api = {
      getEditingCells: () => [],
      addEventListener: (name: string, fn: typeof cellKeyDownHandler) => {
        if (name === 'cellKeyDown') cellKeyDownHandler = fn;
      },
      removeEventListener: vi.fn(),
      applyTransactionAsync,
    };

    const platform = {
      getState: () => ({
        settings: {
          enabled: false,
          incrementStep: 1,
          magnitudeShortcutsEnabled: true,
          enabledOps: [],
          confirmThreshold: 0,
        },
      }),
      api: {
        onReady: (cb: (api: typeof api) => void) => {
          cb(api);
          return () => {};
        },
      },
    };

    activateSmartEdit(platform as never);
    await cellKeyDownHandler!({
      event: { key: '+', preventDefault: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();
  });
});
