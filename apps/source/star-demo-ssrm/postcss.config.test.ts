/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import postcssConfig from './postcss.config.cjs';

describe('postcss.config', () => {
  it('registers tailwindcss nesting, tailwindcss, and autoprefixer', () => {
    expect(postcssConfig).toBeDefined();
    expect(postcssConfig.plugins).toMatchObject({
      'tailwindcss/nesting': {},
      tailwindcss: {},
      autoprefixer: {},
    });
  });
});
