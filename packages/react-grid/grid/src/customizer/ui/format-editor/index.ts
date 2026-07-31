/**
 * Figma-inspired Format Editor primitives.
 *
 * A unified component set that toolbars, settings panels, and inline rule
 * editors all consume — so style editing looks and behaves identically
 * everywhere in the grid customizer.
 *
 * Design notes and rationale live in:
 *   apps/demo/src/FormatEditorPreview.tsx (the living preview at ?fmt=preview)
 *   docs/IMPLEMENTED_FEATURES.md (the sub-project entry)
 */

export { FormatPopover } from './FormatPopover';
export { FormatDropdown } from './FormatDropdown';
export { FormatColorPicker } from './FormatColorPicker';

export { registerPopoverRoot, clickIsInsideAnyOpenPopover } from './popoverStack';

export {
  EDGE_ORDER,
  defaultSideSpec,
  makeDefaultSides,
} from './types';
export type { BorderSide, BorderStyle, BorderMode, SideSpec } from './types';
