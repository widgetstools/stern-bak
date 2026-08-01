import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCrossWindowPrefix,
  readCrossWindowItem,
  writeCrossWindowItem,
} from './crossWindowStorage.js';

function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { map.set(key, value); }),
    removeItem: vi.fn((key: string) => { map.delete(key); }),
    key: vi.fn((index: number) => [...map.keys()][index] ?? null),
    get length() { return map.size; },
  };
}

describe('crossWindowStorage', () => {
  let local: ReturnType<typeof makeStorage>;
  let session: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    local = makeStorage();
    session = makeStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers localStorage over sessionStorage when both have the key', () => {
    local.setItem('theme', 'dark');
    session.setItem('theme', 'light');

    expect(readCrossWindowItem('theme')).toBe('dark');
    expect(session.getItem).not.toHaveBeenCalled();
  });

  it('falls back to sessionStorage when localStorage misses', () => {
    session.setItem('warm-session', '1');

    expect(readCrossWindowItem('warm-session')).toBe('1');
  });

  it('falls back to sessionStorage when localStorage throws', () => {
    local.getItem.mockImplementation(() => { throw new Error('blocked'); });
    session.setItem('fallback', 'yes');

    expect(readCrossWindowItem('fallback')).toBe('yes');
  });

  it('returns null when neither store is available', () => {
    vi.stubGlobal('localStorage', undefined);
    vi.stubGlobal('sessionStorage', undefined);

    expect(readCrossWindowItem('missing')).toBeNull();
  });

  it('writes to both stores and clears keys by prefix', () => {
    writeCrossWindowItem('starui:theme', 'dark');
    expect(local.setItem).toHaveBeenCalledWith('starui:theme', 'dark');
    expect(session.setItem).toHaveBeenCalledWith('starui:theme', 'dark');

    local.setItem('starui:a', '1');
    local.setItem('starui:b', '2');
    local.setItem('other', '3');
    session.setItem('starui:c', '4');

    clearCrossWindowPrefix('starui:');

    expect(local.removeItem).toHaveBeenCalledWith('starui:a');
    expect(local.removeItem).toHaveBeenCalledWith('starui:b');
    expect(local.removeItem).not.toHaveBeenCalledWith('other');
    expect(session.removeItem).toHaveBeenCalledWith('starui:c');
  });
});
