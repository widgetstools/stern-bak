import { describe, expect, it } from 'vitest';
import { fromStyleEditorValue, toStyleEditorValue } from './styleBridge.js';

describe('styleBridge', () => {
  const theme = {
    light: {
      fontWeight: '700',
      fontStyle: 'italic',
      textDecoration: 'underline',
      textAlign: 'right',
      fontSize: '14px',
      color: 'red',
      backgroundColor: 'white',
      borderTopWidth: '2px',
      borderTopStyle: 'dashed',
      borderTopColor: '#111',
    },
    dark: {
      backgroundColor: 'black',
    },
  };

  it('toStyleEditorValue reads typography, alignment, and borders', () => {
    const value = toStyleEditorValue(theme);
    expect(value.bold).toBe(true);
    expect(value.italic).toBe(true);
    expect(value.underline).toBe(true);
    expect(value.align).toBe('right');
    expect(value.fontSize).toBe(14);
    expect(value.color).toBe('red');
    expect(value.backgroundColor).toBe('black');
    expect(value.borders?.top).toEqual({ width: 2, color: '#111', style: 'dashed' });
  });

  it('fromStyleEditorValue writes identical text styling to both themes', () => {
    const next = fromStyleEditorValue(
      { light: {}, dark: {} },
      {
        bold: true,
        italic: false,
        underline: false,
        strikethrough: false,
        align: 'center',
        fontSize: 16,
        color: 'green',
        backgroundColor: 'yellow',
        backgroundAlpha: 100,
        borders: {
          left: { width: 1, color: 'blue', style: 'solid' },
        },
      },
    );
    expect(next.light?.fontWeight).toBe('700');
    expect(next.dark?.fontWeight).toBe('700');
    expect(next.light?.textAlign).toBe('center');
    expect(next.dark?.backgroundColor).toBe('yellow');
    expect(next.light?.borderLeftWidth).toBe('1px');
    expect(next.dark?.borderLeftColor).toBe('blue');
  });

  it('clears borders when a side is removed', () => {
    const next = fromStyleEditorValue(theme, {
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      backgroundAlpha: 100,
      borders: {},
    });
    expect(next.light?.borderTopWidth).toBeUndefined();
  });
});
