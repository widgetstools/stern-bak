import { afterEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_DATA_CHANGE_HISTORY } from '@wellsfargo-starui/engine';
import { clearEditJournalRegistry, getEditJournal } from '../../../editing/editJournalScope.js';
import { wrapEditableValueSetters } from './wrapEditableValueSetters.js';

const ctx = {
  gridId: 'g-wrap',
  getRowId: ({ data }: { data?: { id?: string } }) => String(data?.id ?? ''),
  getModuleState: (id: string) => {
    if (id === 'data-change-history') return structuredClone(INITIAL_DATA_CHANGE_HISTORY);
    throw new Error(id);
  },
  resources: {} as never,
  api: null,
};

describe('wrapEditableValueSetters', () => {
  afterEach(() => clearEditJournalRegistry());

  it('records journal entry when valueSetter commits an edit', () => {
    const defs = wrapEditableValueSetters(
      [{ field: 'quantityFace', editable: true, cellDataType: 'number' }],
      structuredClone(INITIAL_DATA_CHANGE_HISTORY),
      ctx,
    );

    const setter = defs[0]?.valueSetter;
    expect(typeof setter).toBe('function');

    const data = { id: 'r1', quantityFace: 100 };
    setter?.({
      data,
      oldValue: 100,
      newValue: 200,
      column: { getColId: () => 'quantityFace' },
    } as never);

    const journal = getEditJournal({ gridId: 'g-wrap', getModuleState: ctx.getModuleState });
    expect(journal.canUndo).toBe(true);
    expect(journal.entries[0]?.source).toBe('cell-editor');
    expect(data.quantityFace).toBe(200);
  });

  it('preserves an existing valueSetter', () => {
    const prev = vi.fn(() => true);
    const defs = wrapEditableValueSetters(
      [{ field: 'qty', editable: true, valueSetter: prev }],
      structuredClone(INITIAL_DATA_CHANGE_HISTORY),
      ctx,
    );

    defs[0]?.valueSetter?.({ data: { id: 'r1', qty: 1 }, oldValue: 1, newValue: 2, column: { getColId: () => 'qty' } } as never);
    expect(prev).toHaveBeenCalled();
  });
});
