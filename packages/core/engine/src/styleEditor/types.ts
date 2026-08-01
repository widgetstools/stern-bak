import type { BorderSpec, ValueFormatterTemplate } from '../colDef/types.js';

/**
 * StyleEditorValue — the shape the shared <StyleEditor /> edits.
 */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type FontWeight = 400 | 500 | 600 | 700;

export interface StyleEditorValue {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: TextAlign;
  fontSize?: number;
  fontWeight?: FontWeight;
  color?: string;
  backgroundColor?: string;
  backgroundAlpha?: number;
  borders?: {
    top?: BorderSpec;
    right?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
  };
  valueFormatter?: ValueFormatterTemplate;
}

export type StyleEditorSection = 'text' | 'color' | 'border' | 'format';
export type StyleEditorVariant = 'inline' | 'popover' | 'dialog' | 'drawer';
export type StyleEditorDataType = 'number' | 'date' | 'text' | 'boolean';
