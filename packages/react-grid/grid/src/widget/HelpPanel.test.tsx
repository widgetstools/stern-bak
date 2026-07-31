/**
 * HelpPanel — basic structural tests post content-split refactor.
 *
 * Locks down: rail lists every section, overview is the default body,
 * clicking a rail entry swaps the body, the Overview's in-body
 * "Jump to a section" buttons navigate to the matching section.
 */

import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HelpPanel } from './HelpPanel';
import { SECTIONS } from './help/sections';

afterEach(() => cleanup());

describe('HelpPanel', () => {
  it('renders a rail button for every section', () => {
    render(<HelpPanel />);
    for (const section of SECTIONS) {
      const railButton = screen.getByTestId(`help-nav-${section.id}`);
      expect(railButton).toBeTruthy();
      expect(railButton.textContent).toContain(section.title);
    }
  });

  it('renders the overview heading by default', () => {
    render(<HelpPanel />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Formats & Expressions Cookbook/ }),
    ).toBeTruthy();
  });

  it('switches the displayed body when a rail entry is clicked', () => {
    render(<HelpPanel />);
    fireEvent.click(screen.getByTestId('help-nav-excel'));
    expect(screen.getByRole('heading', { level: 1, name: '1. Excel Format Strings' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('help-nav-trading'));
    expect(screen.getByRole('heading', { level: 1, name: '2. Trading-Specific Formats' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('help-nav-emojis'));
    expect(screen.getByRole('heading', { level: 1, name: '5. Emoji Gallery' })).toBeTruthy();
  });

  it("navigates from Overview's in-body jump button to the target section", () => {
    render(<HelpPanel />);
    // Overview renders one in-body button per non-overview section.
    // The Expressions title appears in the rail and once in the body
    // jump-list, so target the in-body button via its content node and
    // assert the body H1 appears after click.
    const jumpButtons = screen.getAllByText('3. Expression Syntax');
    // First match is rail button (data-testid="help-nav-expressions"),
    // second is the Overview body button.
    const overviewJump = jumpButtons.find(
      (el) => !el.getAttribute('data-testid'),
    );
    expect(overviewJump).toBeTruthy();
    fireEvent.click(overviewJump!);
    expect(screen.getByRole('heading', { level: 1, name: '3. Expression Syntax' })).toBeTruthy();
  });
});
