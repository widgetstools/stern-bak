/**
 * Mock provider configuration presets.
 *
 * The underlying generator (`mockPosition.ts` + `mockUniverse.ts`) is
 * already a rich fixed-income simulator — 53 distinct issuers cycled
 * to any row count, 270+ fields per row including nested
 * ratings/exposure/key-rate-durations, and a tick function that walks
 * pricing, yields, spreads, accrued, and P&L.
 *
 * These presets just label two common configurations so consumers
 * (the browser-blotter e2e app, the OpenFin workspace e2e app, the
 * mockdata-provider tutorial) don't each invent their own knob set:
 *
 *   - **fi-positions-large** — 500 rows, 50ms tick interval. Designed
 *     to stress flash-on-change, conditional styling, calculated
 *     columns, and the SharedWorker data-services hub under sustained
 *     high-frequency updates.
 *
 *   - **fi-positions-small** — 50 rows, 750ms tick interval. The
 *     "this is what a working grid looks like" preset for tutorials
 *     that just need ticking data on screen.
 *
 * Both return `MockProviderConfig` objects ready to pass into the
 * SharedWorker provider hub (or to `startMock` for in-process use).
 *
 * Override any field with the options argument:
 *
 *   ```ts
 *   const cfg = createFiPositionsLargeConfig({ rowCount: 2_000 });
 *   ```
 *
 * Override semantics: provided values win; omitted values fall back
 * to the preset's defaults. To turn ticking off, pass
 * `{ enableUpdates: false }`.
 */
import type { MockProviderConfig } from '@wellsfargo-starui/types';

export interface FiPositionsConfigOverrides {
  /** Row count. Universe has 53 issuers; counts above 53 cycle with rotating account ids. */
  rowCount?: number;
  /** Tick interval in milliseconds. */
  updateIntervalMs?: number;
  /** Master switch. Defaults to true. */
  enableUpdates?: boolean;
  /** Key column. Defaults to 'cusip' — matches the universe schema. */
  keyColumn?: string | readonly string[];
}

const POSITIONS_BASE: Pick<MockProviderConfig, 'providerType' | 'dataType' | 'keyColumn'> = {
  providerType: 'mock',
  dataType: 'positions',
  keyColumn: 'cusip',
};

/**
 * High-frequency 500-row positions preset. Targets the e2e harness
 * and any "is the grid keeping up?" benchmark workflow.
 *
 * Defaults:
 *   - rowCount = 500
 *   - updateIntervalMs = 50 (20 ticks/sec)
 *   - enableUpdates = true
 */
export function createFiPositionsLargeConfig(
  overrides: FiPositionsConfigOverrides = {},
): MockProviderConfig {
  return {
    ...POSITIONS_BASE,
    rowCount: overrides.rowCount ?? 500,
    updateIntervalMs: overrides.updateIntervalMs ?? 50,
    enableUpdates: overrides.enableUpdates ?? true,
    keyColumn: overrides.keyColumn ?? POSITIONS_BASE.keyColumn,
  };
}

/**
 * Calm 50-row positions preset. Targets tutorials that need
 * recognizable ticking without overwhelming visual noise.
 *
 * Defaults:
 *   - rowCount = 50
 *   - updateIntervalMs = 750 (~1.3 ticks/sec)
 *   - enableUpdates = true
 */
export function createFiPositionsSmallConfig(
  overrides: FiPositionsConfigOverrides = {},
): MockProviderConfig {
  return {
    ...POSITIONS_BASE,
    rowCount: overrides.rowCount ?? 50,
    updateIntervalMs: overrides.updateIntervalMs ?? 750,
    enableUpdates: overrides.enableUpdates ?? true,
    keyColumn: overrides.keyColumn ?? POSITIONS_BASE.keyColumn,
  };
}
