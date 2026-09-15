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
const seeded = { id: 'markets-grid-lab-ssrm:positions' as string | null };
vi.mock('./ssrm/labSsrmProvider', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSeedLabSsrmProvider: () => seeded.id,
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

  it('opens the profiles tab against the seeded provider', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('lab-tab-profiles'));
    expect(screen.getByTestId('ssrm-profiles')).toHaveAttribute(
      'data-provider',
      'markets-grid-lab-ssrm:positions',
    );
  });

  /**
   * Every tab needs the provider row in the catalog before it can attach.
   * Rendering a grid against a providerId that is not there yet reads as an
   * empty book rather than as "still starting".
   */
  it('holds each grid tab behind a seeding note until the provider row exists', () => {
    seeded.id = null;
    try {
      render(<App />);
      fireEvent.click(screen.getByTestId('parity-row-overview'));
      expect(screen.queryByTestId('ssrm-feature-overview')).toBeNull();
      expect(screen.getByText('Seeding the mock-ssrm provider…')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('lab-tab-profiles'));
      expect(screen.queryByTestId('ssrm-profiles')).toBeNull();
      expect(screen.getByText('Seeding the mock-ssrm provider…')).toBeInTheDocument();
    } finally {
      seeded.id = 'markets-grid-lab-ssrm:positions';
    }
  });

  it('shows the active tab\'s hint beside the title', () => {
    render(<App />);
    expect(screen.getByText(/Feature-by-feature SSRM verdicts/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('lab-tab-profiles'));
    expect(screen.getByText(/Pre-baked configurations/)).toBeInTheDocument();
  });

  it('mounts only the active tab, so 17 grids never exist at once', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('parity-row-overview'));
    expect(screen.getAllByTestId(/^ssrm-feature-/)).toHaveLength(1);
  });
});
