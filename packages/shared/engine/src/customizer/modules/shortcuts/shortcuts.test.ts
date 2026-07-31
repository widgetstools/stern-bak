import { describe, expect, it } from 'vitest';
import { buildShortcutPatches } from './buildShortcutPatches.js';
import { collectShortcutKeys, matchShortcutForCell } from './matchShortcut.js';
import { defaultShortcut, deserializeShortcutsState } from './state.js';

describe('matchShortcutForCell', () => {
  const cell = { colId: 'quantityFace', field: 'quantityFace' };

  it('returns first enabled shortcut matching key and column scope', () => {
    const shortcuts = [
      { ...defaultShortcut('A'), shortcutKey: 'h', scope: { columnIds: ['midPrice'] }, shortcutValue: 10 },
      { ...defaultShortcut('B'), shortcutKey: 'h', scope: { columnIds: ['quantityFace'] }, shortcutValue: 100 },
    ];
    const match = matchShortcutForCell(cell, 'H', shortcuts);
    expect(match?.name).toBe('B');
    expect(match?.shortcutValue).toBe(100);
  });

  it('is case-insensitive for shortcut keys', () => {
    const shortcuts = [{ ...defaultShortcut('H'), shortcutKey: 'm', operation: 'add' as const, shortcutValue: 5 }];
    expect(matchShortcutForCell(cell, 'M', shortcuts)?.shortcutValue).toBe(5);
  });
});

describe('buildShortcutPatches', () => {
  it('builds multiply patches from matching shortcuts', () => {
    const shortcuts = [
      {
        ...defaultShortcut('×100'),
        shortcutKey: 'h',
        operation: 'multiply' as const,
        shortcutValue: 100,
        scope: { columnIds: ['quantityFace'] },
      },
    ];
    const cells = [{ rowId: 'r1', colId: 'quantityFace', field: 'quantityFace', value: 2500 }];
    const patches = buildShortcutPatches({ cells, key: 'h', shortcuts });
    expect(patches[0]?.newValue).toBe(250_000);
  });
});

describe('collectShortcutKeys', () => {
  it('collects enabled single-letter keys', () => {
    const keys = collectShortcutKeys([
      { ...defaultShortcut('On'), shortcutKey: 'h', enabled: true },
      { ...defaultShortcut('Off'), shortcutKey: 'l', enabled: false },
    ]);
    expect([...keys]).toEqual(['h']);
  });
});

describe('deserializeShortcutsState', () => {
  it('drops invalid shortcuts and merges settings', () => {
    const state = deserializeShortcutsState({
      settings: { enabled: false, recordHistory: false },
      shortcuts: [
        {
          id: 's1',
          name: 'Ok',
          enabled: true,
          shortcutKey: 'h',
          operation: 'multiply',
          shortcutValue: 100,
          scope: { columnIds: ['qty'] },
        },
        { id: 'bad', name: 'No key' },
      ],
    });
    expect(state.settings.enabled).toBe(false);
    expect(state.shortcuts).toHaveLength(1);
    expect(state.shortcuts[0]?.shortcutKey).toBe('h');
  });
});
