import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@wellsfargo-starui/design-system/icons/all-icons', () => ({
  marketIconToDataUrl: (name: string, color: string) => `data:mkt:${name}:${color}`,
}));

const buildPalettes = vi.fn(() => ({
  dark: { textDefault: '#FFFFFF' },
  light: { textDefault: '#1E1F23' },
}));

vi.mock('../openfinPalette.js', () => ({
  buildOpenFinPalettesFromDesignSystem: () => buildPalettes(),
}));

const { iconIdToSvgUrl, iconIdToThemedUrls, parseIconUrl } = await import('./iconUtils.js');

/**
 * Resolving the palette flips `data-theme` on <html> twice and reads computed
 * styles, forcing a full-document style recalculation. The dock editor draws
 * one icon per row and re-renders on every keystroke in the inspector, so a
 * palette build per icon is what made typing sluggish. These pin the two
 * properties that keep it cheap.
 */
describe('palette resolution cost', () => {
  beforeEach(() => buildPalettes.mockClear());

  it('does not resolve the palette when the caller supplies a colour', () => {
    iconIdToSvgUrl('lucide:home', 'currentColor');
    expect(buildPalettes).not.toHaveBeenCalled();
  });

  /** Every workspace-setup pane calls it exactly this way. */
  it('stays free across a whole pane of icons', () => {
    for (let i = 0; i < 50; i++) iconIdToSvgUrl('lucide:home', 'currentColor');
    expect(buildPalettes).not.toHaveBeenCalled();
  });

  it('still resolves a default when no colour is given', () => {
    expect(iconIdToSvgUrl('mkt:bond')).toBe('data:mkt:bond:#FFFFFF');
    expect(buildPalettes).toHaveBeenCalledTimes(1);
  });

  it('bails out before resolving anything for a malformed id', () => {
    expect(iconIdToSvgUrl('nonsense')).toBe('');
    expect(buildPalettes).not.toHaveBeenCalled();
  });

  /** Needs both theme colours, so one build — not one per URL it returns. */
  it('resolves once for both themed URLs', () => {
    iconIdToThemedUrls('lucide:home');
    expect(buildPalettes).toHaveBeenCalledTimes(1);
  });
});

describe('iconIdToSvgUrl', () => {
  it('builds a market-icon data URL', () => {
    expect(iconIdToSvgUrl('mkt:bond', '#abc')).toBe('data:mkt:bond:#abc');
  });

  it('builds an Iconify CDN URL for lucide icons', () => {
    expect(iconIdToSvgUrl('lucide:home', '#ff0000')).toBe(
      'https://api.iconify.design/lucide/home.svg?color=%23ff0000&height=24',
    );
  });

  it('defaults color from the dark theme palette', () => {
    expect(iconIdToSvgUrl('lucide:home')).toContain(encodeURIComponent('#FFFFFF'));
  });

  it('returns empty string for an invalid iconId', () => {
    expect(iconIdToSvgUrl('')).toBe('');
    expect(iconIdToSvgUrl('nocolon')).toBe('');
  });
});

describe('iconIdToThemedUrls', () => {
  it('returns distinct dark and light URLs', () => {
    const urls = iconIdToThemedUrls('lucide:home');
    expect(urls.dark).toContain(encodeURIComponent('#FFFFFF'));
    expect(urls.light).toContain(encodeURIComponent('#1E1F23'));
    expect(urls.dark).not.toBe(urls.light);
  });
});

describe('parseIconUrl', () => {
  it('returns defaults when the URL is missing', () => {
    expect(parseIconUrl(undefined)).toEqual({
      iconName: 'FileText',
      iconId: 'lucide:file-text',
    });
  });

  it('parses an Iconify CDN URL into a PascalCase display name', () => {
    expect(
      parseIconUrl('https://api.iconify.design/lucide/file-text.svg?color=%23fff&height=24'),
    ).toEqual({ iconName: 'FileText', iconId: 'lucide:file-text' });
  });

  it('falls back to defaults for data URLs (not reversible)', () => {
    expect(parseIconUrl('data:image/svg+xml;base64,abc')).toEqual({
      iconName: 'FileText',
      iconId: 'lucide:file-text',
    });
  });
});
