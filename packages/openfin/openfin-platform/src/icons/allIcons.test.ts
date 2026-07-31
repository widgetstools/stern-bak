import { describe, expect, it } from 'vitest';
import {
  CODE_SVG,
  DOWNLOAD_SVG,
  EYE_SVG,
  MARKET_ICON_SVGS,
  MOON_SVG,
  REFRESH_SVG,
  SETTINGS_SVG,
  SUN_SVG,
  TOOLS_SVG,
  UPLOAD_SVG,
  marketIconToDataUrl,
  svgToDataUrl,
} from './allIcons.js';

describe('MARKET_ICON_SVGS', () => {
  it('exposes a non-empty registry of SVG strings', () => {
    const keys = Object.keys(MARKET_ICON_SVGS);
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) {
      expect(typeof MARKET_ICON_SVGS[key], key).toBe('string');
      expect(MARKET_ICON_SVGS[key].length, key).toBeGreaterThan(0);
    }
  });
});

describe('svgToDataUrl', () => {
  it('returns empty string for empty input', () => {
    expect(svgToDataUrl('')).toBe('');
  });

  it('replaces currentColor, strips comments, and base64-encodes', () => {
    const svg = `<svg><!-- comment --><path stroke="currentColor"/></svg>`;
    const url = svgToDataUrl(svg, '#ff0000');
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const decoded = decodeURIComponent(escape(atob(url.slice('data:image/svg+xml;base64,'.length))));
    expect(decoded).toContain('#ff0000');
    expect(decoded).not.toContain('currentColor');
    expect(decoded).not.toContain('comment');
  });
});

describe('marketIconToDataUrl', () => {
  it('returns a data URL for a known key', () => {
    const url = marketIconToDataUrl('settings', '#ffffff');
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('returns empty string for an unknown key', () => {
    expect(marketIconToDataUrl('not-an-icon')).toBe('');
  });
});

describe('dock system convenience exports', () => {
  it('alias the expected MARKET_ICON_SVGS keys', () => {
    expect(TOOLS_SVG).toBe(MARKET_ICON_SVGS.wrench);
    expect(SETTINGS_SVG).toBe(MARKET_ICON_SVGS.settings);
    expect(REFRESH_SVG).toBe(MARKET_ICON_SVGS.refresh);
    expect(CODE_SVG).toBe(MARKET_ICON_SVGS.code);
    expect(DOWNLOAD_SVG).toBe(MARKET_ICON_SVGS.download);
    expect(UPLOAD_SVG).toBe(MARKET_ICON_SVGS.upload);
    expect(SUN_SVG).toBe(MARKET_ICON_SVGS.sun);
    expect(MOON_SVG).toBe(MARKET_ICON_SVGS.moon);
    expect(EYE_SVG).toBe(MARKET_ICON_SVGS.eye);
  });
});
