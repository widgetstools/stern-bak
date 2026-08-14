/** Canonical localStorage key for persisted theme (`'dark'` | `'light'`).
 *  Byte-equal twin lives in `types/src/index.ts` (root subpath) — pinned
 *  by `themeKeyParity.test.ts`. Change BOTH or neither. */
export const THEME_STORAGE_KEY = 'starui:theme';

/** BroadcastChannel name for cross-tab / cross-window theme sync. */
export const THEME_BROADCAST_CHANNEL = 'starui:theme';
