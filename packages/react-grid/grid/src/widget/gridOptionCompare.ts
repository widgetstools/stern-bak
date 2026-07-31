/**
 * Targeted comparators for grid-option diffing in `useGridHost`.
 * Avoids full `JSON.stringify` on heavy keys when reference drifts
 * but content is unchanged.
 */

/**
 * Comparator for FUNCTION-CARRYING option values (defaultColDef,
 * rowClassRules, …). Strictly shallow: object members — including the
 * functions — compare by `Object.is`, never by JSON (JSON.stringify
 * silently drops functions, which would call two rule-sets with
 * different predicates "equal"). Modules that hoist their closures to
 * stable references make their carrier objects skippable; modules that
 * legitimately rebuild closures (fresh predicates) fail the compare
 * and push, as they must.
 */
export function functionOptionValuesEqual(prev: unknown, next: unknown): boolean {
  if (Object.is(prev, next)) return true;
  if (
    prev && next
    && typeof prev === 'object'
    && typeof next === 'object'
    && !Array.isArray(prev)
    && !Array.isArray(next)
  ) {
    return shallowRecordEqual(prev as Record<string, unknown>, next as Record<string, unknown>);
  }
  return false;
}

function shallowRecordEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

function deepArrayShallowEqual(a: unknown[], b: unknown[], depth = 0): boolean {
  if (a.length !== b.length) return false;
  if (depth > 3) return true;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    if (Object.is(av, bv)) continue;
    if (
      av && bv
      && typeof av === 'object'
      && typeof bv === 'object'
      && !Array.isArray(av)
      && !Array.isArray(bv)
    ) {
      if (!shallowRecordEqual(av as Record<string, unknown>, bv as Record<string, unknown>)) {
        return false;
      }
      continue;
    }
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (!deepArrayShallowEqual(av, bv, depth + 1)) return false;
      continue;
    }
    return false;
  }
  return true;
}

/** Compare two grid-option values; returns true when content matches. */
export function gridOptionValuesEqual(key: string, prev: unknown, next: unknown): boolean {
  if (Object.is(prev, next)) return true;

  if (key === 'defaultColDef' || key === 'autoGroupColumnDef') {
    if (
      prev && next
      && typeof prev === 'object'
      && typeof next === 'object'
      && !Array.isArray(prev)
      && !Array.isArray(next)
    ) {
      return shallowRecordEqual(prev as Record<string, unknown>, next as Record<string, unknown>);
    }
  }

  if (key === 'sideBar' || key === 'statusBar') {
    if (
      prev && next
      && typeof prev === 'object'
      && typeof next === 'object'
    ) {
      return shallowRecordEqual(prev as Record<string, unknown>, next as Record<string, unknown>);
    }
  }

  if (Array.isArray(prev) && Array.isArray(next)) {
    return deepArrayShallowEqual(prev, next);
  }

  if (
    prev && next
    && typeof prev === 'object'
    && typeof next === 'object'
    && !Array.isArray(prev)
    && !Array.isArray(next)
  ) {
    try {
      return JSON.stringify(prev) === JSON.stringify(next);
    } catch {
      return false;
    }
  }

  return false;
}
