import { describe, expect, it } from 'vitest';

import { createLogger, isLogLevel } from './logger.js';

function capture(level: Parameters<typeof createLogger>[0]) {
  const lines: string[] = [];
  return { lines, logger: createLogger(level, (line) => lines.push(line)) };
}

describe('createLogger', () => {
  it('emits at and above the threshold', () => {
    const { lines, logger } = capture('warn');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('WARN  w');
    expect(lines[1]).toContain('ERROR e');
  });

  it('emits everything at debug', () => {
    const { lines, logger } = capture('debug');
    logger.debug('d');
    logger.error('e');
    expect(lines).toHaveLength(2);
  });

  it('emits nothing at silent', () => {
    const { lines, logger } = capture('silent');
    logger.error('e');
    expect(lines).toEqual([]);
  });

  it('prefixes an ISO timestamp', () => {
    const { lines, logger } = capture('info');
    logger.info('hello');
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z INFO {2}hello$/);
  });
});

describe('isLogLevel', () => {
  it('recognises the known levels and rejects others', () => {
    expect(isLogLevel('debug')).toBe(true);
    expect(isLogLevel('silent')).toBe(true);
    expect(isLogLevel('verbose')).toBe(false);
  });
});
