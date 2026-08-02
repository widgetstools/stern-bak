import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampSnapshotRows,
  loadConfig,
  parseLiveMode,
  type AppConfig,
} from "./config.js";

const baseConfig = (): AppConfig => ({
  port: 8081,
  nodeEnv: "test",
  rowProfile: "slim",
  defaultSnapshotRows: 5000,
  minSnapshotRows: 1000,
  maxSnapshotRows: 20000,
  liveTickMs: 40,
  maxRowsPerFrame: 2000,
  maxLiveRowsPerSec: 60000,
  defaultLiveMode: "legacy",
  debug: false,
  logOutbound: true,
  logLiveEvery: 1,
  logBodyPreviewChars: 400,
});

describe("parseLiveMode", () => {
  it("defaults to legacy", () => {
    const config = loadConfig();
    expect(parseLiveMode(config, undefined)).toBe("legacy");
  });

  it("accepts sparse and sparse-erratic", () => {
    const config = loadConfig();
    expect(parseLiveMode(config, "sparse")).toBe("sparse");
    expect(parseLiveMode(config, "sparse-erratic")).toBe("sparse");
    expect(parseLiveMode(config, "legacy")).toBe("legacy");
  });
});

describe("clampSnapshotRows", () => {
  it("clamps requested rows to configured min/max", () => {
    const config = baseConfig();
    expect(clampSnapshotRows(config, 500)).toBe(1000);
    expect(clampSnapshotRows(config, 25000)).toBe(20000);
    expect(clampSnapshotRows(config, 7500)).toBe(7500);
  });

  it("uses default when requested is undefined", () => {
    const config = baseConfig();
    expect(clampSnapshotRows(config, undefined)).toBe(5000);
  });

  it("falls back to default when requested is not finite", () => {
    const config = baseConfig();
    expect(clampSnapshotRows(config, Number.NaN)).toBe(5000);
  });

  it("floors fractional values", () => {
    const config = baseConfig();
    expect(clampSnapshotRows(config, 1500.9)).toBe(1500);
  });
});

describe("loadConfig", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllEnvs();
  });

  it("reads env overrides for snapshot and live settings", () => {
    vi.stubEnv("PORT", "9099");
    vi.stubEnv("ROW_PROFILE", "wide");
    vi.stubEnv("DEFAULT_SNAPSHOT_ROWS", "15000");
    vi.stubEnv("MIN_SNAPSHOT_ROWS", "2000");
    vi.stubEnv("MAX_SNAPSHOT_ROWS", "18000");
    vi.stubEnv("LIVE_TICK_MS", "100");
    vi.stubEnv("MAX_ROWS_PER_FRAME", "500");
    vi.stubEnv("MAX_LIVE_ROWS_PER_SEC", "8000");
    vi.stubEnv("LIVE_MODE", "sparse");
    vi.stubEnv("DEBUG", "true");
    vi.stubEnv("LOG_OUTBOUND", "0");
    vi.stubEnv("LOG_LIVE_EVERY", "5");
    vi.stubEnv("LOG_BODY_PREVIEW", "200");

    const config = loadConfig();
    expect(config.port).toBe(9099);
    expect(config.rowProfile).toBe("wide");
    expect(config.defaultSnapshotRows).toBe(15000);
    expect(config.minSnapshotRows).toBe(2000);
    expect(config.maxSnapshotRows).toBe(18000);
    expect(config.liveTickMs).toBe(100);
    expect(config.maxRowsPerFrame).toBe(500);
    expect(config.maxLiveRowsPerSec).toBe(8000);
    expect(config.defaultLiveMode).toBe("sparse");
    expect(config.debug).toBe(true);
    expect(config.logOutbound).toBe(false);
    expect(config.logLiveEvery).toBe(5);
    expect(config.logBodyPreviewChars).toBe(200);
  });

  it("uses SWEEP_ROWS_PER_SEC alias when MAX_LIVE_ROWS_PER_SEC is unset", () => {
    delete process.env.MAX_LIVE_ROWS_PER_SEC;
    vi.stubEnv("ROW_PROFILE", "wide");
    vi.stubEnv("SWEEP_ROWS_PER_SEC", "12000");

    const config = loadConfig();
    expect(config.maxLiveRowsPerSec).toBe(12000);
  });

  it("applies fallbacks for invalid numeric env values", () => {
    vi.stubEnv("PORT", "not-a-number");
    vi.stubEnv("LIVE_TICK_MS", "abc");
    vi.stubEnv("MAX_ROWS_PER_FRAME", "x");
    vi.stubEnv("LOG_LIVE_EVERY", "0");
    vi.stubEnv("LOG_BODY_PREVIEW", "10");

    const config = loadConfig();
    expect(config.port).toBe(8081);
    expect(config.liveTickMs).toBe(40);
    expect(config.maxRowsPerFrame).toBe(2000);
    expect(config.logLiveEvery).toBe(1);
    expect(config.logBodyPreviewChars).toBe(400);
  });
});
