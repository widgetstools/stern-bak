/**
 * Holds a live report's numbers still while its layout is being moved.
 *
 * A live report re-runs every block's query each time the provider pushes.
 * For a five-block dashboard that is the most expensive thing on the page, and
 * it does not stop just because someone is dragging: profiling a drag at 6x
 * CPU throttle put 22% of the whole gesture inside the query engine
 * (`runGrouped`, `applyAgg`, `getValueByPath`), competing for the main thread
 * with the only thing the user is looking at. 58 of 144 frames were dropped.
 *
 * Freezing the version the results memo watches took that to 4 of 157.
 *
 * Nothing is lost by waiting. Rows keep arriving and the live source keeps
 * mutating its array; only the recompute is deferred, and it catches up to
 * whatever is current the moment the gesture ends — never to the stale value
 * it was frozen at. Numbers a second old while you drag a block is nothing; a
 * drag that stutters was the entire complaint.
 */
import { useRef } from 'react';

export function useSettledVersion(version: number, frozen: boolean): number {
  const held = useRef(version);
  // Read during render on purpose: the frozen value must be in effect for the
  // very first render of the gesture, not one render late — by then the
  // expensive recompute has already happened.
  if (!frozen) held.current = version;
  return frozen ? held.current : version;
}
