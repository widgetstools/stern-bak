/**
 * Keep AG Grid's focused cell while the user works the toolbar chrome.
 *
 * The toolbar acts on the grid's SELECTION. A mousedown anywhere in its
 * chrome moves focus out of the grid, and the selection goes with it — so
 * chrome eats mousedown. Form controls must be exempt: a native `<select>`
 * opens its dropdown on mousedown, and `preventDefault` there kills it (the
 * bug where the template dropdown would not open from the toolbar popover
 * while working fine in the popped-out panel).
 *
 * One module-level function, not a closure per surface. The list had been
 * copied to four call sites and one of them had drifted to three tags: the
 * formatter shell omitted TEXTAREA, and since the overflow menu renders
 * inline inside that shell, a TEXTAREA its own guard let through was eaten on
 * the way up.
 */

/** Elements whose own mousedown behaviour must survive. */
const FORM_CONTROLS = new Set(['INPUT', 'SELECT', 'OPTION', 'TEXTAREA']);

export function preserveGridCellOnMouseDown(event: {
  target: EventTarget | null;
  preventDefault: () => void;
}): void {
  const tag = (event.target as HTMLElement | null)?.tagName ?? '';
  if (!FORM_CONTROLS.has(tag)) event.preventDefault();
}
