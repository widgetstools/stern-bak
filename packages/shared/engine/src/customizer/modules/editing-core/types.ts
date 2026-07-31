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

/** Minimal grid writer for patch apply — no AG Grid import in engine. */
export interface EditGridWriter {
  getRowNode(id: string): { data?: Record<string, unknown> } | undefined;
  applyTransactionAsync(update: { update: Record<string, unknown>[] }): Promise<void>;
}
