import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrafficLightSection } from './TrafficLightSection';

describe('TrafficLightSection', () => {
  it('renders the end-to-end walkthrough heading and key steps', () => {
    render(<TrafficLightSection />);
    expect(
      screen.getByRole('heading', { level: 1, name: '4. Traffic Light — End-to-End' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Step 1 — Add a calculated column' })).toBeInTheDocument();
    expect(screen.getByText(/IFS\(\[price\] >= 105, 1, \[price\] >= 95, 2, 3\)/)).toBeInTheDocument();
  });
});
