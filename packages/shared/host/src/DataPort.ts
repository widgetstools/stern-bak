import type { AppDataSnapshot, Unsubscribe } from '@wellsfargo-starui/types';

/**
 * DataPort — live data feeds and AppData mirror for template resolution.
 * Optional: grid works with static rowData when omitted.
 */
export interface DataPort {
  /** Resolves when the SharedWorker hub (or equivalent) is ready. */
  ready: Promise<void>;
  getSnapshot(): AppDataSnapshot | null;
  subscribe(fn: (snapshot: AppDataSnapshot) => void): Unsubscribe;
}
