/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import type { EditingState } from '@wellsfargo-starui/core';
import { INITIAL_EDITING } from '@wellsfargo-starui/core';
import { makeFakeEditPlatform } from '../../../editing/applyAndRecord.test.js';
import { activateEditing } from './activate.js';

type Handler = (e: { event?: Event }) => void | Promise<void>;

function makeApi(overrides: Record<string, unknown> = {}) {
  let cellKeyDownHandler: Handler | null = null;
  // The grid answers the SELECTION reads; the write goes through the port,
  // which is why this fake carries no transaction API at all.
  const port = makeFakeEditPlatform({ r1: { id: 'r1', qty: 10 } });
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
    addEventListener: (name: string, fn: Handler) => {
      if (name === 'cellKeyDown') cellKeyDownHandler = fn;
    },
    removeEventListener: vi.fn(),
    ...overrides,
  };
  return {
    api,
    data: port.platform.data,
    mutations: port.mutations,
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

function makePlatform(state: EditingState, api: unknown, data: unknown) {
  return {
    gridId: 'g1',
    data,
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
    const { api, data, mutations, fire } = makeApi();
    const state = makeState({ smartEdit: { enabled: true, incrementStep: 2 } });
    const dispose = activateEditing(makePlatform(state, api, data) as never);
    const event = await fire('+');
    expect(mutations).toHaveLength(1);
    expect(event.preventDefault).toHaveBeenCalled();
    dispose();
  });

  it('smart-edit handles - as subtract and = as increment', async () => {
    const { api, data, mutations, fire } = makeApi();
    const state = makeState({ smartEdit: { enabled: true, incrementStep: 3 } });
    const dispose = activateEditing(makePlatform(state, api, data) as never);
    await fire('-');
    await fire('=');
    expect(mutations).toHaveLength(2);
    dispose();
  });

  it('plus-minus owns +/- when enabled — smart-edit does not fire', async () => {
    const { api, data, mutations, fire } = makeApi();
    // pm enabled with no nudges: keys are claimed but nothing applies —
    // matches the pre-merge behavior where smart-edit yielded entirely.
    const state = makeState({
      smartEdit: { enabled: true, incrementStep: 2 },
      plusMinus: { settings: { enabled: true, recordHistory: true }, nudges: [] },
    });
    const dispose = activateEditing(makePlatform(state, api, data) as never);
    await fire('+');
    expect(mutations).toEqual([]);
    dispose();
  });

  it('plus-minus applies a matching nudge', async () => {
    const { api, data, mutations, fire } = makeApi();
    const state = makeState({
      plusMinus: {
        settings: { enabled: true, recordHistory: true },
        nudges: [
          { id: 'n1', name: 'Bump', enabled: true, scope: { columnIds: [] }, incrementStep: 5 },
        ],
      },
    });
    const dispose = activateEditing(makePlatform(state, api, data) as never);
    const event = await fire('+');
    expect(mutations).toHaveLength(1);
    expect(event.stopPropagation).toHaveBeenCalled();
    dispose();
  });

  it('ignores keys while a cell editor is open, and when both are disabled', async () => {
    const editing = makeApi({ getEditingCells: () => [{}] });
    const state = makeState({ smartEdit: { enabled: true } });
    activateEditing(makePlatform(state, editing.api, editing.data) as never);
    await editing.fire('+');
    expect(editing.mutations).toEqual([]);

    const disabled = makeApi();
    activateEditing(makePlatform(makeState({ smartEdit: { enabled: false } }), disabled.api, disabled.data) as never);
    await disabled.fire('+');
    expect(disabled.mutations).toEqual([]);
  });

  it('survives getEditingCells throwing during teardown', async () => {
    const { api, data, mutations, fire } = makeApi({
      getEditingCells: () => {
        throw new Error('teardown');
      },
      getFocusedCell: () => null as never,
    });
    const state = makeState({ smartEdit: { enabled: true } });
    activateEditing(makePlatform(state, api, data) as never);
    await fire('+');
    expect(mutations).toEqual([]);
  });
});

describe('activateEditing — letter shortcuts', () => {
  it('applies a matching letter shortcut', async () => {
    const { api, data, mutations, fire } = makeApi();
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
    const dispose = activateEditing(makePlatform(state, api, data) as never);
    const event = await fire('d');
    expect(mutations).toHaveLength(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    dispose();
  });

  it('ignores letters when the shortcuts slice is disabled', async () => {
    const { api, data, mutations, fire } = makeApi();
    const state = makeState({
      shortcuts: { settings: { enabled: false, recordHistory: true }, shortcuts: [] },
    });
    activateEditing(makePlatform(state, api, data) as never);
    await fire('d');
    expect(mutations).toEqual([]);
  });

  it('non-matching letters claim the key but apply nothing', async () => {
    const { api, data, mutations, fire } = makeApi();
    const state = makeState({
      shortcuts: { settings: { enabled: true, recordHistory: true }, shortcuts: [] },
    });
    activateEditing(makePlatform(state, api, data) as never);
    await fire('z');
    expect(mutations).toEqual([]);
  });

  it('detaches the listener on dispose', () => {
    const removeEventListener = vi.fn();
    const { api, data, handlerAttached } = makeApi({ removeEventListener });
    const dispose = activateEditing(makePlatform(makeState({}), api, data) as never);
    expect(handlerAttached()).toBe(true);
    dispose();
    expect(removeEventListener).toHaveBeenCalledWith('cellKeyDown', expect.any(Function));
  });
});
