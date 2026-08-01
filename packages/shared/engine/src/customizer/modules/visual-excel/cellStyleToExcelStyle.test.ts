import { describe, expect, it } from 'vitest';
import {
  cellStyleToExcelStyle,
  numberFormatExcelStyle,
  VISUAL_EXCEL_CELL_STYLE,
  VISUAL_EXCEL_HEADER_STYLE,
} from './cellStyleToExcelStyle.js';

describe('cellStyleToExcelStyle', () => {
  it('maps typography, fill, and alignment to ExcelStyle', () => {
    const style = cellStyleToExcelStyle('rule-1', {
      color: '#EF4444',
      backgroundColor: '#F3F4F6',
      fontWeight: '700',
      fontStyle: 'italic',
      textDecoration: 'underline',
      fontSize: '14px',
      textAlign: 'center',
    });
    expect(style).toMatchObject({
      id: 'rule-1',
      font: {
        color: '#EF4444',
        bold: true,
        italic: true,
        underline: 'Single',
        size: 14,
      },
      interior: { pattern: 'Solid', color: '#F3F4F6' },
      alignment: { horizontal: 'Center' },
    });
  });

  it('maps line-through and left/right alignment', () => {
    const left = cellStyleToExcelStyle('l', { textAlign: 'left', textDecoration: 'line-through' });
    expect(left.alignment?.horizontal).toBe('Left');
    expect(left.font?.strikeThrough).toBe(true);

    const right = cellStyleToExcelStyle('r', { textAlign: 'right' });
    expect(right.alignment?.horizontal).toBe('Right');
  });

  it('returns minimal style when no mappable properties present', () => {
    expect(cellStyleToExcelStyle('empty', {})).toEqual({ id: 'empty' });
  });

  it('exports header and cell preset styles', () => {
    expect(VISUAL_EXCEL_HEADER_STYLE.id).toBe('header');
    expect(VISUAL_EXCEL_CELL_STYLE.id).toBe('cell');
    expect(numberFormatExcelStyle('fmt', '0.00')).toEqual({
      id: 'fmt',
      numberFormat: { format: '0.00' },
    });
  });
});
