import { describe, expect, it } from 'vitest';
import postcssConfig from './postcss.config.js';

describe('postcss.config', () => {
  it('registers tailwindcss and autoprefixer plugins', () => {
    expect(postcssConfig.plugins).toEqual(
      expect.objectContaining({
        'tailwindcss/nesting': {},
        tailwindcss: {},
        autoprefixer: {},
      }),
    );
  });
});
