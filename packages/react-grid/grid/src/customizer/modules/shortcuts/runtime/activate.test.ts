/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import {
  defaultShortcut,
  GridPlatform,
  INITIAL_SHORTCUTS,
} from '@wellsfargo-starui/engine';
import { shortcutsModule } from '../index.js';

function makeMockApi() {
  const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
  let cellKeyDownHandler: ((e: { event?: Event }) => void) | null = null;
  const api = {
    getEditingCells: () => [],
    getCellRanges: () => [],
    getFocusedCell: () => ({ rowIndex: 0, column: { getColId: () => 'quantityFace' } }),
    getDisplayedRowAtIndex: () => ({ id: 'r1', data: { id: 'r1', quantityFace: 10 } }),
    getRowNode: () => ({ data: { id: 'r1', quantityFace: 10 } }),
    getColumn: () => ({
      getColDef: () => ({ editable: true, field: 'quantityFace', cellDataType: 'number' }),
    }),
    getCellValue: () => 10,
    applyTransactionAsync,
    addEventListener: (name: string, fn: typeof cellKeyDownHandler) => {
      if (name === 'cellKeyDown') cellKeyDownHandler = fn;
    },
    removeEventListener: vi.fn(),
  };
  return { api, getHandler: () => cellKeyDownHandler, applyTransactionAsync };
}

describe('activateShortcuts', () => {
  it('applies matching shortcut on letter key', async () => {
    const platform = new GridPlatform({
      gridId: 'sc-grid',
      modules: [shortcutsModule],
    });
    platform.store.setModuleState('shortcuts', () => ({
      ...INITIAL_SHORTCUTS,
      shortcuts: [{
        ...defaultShortcut('Add 5'),
        shortcutKey: 'm',
        operation: 'add',
        shortcutValue: 5,
        scope: { columnIds: ['quantityFace'] },
      }],
    }));
    const { api, getHandler, applyTransactionAsync } = makeMockApi();
    platform.onGridReady(api as never);

    await getHandler()!({
      event: { key: 'm', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).toHaveBeenCalled();
    platform.destroy();
  });

  it('ignores when disabled or no matching shortcut key', async () => {
    const platform = new GridPlatform({
      gridId: 'sc-disabled',
      modules: [shortcutsModule],
    });
    platform.store.setModuleState('shortcuts', () => ({
      ...INITIAL_SHORTCUTS,
      settings: { ...INITIAL_SHORTCUTS.settings, enabled: false },
    }));
    const { api, getHandler, applyTransactionAsync } = makeMockApi();
    platform.onGridReady(api as never);
    await getHandler()!({
      event: { key: 'm', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();
    platform.destroy();
  });

  it('ignores missing keyboard event and empty cell selection', async () => {
    const platform = new GridPlatform({
      gridId: 'sc-empty',
      modules: [shortcutsModule],
    });
    const { api, getHandler, applyTransactionAsync } = makeMockApi();
    api.getFocusedCell = () => null as never;
    platform.onGridReady(api as never);
    await getHandler()!({ event: undefined });
    await getHandler()!({
      event: { key: 'm', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();
    platform.destroy();
  });

  it('ignores non-letter keys and editing cells', async () => {
    const platform = new GridPlatform({
      gridId: 'sc-skip',
      modules: [shortcutsModule],
    });
    const { api, getHandler, applyTransactionAsync } = makeMockApi();
    api.getEditingCells = () => [{ rowIndex: 0 }];
    platform.onGridReady(api as never);

    await getHandler()!({
      event: { key: '+', preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent,
    });
    expect(applyTransactionAsync).not.toHaveBeenCalled();
    platform.destroy();
  });
});
