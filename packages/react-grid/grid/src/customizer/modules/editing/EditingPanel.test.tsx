/**
 * The merged Editing panel is a section strip over four pre-merge panels. Its
 * own job is the switch and the two legacy testid anchors the master-detail
 * panes still look for — the section bodies are covered by their own suites.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditingPanel } from './EditingPanel';

// Inline stubs: `vi.mock` is hoisted above every top-level binding, so a
// shared factory declared here would not exist yet when these run.
vi.mock('../smart-edit/SmartEditPanel.js', () => ({
  SmartEditPanel: () => <div data-testid="stub-smart-edit" />,
}));
vi.mock('../bulk-update/BulkUpdatePanel', () => ({
  BulkUpdatePanel: () => <div data-testid="stub-bulk-update" />,
}));
vi.mock('../plus-minus/PlusMinusPanel.js', () => ({
  PlusMinusPanel: () => <div data-testid="stub-plus-minus" />,
}));
vi.mock('../shortcuts/ShortcutsPanel.js', () => ({
  ShortcutsPanel: () => <div data-testid="stub-shortcuts" />,
}));

const SECTIONS = ['smart-edit', 'bulk-update', 'plus-minus', 'shortcuts'];

describe('EditingPanel', () => {
  it('offers one tab per merged module', () => {
    render(<EditingPanel />);

    expect(screen.getByRole('tablist', { name: 'Editing sections' })).toBeInTheDocument();
    for (const id of SECTIONS) {
      expect(screen.getByTestId(`editing-section-tab-${id}`)).toBeInTheDocument();
    }
  });

  it('opens on Smart Edit', () => {
    render(<EditingPanel />);

    expect(screen.getByTestId('stub-smart-edit')).toBeInTheDocument();
    expect(screen.getByTestId('editing-section-tab-smart-edit')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it.each(SECTIONS)('switches to %s and shows only that section', async (id) => {
    const user = userEvent.setup();
    render(<EditingPanel />);

    await user.click(screen.getByTestId(`editing-section-tab-${id}`));

    expect(screen.getByTestId(`stub-${id}`)).toBeInTheDocument();
    for (const other of SECTIONS.filter((s) => s !== id)) {
      expect(screen.queryByTestId(`stub-${other}`)).not.toBeInTheDocument();
    }
  });

  it.each(SECTIONS)('marks %s selected once it is open', async (id) => {
    const user = userEvent.setup();
    render(<EditingPanel />);
    await user.click(screen.getByTestId(`editing-section-tab-${id}`));

    for (const each of SECTIONS) {
      expect(screen.getByTestId(`editing-section-tab-${each}`)).toHaveAttribute(
        'aria-selected',
        String(each === id),
      );
    }
  });

  it.each([
    ['plus-minus', 'plus-minus-panel'],
    ['shortcuts', 'shortcuts-panel'],
  ])('keeps the pre-merge %s wrapper anchor', async (id, anchor) => {
    // The master-detail panes still find these panels by their pre-merge
    // testids; dropping the anchor would break them silently.
    const user = userEvent.setup();
    render(<EditingPanel />);
    await user.click(screen.getByTestId(`editing-section-tab-${id}`));

    expect(screen.getByTestId(anchor)).toBeInTheDocument();
  });

  it.each(['smart-edit', 'bulk-update'])('gives %s no wrapper anchor', async (id) => {
    const user = userEvent.setup();
    render(<EditingPanel />);
    await user.click(screen.getByTestId(`editing-section-tab-${id}`));

    expect(screen.queryByTestId('plus-minus-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shortcuts-panel')).not.toBeInTheDocument();
  });
});
