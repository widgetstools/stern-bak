import '../testSetupMocks';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId, getOneByText } from '../../../../test-utils/queries';
import { HelpSheet } from './HelpSheet';

describe('HelpSheet', () => {
  it('does not render content when closed', () => {
    render(<HelpSheet open={false} onOpenChange={vi.fn()} />);
    const openPanels = screen
      .queryAllByText('Composition demo')
      .filter((el) => el.closest('[data-state="open"]') !== null);
    expect(openPanels).toHaveLength(0);
  });

  it('renders help content when open', () => {
    render(<HelpSheet open onOpenChange={vi.fn()} />);

    expect(getOneByTestId('sheet')).toBeInTheDocument();
    expect(screen.getAllByText('DataProvider Editor + ConfigBrowser').length).toBeGreaterThan(0);
    expect(getOneByText('Composition demo')).toBeInTheDocument();
    expect(getOneByText('Quick start')).toBeInTheDocument();
    expect(getOneByText('Editor')).toBeInTheDocument();
    expect(getOneByText('Hosted grid')).toBeInTheDocument();
    expect(getOneByText('vs manual')).toBeInTheDocument();
  });

  it('shows quick start documentation sections', () => {
    render(<HelpSheet open onOpenChange={vi.fn()} />);

    expect(getOneByText('What this demo shows')).toBeInTheDocument();
    expect(getOneByText('The workspace at a glance')).toBeInTheDocument();
    expect(getOneByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(getOneByText('Toggle this help drawer')).toBeInTheDocument();
  });

  it('renders all tab panes and documentation blocks', () => {
    render(<HelpSheet open onOpenChange={vi.fn()} />);

    expect(getOneByTestId('tab-quickstart')).toBeInTheDocument();
    expect(getOneByTestId('tab-editor')).toBeInTheDocument();
    expect(getOneByTestId('tab-grid')).toBeInTheDocument();
    expect(getOneByTestId('tab-compared')).toBeInTheDocument();
    expect(screen.getAllByText('The component').length).toBeGreaterThan(0);
    expect(getOneByText('Side-by-side')).toBeInTheDocument();
  });

  it('links to the GitHub repository', () => {
    render(<HelpSheet open onOpenChange={vi.fn()} />);

    const link = getOneByText('View on GitHub').closest('a');
    expect(link).toHaveAttribute('href', 'https://github.com/nndrao/starui');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('calls onOpenChange when the sheet requests a change', async () => {
    const onOpenChange = vi.fn();
    render(<HelpSheet open onOpenChange={onOpenChange} />);

    await userEvent.click(getOneByTestId('sheet'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
