import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Progress } from './progress.js';

afterEach(cleanup);

describe('Progress', () => {
  it('reflects the supplied value on the indicator transform', () => {
    const { container } = render(<Progress aria-label="Upload" value={40} />);

    expect(screen.getByRole('progressbar', { name: 'Upload' })).toBeInTheDocument();
    expect(container.querySelector('[style*="translateX(-60%)"]')).toBeTruthy();
  });

  it('defaults to a full offset when value is omitted', () => {
    const { container } = render(<Progress aria-label="Loading" />);

    expect(container.querySelector('[style*="translateX(-100%)"]')).toBeTruthy();
  });

  it('merges a caller className', () => {
    render(<Progress aria-label="Styled" className="h-4" value={10} />);

    expect(screen.getByRole('progressbar', { name: 'Styled' })).toHaveClass('h-4');
  });
});
