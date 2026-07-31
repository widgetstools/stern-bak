/**
 * Merge incoming provider rows into the current snapshot by id. Pure;
 * always returns a new array. New rows are appended at the end;
 * existing rows are replaced in place.
 */
export function applyDelta<T extends Record<string, unknown>>(
  snapshot: readonly T[],
  incoming: readonly T[],
  idField: keyof T,
): T[] {
  if (incoming.length === 0) return snapshot as T[];
  const byId = new Map<unknown, number>();
  for (let i = 0; i < snapshot.length; i++) {
    byId.set(snapshot[i][idField], i);
  }
  const next = snapshot.slice();
  for (const row of incoming) {
    const idx = byId.get(row[idField]);
    if (idx === undefined) {
      byId.set(row[idField], next.length);
      next.push(row);
    } else {
      next[idx] = row;
    }
  }
  return next;
}
