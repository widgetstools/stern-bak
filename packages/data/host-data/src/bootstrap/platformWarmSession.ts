import {
  clearCrossWindowPrefix,
  readCrossWindowItem,
  writeCrossWindowItem,
} from './crossWindowStorage.js';

const PLATFORM_WARM_PREFIX = 'starui:platform-warm:';

/** Record that a full platform bootstrap completed for this deployment. */
export function markPlatformWarm(appId: string): void {
  writeCrossWindowItem(`${PLATFORM_WARM_PREFIX}${appId}`, '1');
}

/** True when a prior window already ran full bootstrap (cross-window). */
export function isPlatformWarm(appId: string): boolean {
  return readCrossWindowItem(`${PLATFORM_WARM_PREFIX}${appId}`) === '1';
}

/** Test-only — clears all warm markers. */
export function _resetPlatformWarmSessionForTests(): void {
  clearCrossWindowPrefix(PLATFORM_WARM_PREFIX);
}
