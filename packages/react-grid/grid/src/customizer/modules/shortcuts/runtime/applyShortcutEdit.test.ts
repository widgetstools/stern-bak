import { describe, expect, it, vi } from 'vitest';
import { defaultShortcut, EditJournal } from '@wellsfargo-starui/engine';
import { applyShortcutEdit } from './applyShortcutEdit.js';

describe('applyShortcutEdit', () => {
  it('applies shortcut patches', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', quantityFace: 2500 } }),
    } as never;
    const shortcuts = [{
      ...defaultShortcut('×100'),
      shortcutKey: 'h',
      operation: 'multiply' as const,
      shortcutValue: 100,
      scope: { columnIds: ['quantityFace'] },
    }];

    const count = await applyShortcutEdit(
      api,
      {
        cells: [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 2500 }],
        key: 'h',
        shortcuts,
      },
    );

    expect(count).toBe(1);
    expect(applyTransactionAsync).toHaveBeenCalled();
  });

  it('records journal with shortcut label', async () => {
    const applyTransactionAsync = vi.fn().mockResolvedValue(undefined);
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', quantityFace: 10 } }),
    } as never;
    const journal = new EditJournal();
    const shortcuts = [{
      ...defaultShortcut('Add 5'),
      shortcutKey: 'm',
      operation: 'add' as const,
      shortcutValue: 5,
      scope: { columnIds: ['quantityFace'] },
    }];

    await applyShortcutEdit(
      api,
      {
        cells: [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 10 }],
        key: 'M',
        shortcuts,
      },
      { journal },
    );

    expect(journal.entries[0]?.source).toBe('shortcut');
    expect(journal.entries[0]?.label).toContain('M');
  });

  it('returns 0 when no shortcut matches', async () => {
    const applyTransactionAsync = vi.fn();
    const api = {
      applyTransactionAsync,
      getRowNode: () => ({ data: { id: 'r1', quantityFace: 10 } }),
    } as never;
    const count = await applyShortcutEdit(
      api,
      {
        cells: [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 10 }],
        key: 'z',
        shortcuts: [],
      },
    );
    expect(count).toBe(0);
  });
});
