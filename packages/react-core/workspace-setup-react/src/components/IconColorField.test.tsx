import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MARKET_ICON_SVGS } from '@wellsfargo-starui/design-system/icons/all-icons';
import { IconColorField, ICON_COLOR_SWATCHES } from './IconColorField.js';
import { IconGlyph, isRecolorableIcon } from './IconGlyph.js';

afterEach(cleanup);

/**
 * Monochrome icons are drawn with `currentColor`, so they inherit the
 * surrounding text colour and follow the theme. The curated trading glyphs ship
 * hardcoded hex on purpose, and `svgToDataUrl`'s currentColor substitution is a
 * no-op for them — so offering to recolour one would be a control that does
 * nothing.
 */
describe('isRecolorableIcon', () => {
  it('accepts lucide icons, which are always currentColor', () => {
    expect(isRecolorableIcon('lucide:home')).toBe(true);
  });

  it('accepts a monochrome market icon', () => {
    // Guard the premise: if this icon ever gains a fixed palette the test
    // should be re-pointed rather than silently passing for the wrong reason.
    expect(MARKET_ICON_SVGS.bond).toContain('currentColor');
    expect(isRecolorableIcon('mkt:bond')).toBe(true);
  });

  it('rejects a fixed-palette market icon', () => {
    expect(MARKET_ICON_SVGS.buy).not.toContain('currentColor');
    expect(isRecolorableIcon('mkt:buy')).toBe(false);
  });

  it('rejects nothing selected', () => {
    expect(isRecolorableIcon(undefined)).toBe(false);
    expect(isRecolorableIcon('')).toBe(false);
  });
});

/**
 * Theme compatibility rests on one property: a monochrome icon must NOT bake a
 * colour, so it inherits the themed `color` of whatever contains it. Icons used
 * to render as `<img>` from a CDN URL with a colour already baked in, which is
 * exactly why they did not follow the theme.
 */
describe('IconGlyph colour', () => {
  it('bakes no colour by default, so it follows the surrounding theme', () => {
    const { container } = render(<IconGlyph iconId="mkt:bond" />);
    const glyph = container.querySelector('[data-icon-id="mkt:bond"]') as HTMLElement;

    expect(glyph.style.color).toBe('');
    expect(glyph.innerHTML).toContain('currentColor');
  });

  it('never renders a network image', () => {
    const { container } = render(<IconGlyph iconId="lucide:home" />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('applies an explicit colour when one is set', () => {
    const { container } = render(<IconGlyph iconId="mkt:bond" color="#ff4d7d" />);
    const glyph = container.querySelector('[data-icon-id="mkt:bond"]') as HTMLElement;

    expect(glyph.style.color).toBe('rgb(255, 77, 125)');
  });
});

describe('IconColorField', () => {
  /** The colour is baked into an SVG data URL, and a data URL is its own
   *  document — a `var(--x)` would resolve to nothing there. */
  it('offers only concrete colours, never CSS variables', () => {
    for (const swatch of ICON_COLOR_SWATCHES) {
      expect(swatch.value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('clears the override when "Follow theme" is chosen', async () => {
    const onChange = vi.fn();
    render(<IconColorField iconId="mkt:bond" iconColor="#ff4d7d" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /Icon colour/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Follow theme' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('emits the chosen swatch', async () => {
    const onChange = vi.fn();
    render(<IconColorField iconId="mkt:bond" iconColor="" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /Icon colour/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Green' }));

    expect(onChange).toHaveBeenCalledWith('#1ed8a0');
  });

  /** A control that silently does nothing is worse than no control. */
  it('is disabled for an icon it could not recolour, and says why', () => {
    render(<IconColorField iconId="mkt:buy" iconColor="" onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: /fixed palette/ });
    expect(trigger.hasAttribute('disabled')).toBe(true);
  });

  it('shows the fixed colour as a swatch, and the icon itself when following the theme', () => {
    const { container, unmount } = render(
      <IconColorField iconId="mkt:bond" iconColor="#5b8cff" onChange={vi.fn()} />,
    );
    // A solid swatch stands in for the colour; the glyph is not drawn.
    expect(container.querySelector('[data-icon-id]')).toBeNull();
    unmount();

    const following = render(<IconColorField iconId="mkt:bond" iconColor="" onChange={vi.fn()} />);
    expect(following.container.querySelector('[data-icon-id="mkt:bond"]')).not.toBeNull();
  });
});
