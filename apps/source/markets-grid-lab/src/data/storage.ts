import { createMarketsGridLocalStorageStorage } from '@wellsfargo-starui/grid';

/** Shared MarketsGrid storage factory — each tab scopes by its own `gridId`. */
export const labStorage = createMarketsGridLocalStorageStorage();
