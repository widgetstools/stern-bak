import { composeRowId } from '@wellsfargo-starui/types';

/** Stable anonymous ids keyed by row object identity (never random per call). */
const anonymousRowIds = new WeakMap<object, string>();
let nextAnonymousId = 0;

/**
 * Stable AG Grid `getRowId` for SSRM rows. Prefers key column / group key /
 * `composeRowId`; falls back to a WeakMap sentinel for malformed rows.
 */
export function ssrmGetRowId(data: unknown, keyColumn: string): string {
  if (data == null || typeof data !== 'object') {
    return '__ssrm_missing__';
  }
  const record = data as Record<string, unknown>;
  const direct = record[keyColumn];
  if (direct != null && direct !== '') {
    return String(direct);
  }
  const groupKey = (data as { __ssrmGroupKey?: string }).__ssrmGroupKey;
  if (groupKey != null && groupKey !== '') {
    return String(groupKey);
  }
  const composed = composeRowId(record, keyColumn);
  if (composed != null) {
    return composed;
  }
  let anon = anonymousRowIds.get(data);
  if (anon === undefined) {
    anon = `__ssrm_anon_${++nextAnonymousId}`;
    anonymousRowIds.set(data, anon);
  }
  return anon;
}
