import '../testSetupMocks';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId, getOneByText } from '../../../../test-utils/queries';
import { Markdown } from './Markdown';
import { HelpSheet } from './HelpSheet';
import { TabContainer } from './TabContainer';
import { ThemeToggle } from './ThemeToggle';
import { LabSidebarNav } from './LabSidebarNav';
import { InspectorDrawer } from './InspectorDrawer';
import { getFeatureGuide } from '../guides/featureGuides';
import { mockApplyTheme, mockGetTheme } from '../testSetupMocks';

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'overview', label: 'Overview' },
  { id: 'formatting', label: 'Formatting' },
];

describe('Markdown', () => {
  it('renders markdown content', () => {
    render(<Markdown source="# Hello **world**" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello world');
  });

  it('applies optional className', () => {
    const { container } = render(<Markdown source="text" className="extra" />);
    expect(container.firstChild).toHaveClass('lab-markdown', 'extra');
  });
});

describe('HelpSheet', () => {
  it('shows content when open', () => {
    render(
      <HelpSheet
        open
        onOpenChange={vi.fn()}
        title="Help title"
        subtitle="Help subtitle"
        source="Help body"
      />,
    );
    expect(getOneByText('Help title')).toBeInTheDocument();
    expect(getOneByText('Help subtitle')).toBeInTheDocument();
    expect(getOneByText('Help body')).toBeInTheDocument();
  });
});

describe('TabContainer', () => {
  it('renders title, children, and opens help', async () => {
    render(
      <TabContainer title="Tab" subtitle="Sub" help="# Help doc">
        <div data-testid="child">Grid</div>
      </TabContainer>,
    );

    expect(getOneByText('Tab')).toBeInTheDocument();
    expect(getOneByTestId('child')).toBeInTheDocument();

    await userEvent.click(getOneByTestId('tab-help'));
    expect(getOneByTestId('sheet-content')).toBeInTheDocument();
  });

  it('renders variant picker when configured', async () => {
    const onVariantChange = vi.fn();
    render(
      <TabContainer
        title="Variants"
        help="help"
        variants={[
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
        ]}
        activeVariant="a"
        onVariantChange={onVariantChange}
      >
        content
      </TabContainer>,
    );
    expect(getOneByText('Variants')).toBeInTheDocument();
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockApplyTheme.mockClear();
    mockGetTheme.mockReturnValue({ theme: 'dark' });
  });

  it('toggles between dark and light themes', async () => {
    render(<ThemeToggle />);
    await userEvent.click(getOneByTestId('theme-toggle'));
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'light' });

    mockGetTheme.mockReturnValue({ theme: 'light' });
    await userEvent.click(getOneByTestId('theme-toggle'));
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'dark' });
  });
});

describe('LabSidebarNav', () => {
  it('filters tabs and selects items', async () => {
    const onSelect = vi.fn();
    const onQueryChange = vi.fn();

    render(
      <LabSidebarNav
        items={NAV_ITEMS}
        activeId="home"
        onSelect={onSelect}
        query=""
        onQueryChange={onQueryChange}
      />,
    );

    expect(getOneByTestId('lab-sidebar')).toBeInTheDocument();
    await userEvent.click(getOneByTestId('lab-tab-overview'));
    expect(onSelect).toHaveBeenCalledWith('overview');

    await userEvent.type(getOneByTestId('lab-sidebar-filter'), 'form');
    expect(onQueryChange).toHaveBeenCalled();
  });

  it('hides groups with no matches when filtering', () => {
    const { container } = render(
      <LabSidebarNav
        items={NAV_ITEMS}
        activeId="home"
        onSelect={vi.fn()}
        query="zzzz-no-match"
        onQueryChange={vi.fn()}
      />,
    );
    expect(within(container).queryByTestId('lab-tab-overview')).not.toBeInTheDocument();
  });
});

describe('InspectorDrawer', () => {
  const guide = getFeatureGuide('overview')!;

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders guide tabs and toggles collapse', async () => {
    render(
      <InspectorDrawer
        guide={guide}
        configBlocks={[{ label: 'Sample', lang: 'json', code: '{ "a": 1 }' }]}
        fullDocs="# Full docs"
      />,
    );

    expect(getOneByTestId('lab-inspector')).toBeInTheDocument();
    await userEvent.click(getOneByTestId('lab-inspector-tab-try'));
    expect(getOneByTestId('tab-panel-try')).toBeInTheDocument();

    await userEvent.click(getOneByTestId('lab-inspector-tab-config'));
    expect(getOneByText('Sample')).toBeInTheDocument();

    await userEvent.click(getOneByTestId('lab-inspector-copy'));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{ "a": 1 }'));

    await userEvent.click(getOneByTestId('lab-inspector-tab-props'));
    expect(getOneByText('gridId')).toBeInTheDocument();

    await userEvent.click(getOneByTestId('lab-inspector-toggle'));
    expect(screen.queryAllByTestId('tab-panel-what')).toHaveLength(0);
  });

  it('restores open/tab state from localStorage', () => {
    localStorage.setItem('lab-inspector-open', '0');
    localStorage.setItem('lab-inspector-tab', 'props');
    render(<InspectorDrawer guide={guide} configBlocks={[]} />);
    expect(screen.queryAllByTestId('tab-panel-props')).toHaveLength(0);
  });
});
