import type { LabRow } from './types';

/** Shallow field compare — avoids JSON.stringify on hot paths. */
export function labRowsEqual(a: LabRow, b: LabRow): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof LabRow)[]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/** Fields in `after` that differ from `before` (excluding `id`). */
export function labRowFieldPatch(before: LabRow, after: LabRow): Partial<LabRow> | null {
  const patch: Partial<LabRow> = {};
  let changed = false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)] as (keyof LabRow)[]);
  for (const key of keys) {
    if (key === 'id') continue;
    if (before[key] !== after[key]) {
      (patch as Record<string, unknown>)[key as string] = after[key];
      changed = true;
    }
  }
  return changed ? patch : null;
}
