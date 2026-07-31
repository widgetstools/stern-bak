import { describe, expect, it } from 'vitest';
import { dark, light } from '../../src/tokens/semantic';
import { generateShadcnCSS, getShadcnTokens } from '../../src/adapters/shadcn';

/**
 * `getShadcnTokens` is the JS entry point for consumers that need the semantic
 * scheme at runtime rather than via CSS variables. `generateShadcnCSS` is
 * deliberately inert — the shadcn variables now live in starui-tokens.css, and
 * the function is kept only so existing callers do not break.
 */
describe('getShadcnTokens', () => {
  it('returns the dark scheme for "dark"', () => {
    expect(getShadcnTokens('dark')).toBe(dark);
  });

  it('returns the light scheme for "light"', () => {
    expect(getShadcnTokens('light')).toBe(light);
  });

  it('returns distinct schemes per mode', () => {
    expect(getShadcnTokens('dark')).not.toBe(getShadcnTokens('light'));
  });
});

describe('generateShadcnCSS', () => {
  it('emits nothing — shadcn vars come from starui-tokens.css', () => {
    // Pinned so a future change that starts emitting CSS again has to be
    // deliberate: duplicate declarations would override the canonical tokens.
    expect(generateShadcnCSS()).toBe('');
  });
});
