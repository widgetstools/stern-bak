/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import type { EditingState } from '@wellsfargo-starui/core';
import { INITIAL_EDITING } from '@wellsfargo-starui/core';
import { activateEditing } from './activate.js';

type Handler = (e: { event?: Event }) => void | Promise<void>;

function makeApi(overrides: Record<string, unknown> = {}) {
  let cellKeyDownHandler: Handler | null = null;
  const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
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
    addEventListener: (name: string, fn: Handler) => {
      if (name === 'cellKeyDown') cellKeyDownHandler = fn;
    },
    removeEventListener: vi.fn(),
    ...overrides,
  };
  return {
    api,
    applyTransactionAsync,
    fire: (key: string) => {
      const event = {
        key,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as KeyboardEvent;
      return Promise.resolve(cellKeyDownHandler!({ event })).then(() => event);
    },
    handlerAttached: () => cellKeyDownHandler !== null,
  };
}

function makeState(patch: {
  smartEdit?: Partial<EditingState['smartEdit']['settings']>;
  plusMinus?: Partial<EditingState['plusMinus']>;
  shortcuts?: Partial<EditingState['shortcuts']>;
}): EditingState {
  const base = structuredClone(INITIAL_EDITING);
  return {
    ...base,
    smartEdit: { settings: { ...base.smartEdit.settings, ...patch.smartEdit } },
    plusMinus: { ...base.plusMinus, settings: { ...base.plusMinus.settings, enabled: false }, ...patch.plusMinus },
    shortcuts: { ...base.shortcuts, settings: { ...base.shortcuts.settings, enabled: false }, ...patch.shortcuts },
  };
}

function makePlatform(state: EditingState, api: unknown) {
  return {
    gridId: 'g1',
    getState: () => state,
    getModuleState: () => {
      throw new Error('missing');
    },
    resources: { expression: () => ({ evaluate: () => true, validate: () => ({ valid: true, errors: [] }) }) },
    api: {
      onReady: (cb: (a: unknown) => void) => {
        cb(api);
        return () => {};
      },
    },
  };
}

describe('activateEditing — +/- arbitration', () => {
  it('smart-edit increments on + when plus-minus is disabled', async () => {
    const { api, applyTransactionAsync, fire } = makeApi();
    const state = makeState({ smartEdit: { enabled: true, incrementStep: 2 } });
    const dispose = activateEditing(makePlatform(state, api) as never);
    const event = await fire('+');
    expect(applyTransactionAsync).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    dispose();
  });

  it('smart-edit handles - as subtract and = as increment', async () => {
    const { api, applyTransactionAsync, fire } = makeApi();
    const state = makeState({ smartEdit: { enabled: true, incrementStep: 3 } });
    const dispose = activateEditing(makePlatform(state, api) as never);
    await fire('-');
    await fire('=');
    expect(applyTransactionAsync).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('plus-minus owns +/- when enabled — smart-edit does not fire', async () => {
    const { api, applyTransactionAsync, fire } = makeApi();
    // pm enabled with no nudges: keys are claimed but nothing applies —
    // matches the pre-merge behavior where smart-edit yielded entirely.
    const state = makeState({
      smartEdit: { enabled: true, incrementStep: 2 },
      plusMinus: { settings: { enabled: true, recordHistory: true }, nudges: [] },
    });
    const dispose = activateEditing(makePlatform(state, api) as never);
    await fire('+');
    expect(applyTransactionAsync).not.toHaveBeenCalled();
    dispose();
  });

  it('plus-minus applies a matching nudge', async () => {
    const { api, applyTransactionAsync, fire } = makeApi();
    const state = makeState({
      plusMinus: {
        settings: { enabled: true, recordHistory: true },
        nudges: [
          { id: 'n1', name: 'Bump', enabled: true, scope: { columnIds: [] }, incrementStep: 5 },
        ],
      },
    });
    const dispose = activateEditing(makePlatform(state, api) as never);
    const event = await fire('+');
    expect(applyTransactionAsync).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    dispose();
  });

  it('ignores keys while a cell editor is open, and when both are disabled', async () => {
    const editing = makeApi({ getEditingCells: () => [{}] });
    const state = makeState({ smartEdit: { enabled: true } });
    activateEditing(makePlatform(state, editing.api) as never);
    await editing.fire('+');
    expect(editing.applyTransactionAsync).not.toHaveBeenCalled();

    const disabled = makeApi();
    activateEditing(makePlatform(makeState({ smartEdit: { enabled: false } }), disabled.api) as never);
    await disabled.fire('+');
    expect(disabled.applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('survives getEditingCells throwing during teardown', async () => {
    const { api, applyTransactionAsync, fire } = makeApi({
      getEditingCells: () => {
        throw new Error('teardown');
      },
      getFocusedCell: () => null as never,
    });
    const state = makeState({ smartEdit: { enabled: true } });
    activateEditing(makePlatform(state, api) as never);
    await fire('+');
    expect(applyTransactionAsync).not.toHaveBeenCalled();
  });
});

describe('activateEditing — letter shortcuts', () => {
  it('applies a matching letter shortcut', async () => {
    const { api, applyTransactionAsync, fire } = makeApi();
    const state = makeState({
      shortcuts: {
        settings: { enabled: true, recordHistory: true },
        shortcuts: [
          {
            id: 's1',
            name: 'Double',
            enabled: true,
            shortcutKey: 'd',
            operation: 'multiply',
            shortcutValue: 2,
            scope: { columnIds: [] },
          },
        ],
      },
    });
    const dispose = activateEditing(makePlatform(state, api) as never);
    const event = await fire('d');
    expect(applyTransactionAsync).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    dispose();
  });

  it('ignores letters when the shortcuts slice is disabled', async () => {
    const { api, applyTransactionAsync, fire } = makeApi();
    const state = makeState({
      shortcuts: { settings: { enabled: false, recordHistory: true }, shortcuts: [] },
    });
    activateEditing(makePlatform(state, api) as never);
    await fire('d');
    expect(applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('non-matching letters claim the key but apply nothing', async () => {
    const { api, applyTransactionAsync, fire } = makeApi();
    const state = makeState({
      shortcuts: { settings: { enabled: true, recordHistory: true }, shortcuts: [] },
    });
    activateEditing(makePlatform(state, api) as never);
    await fire('z');
    expect(applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('detaches the listener on dispose', () => {
    const removeEventListener = vi.fn();
    const { api, handlerAttached } = makeApi({ removeEventListener });
    const dispose = activateEditing(makePlatform(makeState({}), api) as never);
    expect(handlerAttached()).toBe(true);
    dispose();
    expect(removeEventListener).toHaveBeenCalledWith('cellKeyDown', expect.any(Function));
  });
});
