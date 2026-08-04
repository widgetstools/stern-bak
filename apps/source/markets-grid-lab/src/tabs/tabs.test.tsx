import '../testSetupMocks';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getOneByTestId, getOneByText } from '../../../../test-utils/queries';
import { LabDemoProvider } from '../demo/LabDemoContext';
import { LabFeatureTab } from './LabFeatureTab';
import { OVERVIEW_FEATURE } from './labFeatureConfigs';
import { OverviewTab } from './OverviewTab';
import { FormattingTab } from './FormattingTab';
import { RenderersTab } from './RenderersTab';
import { FormatterToolbarTab } from './FormatterToolbarTab';
import { ColumnGroupsTab } from './ColumnGroupsTab';
import { CalculatedColumnsTab } from './CalculatedColumnsTab';
import { ConditionalStylingTab } from './ConditionalStylingTab';
import { QuickFiltersTab } from './QuickFiltersTab';
import { LiveUpdatesTab } from './LiveUpdatesTab';
import { AlertsTab } from './AlertsTab';
import { EditingTab } from './EditingTab';
import { BulkUpdateTab } from './BulkUpdateTab';
import { PlusMinusTab } from './PlusMinusTab';
import { ShortcutsTab } from './ShortcutsTab';
import { SmartEditTab } from './SmartEditTab';
import { VisualExcelTab } from './VisualExcelTab';
import { StressTestTab } from './StressTestTab';
import { ProfilesTab } from './ProfilesTab';
import { HomeTab } from './HomeTab';

const TAB_COMPONENTS = [
  ['OverviewTab', OverviewTab],
  ['FormattingTab', FormattingTab],
  ['RenderersTab', RenderersTab],
  ['FormatterToolbarTab', FormatterToolbarTab],
  ['ColumnGroupsTab', ColumnGroupsTab],
  ['CalculatedColumnsTab', CalculatedColumnsTab],
  ['ConditionalStylingTab', ConditionalStylingTab],
  ['QuickFiltersTab', QuickFiltersTab],
  ['LiveUpdatesTab', LiveUpdatesTab],
  ['AlertsTab', AlertsTab],
  ['EditingTab', EditingTab],
  ['BulkUpdateTab', BulkUpdateTab],
  ['PlusMinusTab', PlusMinusTab],
  ['ShortcutsTab', ShortcutsTab],
  ['SmartEditTab', SmartEditTab],
  ['VisualExcelTab', VisualExcelTab],
  ['StressTestTab', StressTestTab],
] as const;

function renderWithDemo(ui: React.ReactElement) {
  return render(<LabDemoProvider>{ui}</LabDemoProvider>);
}

describe('feature tabs', () => {
  it.each(TAB_COMPONENTS)('%s renders grid shell', async (_name, Tab) => {
    renderWithDemo(<Tab />);
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());
  });

  /**
   * The row-engine picker lives in the one shell every feature tab funnels
   * through, so this is the assertion that all of them got a Perspective
   * variant from a single edit — not sixteen separate wirings that could each
   * be missing.
   */
  it.each(TAB_COMPONENTS)('%s switches to the Perspective engine', async (_name, Tab) => {
    renderWithDemo(<Tab />);
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());

    // The mocked shadcn Select renders as a native `<select>`; the engine
    // picker is the first one every tab renders.
    const engineSelect = document.querySelectorAll('select')[0] as HTMLSelectElement;
    expect([...engineSelect.options].map((o) => o.value)).toEqual(['client', 'perspective']);
    fireEvent.change(engineSelect, { target: { value: 'perspective' } });

    await waitFor(() =>
      expect(getOneByTestId('markets-grid')).toHaveAttribute('data-row-model', 'perspective'),
    );
  }, 20_000);

  it('LabFeatureTab renders inspector when guide exists', async () => {
    renderWithDemo(<LabFeatureTab config={OVERVIEW_FEATURE} />);
    await waitFor(() => {
      expect(getOneByTestId('markets-grid')).toBeInTheDocument();
      expect(getOneByTestId('lab-inspector')).toBeInTheDocument();
    });
  });

  it('ProfilesTab renders gallery and opens preset grid', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithDemo(<ProfilesTab />);
    expect(getOneByText('Profiles')).toBeInTheDocument();

    const openButtons = screen.getAllByRole('button', { name: /Open lens/i });
    await user.click(openButtons[0]!);
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());

    await user.click(getOneByText('All presets'));
    expect(getOneByText('Profiles')).toBeInTheDocument();
  });

  it('HomeTab navigates feature cards', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const onNavigate = vi.fn();
    const items = [
      { id: 'home', label: 'Home' },
      { id: 'overview', label: 'Overview' },
      { id: 'formatting', label: 'Formatting' },
    ];

    render(<HomeTab items={items} onNavigate={onNavigate} />);
    expect(getOneByTestId('lab-home')).toBeInTheDocument();

    await user.click(getOneByTestId('lab-home-card-overview'));
    expect(onNavigate).toHaveBeenCalledWith('overview');
  });
});
