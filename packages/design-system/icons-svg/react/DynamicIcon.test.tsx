import { describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach } from 'vitest';
import { DynamicIcon } from './DynamicIcon';
import { MARKET_ICON_SVGS } from '../allIcons';

afterEach(cleanup);

describe('DynamicIcon', () => {
  it('renders a curated lucide id as an inline <svg>', () => {
    const { container } = render(<DynamicIcon icon="lucide:file-text" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Default size when style gives no numeric width/height.
    expect(svg?.getAttribute('width')).toBe('16');
  });

  it('applies a numeric style width as the lucide icon size', () => {
    const { container } = render(
      <DynamicIcon icon="lucide:x" style={{ width: 24, color: 'rgb(1, 2, 3)' }} />,
    );
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('24');
  });

  it('falls back to the numeric style height when width is a CSS string', () => {
    const { container } = render(
      <DynamicIcon icon="lucide:check" style={{ width: '100%', height: 20 }} />,
    );
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20');
  });

  it('renders a known mkt: icon inline from the market SVG map', () => {
    const name = Object.keys(MARKET_ICON_SVGS)[0];
    const { container } = render(
      <DynamicIcon icon={`mkt:${name}`} style={{ width: 18, color: 'red' }} className="mkt" />,
    );
    const span = container.querySelector('span.mkt');
    expect(span).not.toBeNull();
    expect(span?.innerHTML).toContain('<svg');
    // The width="24" template attribute is rewritten to the requested size.
    expect(span?.innerHTML).toContain('width="18"');
  });

  it('renders unknown icon sets as an Iconify CDN <img>', () => {
    const { container } = render(<DynamicIcon icon="mdi:rocket" style={{ width: 14 }} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://api.iconify.design/mdi/rocket.svg?height=14');
    expect(img?.getAttribute('alt')).toBe('mdi:rocket');
  });

  it('renders an unknown mkt: name via the CDN fallback rather than crashing', () => {
    const { container } = render(<DynamicIcon icon="mkt:not-a-real-icon" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain(
      'api.iconify.design/mkt/not-a-real-icon',
    );
  });

  it('renders nothing for a malformed id with no set prefix', () => {
    const { container } = render(<DynamicIcon icon="justtext" />);
    expect(container.firstChild).toBeNull();
  });
});
