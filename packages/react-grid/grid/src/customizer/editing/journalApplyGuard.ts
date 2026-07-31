/** Blocks cell-editor journal recording while journal patches are being applied. */
const applyDepthByGridId = new Map<string, number>();

export function isJournalApplyInProgress(gridId: string): boolean {
  return (applyDepthByGridId.get(gridId) ?? 0) > 0;
}

export async function withJournalApplyGuard<T>(
  gridId: string,
  fn: () => Promise<T>,
): Promise<T> {
  applyDepthByGridId.set(gridId, (applyDepthByGridId.get(gridId) ?? 0) + 1);
  try {
    return await fn();
  } finally {
    const next = (applyDepthByGridId.get(gridId) ?? 1) - 1;
    if (next <= 0) applyDepthByGridId.delete(gridId);
    else applyDepthByGridId.set(gridId, next);
  }
}

export function clearJournalApplyGuardRegistry(): void {
  applyDepthByGridId.clear();
}
