/**
 * Which surface MarketsGrid mounts, and — more importantly — when it mounts
 * none at all.
 *
 * EXACTLY ONE GRID MAY MOUNT PER `GridPlatform`, EVER. That is the rule the
 * `'pending'` state exists to protect, and it is worth stating the failure in
 * full because nothing about it is visible from the symptoms.
 *
 * Attaching to the worker-held Table is async. If `rowModel: 'perspective'`
 * fell through to the client surface for those first few hundred milliseconds,
 * that stand-in grid would fire `onGridReady` — attaching the api and
 * activating every module — and then unmount when the Table arrived. Its
 * `onGridPreDestroyed` calls `platform.destroy()`, which is PERMANENT. The
 * real grid's `onGridReady` then lands on a destroyed platform, where
 * `GridPlatform.onGridReady` returns immediately.
 *
 * The result is a grid that looks entirely healthy — grouping, sorting, the
 * context menu and density all talk to AG Grid directly — while every
 * platform-driven feature is silently dead: the formatting toolbar, the
 * auto-formatter, the saved-filter "+" button, and profile save/restore. No
 * error, no warning, no console output. This is a structural fix, not a patch:
 * the only way to be sure a stand-in never mounts is for the resolver to have
 * no branch that produces one.
 *
 * Hence the one deliberate difference from a resolver that merely defends the
 * async window: **asking for `'perspective'` can never yield `'client'`.**
 * A missing table is `'pending'` whether it is missing because the attach is
 * in flight or because the host forgot to wire it. A host that misconfigures
 * gets an empty surface — visible, inspectable, and recoverable the moment a
 * table arrives — rather than a live-looking grid on a dead platform.
 */

import type { GridSurfaceChoice, MarketsGridRowModel } from './types.js';

export interface ResolveGridSurfaceOpts {
  rowModel?: MarketsGridRowModel;
  /**
   * The worker-held Table this window reads.
   *
   * `null` is what `usePerspectiveTable` returns while attaching, and
   * `undefined` means nothing was wired. Both resolve to `'pending'` — see
   * the module header for why they must not diverge.
   */
  perspectiveTable?: unknown;
}

export function resolveGridSurface(opts: ResolveGridSurfaceOpts): GridSurfaceChoice {
  if (opts.rowModel !== 'perspective') return 'client';
  return opts.perspectiveTable ? 'perspective' : 'pending';
}

/** True when the host asked for Perspective, whatever state the attach is in. */
export function isPerspectiveRowModel(rowModel: MarketsGridRowModel | undefined): boolean {
  return rowModel === 'perspective';
}
