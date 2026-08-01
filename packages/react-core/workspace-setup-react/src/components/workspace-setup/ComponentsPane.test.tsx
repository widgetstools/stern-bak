import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { ComponentsPane } from './ComponentsPane.js';
import type { EditorSelection } from './types.js';

/**
 * Pane ① is the component catalog: search, four filter chips, and per-row
 * actions. The delete action is behind a `confirm()`, so both answers are
 * exercised — a delete that fires on Cancel is the kind of thing this suite
 * exists to catch.
 */

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'grid-credit',
    hostUrl: '/blotters/marketsgrid',
    iconId: '',
    componentType: 'GRID',
    componentSubType: 'CREDIT',
    configId: 'grid-credit',
    displayName: 'Credit blotter',
    createdAt: '2026-01-01T00:00:00.000Z',
    type: 'internal',
    usesHostConfig: true,
    appId: 'star-demo',
    configServiceUrl: 'https://cfg.example',
    singleton: false,
    ...overrides,
  } as RegistryEntry;
}

const entries = [
  entry(),
  entry({ id: 'grid-rates', componentSubType: 'RATES', displayName: 'Rates blotter', singleton: true }),
  entry({ id: 'chart-fx', componentType: 'CHART', componentSubType: 'FX', displayName: 'FX chart', type: 'external' }),
];

function renderPane(overrides: Partial<React.ComponentProps<typeof ComponentsPane>> = {}) {
  const props = {
    entries,
    inDockEntryIds: new Set(['grid-credit']),
    selection: { kind: 'none' } as EditorSelection,
    onSelect: vi.fn(),
    onAddDraft: vi.fn(),
    onClone: vi.fn(),
    onDelete: vi.fn(),
    onTest: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ComponentsPane {...props} />) };
}

/** The clickable row button for a component, by its display name. */
const row = (name: string) => screen.getByText(name).closest('button')!;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ComponentsPane', () => {
  it('lists every component with its type pair and dock status', () => {
    renderPane();

    expect(screen.getByText('Credit blotter')).toBeDefined();
    expect(screen.getByText('Rates blotter')).toBeDefined();
    expect(within(row('Credit blotter')).getByText('✓ in dock')).toBeDefined();
    expect(within(row('Rates blotter')).getByText('⚠ not in dock')).toBeDefined();
    expect(within(row('Credit blotter')).getByText('GRID / CREDIT')).toBeDefined();
  });

  it('labels an entry with no display name rather than rendering a blank row', () => {
    renderPane({ entries: [entry({ displayName: '' })] });

    expect(screen.getByText('(unnamed)')).toBeDefined();
  });

  it('renders em dashes for a draft with no type pair yet', () => {
    renderPane({ entries: [entry({ componentType: '', componentSubType: '' })] });

    expect(screen.getByText('— / —')).toBeDefined();
  });

  it('shows the counts on each filter chip', () => {
    renderPane();

    expect(screen.getByRole('button', { name: 'All (3)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'In dock (1)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Not in dock (2)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Singleton (1)' })).toBeDefined();
  });

  it.each([
    ['In dock (1)', ['Credit blotter']],
    ['Not in dock (2)', ['Rates blotter', 'FX chart']],
    ['Singleton (1)', ['Rates blotter']],
  ])('the %s chip narrows the list', async (chip, expected) => {
    renderPane();

    await userEvent.click(screen.getByRole('button', { name: chip }));

    for (const name of expected) expect(screen.getByText(name)).toBeDefined();
    for (const name of ['Credit blotter', 'Rates blotter', 'FX chart']) {
      if (!expected.includes(name)) expect(screen.queryByText(name)).toBeNull();
    }
  });

  it('searches across display name, type and subtype', async () => {
    renderPane();
    const search = screen.getByPlaceholderText('Search components');

    await userEvent.type(search, 'rates');
    expect(screen.getByText('Rates blotter')).toBeDefined();
    expect(screen.queryByText('Credit blotter')).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, 'chart');
    expect(screen.getByText('FX chart')).toBeDefined();
  });

  it('distinguishes "no components at all" from "nothing matches the filter"', async () => {
    const { unmount } = renderPane({ entries: [] });
    expect(screen.getByText('No components yet. Click "+ New" to define your first one.')).toBeDefined();
    unmount();

    renderPane();
    await userEvent.type(screen.getByPlaceholderText('Search components'), 'zzz');
    expect(screen.getByText('No components match the current filter.')).toBeDefined();
  });

  it('clicking a row selects that component', async () => {
    const { props } = renderPane();

    await userEvent.click(row('Rates blotter'));

    expect(props.onSelect).toHaveBeenCalledWith({ kind: 'component', entryId: 'grid-rates' });
  });

  it('+ New asks the parent for a draft', async () => {
    const { props } = renderPane();

    await userEvent.click(screen.getByRole('button', { name: 'New' }));

    expect(props.onAddDraft).toHaveBeenCalledTimes(1);
  });

  it('the configure action launches that entry without changing the selection', async () => {
    const { props } = renderPane();

    await userEvent.click(within(row('Credit blotter')).getByRole('button', { name: 'Configure component' }));

    expect(props.onTest).toHaveBeenCalledWith(entries[0]);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('the clone action clones by id without changing the selection', async () => {
    const { props } = renderPane();

    await userEvent.click(within(row('Credit blotter')).getByRole('button', { name: 'Clone component' }));

    expect(props.onClone).toHaveBeenCalledWith('grid-credit');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('delete only fires once the user confirms', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { props } = renderPane();

    await userEvent.click(within(row('Credit blotter')).getByRole('button', { name: 'Delete' }));
    // Cancelling must leave the catalog untouched.
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledWith('Delete "Credit blotter"?');

    confirmSpy.mockReturnValue(true);
    await userEvent.click(within(row('Credit blotter')).getByRole('button', { name: 'Delete' }));
    expect(props.onDelete).toHaveBeenCalledWith('grid-credit');
  });

  it('marks singleton and external entries so the badge is visible at a glance', () => {
    renderPane();

    expect(within(row('Rates blotter')).getByTitle('Singleton')).toBeDefined();
    expect(within(row('FX chart')).getByTitle('External component')).toBeDefined();
  });

  it('renders the entry icon when one is set, and a placeholder when not', () => {
    const { unmount } = renderPane({ entries: [entry({ iconId: 'mkt:bond' })] });
    expect(screen.getByRole('presentation')).toBeDefined();
    unmount();

    renderPane({ entries: [entry({ iconId: '' })] });
    expect(screen.queryByRole('presentation')).toBeNull();
  });
});
