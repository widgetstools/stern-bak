import '../testSetupMocks';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Brand } from './Brand';

describe('Brand', () => {
  it('renders the app title and subtitle', () => {
    render(<Brand />);

    expect(screen.getByText('DataProvider Editor + ConfigBrowser')).toBeInTheDocument();
    expect(screen.getByText('StarUI · composition demo')).toBeInTheDocument();
  });

  it('renders the decorative logo icon', () => {
    const { container } = render(<Brand />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
