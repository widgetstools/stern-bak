/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import tailwindConfig from './tailwind.config.js';

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
