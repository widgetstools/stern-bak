import type { GridDataPort, MutationRejection } from '../../../platform/types.js';

/** Framework-agnostic cell patch for undo/redo journal entries. */
export interface CellPatch {
  rowId: string;
  field: string;
  colId: string;
  oldValue: unknown;
  newValue: unknown;
}

export type EditSource =
  | 'smart-edit'
  | 'bulk-update'
  | 'plus-minus'
  | 'shortcut'
  | 'cell-editor';

export interface EditJournalEntry {
  id: string;
  at: number;
  source: EditSource;
  label: string;
  patches: CellPatch[];
}

export type EditValidationResult = 'valid' | 'invalid' | 'warning';

export type EditValidator = (patch: CellPatch) => EditValidationResult;

export interface PatchTarget {
  rowId: string;
  colId: string;
  field: string;
  value: unknown;
}

export interface EditPreviewResult {
  allValid: boolean;
  someInvalid: boolean;
  allInvalid: boolean;
  results: Array<{ patch: CellPatch; status: EditValidationResult }>;
  validPatches: CellPatch[];
}

/**
 * What a write funnel needs from the platform.
 *
 * `data` is the ONLY way an edit reaches rows — `applyTransactionAsync` is a
 * ClientSideRowModel API, so a funnel that held a `GridApi` would be inert on
 * a server-side grid while still reporting a count its journal recorded from.
 * `gridId` keys the apply guard that stops `cellValueChanged` re-recording a
 * patch this funnel is in the middle of applying.
 *
 * Both `PlatformHandle` and `GridPlatform` satisfy this structurally, so a
 * caller passes whichever it already holds.
 */
export interface EditPlatform {
  readonly gridId: string;
  readonly data: GridDataPort;
}

/**
 * What actually happened to a set of cell patches.
 *
 * `applied` is the subset the port CONFIRMED — the journal records only these,
 * which is the whole point of routing writes through the port: an edit that
 * did not land must not appear in the history panel. `rejected` carries the
 * port's user-facing copy, one entry per row that did not change.
 */
export interface EditApplyResult {
  readonly applied: readonly CellPatch[];
  readonly rejected: readonly MutationRejection[];
  /** `rejected.length === 0`. */
  readonly ok: boolean;
}
