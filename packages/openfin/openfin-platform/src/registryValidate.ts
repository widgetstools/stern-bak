/**
 * Registry v2 validators — framework-agnostic, pure functions.
 *
 * Both the React and Angular registry editors import these and run
 * them on field change + save. Persistence layer (saveRegistryConfig)
 * does NOT re-validate — assumes the editors gate before write.
 *
 * The Zod-less, dependency-free style is deliberate: keeps this module
 * cheap to import from any framework context. If we ever standardize
 * on Zod, swap the body of `validateEntry()` for a `.safeParse()` call
 * against a schema — callers won't notice.
 */
import type { RegistryEntry } from './registryConfigTypes';
import { deriveSingletonConfigId } from './registryConfigTypes';

export interface ValidationError {
  /** Target field — used by the UI to place the error under the right input. */
  field: keyof RegistryEntry | '__root__';
  /** Human-readable message. */
  message: string;
}

/**
 * Validate a single entry against the v2 schema rules.
 *
 *   1. displayName, hostUrl, componentType, componentSubType — required non-empty
 *   2. type === 'external' | 'internal'
 *   3. usesHostConfig: boolean
 *   4. usesHostConfig === true  → appId + configServiceUrl must equal `hostEnv`
 *      (editor enforces by disabling the fields; this catches tampered payloads)
 *   5. usesHostConfig === false → appId required non-empty;
 *                                 configServiceUrl may be empty (self-contained)
 *   6. singleton === true → configId must equal deriveSingletonConfigId(...)
 *
 * Returns an array of errors (empty = valid).
 */
export function validateEntry(
  entry: Partial<RegistryEntry>,
  hostEnv?: { appId: string; configServiceUrl: string },
): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── Rule 1: required non-empty text fields ─────────────────────
  if (!entry.displayName?.trim()) errors.push({ field: 'displayName', message: 'Required' });
  if (!entry.hostUrl?.trim()) errors.push({ field: 'hostUrl', message: 'Required' });
  if (!entry.componentType?.trim()) errors.push({ field: 'componentType', message: 'Required' });
  if (!entry.componentSubType?.trim()) errors.push({ field: 'componentSubType', message: 'Required' });

  // ── Rule 2: type enum ──────────────────────────────────────────
  if (entry.type !== 'internal' && entry.type !== 'external') {
    errors.push({ field: 'type', message: "Must be 'internal' or 'external'" });
  }

  // ── Rule 3: usesHostConfig boolean ────────────────────────────
  if (typeof entry.usesHostConfig !== 'boolean') {
    errors.push({ field: 'usesHostConfig', message: 'Required (true or false)' });
  }

  // ── Rules 4 & 5: appId / configServiceUrl behavior ────────────
  if (entry.usesHostConfig === true) {
    if (hostEnv) {
      if (entry.appId !== hostEnv.appId) {
        errors.push({
          field: 'appId',
          message: 'Must equal host appId when usesHostConfig === true',
        });
      }
      if (entry.configServiceUrl !== hostEnv.configServiceUrl) {
        errors.push({
          field: 'configServiceUrl',
          message: 'Must equal host configServiceUrl when usesHostConfig === true',
        });
      }
    }
    // If hostEnv isn't provided we can't assert equality — skip the check.
  } else if (entry.usesHostConfig === false) {
    if (!entry.appId?.trim()) {
      errors.push({ field: 'appId', message: 'Required when usesHostConfig === false' });
    }
    // configServiceUrl is intentionally optional when usesHostConfig === false
    // (external component may be fully self-contained).
  }

  // ── Rule 6: singleton configId derivation ─────────────────────
  if (entry.singleton === true && entry.componentType && entry.componentSubType) {
    const expected = deriveSingletonConfigId(entry.componentType, entry.componentSubType);
    if (entry.configId && entry.configId !== expected) {
      errors.push({
        field: 'configId',
        message: `Singleton configId must be "${expected}"`,
      });
    }
  }

  return errors;
}

/**
 * Validate that no two singleton entries in the same `appId` share
 * a componentType + componentSubType pair.
 *
 * Non-singletons are exempt — they use `generateTemplateConfigId()`
 * which is a shared template id for a class of components, not an
 * instance id, so collisions are expected and harmless.
 *
 * Returns one error per colliding entry (pointing at the later one;
 * the first occurrence is treated as the "owner" of the slot).
 */
export function validateSingletonUniqueness(
  entries: readonly RegistryEntry[],
  appId: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, string>(); // configId → entryId holding it

  for (const e of entries) {
    if (!e.singleton) continue;
    if (e.appId !== appId) continue; // scope to this app

    const key = deriveSingletonConfigId(e.componentType, e.componentSubType);
    const existing = seen.get(key);
    if (existing) {
      errors.push({
        field: 'componentSubType',
        message:
          `Singleton configId "${key}" collides with entry ${existing}. ` +
          `Two singletons in app "${appId}" cannot share componentType+componentSubType.`,
      });
    } else {
      seen.set(key, e.id);
    }
  }

  return errors;
}
