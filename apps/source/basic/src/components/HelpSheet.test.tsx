import '../staruiVitestMocks';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getOneByText } from '../../../../test-utils/queries';
import { HelpSheet } from './HelpSheet';

describe('HelpSheet', () => {
  it('renders help content when open', () => {
    render(<HelpSheet open={true} onOpenChange={vi.fn()} />);
    expect(getOneByText('Help & documentation')).toBeInTheDocument();
    expect(getOneByText('Bond blotter')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Quick start' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Formatter' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Customizer' })[0]).toBeInTheDocument();
  });

  it('shows quick start documentation sections', () => {
    render(<HelpSheet open={true} onOpenChange={vi.fn()} />);
    expect(getOneByText('What this demo shows')).toBeInTheDocument();
    expect(getOneByText('The three surfaces')).toBeInTheDocument();
    expect(screen.getAllByText('Formatter toolbar').length).toBeGreaterThan(0);
    expect(getOneByText('Grid customizer')).toBeInTheDocument();
    expect(getOneByText('Try it')).toBeInTheDocument();
    expect(getOneByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(getOneByText('Toggle help panel')).toBeInTheDocument();
  });

  it('includes formatter documentation topics', () => {
    render(<HelpSheet open={true} onOpenChange={vi.fn()} />);
    expect(getOneByText('Opening the toolbar')).toBeInTheDocument();
    expect(getOneByText('Typography')).toBeInTheDocument();
    expect(getOneByText('Number formatting')).toBeInTheDocument();
    expect(getOneByText('Currency')).toBeInTheDocument();
    expect(getOneByText('Templates & reset')).toBeInTheDocument();
  });

  it('includes customizer documentation topics', () => {
    render(<HelpSheet open={true} onOpenChange={vi.fn()} />);
    expect(getOneByText('Opening the customizer')).toBeInTheDocument();
    expect(screen.getAllByText('General settings').length).toBeGreaterThan(0);
    expect(getOneByText('Calculated columns')).toBeInTheDocument();
    expect(screen.getAllByText('Conditional styling').length).toBeGreaterThan(0);
    expect(getOneByText('How layouts work')).toBeInTheDocument();
    expect(getOneByText('Persistence')).toBeInTheDocument();
    expect(getOneByText('markets-grid-bundle:bond-blotter-v1')).toBeInTheDocument();
  });

  it('renders the footer keyboard hint', () => {
    render(<HelpSheet open={true} onOpenChange={vi.fn()} />);
    expect(getOneByText('Ctrl + /')).toBeInTheDocument();
  });

  it('hides content when closed', () => {
    render(<HelpSheet open={false} onOpenChange={vi.fn()} />);
    const openPanels = screen
      .queryAllByText('Bond blotter')
      .filter((el) => el.closest('[data-state="open"]') !== null);
    expect(openPanels).toHaveLength(0);
  });
});
