import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getInteropClient, isInteropAvailable } from './interop.js';

let originalFin: unknown;

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalFin = (globalThis as any).fin;
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fin = originalFin;
});

describe('getInteropClient / isInteropAvailable', () => {
  it('undefined / false outside OpenFin', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = undefined;
    expect(getInteropClient()).toBeUndefined();
    expect(isInteropAvailable()).toBe(false);
  });

  it('undefined / false when fin.me has no interop (bare window)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = { me: {} };
    expect(getInteropClient()).toBeUndefined();
    expect(isInteropAvailable()).toBe(false);
  });

  it('hands back fin.me.interop when present (platform view)', () => {
    const interop = { setContext: async () => {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = { me: { interop } };
    expect(getInteropClient()).toBe(interop);
    expect(isInteropAvailable()).toBe(true);
  });
});
