/**
 * Snapshot end-token collision check.
 *
 * The client tests `snapshotEndToken` as a case-insensitive SUBSTRING against
 * every frame body before parsing it, so a row carrying that word anywhere
 * truncates the snapshot and everything after it is misread as live deltas.
 *
 * The symptom is a short grid, not an error, which is why this is asserted
 * rather than left to review. It is cheap: one pass over the string fields of
 * a book that is built once.
 */

/** Throw if any string value in `rows` contains one of `tokens`. */
export function assertNoSentinelCollision(
  rows: readonly Record<string, unknown>[],
  tokens: readonly string[],
): void {
  const needles = tokens.map((token) => token.toLowerCase());
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (typeof value !== 'string') continue;
      const hay = value.toLowerCase();
      for (const needle of needles) {
        if (hay.includes(needle)) {
          throw new Error(
            `Field '${field}' value ${JSON.stringify(value)} contains snapshot end token ` +
              `'${needle}' — it would truncate the snapshot at the client.`,
          );
        }
      }
    }
  }
}
