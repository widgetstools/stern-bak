import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Separator } from './separator.js';

afterEach(cleanup);

describe('Separator', () => {
  it('renders a decorative separator by default', () => {
    render(<Separator data-testid="sep" />);

    expect(screen.getByTestId('sep')).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('renders a semantic separator when decorative is false', () => {
    render(<Separator decorative={false} />);

    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('renders a vertical orientation distinctly from horizontal', () => {
    const { rerender } = render(<Separator data-testid="sep" orientation="horizontal" />);
    expect(screen.getByTestId('sep')).toHaveAttribute('data-orientation', 'horizontal');

    rerender(<Separator data-testid="sep" orientation="vertical" />);
    expect(screen.getByTestId('sep')).toHaveAttribute('data-orientation', 'vertical');
  });

  it('merges a caller className', () => {
    render(<Separator className="my-4" data-testid="sep" />);

    expect(screen.getByTestId('sep')).toHaveClass('my-4');
  });
});
