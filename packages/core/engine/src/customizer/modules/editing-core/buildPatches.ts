import type { CellPatch, PatchTarget } from './types.js';

/** Build cell patches from targets and a per-cell new-value function. */
export function buildPatchesFromTargets(
  targets: readonly PatchTarget[],
  computeNewValue: (target: PatchTarget) => number | null,
): CellPatch[] {
  const patches: CellPatch[] = [];
  for (const target of targets) {
    const next = computeNewValue(target);
    if (next === null) continue;
    patches.push({
      rowId: target.rowId,
      colId: target.colId,
      field: target.field,
      oldValue: target.value,
      newValue: next,
    });
  }
  return patches;
}

/** Merge patches that touch the same row+field (last wins). */
export function dedupePatches(patches: readonly CellPatch[]): CellPatch[] {
  const byKey = new Map<string, CellPatch>();
  for (const patch of patches) {
    byKey.set(`${patch.rowId}:${patch.field}`, patch);
  }
  return [...byKey.values()];
}
