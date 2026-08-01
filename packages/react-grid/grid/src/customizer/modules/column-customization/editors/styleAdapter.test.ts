import { describe, expect, it } from 'vitest';
import {
  countOverrides,
  fromStyleEditorValue,
  isEmptyAssignment,
  toStyleEditorValue,
} from './styleAdapter';

describe('styleAdapter', () => {
  it('round-trips typography and colors', () => {
    const editor = toStyleEditorValue({
      typography: { bold: true, fontSize: 13 },
      colors: { text: '#111111', background: '#222222' },
    });
    expect(editor.bold).toBe(true);
    expect(editor.fontSize).toBe(13);
    expect(editor.color).toBe('#111111');

    const back = fromStyleEditorValue({
      bold: true,
      fontSize: 13,
      color: '#111111',
      backgroundColor: '#222222',
    });
    expect(back?.typography?.bold).toBe(true);
    expect(back?.colors?.text).toBe('#111111');
  });

  it('drops zero-width borders on export', () => {
    const back = fromStyleEditorValue({
      borders: {
        top: { color: '#000', alpha: 100, width: 0, style: 'solid', visible: true },
      },
    });
    expect(back?.borders).toBeUndefined();
  });

  it('isEmptyAssignment ignores colId-only entries', () => {
    expect(isEmptyAssignment({ colId: 'price' })).toBe(true);
    expect(isEmptyAssignment({ colId: 'price', headerName: 'Bid' })).toBe(false);
  });

  it('countOverrides excludes colId', () => {
    expect(countOverrides({ colId: 'x', headerName: 'A', sortable: true })).toBe(2);
  });
});
