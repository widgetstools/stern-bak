/**
 * Platform/window control seam — the narrow slice of `fin.Platform` /
 * `fin.Window` that framework packages outside `packages/openfin` need.
 * Noops (returning `false` / resolving) outside OpenFin.
 */
import { isOpenFin } from './identity.js';

/**
 * Create a view in the current OpenFin platform (default target window
 * placement — identical to `fin.Platform.getCurrentSync().createView(opts)`).
 * Returns `false` without side effects outside OpenFin; inside OpenFin,
 * creation errors propagate to the caller.
 */
export async function createPlatformView(opts: {
  url: string;
  customData?: Record<string, unknown>;
}): Promise<boolean> {
  if (!isOpenFin()) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformApi = (globalThis as any).fin?.Platform;
  if (typeof platformApi?.getCurrentSync !== 'function') return false;
  const platform = platformApi.getCurrentSync();
  await platform.createView(opts);
  return true;
}

/**
 * Close the current OpenFin window (`fin.Window.getCurrentSync().close()`).
 * Noop outside OpenFin; close errors propagate.
 */
export async function closeCurrentWindow(): Promise<void> {
  if (!isOpenFin()) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windowApi = (globalThis as any).fin?.Window;
  if (typeof windowApi?.getCurrentSync !== 'function') return;
  await windowApi.getCurrentSync().close();
}
