import '../testSetupMocks';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { getOneByTestId, getOneByText } from '../../../../test-utils/queries';
import { LabDemoProvider } from '../demo/LabDemoContext';
import { SsrmLabProvider } from '../ssrm/SsrmLabProviderContext';
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
] as const;

function renderWithDemo(ui: React.ReactElement) {
  // `SsrmLabProvider` too: every feature tab in THIS lab renders `SsrmLabGrid`,
  // which calls `useSsrmLabProvider` and throws without it. `App` mounts both
  // providers; a tab rendered on its own gets neither, which is why these
  // cases were failing on a hard throw rather than an assertion.
  return render(
    <SsrmLabProvider>
      <LabDemoProvider>{ui}</LabDemoProvider>
    </SsrmLabProvider>,
  );
}

describe('feature tabs', () => {
  it.each(TAB_COMPONENTS)('%s renders grid shell', async (_name, Tab) => {
    renderWithDemo(<Tab />);
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());
  });

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
