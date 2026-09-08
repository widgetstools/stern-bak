import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('falls back to defaults on an empty environment', () => {
    expect(loadConfig({})).toEqual({
      port: 8081,
      host: '0.0.0.0',
      logLevel: 'info',
      bookScale: 1,
      tickRows: 200,
      tickIntervalMs: 100,
      seed: 20260907,
    });
  });

  it('reads well-formed values', () => {
    const config = loadConfig({
      PORT: '9000',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      BOOK_SCALE: '2.5',
      TICK_ROWS: '10',
      TICK_INTERVAL_MS: '500',
      SEED: '42',
    });
    expect(config).toMatchObject({
      port: 9000,
      host: '127.0.0.1',
      logLevel: 'debug',
      bookScale: 2.5,
      tickRows: 10,
      tickIntervalMs: 500,
      seed: 42,
    });
  });

  it('clamps out-of-range values instead of failing to start', () => {
    const config = loadConfig({ PORT: '999999', BOOK_SCALE: '-5', TICK_INTERVAL_MS: '1' });
    expect(config.port).toBe(65535);
    expect(config.bookScale).toBe(0.05);
    expect(config.tickIntervalMs).toBe(10);
  });

  it('ignores unparseable and blank values', () => {
    const config = loadConfig({ PORT: 'not-a-port', SEED: '', LOG_LEVEL: 'chatty' });
    expect(config.port).toBe(8081);
    expect(config.seed).toBe(20260907);
    expect(config.logLevel).toBe('info');
  });

  it('accepts a level in any casing', () => {
    expect(loadConfig({ LOG_LEVEL: 'WARN' }).logLevel).toBe('warn');
  });

  it('allows ticking to be turned off entirely', () => {
    expect(loadConfig({ TICK_ROWS: '0' }).tickRows).toBe(0);
  });
});
