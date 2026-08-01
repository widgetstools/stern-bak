import type { PatchTarget } from './types.js';

export interface SingleColumnGuardResult {
  ok: boolean;
  columnId?: string;
  reason?: 'empty' | 'multi-column';
}

/** AdapTable rule: smart edit / bulk update operate on one column at a time. */
export function assertSingleColumnSelection(
  targets: readonly PatchTarget[],
): SingleColumnGuardResult {
  if (targets.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  const colIds = new Set(targets.map((t) => t.colId));
  if (colIds.size > 1) {
    return { ok: false, reason: 'multi-column' };
  }
  return { ok: true, columnId: targets[0]?.colId };
}
