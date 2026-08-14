/**
 * OpenFin interop seam — access to `fin.me.interop`, the context-group
 * transport the workspace dock "Link" button joins entities to. Framework
 * packages consume this instead of reading the `fin` global; everything is
 * undefined/noop outside OpenFin.
 */
import { getFinMe } from './identity.js';

/**
 * Structural subset of the interop client. Context payloads are typed as
 * `object` — the FDC3-flavoured typing lives with the React linking
 * facade, not at this seam.
 */
export interface InteropClientLike {
  setContext?: (context: object) => Promise<void>;
  addContextHandler?: (
    handler: (ctx: object) => void,
    contextType?: string,
  ) => Promise<{ unsubscribe?: () => void }> | { unsubscribe?: () => void };
  joinContextGroup?: (contextGroupId: string, target?: unknown) => Promise<void>;
  removeFromContextGroup?: () => Promise<void>;
}

/** The current entity's interop client, or undefined outside OpenFin. */
export function getInteropClient(): InteropClientLike | undefined {
  const interop = getFinMe()?.interop;
  return interop && typeof interop === 'object' ? (interop as InteropClientLike) : undefined;
}

/** True when the OpenFin interop client is reachable (a platform view/window). */
export function isInteropAvailable(): boolean {
  return getInteropClient() !== undefined;
}
