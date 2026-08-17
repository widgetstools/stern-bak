export * from './types.js';
export { buildPatchesFromTargets, dedupePatches } from './buildPatches.js';
export { buildRowPatches, type PatchDirection } from './buildRowPatches.js';
export { applyPatches, applyForwardPatches } from './applyPatches.js';
export { previewPatches } from './previewPatches.js';
export { defaultEditValidator, combineValidators } from './validation.js';
export { assertSingleColumnSelection, type SingleColumnGuardResult } from './selectionGuards.js';
export { EditJournal, type EditJournalOptions } from './EditJournal.js';
export {
  submitEdits,
  type EditSubmission,
  type EditWriteBack,
  type EditWriteBackFailure,
  type EditWriteBackHooks,
  type SubmitEdits,
} from './writeBack.js';
