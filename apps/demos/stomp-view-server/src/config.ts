import type { RowProfile } from "./data/fiRecords.js";

export type LiveMode = "legacy" | "sparse";

export interface AppConfig {
  port: number;
  nodeEnv: string;
  /**
   * Snapshot row width (env `ROW_PROFILE`): `slim` (default) = top-level
   * primitives only (~1.1 KB) — serialization stops being the bottleneck so
   * high aggregate live rates are sustainable, the right shape for the
   * default 20k high-frequency blotter. `wide` = full ~8.5 KB nested records.
   */
  rowProfile: RowProfile;
  /** Rows delivered in snapshot unless overridden by STOMP header `snapshot-rows` */
  defaultSnapshotRows: number;
  minSnapshotRows: number;
  maxSnapshotRows: number;
  /**
   * Live tick cadence in ms (env `LIVE_TICK_MS`, default 40 → 25
   * frames/sec). The trigger `rate` is honoured EXACTLY regardless of
   * cadence — each tick emits `rate × elapsed / 1000` rows (fractional
   * budget carried), so this knob only shapes frame size, not
   * throughput: 10 000 rows/sec at 40 ms = ~400-row frames.
   */
  liveTickMs: number;
  /**
   * Hard cap on rows in one live frame (env `MAX_ROWS_PER_FRAME`,
   * default 2000). Keeps a single frame decodable within the
   * receiver's long-task budget; leftover rate budget carries to the
   * next tick.
   */
  maxRowsPerFrame: number;
  /**
   * Safety cap on the requested live rate in rows/sec (env
   * `MAX_LIVE_ROWS_PER_SEC`; legacy alias `SWEEP_ROWS_PER_SEC`).
   * Requests above it are clamped. Default tracks the row profile's
   * measured single-thread serialization ceiling: `slim` (~1.1 KB)
   * → 60 000; `wide` (~8.5 KB) → 10 000.
   */
  maxLiveRowsPerSec: number;
  /**
   * Live update wire shape (env `LIVE_MODE`): `legacy` = full rows
   * whose hot-field values changed; `sparse` = partial headline-field
   * deltas for positions (positions only — trades stay full-row).
   * Overridable per SEND via STOMP header `live-mode: sparse`.
   */
  defaultLiveMode: LiveMode;
  /** Verbose STOMP / per-tick logging */
  debug: boolean;
  /** Log outbound STOMP frames (CONNECTED + MESSAGE) to the terminal */
  logOutbound: boolean;
  /** Log every Nth live-update MESSAGE when logOutbound (1 = all) */
  logLiveEvery: number;
  /** Max characters of MESSAGE body to print before truncation */
  logBodyPreviewChars: number;
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 8081);
  const rawDefault = Number(process.env.DEFAULT_SNAPSHOT_ROWS ?? 20_000);
  const rawMin = Number(process.env.MIN_SNAPSHOT_ROWS ?? 1_000);
  const rawMax = Number(process.env.MAX_SNAPSHOT_ROWS ?? 20_000);

  const minSnapshotRows = Number.isFinite(rawMin) ? rawMin : 1_000;
  const maxSnapshotRows = Number.isFinite(rawMax)
    ? Math.max(minSnapshotRows, rawMax)
    : Math.max(minSnapshotRows, 1_000);
  const defaultSnapshotRows = clamp(
    Number.isFinite(rawDefault) ? rawDefault : 1_000,
    minSnapshotRows,
    maxSnapshotRows,
  );

  const rowProfile: RowProfile =
    process.env.ROW_PROFILE === "wide" ? "wide" : "slim";

  const defaultMaxLiveRows = rowProfile === "slim" ? 60_000 : 10_000;
  const rawMaxLiveRows = Number.parseInt(
    process.env.MAX_LIVE_ROWS_PER_SEC ??
      process.env.SWEEP_ROWS_PER_SEC ??
      String(defaultMaxLiveRows),
    10,
  );

  const rawTickMs = Number.parseInt(process.env.LIVE_TICK_MS ?? "40", 10);
  const rawMaxRowsPerFrame = Number.parseInt(
    process.env.MAX_ROWS_PER_FRAME ?? "2000",
    10,
  );

  const logLiveRaw = Number.parseInt(process.env.LOG_LIVE_EVERY ?? "1", 10);
  const logPreviewRaw = Number.parseInt(
    process.env.LOG_BODY_PREVIEW ?? "400",
    10,
  );

  const defaultLiveMode: LiveMode =
    process.env.LIVE_MODE === "sparse" ? "sparse" : "legacy";

  return {
    port: Number.isFinite(port) ? port : 8081,
    nodeEnv: process.env.NODE_ENV ?? "development",
    rowProfile,
    defaultSnapshotRows,
    minSnapshotRows,
    maxSnapshotRows,
    liveTickMs:
      Number.isFinite(rawTickMs) ? clamp(rawTickMs, 10, 1000) : 40,
    maxRowsPerFrame:
      Number.isFinite(rawMaxRowsPerFrame)
        ? clamp(rawMaxRowsPerFrame, 50, 50_000)
        : 2000,
    maxLiveRowsPerSec:
      Number.isFinite(rawMaxLiveRows) && rawMaxLiveRows >= 1
        ? Math.min(rawMaxLiveRows, 1_000_000)
        : defaultMaxLiveRows,
    defaultLiveMode,
    debug: process.env.DEBUG === "1" || process.env.DEBUG === "true",
    logOutbound:
      process.env.LOG_OUTBOUND !== "0" &&
      process.env.LOG_OUTBOUND !== "false",
    logLiveEvery: Number.isFinite(logLiveRaw) && logLiveRaw >= 1 ? logLiveRaw : 1,
    logBodyPreviewChars:
      Number.isFinite(logPreviewRaw) && logPreviewRaw >= 80
        ? Math.min(logPreviewRaw, 50_000)
        : 400,
  };
}

export function clampSnapshotRows(
  config: AppConfig,
  requested: number | undefined,
): number {
  const lo = Math.max(1, config.minSnapshotRows);
  const hi = Math.max(lo, config.maxSnapshotRows);
  const raw = requested ?? config.defaultSnapshotRows;
  if (!Number.isFinite(raw)) return clamp(config.defaultSnapshotRows, lo, hi);
  return clamp(Math.floor(raw), lo, hi);
}

export function parseLiveMode(
  config: AppConfig,
  requested: string | undefined,
): LiveMode {
  const raw = (requested ?? config.defaultLiveMode).trim().toLowerCase();
  return raw === "sparse" || raw === "sparse-erratic" ? "sparse" : "legacy";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
