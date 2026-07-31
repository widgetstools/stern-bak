/**
 * Cockpit ColorPicker kit — a single compact inline field that opens a
 * Figma-style popover shell (alpha slider + panel-local recents strip).
 *
 *   import { CompactColorField } from '@wellsfargo-starui/engine';
 *
 * The popover shell is an implementation detail of CompactColorField;
 * it's NOT exported. FormattingToolbar and other toolbar-style
 * consumers should use the `ColorPickerPopover` re-exported from
 * `@wellsfargo-starui/engine` which wraps FormatColorPicker in a toolbar
 * icon-button trigger. AUDIT M1 collapsed the previous dual export.
 */

export { CompactColorField, type CompactColorFieldProps } from './CompactColorField';
