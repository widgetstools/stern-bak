/**
 * Vitest global setup — mirrors the core-package setup: wires
 * jest-dom matchers + cleans up the jsdom DOM + localStorage between
 * tests so adapters / draft state start fresh.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  try { localStorage.clear(); } catch { /* noop */ }
});
