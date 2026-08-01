export * from './types.js';
export { buildPatchesFromTargets, dedupePatches } from './buildPatches.js';
export { buildRowUpdatesFromPatches, type PatchDirection } from './buildRowUpdates.js';
export { applyPatches, applyForwardPatches } from './applyPatches.js';
export { previewPatches } from './previewPatches.js';
export { defaultEditValidator, combineValidators } from './validation.js';
export { assertSingleColumnSelection, type SingleColumnGuardResult } from './selectionGuards.js';
export { EditJournal, type EditJournalOptions } from './EditJournal.js';
