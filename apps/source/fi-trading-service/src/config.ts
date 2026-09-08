/**
 * Environment to typed config, with every value clamped at the edge.
 *
 * Clamping here rather than at each use site means a nonsense env var
 * produces a working server with a sane value, not a runtime failure three
 * layers down.
 */

import { isLogLevel, type LogLevel } from './logger.js';

export interface AppConfig {
  port: number;
  host: string;
  logLevel: LogLevel;
  /** Rows in the phase-1 synthetic book. */
  /** Multiplier on the demo book scale. 1 is roughly 1,700 positions. */
  bookScale: number;
  /** Rows mutated per simulator tick. */
  tickRows: number;
  /** Simulator cadence, ms. */
  tickIntervalMs: number;
  seed: number;
}

function intFromEnv(env: NodeJS.ProcessEnv, key: string, fallback: number, lo: number, hi: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(hi, Math.max(lo, parsed));
}

/** Same clamping as `intFromEnv`, for a dial that is meaningful below 1. */
function numberFromEnv(env: NodeJS.ProcessEnv, key: string, fallback: number, lo: number, hi: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(hi, Math.max(lo, parsed));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawLevel = (env.LOG_LEVEL ?? 'info').toLowerCase();
  return {
    // 0 is allowed and means 'ephemeral port', which is how tests bind.
    port: intFromEnv(env, 'PORT', 8081, 0, 65535),
    host: env.HOST ?? '0.0.0.0',
    logLevel: isLogLevel(rawLevel) ? rawLevel : 'info',
    bookScale: numberFromEnv(env, 'BOOK_SCALE', 1, 0.05, 60),
    tickRows: intFromEnv(env, 'TICK_ROWS', 200, 0, 100_000),
    tickIntervalMs: intFromEnv(env, 'TICK_INTERVAL_MS', 100, 10, 60_000),
    seed: intFromEnv(env, 'SEED', 20260907, 1, 2_147_483_647),
  };
}
