import type { ExcelStyle } from 'ag-grid-community';
import type { CellStyleProperties } from '../../../types/common.js';
import { cssToExcelColor } from './cssToExcelColor.js';

export function cellStyleToExcelStyle(id: string, style: CellStyleProperties): ExcelStyle {
  const excel: ExcelStyle = { id };

  const fontColor = cssToExcelColor(style.color);
  const bg = cssToExcelColor(style.backgroundColor);
  const bold = style.fontWeight === '700' || style.fontWeight === 'bold';
  const italic = style.fontStyle === 'italic';
  const underline = style.textDecoration === 'underline';
  const strike = style.textDecoration === 'line-through';
  const size = style.fontSize ? parseInt(style.fontSize, 10) : undefined;

  if (fontColor || bold || italic || underline || strike || size) {
    excel.font = {
      ...(fontColor ? { color: fontColor } : {}),
      ...(bold ? { bold: true } : {}),
      ...(italic ? { italic: true } : {}),
      ...(underline ? { underline: 'Single' as const } : {}),
      ...(strike ? { strikeThrough: true } : {}),
      ...(Number.isFinite(size) && size ? { size } : {}),
    };
  }

  if (bg) {
    excel.interior = {
      pattern: 'Solid',
      color: bg,
    };
  }

  if (style.textAlign === 'left' || style.textAlign === 'center' || style.textAlign === 'right') {
    const horizontal =
      style.textAlign === 'left' ? 'Left'
        : style.textAlign === 'center' ? 'Center'
          : 'Right';
    excel.alignment = { horizontal };
  }

  return excel;
}

export function numberFormatExcelStyle(id: string, format: string): ExcelStyle {
  return {
    id,
    numberFormat: { format },
  };
}

export const VISUAL_EXCEL_HEADER_STYLE: ExcelStyle = {
  id: 'header',
  font: { bold: true, color: '#374151' },
  interior: { pattern: 'Solid', color: '#F3F4F6' },
  alignment: { horizontal: 'Center' },
};

export const VISUAL_EXCEL_CELL_STYLE: ExcelStyle = {
  id: 'cell',
  font: { color: '#111827' },
};
