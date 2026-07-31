import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketsGridLoadingOverlay } from './LoadingOverlay.js';

describe('MarketsGridLoadingOverlay', () => {
  it('exposes status semantics and default subtitle', () => {
    render(<MarketsGridLoadingOverlay title="Positions" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-label', 'Positions. Fetching snapshot…');
    expect(screen.getByText('Positions')).toBeInTheDocument();
    expect(screen.getByText('Fetching snapshot…')).toBeInTheDocument();
  });

  it('pluralizes row count in the default subtitle', () => {
    render(<MarketsGridLoadingOverlay rowCount={2} />);
    expect(screen.getByText(/2 rows received/)).toBeInTheDocument();
  });

  it('uses a custom message when provided', () => {
    render(<MarketsGridLoadingOverlay message="Connecting to feed…" />);
    expect(screen.getByText('Connecting to feed…')).toBeInTheDocument();
  });
});
