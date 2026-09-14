import { beforeEach, describe, expect, it } from 'vitest';
import { isOpenFinHost, readLaunchInstanceId } from './readLaunchInstanceId.js';

describe('readLaunchInstanceId', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { search: '' },
    });
  });

  it('reads instanceId query param', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { search: '?instanceId=grid-ssrm' },
    });
    expect(readLaunchInstanceId()).toBe('grid-ssrm');
  });

  it('falls back to id query param', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { search: '?id=dev1grid-ssrm-1' },
    });
    expect(readLaunchInstanceId()).toBe('dev1grid-ssrm-1');
  });

  it('returns null when unstamped', () => {
    expect(readLaunchInstanceId()).toBeNull();
  });
});

describe('isOpenFinHost', () => {
  it('is false in jsdom', () => {
    expect(isOpenFinHost()).toBe(false);
  });
});
