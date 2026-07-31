export type LabRow = Record<string, unknown>;

export interface StreamOptions {
  /** Number of rows to seed. Default 500. */
  rowCount?: number;
  /** Tick interval in ms. Default 250. */
  updateIntervalMs?: number;
  /** Toggle live ticking. Default true. */
  enableUpdates?: boolean;
}
