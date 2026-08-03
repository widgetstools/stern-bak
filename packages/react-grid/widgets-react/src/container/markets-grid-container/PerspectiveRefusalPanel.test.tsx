import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerspectiveRefusalPanel } from './PerspectiveRefusalPanel.js';

const REASON =
  "Provider 'dp-1' has a composite keyColumn [book, id], which cannot index a Perspective Table.";

describe('PerspectiveRefusalPanel', () => {
  // The worker's wording is the whole value of this panel — most refusals are
  // permanent for the current config, and a paraphrase would cost the user the
  // one sentence that says what to change.
  it('renders the worker’s reason verbatim, as an alert', () => {
    render(<PerspectiveRefusalPanel providerName="Positions" reason={REASON} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(REASON);
    expect(alert).toHaveTextContent('Positions has no Perspective Table');
  });

  it('falls back to a name-free heading before the catalog row resolves', () => {
    render(<PerspectiveRefusalPanel providerName={null} reason={REASON} />);

    expect(screen.getByRole('heading')).toHaveTextContent(
      'No Perspective Table for this provider',
    );
  });
});
