import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  rgbStringToHex,
  buildPaletteFromThemeScope,
  buildOpenFinPalettesFromDesignSystem,
  paletteContrastRatio,
  FALLBACK_OPENFIN_DARK_PALETTE,
} from './openfinPalette';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensCssPath = resolve(
  __dirname,
  '../../../design-system/design-system/src/tokens/starui-tokens.css',
);

describe('rgbStringToHex', () => {
  it('converts rgb() to hex', () => {
    expect(rgbStringToHex('rgb(10, 118, 211)')).toBe('#0A76D3');
  });

  it('passes through existing hex', () => {
    expect(rgbStringToHex('#0A76D3')).toBe('#0A76D3');
  });
});

describe('buildOpenFinPalettesFromDesignSystem', () => {
  beforeAll(() => {
    const style = document.createElement('style');
    style.setAttribute('data-test-tokens', 'true');
    style.textContent = readFileSync(tokensCssPath, 'utf8');
    document.head.appendChild(style);
  });

  it('resolves Azure primary from dark tokens (not legacy OpenFin blue)', () => {
    const html = document.documentElement;
    html.setAttribute('data-theme', 'dark');
    const scope = document.createElement('div');
    document.body.appendChild(scope);

    const palette = buildPaletteFromThemeScope(scope);
    scope.remove();

    // starui-tokens dark --primary ≈ Azure hue 256; legacy OpenFin brand was #0A76D3
    expect(palette.brandPrimary).not.toBe(FALLBACK_OPENFIN_DARK_PALETTE.brandPrimary);
    expect(palette.brandPrimary).toMatch(/^#[0-9A-F]{6}$/);
    expect(palette.background1).toMatch(/^#[0-9A-F]{6}$/);
    expect(palette.contentBackground4).toBe(palette.background4);
  });

  it('resolves distinct palettes when html data-theme flips', () => {
    const html = document.documentElement;
    const probe = document.createElement('div');
    document.body.appendChild(probe);

    html.setAttribute('data-theme', 'dark');
    const darkBg = buildPaletteFromThemeScope(probe).background1;

    html.setAttribute('data-theme', 'light');
    const lightBg = buildPaletteFromThemeScope(probe).background1;

    probe.remove();
    html.setAttribute('data-theme', 'dark');

    expect(darkBg).not.toBe(lightBg);
  });

  it('returns distinct dark and light palettes', () => {
    const { dark, light } = buildOpenFinPalettesFromDesignSystem();
    expect(dark.background1).not.toBe(light.background1);
    expect(dark.brandPrimary).toMatch(/^#[0-9A-F]{6}$/);
    expect(light.brandPrimary).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('light palette keeps readable text on active browser tab chrome', () => {
    const { light } = buildOpenFinPalettesFromDesignSystem();
    expect(light.brandPrimaryText).toMatch(/^#[0-9A-F]{6}$/);
    expect(paletteContrastRatio(light.brandPrimaryText!, light.brandPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(light.brandPrimaryFocused).toBe(light.brandPrimaryText);
  });

  // Regression: `readColorExpression`'s color-mix branch read the regex
  // capture groups off by one — it passed the percentage as the second var
  // name and the var name as the percentage. `Number('foreground')` is NaN,
  // and the bit-packing turned that into the literal string '#AN', which
  // OpenFin accepts into a palette and renders as an undefined colour.
  // Only the four color-mix-derived keys were affected, and no assertion
  // covered them — hence this sweep over every key.
  it('resolves every palette key to a valid hex colour in both schemes', () => {
    const { dark, light } = buildOpenFinPalettesFromDesignSystem();
    for (const [scheme, palette] of [['dark', dark], ['light', light]] as const) {
      for (const [key, value] of Object.entries(palette)) {
        expect(`${scheme}.${key}=${value}`).toMatch(/=#[0-9A-F]{6}$/);
      }
    }
  });

  it('derives hover/active states as a mix, not as an endpoint or a NaN artefact', () => {
    const html = document.documentElement;
    html.setAttribute('data-theme', 'dark');
    const scope = document.createElement('div');
    document.body.appendChild(scope);

    const p = buildPaletteFromThemeScope(scope);
    scope.remove();

    // A mix of `--primary` toward `--foreground` lands near primary but not on
    // it. The broken build produced '#AN'; a swapped-argument build would have
    // produced '#000000' (the empty-token fallback for `--88`).
    expect(p.brandPrimaryHover).not.toBe(p.brandPrimary);
    expect(p.brandPrimaryHover).not.toBe('#000000');
    expect(p.brandSecondaryHover).not.toBe(p.brandSecondary);
    expect(p.brandSecondaryHover).not.toBe('#000000');
    // 88% primary must stay closer to primary than the 82% active variant.
    expect(paletteContrastRatio(p.brandPrimaryHover!, p.brandPrimary))
      .toBeLessThan(paletteContrastRatio(p.brandPrimaryActive!, p.brandPrimary));
  });

  it('dark chrome header (backgroundPrimary) is lighter than the page so the window frame is perceptible', () => {
    const { dark } = buildOpenFinPalettesFromDesignSystem();
    expect(dark.backgroundPrimary).toMatch(/^#[0-9A-F]{6}$/);
    // Header must be clearly lighter than the page background, not a hairline.
    const lift = paletteContrastRatio(dark.backgroundPrimary, dark.background1!);
    expect(lift).toBeGreaterThan(1.15);
    // Title bar and tab-strip surface stay in lock-step.
    expect(dark.background2).toBe(dark.backgroundPrimary);
  });
});
