import { describe, expect, it } from 'vitest';
import { ConfigNotFoundError, OptimisticLockError } from './errors';
import type { AppConfigRow } from './types';

/**
 * Both errors are matched by `name` (not by `instanceof`) in the config
 * browser and in `ConfigManager`'s REST fallback path, because an error
 * crossing a worker/postMessage boundary loses its prototype. The name
 * and message strings are therefore load-bearing.
 */
describe('OptimisticLockError', () => {
  const row = { configId: 'c1', updatedTime: '2026-01-01T00:00:00Z' } as AppConfigRow;

  it('is an Error with the pinned name and message', () => {
    const err = new OptimisticLockError(row);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('OptimisticLockError');
    expect(err.message).toBe('Row changed since edit began');
  });

  it('carries the latest row so the editor can offer a reload prompt', () => {
    expect(new OptimisticLockError(row).currentRow).toBe(row);
  });

  it('accepts undefined when the current row could not be read back', () => {
    expect(new OptimisticLockError(undefined).currentRow).toBeUndefined();
  });

  it('is catchable as a plain Error', () => {
    expect(() => { throw new OptimisticLockError(row); }).toThrow('Row changed since edit began');
  });
});

describe('ConfigNotFoundError', () => {
  it('names the missing configId in both the message and a field', () => {
    const err = new ConfigNotFoundError('grid-42');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ConfigNotFoundError');
    expect(err.message).toBe('Configuration not found: grid-42');
    expect(err.configId).toBe('grid-42');
  });

  it('is distinguishable from OptimisticLockError by name', () => {
    // The update path throws one or the other; a caller retrying on the
    // wrong one would loop forever against a row that does not exist.
    expect(new ConfigNotFoundError('x').name).not.toBe(new OptimisticLockError(undefined).name);
  });
});
