import { buildPatchesFromTargets } from '../editing-core/buildPatches.js';
import type { CellPatch } from '../editing-core/types.js';
import { applyNumericOp } from '../smart-edit/operations.js';
import type { TargetCell } from '../smart-edit/collectTargetCells.js';
import { matchShortcutForCell } from './matchShortcut.js';
import type { ShortcutDefinition } from './state.js';

export interface BuildShortcutPatchesOptions {
  cells: readonly TargetCell[];
  key: string;
  shortcuts: readonly ShortcutDefinition[];
}

/** Build cell patches for a letter-key shortcut — skips cells with no matching rule. */
export function buildShortcutPatches(options: BuildShortcutPatchesOptions): CellPatch[] {
  const { cells, key, shortcuts } = options;
  return buildPatchesFromTargets(cells, (cell) => {
    const shortcut = matchShortcutForCell(cell, key, shortcuts);
    if (!shortcut) return null;
    return applyNumericOp(cell.value, shortcut.operation, shortcut.shortcutValue);
  });
}
