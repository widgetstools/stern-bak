/**
 * <StyleEditor /> — the one shared editor for text/color/border/format
 * overrides across v2 panels.
 *
 *   import { StyleEditor } from '@wellsfargo-starui/core';
 *
 * Sub-sections are exported individually for panels that want to render
 * a single facet without the full stack (e.g. the column-groups panel
 * only uses text + color on group headers).
 */

export { StyleEditor } from './StyleEditor';
export type { StyleEditorProps } from './StyleEditor';
export { TextSection } from './sections/TextSection';
export { ColorSection } from './sections/ColorSection';
export { BorderSection } from './sections/BorderSection';
export { FormatSection } from './sections/FormatSection';
export { BorderStyleEditor } from './BorderStyleEditor';
export type { BorderStyleEditorProps, BordersValue } from './BorderStyleEditor';
export type {
  StyleEditorValue,
  StyleEditorSection,
  StyleEditorVariant,
  StyleEditorDataType,
  TextAlign,
  FontWeight,
} from './types';
