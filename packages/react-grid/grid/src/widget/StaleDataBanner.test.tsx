import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StaleDataBanner } from './StaleDataBanner';

describe('StaleDataBanner', () => {
  it('renders the message with status semantics', () => {
    render(<StaleDataBanner message="Grid data is stale — provider disconnected." />);

    const banner = screen.getByTestId('stale-data-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent('Grid data is stale — provider disconnected.');
  });
});
