/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@wellsfargo-starui/platform/scripts/staruiTailwindPreset.cjs', () => ({
  tailwindPreset: { theme: { extend: {} } },
}));
vi.mock('@wellsfargo-starui/design-system/tailwind', () => ({
  tailwindPreset: { theme: { extend: {} } },
}));
vi.mock('@wellsfargo-starui/platform/scripts/tailwindContentGlobs.mjs', () => ({
  demoAppTailwindContent: [],
}));

import tailwindConfig from '../tailwind.config.js';

describe('tailwind.config', () => {
  it('exports preset and content globs', () => {
    expect(tailwindConfig).toBeDefined();
    expect(tailwindConfig.presets).toBeDefined();
    expect(Array.isArray(tailwindConfig.presets)).toBe(true);
    expect(tailwindConfig.content).toEqual(
      expect.arrayContaining(['./index.html', './src/**/*.{ts,tsx}']),
    );
  });
});
