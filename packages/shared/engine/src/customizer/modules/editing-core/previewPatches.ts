import type { CellPatch, EditPreviewResult, EditValidator } from './types.js';
import { defaultEditValidator } from './validation.js';

/** Classify patches for preview UI (green / amber / red apply affordance). */
export function previewPatches(
  patches: readonly CellPatch[],
  validator: EditValidator = defaultEditValidator(),
): EditPreviewResult {
  const results = patches.map((patch) => ({
    patch,
    status: validator(patch),
  }));
  const validPatches = results.filter((r) => r.status === 'valid').map((r) => r.patch);
  const invalidCount = results.filter((r) => r.status === 'invalid').length;
  return {
    allValid: invalidCount === 0,
    someInvalid: invalidCount > 0 && invalidCount < patches.length,
    allInvalid: patches.length > 0 && invalidCount === patches.length,
    results,
    validPatches,
  };
}
