import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubLabel } from './SubLabel.js';

describe('SubLabel', () => {
  it('renders children', () => {
    render(<SubLabel>Column width</SubLabel>);
    expect(screen.getByText('Column width')).toBeTruthy();
  });

  it('renders optional action slot', () => {
    render(
      <SubLabel action={<span>Recommended</span>}>Format</SubLabel>,
    );
    expect(screen.getByText('Recommended')).toBeTruthy();
  });

  it('omits action span when action is undefined', () => {
    const { container } = render(<SubLabel>No action</SubLabel>);
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });
});
