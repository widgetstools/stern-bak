import { describe, expect, it } from 'vitest';
import { cellStyleToAgStyle } from './cellStyleToAgStyle';

describe('cellStyleToAgStyle', () => {
  it('flattens typography, colors, alignment, and borders', () => {
    const style = cellStyleToAgStyle({
      typography: { bold: true, italic: true, underline: true, fontSize: 14 },
      colors: { text: '#111', background: '#eee' },
      alignment: { horizontal: 'right', vertical: 'middle' },
      borders: {
        top: { width: 1, style: 'solid', color: '#000' },
        left: { width: 2, style: 'dashed', color: '#f00' },
      },
    });
    expect(style).toEqual({
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      fontSize: '14px',
      color: '#111',
      backgroundColor: '#eee',
      textAlign: 'right',
      verticalAlign: 'middle',
      borderTop: '1px solid #000',
      borderLeft: '2px dashed #f00',
    });
  });

  it('returns an empty object for an empty overrides input', () => {
    expect(cellStyleToAgStyle({})).toEqual({});
  });

  it('maps each subsection independently without clobbering siblings', () => {
    expect(cellStyleToAgStyle({ typography: { bold: true } })).toEqual({ fontWeight: 'bold' });
    expect(cellStyleToAgStyle({ colors: { text: '#111' } })).toEqual({ color: '#111' });
    expect(cellStyleToAgStyle({ alignment: { horizontal: 'center' } })).toEqual({ textAlign: 'center' });
    expect(cellStyleToAgStyle({
      borders: {
        right: { width: 1, style: 'solid', color: '#000' },
        bottom: { width: 2, style: 'dotted', color: '#333' },
      },
    })).toEqual({
      borderRight: '1px solid #000',
      borderBottom: '2px dotted #333',
    });
  });

  it('skips falsy typography flags and null fontSize', () => {
    expect(cellStyleToAgStyle({
      typography: { bold: false, italic: false, underline: false, fontSize: null as unknown as number },
    })).toEqual({});
  });
});
