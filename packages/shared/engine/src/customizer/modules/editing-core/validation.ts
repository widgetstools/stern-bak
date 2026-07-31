import type { EditValidator, EditValidationResult } from './types.js';

/** Default validator — all patches valid until data-validation module wires in. */
export function defaultEditValidator(): EditValidator {
  return () => 'valid';
}

export function combineValidators(
  validators: readonly EditValidator[],
): EditValidator {
  return (patch) => {
    let worst: EditValidationResult = 'valid';
    for (const validate of validators) {
      const result = validate(patch);
      if (result === 'invalid') return 'invalid';
      if (result === 'warning') worst = 'warning';
    }
    return worst;
  };
}
