import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DynamicIcon } from './icons';

afterEach(cleanup);

/**
 * DynamicIcon is the only glyph source in this package — every toolbar
 * button, dialog header and status chip goes through it. The two things that
 * can silently break are (a) a name that isn't in ICON_MAP quietly falling
 * back to a network fetch, and (b) sizing, which arrives as a `style` object
 * but has to reach lucide as a numeric `size` prop.
 */
describe('DynamicIcon', () => {
  it('renders a local lucide component for a mapped name', () => {
    const { container } = render(<DynamicIcon icon="lucide:database" />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // A mapped icon must never reach for the CDN — the dock renders offline.
    expect(container.querySelector('img')).toBeNull();
  });

  it('defaults to 16px when no numeric size is given', () => {
    const { container } = render(<DynamicIcon icon="lucide:check" />);

    expect(container.querySelector('svg')?.getAttribute('width')).toBe('16');
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('16');
  });

  it('takes the size from style.width', () => {
    const { container } = render(<DynamicIcon icon="lucide:check" style={{ width: 24, height: 24 }} />);

    expect(container.querySelector('svg')?.getAttribute('width')).toBe('24');
  });

  it('falls back to style.height when only a height is given', () => {
    const { container } = render(<DynamicIcon icon="lucide:check" style={{ height: 32 }} />);

    expect(container.querySelector('svg')?.getAttribute('width')).toBe('32');
  });

  it('ignores a non-numeric CSS size and uses the 16px default', () => {
    // `width: '1.5rem'` cannot be handed to lucide's numeric `size` prop.
    const { container } = render(<DynamicIcon icon="lucide:check" style={{ width: '1.5rem' }} />);

    expect(container.querySelector('svg')?.getAttribute('width')).toBe('16');
  });

  it('strips width/height/color out of the forwarded style so they cannot fight the props', () => {
    const { container } = render(
      <DynamicIcon icon="lucide:check" style={{ width: 24, height: 24, color: 'red', opacity: 0.5 }} />,
    );

    const svg = container.querySelector('svg') as SVGElement;
    // lucide gets these as props; leaving them in `style` too would let CSS
    // win over the attribute and desync the rendered box from the layout.
    expect(svg.style.width).toBe('');
    expect(svg.style.height).toBe('');
    expect(svg.style.color).toBe('');
    expect(svg.style.opacity).toBe('0.5');
    expect(svg.style.flexShrink).toBe('0');
    expect(svg.getAttribute('stroke')).toBe('red');
  });

  it('passes the className through to the rendered glyph', () => {
    const { container } = render(<DynamicIcon icon="lucide:database" className="h-4 w-4" />);

    expect(container.querySelector('svg')?.getAttribute('class')).toContain('h-4 w-4');
  });

  it('falls back to an Iconify CDN image for an unmapped prefixed name', () => {
    render(<DynamicIcon icon="mdi:rocket-launch" style={{ width: 20 }} />);

    const img = screen.getByRole('img', { name: 'mdi:rocket-launch' }) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://api.iconify.design/mdi/rocket-launch.svg?height=20');
    expect(img.getAttribute('width')).toBe('20');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('renders nothing for a name with no prefix', () => {
    const { container } = render(<DynamicIcon icon="database" />);

    expect(container.innerHTML).toBe("");
  });

  it('renders nothing for an empty prefix or empty name', () => {
    expect(render(<DynamicIcon icon=":database" />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<DynamicIcon icon="lucide:" />).container.innerHTML).toBe("");
  });

  it('maps every name the package actually asks for', () => {
    // The map is hand-maintained; a typo here renders a CDN <img> in an
    // offline OpenFin window instead of throwing, so assert it explicitly.
    const used = [
      'lucide:alert-triangle', 'lucide:check', 'lucide:circle-check', 'lucide:cloud',
      'lucide:cloud-off', 'lucide:database', 'lucide:database-backup', 'lucide:download',
      'lucide:file-json', 'lucide:inbox', 'lucide:info', 'lucide:moon',
      'lucide:octagon-alert', 'lucide:package', 'lucide:plus', 'lucide:plus-circle',
      'lucide:refresh-cw', 'lucide:rocket', 'lucide:search', 'lucide:sun',
      'lucide:trash-2', 'lucide:triangle-alert', 'lucide:upload', 'lucide:x',
    ];

    for (const icon of used) {
      const { container } = render(<DynamicIcon icon={icon} />);
      expect(container.querySelector('svg'), `${icon} is not in ICON_MAP`).not.toBeNull();
      cleanup();
    }
  });
});
