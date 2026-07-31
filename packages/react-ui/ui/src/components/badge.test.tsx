import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Badge } from './badge.js';

afterEach(cleanup);

const variants = [
  'default',
  'secondary',
  'destructive',
  'outline',
  'buy',
  'sell',
] as const;

describe('Badge', () => {
  it.each(variants)('renders the %s variant distinctly', (variant) => {
    render(<Badge variant={variant}>Status</Badge>);

    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('merges a caller className on top of variant styles', () => {
    render(<Badge className="ml-2">Live</Badge>);

    expect(screen.getByText('Live')).toHaveClass('ml-2');
  });
});
