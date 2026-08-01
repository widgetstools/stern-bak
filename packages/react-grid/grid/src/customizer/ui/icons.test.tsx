import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Icons } from './icons';

describe('Icons', () => {
  it('exports SVG icon components that render at default size', () => {
    const { container } = render(<Icons.Settings />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('width')).toBe('18');
    expect(svg?.getAttribute('height')).toBe('18');
  });

  it('honours custom size and className', () => {
    const { container } = render(<Icons.Filter size={24} className="icon-muted" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.classList.contains('icon-muted')).toBe(true);
  });
});
