import type { CellPatch } from '../editing-core/types.js';
import type { BulkUpdateTarget } from './collectBulkUpdateTargets.js';
import { bulkUpdateValueKind } from './isBulkUpdateCellType.js';

export function parseBulkUpdateValue(
  raw: string,
  cellDataType: string | undefined,
): unknown | null {
  const kind = bulkUpdateValueKind(cellDataType);
  if (kind === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (kind === 'date') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return null;
    return trimmed.length <= 10 ? trimmed.slice(0, 10) : new Date(parsed).toISOString().slice(0, 10);
  }
  return raw;
}

export function buildBulkUpdatePatches(
  targets: readonly BulkUpdateTarget[],
  newValue: unknown,
): CellPatch[] {
  const patches: CellPatch[] = [];
  for (const target of targets) {
    if (Object.is(target.value, newValue)) continue;
    patches.push({
      rowId: target.rowId,
      colId: target.colId,
      field: target.field,
      oldValue: target.value,
      newValue,
    });
  }
  return patches;
}

export function buildBulkUpdatePatchesFromRaw(
  targets: readonly BulkUpdateTarget[],
  raw: string,
): CellPatch[] {
  if (targets.length === 0) return [];
  const cellDataType = targets[0]?.cellDataType;
  const parsed = parseBulkUpdateValue(raw, cellDataType);
  if (parsed === null) return [];
  return buildBulkUpdatePatches(targets, parsed);
}
