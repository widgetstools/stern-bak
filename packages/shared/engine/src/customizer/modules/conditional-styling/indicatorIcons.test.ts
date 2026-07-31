import { describe, expect, it } from 'vitest';
import {
  findIndicatorIcon,
  iconAsDataUrl,
  INDICATOR_ICONS,
} from './indicatorIcons.js';

describe('INDICATOR_ICONS catalog', () => {
  it('contains unique keys', () => {
    const keys = INDICATOR_ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('findIndicatorIcon', () => {
  it('returns undefined for missing or unknown keys', () => {
    expect(findIndicatorIcon(undefined)).toBeUndefined();
    expect(findIndicatorIcon('not-a-real-icon')).toBeUndefined();
  });

  it('looks up icons by persisted key', () => {
    expect(findIndicatorIcon('arrow-up')?.label).toBe('Arrow up');
  });
});

describe('iconAsDataUrl', () => {
  it('embeds stroke colour into the data URL', () => {
    const icon = findIndicatorIcon('arrow-up')!;
    const url = iconAsDataUrl(icon, '#ff0000');
    expect(url.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(url)).toContain('#ff0000');
  });

  it('replaces currentColor in solid-fill bodies', () => {
    const icon = findIndicatorIcon('triangle-up-solid')!;
    const url = iconAsDataUrl(icon, 'blue');
    expect(decodeURIComponent(url)).toContain("fill='blue'");
  });
});
