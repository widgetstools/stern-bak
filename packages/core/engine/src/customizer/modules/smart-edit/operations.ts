import type { SmartEditOp } from './state.js';

/** Apply a smart-edit operation to a single numeric cell value. */
export function applyNumericOp(
  current: unknown,
  op: SmartEditOp,
  operand: number,
): number | null {
  const n = typeof current === 'number' ? current : Number(current);
  if (!Number.isFinite(n)) return null;
  switch (op) {
    case 'multiply':
      return n * operand;
    case 'divide':
      return operand === 0 ? null : n / operand;
    case 'add':
      return n + operand;
    case 'subtract':
      return n - operand;
    case 'set':
      return operand;
    default:
      return null;
  }
}
