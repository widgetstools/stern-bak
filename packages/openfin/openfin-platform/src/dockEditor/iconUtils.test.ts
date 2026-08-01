import { describe, expect, it, vi } from 'vitest';

vi.mock('@wellsfargo-starui/design-system/icons/all-icons', () => ({
  marketIconToDataUrl: (name: string, color: string) => `data:mkt:${name}:${color}`,
}));

vi.mock('../openfinPalette.js', () => ({
  buildOpenFinPalettesFromDesignSystem: () => ({
    dark: { textDefault: '#FFFFFF' },
    light: { textDefault: '#1E1F23' },
  }),
}));

const { iconIdToSvgUrl, iconIdToThemedUrls, parseIconUrl } = await import('./iconUtils.js');

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
