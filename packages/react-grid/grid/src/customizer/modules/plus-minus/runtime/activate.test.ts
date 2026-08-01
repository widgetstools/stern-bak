/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import {
  defaultPlusMinusNudge,
  ExpressionEngine,
  GridPlatform,
  INITIAL_PLUS_MINUS,
} from '@wellsfargo-starui/engine';
import { plusMinusModule } from '../index.js';

function makeMockApi() {
  const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
  let cellKeyDownHandler: ((e: { event?: Event }) => void) | null = null;
  const api = {
    getEditingCells: () => [],
    getCellRanges: () => [],
    getFocusedCell: () => ({ rowIndex: 0, column: { getColId: () => 'quantityFace' } }),
    getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', quantityFace: 1000 } }),
    getRowNode: () => ({ data: { id: 'r1', quantityFace: 1000 } }),
    getColumn: () => ({
      getColDef: () => ({ editable: true, field: 'quantityFace', cellDataType: 'number' }),
    }),
    getCellValue: () => 1000,
    applyTransactionAsync,
    addEventListener: (name: string, fn: typeof cellKeyDownHandler) => {
      if (name === 'cellKeyDown') cellKeyDownHandler = fn;
    },
    removeEventListener: vi.fn(),
  };
  return { api, cellKeyDownHandler: () => cellKeyDownHandler, applyTransactionAsync };
}

describe('activatePlusMinus', () => {
  it('applies increment on + key when enabled', async () => {
    const platform = new GridPlatform({
      gridId: 'pm-grid',
      modules: [plusMinusModule],
    });
    platform.store.setModuleState('plus-minus', () => ({
      ...INITIAL_PLUS_MINUS,
      nudges: [{
        ...defaultPlusMinusNudge('Qty'),
        scope: { columnIds: ['quantityFace'] },
        incrementStep: 500,
      }],
    }));
    const { api, cellKeyDownHandler, applyTransactionAsync } = makeMockApi();
    platform.onGridReady(api as never);

    const handler = cellKeyDownHandler();
    expect(handler).toBeTruthy();
    await handler!({
      event: { key: '+', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).toHaveBeenCalled();
    platform.destroy();
  });

  it('applies decrement on - key and accepts = as increment', async () => {
    const platform = new GridPlatform({
      gridId: 'pm-dec',
      modules: [plusMinusModule],
    });
    platform.store.setModuleState('plus-minus', () => ({
      ...INITIAL_PLUS_MINUS,
      nudges: [{
        ...defaultPlusMinusNudge('Qty'),
        scope: { columnIds: ['quantityFace'] },
        incrementStep: 100,
        decrementStep: 50,
      }],
    }));
    const { api, cellKeyDownHandler, applyTransactionAsync } = makeMockApi();
    platform.onGridReady(api as never);
    const handler = cellKeyDownHandler()!;

    await handler({
      event: { key: '-', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).toHaveBeenCalledTimes(1);

    applyTransactionAsync.mockClear();
    await handler({
      event: { key: '=', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).toHaveBeenCalledTimes(1);
    platform.destroy();
  });

  it('ignores non-nudge keys, missing events, editing cells, and empty selection', async () => {
    const platform = new GridPlatform({
      gridId: 'pm-skip',
      modules: [plusMinusModule],
    });
    const { api, cellKeyDownHandler, applyTransactionAsync } = makeMockApi();
    platform.onGridReady(api as never);
    const handler = cellKeyDownHandler()!;

    await handler({ event: undefined });
    await handler({
      event: { key: 'a', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();

    api.getEditingCells = () => [{ rowIndex: 0 }];
    await handler({
      event: { key: '+', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();

    api.getEditingCells = () => { throw new Error('teardown'); };
    await handler({
      event: { key: '+', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();

    api.getEditingCells = () => [];
    api.getFocusedCell = () => null as never;
    await handler({
      event: { key: '+', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();
    platform.destroy();
  });

  it('skips journal when recordHistory is disabled', async () => {
    const platform = new GridPlatform({
      gridId: 'pm-no-journal',
      modules: [plusMinusModule],
    });
    platform.store.setModuleState('plus-minus', () => ({
      ...INITIAL_PLUS_MINUS,
      settings: { ...INITIAL_PLUS_MINUS.settings, recordHistory: false },
      nudges: [{
        ...defaultPlusMinusNudge('Qty'),
        scope: { columnIds: ['quantityFace'] },
      }],
    }));
    const { api, cellKeyDownHandler, applyTransactionAsync } = makeMockApi();
    platform.onGridReady(api as never);
    await cellKeyDownHandler()!({
      event: { key: '+', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).toHaveBeenCalled();
    platform.destroy();
  });

  it('ignores key when disabled', async () => {
    const platform = new GridPlatform({
      gridId: 'pm-off',
      modules: [plusMinusModule],
    });
    platform.store.setModuleState('plus-minus', () => ({
      ...INITIAL_PLUS_MINUS,
      settings: { ...INITIAL_PLUS_MINUS.settings, enabled: false },
    }));
    const { api, cellKeyDownHandler, applyTransactionAsync } = makeMockApi();
    platform.onGridReady(api as never);
    await cellKeyDownHandler()!({
      event: { key: '+', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();
    platform.destroy();
  });
});
