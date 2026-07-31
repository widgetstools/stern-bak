/**
 * Row — local re-export of the canonical `SettingsRow` primitive.
 *
 * Every band sub-editor in column-customization (HeaderBand,
 * LayoutBand, TemplatesBand, RowGroupingEditor, FilterEditor,
 * CellEditorEditor) imports `Row` from this module. They now resolve
 * to the same `SettingsRow` that the Grid Options panel uses, so the
 * label gutter, vertical alignment, divider, and hint placement are
 * identical across editors.
 */
export { SettingsRow as Row } from '../../../ui/SettingsPanel';
export type { SettingsRowProps as RowProps } from '../../../ui/SettingsPanel';
