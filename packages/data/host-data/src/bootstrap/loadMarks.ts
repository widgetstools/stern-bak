/**
 * Phase-0 load-timing instrumentation (measurement only — no behavior change).
 *
 * Each milestone in the platform bootstrap stamps a `performance.mark` whose
 * `startTime` (relative to the page's `timeOrigin`) is the time-to-milestone in
 * ms. e2e budget tests read these back via
 * `performance.getEntriesByName('starui:platform-ready')`, and dev builds can
 * call {@link readLoadTimings} to log the full ladder. Every helper is a no-op
 * when `performance.mark` is unavailable (older worker scopes, SSR), so it is
 * always safe to call from bootstrap code.
 *
 * Marks are emitted on whatever realm runs the bootstrap — for the
 * window/main-thread path (`ensureConfigReady` / `ensurePlatformReady`) that is
 * the page itself, which is exactly where time-to-interactive is measured.
 */

const PREFIX = 'starui:';

/** Milestone identifiers (suffix appended to {@link PREFIX} for the mark name). */
export type LoadMilestone =
  | 'config-ready'
  | 'hub-connected'
  | 'appdata-ready'
  | 'catalog-ready'
  | 'platform-ready';

const MILESTONES: readonly LoadMilestone[] = [
  'config-ready',
  'hub-connected',
  'appdata-ready',
  'catalog-ready',
  'platform-ready',
];

function canMark(): boolean {
  return (
    typeof performance !== 'undefined' &&
    typeof performance.mark === 'function'
  );
}

/**
 * Stamp a milestone mark. Marks are emitted at most once per milestone per
 * realm (re-entrant bootstraps reuse the singleton promise, so the first
 * resolution wins); a duplicate call is ignored to keep the ladder clean.
 */
export function markLoadMilestone(milestone: LoadMilestone): void {
  if (!canMark()) return;
  const name = `${PREFIX}${milestone}`;
  try {
    if (performance.getEntriesByName(name, 'mark').length > 0) return;
    performance.mark(name);
  } catch {
    /* measurement must never break bootstrap */
  }
}

export const markConfigReady = (): void => markLoadMilestone('config-ready');
export const markHubConnected = (): void => markLoadMilestone('hub-connected');
export const markAppDataReady = (): void => markLoadMilestone('appdata-ready');
export const markCatalogReady = (): void => markLoadMilestone('catalog-ready');
export const markPlatformReady = (): void => markLoadMilestone('platform-ready');

/** Time-to-milestone (ms from `timeOrigin`), or `undefined` if not yet marked. */
export function readLoadMilestone(milestone: LoadMilestone): number | undefined {
  if (!canMark() || typeof performance.getEntriesByName !== 'function') {
    return undefined;
  }
  try {
    const entries = performance.getEntriesByName(`${PREFIX}${milestone}`, 'mark');
    return entries.length > 0 ? entries[entries.length - 1].startTime : undefined;
  } catch {
    return undefined;
  }
}

/** The full milestone ladder as `{ milestone: msFromTimeOrigin }`. */
export function readLoadTimings(): Partial<Record<LoadMilestone, number>> {
  const out: Partial<Record<LoadMilestone, number>> = {};
  for (const milestone of MILESTONES) {
    const value = readLoadMilestone(milestone);
    if (value !== undefined) out[milestone] = value;
  }
  return out;
}

/** Test-only — clears every milestone mark so a fresh ladder can be recorded. */
export function _resetLoadMarksForTests(): void {
  if (!canMark() || typeof performance.clearMarks !== 'function') return;
  for (const milestone of MILESTONES) {
    try {
      performance.clearMarks(`${PREFIX}${milestone}`);
    } catch {
      /* best-effort */
    }
  }
}
