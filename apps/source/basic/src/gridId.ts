import { marketsGridLocalStorageBundleKey } from '@wellsfargo-starui/core';

/** Stable grid id — the storage partition key for profile persistence. */
export const GRID_ID = 'bond-blotter-v1';

/** The single localStorage key every layout in this app persists under. */
export const STORAGE_KEY = marketsGridLocalStorageBundleKey(GRID_ID);
