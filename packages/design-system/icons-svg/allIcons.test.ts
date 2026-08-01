// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MARKET_ICON_SVGS, marketIconToDataUrl, svgToDataUrl,
  TOOLS_SVG, SETTINGS_SVG, REFRESH_SVG, CODE_SVG, DOWNLOAD_SVG,
  UPLOAD_SVG, SUN_SVG, MOON_SVG, EYE_SVG,
} from './allIcons.js';

/** Decode a `data:image/svg+xml;base64,…` URL back to markup. */
function decode(dataUrl: string): string {
  return decodeURIComponent(escape(atob(dataUrl.replace('data:image/svg+xml;base64,', ''))));
}

describe('svgToDataUrl', () => {
  it('returns a base64 svg data URL', () => {
    const url = svgToDataUrl('<svg><path d="M0 0"/></svg>');
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(decode(url)).toBe('<svg><path d="M0 0"/></svg>');
  });

  it('substitutes every currentColor with the requested colour', () => {
    const svg = '<svg stroke="currentColor" fill="currentColor"></svg>';
    expect(decode(svgToDataUrl(svg, '#ff0000'))).toBe('<svg stroke="#ff0000" fill="#ff0000"></svg>');
  });

  it('defaults the colour to white', () => {
    expect(decode(svgToDataUrl('<svg stroke="currentColor"/>'))).toContain('#ffffff');
  });

  it('strips HTML comments', () => {
    expect(decode(svgToDataUrl('<svg><!-- generated --><path/></svg>'))).toBe('<svg><path/></svg>');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(decode(svgToDataUrl('  <svg>\n\t  <path/>\n</svg>  '))).toBe('<svg> <path/> </svg>');
  });

  it('returns an empty string for empty input rather than a bogus URL', () => {
    expect(svgToDataUrl('')).toBe('');
  });

  it('encodes non-ASCII markup without throwing', () => {
    // btoa alone rejects code points > 255; the encodeURIComponent/unescape
    // dance exists for exactly this.
    const url = svgToDataUrl('<svg><title>Prix — €</title></svg>');
    expect(decode(url)).toContain('Prix — €');
  });
});

describe('marketIconToDataUrl', () => {
  it('resolves a known icon key to a data URL', () => {
    const url = marketIconToDataUrl('wrench');
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(decode(url)).toContain('<svg');
  });

  it('applies the requested colour to the resolved icon', () => {
    expect(decode(marketIconToDataUrl('wrench', '#00ff00'))).toContain('#00ff00');
    expect(decode(marketIconToDataUrl('wrench', '#00ff00'))).not.toContain('currentColor');
  });

  it('returns an empty string for an unknown key', () => {
    expect(marketIconToDataUrl('definitely-not-an-icon')).toBe('');
  });
});

describe('MARKET_ICON_SVGS', () => {
  it('is a non-empty map of icon key to svg markup', () => {
    const keys = Object.keys(MARKET_ICON_SVGS);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(MARKET_ICON_SVGS[key]).toContain('<svg');
  });

  /**
   * KNOWN DEFECT — these 25 icons hardcode hex colours (e.g. stroke="#a78bfa")
   * instead of currentColor, despite this module's own doc comment claiming
   * "Each SVG uses stroke=currentColor". Two consequences:
   *
   *   - `marketIconToDataUrl(key, color)` silently ignores `color` for them
   *   - they cannot follow the light/dark theme, which CLAUDE.md requires
   *     ("no hardcoded hex anywhere")
   *
   * The list is pinned so the set can only shrink. Fixing an icon means
   * deleting its entry here; adding a new hardcoded-colour icon fails.
   */
  const KNOWN_HARDCODED_COLOUR = [
    'algo', 'buy', 'cancel-order', 'connectivity', 'crypto', 'equity', 'execute',
    'export', 'futures', 'fx', 'greeks', 'indicator', 'liquidity', 'loss',
    'new-order', 'positions', 'profit', 'search', 'sell', 'settlement',
    'stop-loss', 'take-profit', 'trades', 'var', 'volume',
  ];

  it('does not grow the set of icons that cannot be recoloured', () => {
    const actual = Object.entries(MARKET_ICON_SVGS)
      .filter(([, svg]) => !svg.includes('currentColor'))
      .map(([k]) => k)
      .sort();
    const unexpected = actual.filter((k) => !KNOWN_HARDCODED_COLOUR.includes(k));
    expect(unexpected, 'new icons must use currentColor, not a hardcoded hex').toEqual([]);
  });

  it('every other icon uses currentColor so it inherits CSS colour', () => {
    const themeable = Object.entries(MARKET_ICON_SVGS)
      .filter(([k]) => !KNOWN_HARDCODED_COLOUR.includes(k));
    expect(themeable.length).toBeGreaterThan(0);
    for (const [key, svg] of themeable) {
      expect(svg, `${key} should use currentColor`).toContain('currentColor');
    }
  });

  it('a hardcoded-colour icon ignores the requested colour (documents the defect)', () => {
    const url = marketIconToDataUrl(KNOWN_HARDCODED_COLOUR[0], '#00ff00');
    expect(url).not.toBe('');
    expect(decode(url)).not.toContain('#00ff00');
  });
});

describe('dock system icon re-exports', () => {
  it('every named dock icon resolves to real markup', () => {
    const named = {
      TOOLS_SVG, SETTINGS_SVG, REFRESH_SVG, CODE_SVG, DOWNLOAD_SVG,
      UPLOAD_SVG, SUN_SVG, MOON_SVG, EYE_SVG,
    };
    for (const [name, svg] of Object.entries(named)) {
      expect(svg, `${name} is missing from MARKET_ICON_SVGS`).toBeTruthy();
      expect(svg).toContain('<svg');
    }
  });
});
