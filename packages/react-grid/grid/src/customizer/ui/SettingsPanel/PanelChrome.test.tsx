import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelChrome } from './PanelChrome';

describe('PanelChrome', () => {
  it('renders nothing when breadcrumb and actions are absent', () => {
    const { container } = render(<PanelChrome />);
    expect(container.firstChild).toBeNull();
  });

  it('renders breadcrumb and actions strip when provided', () => {
    render(
      <PanelChrome
        breadcrumb={<span>Columns</span>}
        actions={<button type="button">Act</button>}
        data-testid="chrome"
      />,
    );
    expect(screen.getByTestId('chrome')).toBeTruthy();
    expect(screen.getByText('Columns')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Act' })).toBeTruthy();
  });
});
