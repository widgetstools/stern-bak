import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Brand } from './Brand';

describe('Brand', () => {
  it('renders the bond blotter title', () => {
    render(<Brand />);
    expect(screen.getByText('Bond Blotter')).toBeInTheDocument();
  });

  it('renders decorative logo svg', () => {
    const { container } = render(<Brand />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
