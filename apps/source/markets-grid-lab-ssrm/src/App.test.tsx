import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The feature shell and profiles tab mount MarketsGrid + the SSRM provider —
// stubbed here; their own behaviour is covered by their modules' tests.
vi.mock('./SsrmLabFeatureTab', () => ({
  SsrmLabFeatureTab: ({ config, providerId }: { config: { tabId: string }; providerId: string }) => (
    <div data-testid={`ssrm-feature-${config.tabId}`} data-provider={providerId} />
  ),
}));
vi.mock('./tabs/SsrmProfilesTab', () => ({
  SsrmProfilesTab: ({ providerId }: { providerId: string }) => (
    <div data-testid="ssrm-profiles" data-provider={providerId} />
  ),
}));
vi.mock('./ssrm/labSsrmProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSeedLabSsrmProvider: () => 'markets-grid-lab-ssrm:positions',
}));

import { App } from './App';

describe('App', () => {
  it('lands on the parity matrix and navigates to a feature tab', () => {
    render(<App />);
    expect(screen.getByText('MarketsGrid SSRM Parity Lab')).toBeInTheDocument();
    expect(screen.getByTestId('parity-row-overview')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('parity-row-overview'));
    expect(screen.getByTestId('ssrm-feature-overview')).toHaveAttribute(
      'data-provider',
      'markets-grid-lab-ssrm:positions',
    );
  });

  it('renders the SSRM demo rail', () => {
    render(<App />);
    expect(screen.getByTestId('ssrm-demo-rail')).toBeInTheDocument();
  });
});
