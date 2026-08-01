import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton.js';

afterEach(cleanup);

describe('Skeleton', () => {
  it('renders a placeholder surface', () => {
    render(<Skeleton aria-label="Loading row" />);

    expect(screen.getByLabelText('Loading row')).toBeInTheDocument();
  });

  it('merges a caller className', () => {
    render(<Skeleton aria-label="Loading" className="h-8 w-24" />);

    expect(screen.getByLabelText('Loading')).toHaveClass('h-8', 'w-24');
  });
});
