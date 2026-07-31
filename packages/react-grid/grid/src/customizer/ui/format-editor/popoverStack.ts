/**
 * Shared registry of currently-open Format Editor popover/dropdown portals.
 *
 * Every `FormatPopover` / `FormatDropdown` registers its portal content root
 * here while open. Each popover's close-on-outside-click check consults the
 * stack: if the click's target lives inside ANY open popover portal it's
 * considered "still inside the popover UI" and the click doesn't close.
 *
 * This is what lets a nested color picker or thickness dropdown open from
 * INSIDE an outer border editor without closing the outer as a side effect.
 * Without a shared stack each popover only knows about its own contentRef
 * and interprets every click in a sibling portal as "outside".
 */

const openRoots = new Set<HTMLElement>();

export function registerPopoverRoot(el: HTMLElement): () => void {
  openRoots.add(el);
  return () => {
    openRoots.delete(el);
  };
}

export function clickIsInsideAnyOpenPopover(target: Node): boolean {
  for (const el of openRoots) {
    if (el.contains(target)) return true;
  }
  return false;
}
