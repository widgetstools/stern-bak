import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('@wellsfargo-starui/platform/scripts/staruiTailwindPreset.cjs', () => ({
  tailwindPreset: { theme: { extend: {} } },
}));
vi.mock('@wellsfargo-starui/design-system/tailwind', () => ({
  tailwindPreset: { theme: { extend: {} } },
}));
vi.mock('@wellsfargo-starui/platform/scripts/tailwindContentGlobs.mjs', () => ({
  demoAppTailwindContent: [],
}));

import postcssConfig from '../postcss.config.js';
import tailwindConfig from '../tailwind.config.js';

const appDir = dirname(fileURLToPath(import.meta.url));

describe('build config files', () => {
  it('exports postcss plugins', () => {
    expect(postcssConfig.plugins).toMatchObject({
      'tailwindcss/nesting': {},
      tailwindcss: {},
      autoprefixer: {},
    });
  });

  it('exports tailwind preset and content globs', () => {
    expect(tailwindConfig.presets).toHaveLength(1);
    expect(tailwindConfig.content).toEqual(
      expect.arrayContaining(['./index.html', './src/**/*.{ts,tsx}']),
    );
  });

  it('defines vite dev server port in vite.config.ts', () => {
    const source = readFileSync(join(appDir, '../vite.config.ts'), 'utf8');
    expect(source).toMatch(/port:\s*\d+/);
    expect(source).toContain('@vitejs/plugin-react');
  });
});
