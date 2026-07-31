import type { SlotContent } from '../types/slots.js';

/**
 * renderSlot — renders a slot's content, supporting both static and dynamic slots.
 */
export function renderSlot<C>(
  slot: SlotContent<C> | undefined,
  context: C
): React.ReactNode | null {
  if (slot === undefined || slot === null) return null;

  if (typeof slot === 'function') {
    return (slot as (ctx: C) => React.ReactNode)(context);
  }

  return slot;
}
