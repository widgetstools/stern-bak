import { composeRowId } from '@wellsfargo-starui/types';
import type { GetRowIdParams } from 'ag-grid-community';

const anonymousRowIds = new WeakMap<object, string>();
let nextAnonymousId = 0;

/**
 * A row stub that carries its id directly. Tick removals arrive as ids, not
 * rows, and AG Grid's `remove` transaction runs `getRowId` on each entry —
 * for a composite key the parts cannot be rebuilt from the joined id, so the
 * stub names the id outright.
 */
export const SSRM_ROW_ID_KEY = '__ssrmRowId' as const;

/** Leaf = composeRowId; group = level + parentKeys + group key. */
export function ssrmGetRowId(data: unknown, keyColumn: string | readonly string[]): string {
  if (data == null || typeof data !== 'object') return '__ssrm_missing__';
  const record = data as Record<string, unknown>;
  const branded = record[SSRM_ROW_ID_KEY];
  if (typeof branded === 'string' && branded !== '') return branded;
  const groupKey = record.__ssrmGroupKey;
  if (groupKey != null && groupKey !== '') return String(groupKey);
  const composed = composeRowId(record, keyColumn);
  if (composed != null) return composed;
  let anon = anonymousRowIds.get(data);
  if (anon === undefined) {
    anon = `__ssrm_anon_${++nextAnonymousId}`;
    anonymousRowIds.set(data, anon);
  }
  return anon;
}

export function createSsrmGetRowId(keyColumn: string | readonly string[]) {
  return (params: GetRowIdParams): string => {
    const parents = params.parentKeys ?? [];
    const level = params.level ?? 0;
    if (level > 0 || parents.length > 0) {
      const leaf = ssrmGetRowId(params.data, keyColumn);
      return `${level}:${parents.join('|')}:${leaf}`;
    }
    return ssrmGetRowId(params.data, keyColumn);
  };
}
