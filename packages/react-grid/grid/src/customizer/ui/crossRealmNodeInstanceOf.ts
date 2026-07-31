/**
 * Make `element instanceof Node` cross-realm aware.
 *
 * The formatter (and settings sheet) can be popped into a separate
 * `window.open` browser window — React stays in the parent window and
 * portals the panel's DOM into the popout document, so nodes there belong
 * to the popout window's JS realm.
 *
 * Radix's dismissable-layer guards its outside-pointerdown dismissal with
 * `if (!(target instanceof Node)) return;`. `Node` resolves to the PARENT
 * window's constructor (the realm Radix runs in), and `instanceof` is always
 * false across realms — so in a popout, clicking outside an open popover /
 * select / colour picker never dismisses it (and a modal select traps
 * interaction entirely). See e2e `v2-popout-toolbar`.
 *
 * Patching `Symbol.hasInstance` on the parent realm's `Node` to fall back to a
 * `nodeType` duck-type restores dismissal for popout nodes. The fallback is
 * deliberately scoped to **element** nodes (`nodeType === 1`): Radix's outside
 * target is always an element, and matching a cross-realm Document/text node
 * here would make consumers (incl. React DOM) call element-only methods on a
 * non-element. Same-realm `instanceof` is checked first, so existing behaviour
 * is unchanged; in a real browser the fallback only matches genuine cross-realm
 * elements (nothing else exposes a numeric `nodeType`).
 *
 * Idempotent and side-effect-light; safe to call on every popout open.
 */
let patched = false;

export function enableCrossRealmNodeInstanceOf(): void {
  if (patched || typeof Node === 'undefined') return;
  patched = true;

  const originalHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Node, Symbol.hasInstance, {
    configurable: true,
    value(this: unknown, value: unknown): boolean {
      // Same-realm nodes keep exact `instanceof` semantics.
      if (originalHasInstance.call(this, value)) return true;
      // Cross-realm fallback: an element node from another window realm.
      return (
        value != null &&
        typeof value === 'object' &&
        (value as { nodeType?: unknown }).nodeType === 1
      );
    },
  });
}
