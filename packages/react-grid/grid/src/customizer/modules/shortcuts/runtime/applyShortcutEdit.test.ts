import { describe, expect, it } from 'vitest';
import { defaultShortcut, EditJournal } from '@wellsfargo-starui/core';
import { makeFakeEditPlatform } from '../../../editing/applyAndRecord.test.js';
import { applyShortcutEdit } from './applyShortcutEdit.js';

describe('applyShortcutEdit', () => {
  it('applies shortcut patches through the port', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', quantityFace: 2500 } });
    const shortcuts = [{
      ...defaultShortcut('×100'),
      shortcutKey: 'h',
      operation: 'multiply' as const,
      shortcutValue: 100,
      scope: { columnIds: ['quantityFace'] },
    }];

    const result = await applyShortcutEdit(
      fx.platform,
      {
        cells: [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 2500 }],
        key: 'h',
        shortcuts,
      },
    );

    expect(result.applied).toHaveLength(1);
    expect(fx.rows.r1).toEqual({ id: 'r1', quantityFace: 250000 });
  });

  it('records journal with shortcut label', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', quantityFace: 10 } });
    const journal = new EditJournal();
    const shortcuts = [{
      ...defaultShortcut('Add 5'),
      shortcutKey: 'm',
      operation: 'add' as const,
      shortcutValue: 5,
      scope: { columnIds: ['quantityFace'] },
    }];

    await applyShortcutEdit(
      fx.platform,
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

  it('applies nothing when no shortcut matches', async () => {
    const fx = makeFakeEditPlatform({ r1: { id: 'r1', quantityFace: 10 } });
    const result = await applyShortcutEdit(
      fx.platform,
      {
        cells: [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 10 }],
        key: 'z',
        shortcuts: [],
      },
    );
    expect(result.applied).toEqual([]);
    expect(fx.mutations).toEqual([]);
  });
});
