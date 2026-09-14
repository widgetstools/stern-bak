import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@wellsfargo-starui/design-system/icons/all-icons', () => ({
  marketIconToDataUrl: (name: string, color: string) => `data:mkt:${name}:${color}`,
  svgToDataUrl: (svg: string, color: string) => `data:svg:${color}:${svg.length}`,
}));

vi.mock('@wellsfargo-starui/design-system/icons/react', () => ({
  // Only ids in the bundled set render; anything else is unknown.
  lucideIconToSvg: (iconId: string) => (iconId === 'lucide:home' ? '<svg>home</svg>' : null),
}));

const palette = vi.fn(() => ({
  dark: { textDefault: '#FFFFFF' },
  light: { textDefault: '#1E1F23' },
}));
vi.mock('../openfinPalette.js', () => ({
  buildOpenFinPalettesFromDesignSystem: () => palette(),
}));

const { iconIdToSvgUrl, iconIdToThemedUrls, parseIconUrl, __resetThemedIconColorsForTests } =
  await import('./iconUtils.js');

beforeEach(() => {
  __resetThemedIconColorsForTests();
  palette.mockClear();
});

describe('iconIdToSvgUrl', () => {
  it('builds a market-icon data URL', () => {
    expect(iconIdToSvgUrl('mkt:bond', '#abc')).toBe('data:mkt:bond:#abc');
  });

  it('inlines a bundled lucide icon as a data URL — the dock renders offline', () => {
    expect(iconIdToSvgUrl('lucide:home', '#ff0000')).toBe('data:svg:#ff0000:15');
  });

  it('falls back to the Iconify CDN only for an id outside the bundled set', () => {
    expect(iconIdToSvgUrl('lucide:not-bundled', '#ff0000')).toBe(
      'https://api.iconify.design/lucide/not-bundled.svg?color=%23ff0000&height=24',
    );
  });

  it('defaults color from the dark theme palette', () => {
    expect(iconIdToSvgUrl('lucide:home')).toBe('data:svg:#FFFFFF:15');
  });

  it('resolves the palette once per document, not once per icon', () => {
    // Building the palette re-themes the whole page twice; the editor used
    // to pay that per row per render.
    iconIdToSvgUrl('lucide:home');
    iconIdToSvgUrl('mkt:bond');
    iconIdToThemedUrls('lucide:home');

    expect(palette).toHaveBeenCalledTimes(1);
  });

  it('returns empty string for an invalid iconId', () => {
    expect(iconIdToSvgUrl('')).toBe('');
    expect(iconIdToSvgUrl('nocolon')).toBe('');
  });
});

describe('iconIdToThemedUrls', () => {
  it('returns distinct dark and light URLs', () => {
    const urls = iconIdToThemedUrls('lucide:home');
    expect(urls.dark).toBe('data:svg:#FFFFFF:15');
    expect(urls.light).toBe('data:svg:#1E1F23:15');
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
