/** Upsert keyed rows from a streaming delta batch. */
export function applyDelta<T extends Record<string, unknown>>(
  snapshot: T[],
  incoming: T[],
  idField: string,
): T[] {
  const map = new Map(snapshot.map((r) => [String(r[idField]), r]));
  for (const row of incoming) map.set(String(row[idField]), row);
  return [...map.values()];
}
