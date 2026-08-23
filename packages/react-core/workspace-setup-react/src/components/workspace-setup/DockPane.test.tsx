import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  DockButtonConfig,
  DockEditorConfig,
  RegistryEntry,
} from '@wellsfargo-starui/openfin/config';
import { ACTION_LAUNCH_COMPONENT } from '@wellsfargo-starui/openfin/config';
import { DockPane } from './DockPane.js';
import type { EditorSelection } from './types.js';

/**
 * Pane ② renders the dock as a tree and owns the authoring affordances:
 * reorder, remove, create a dropdown, add a component into one. The
 * "component deleted" state matters most — a dock button pointing at a
 * removed registry entry must read as broken rather than as a normal button.
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
    asWindow: false,
    ...overrides,
  } as RegistryEntry;
}

const entries = [entry(), entry({ id: 'chart-fx', displayName: 'FX chart', componentType: 'CHART', componentSubType: 'FX' })];

const launchButton = (id: string, tooltip: string, registryEntryId: string) => ({
  type: 'ActionButton',
  id,
  tooltip,
  iconUrl: '',
  iconId: '',
  iconColor: '',
  actionId: ACTION_LAUNCH_COMPONENT,
  customData: { registryEntryId, asWindow: false },
}) as unknown as DockButtonConfig;

const dropdownButton = (id: string, tooltip: string, options: unknown[]) => ({
  type: 'DropdownButton',
  id,
  tooltip,
  iconUrl: '',
  iconId: '',
  iconColor: '',
  options,
}) as unknown as DockButtonConfig;

const menuItem = (id: string, tooltip: string, extra: Record<string, unknown> = {}) => ({
  id, tooltip, ...extra,
});

function dock(buttons: DockButtonConfig[]): DockEditorConfig {
  return { version: 1, buttons, updatedAt: '' } as DockEditorConfig;
}

function renderPane(overrides: Partial<React.ComponentProps<typeof DockPane>> = {}) {
  const props = {
    dock: dock([launchButton('btn-1', 'Credit blotter', 'grid-credit')]),
    entries,
    selection: { kind: 'none' } as EditorSelection,
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    onCreateDropdown: vi.fn(),
    onAddComponentToDropdown: vi.fn(),
    onRemoveMenuItem: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<DockPane {...props} />) };
}

/** The row wrapper for a dock entry, located by its label. */
const rowFor = (label: string) => screen.getByText(label).closest('div.group')!;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DockPane', () => {
  it('prompts the user when the dock is empty', () => {
    renderPane({ dock: dock([]) });

    expect(screen.getByText(/Your dock has no buttons yet/)).toBeDefined();
  });

  it('handles a null dock the same as an empty one', () => {
    renderPane({ dock: null });

    expect(screen.getByText(/Your dock has no buttons yet/)).toBeDefined();
  });

  it('+ New menu asks the parent to append a dropdown', async () => {
    const { props } = renderPane();

    await userEvent.click(screen.getByRole('button', { name: /New menu/ }));

    expect(props.onCreateDropdown).toHaveBeenCalledTimes(1);
  });

  it('clicking a button selects it as the inspector subject', async () => {
    const { props } = renderPane();

    await userEvent.click(screen.getByText('Credit blotter'));

    expect(props.onSelect).toHaveBeenCalledWith({ kind: 'dock-item', itemId: 'btn-1' });
  });

  it('flags a button whose component was deleted', () => {
    renderPane({ dock: dock([launchButton('btn-1', 'Ghost', 'deleted-entry')]) });

    // Without this the dock silently fails on click at runtime.
    expect(screen.getByText('⚠ Component deleted')).toBeDefined();
  });

  it('does not flag a button that launches no component at all', () => {
    const plain = { type: 'ActionButton', id: 'btn-x', tooltip: 'Toggle theme', iconUrl: '', iconId: '', iconColor: '' };
    renderPane({ dock: dock([plain as unknown as DockButtonConfig]) });

    expect(screen.queryByText('⚠ Component deleted')).toBeNull();
  });

  it('remove asks for confirmation first', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { props } = renderPane();

    await userEvent.click(within(rowFor('Credit blotter')).getByRole('button', { name: 'Remove from dock' }));
    expect(props.onRemove).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledWith('Remove "Credit blotter" from your dock?');

    confirmSpy.mockReturnValue(true);
    await userEvent.click(within(rowFor('Credit blotter')).getByRole('button', { name: 'Remove from dock' }));
    expect(props.onRemove).toHaveBeenCalledWith('btn-1');
  });

  it('disables the reorder arrows at the ends of the list', () => {
    renderPane({
      dock: dock([
        launchButton('btn-1', 'First', 'grid-credit'),
        launchButton('btn-2', 'Second', 'grid-credit'),
        launchButton('btn-3', 'Third', 'grid-credit'),
      ]),
    });

    expect(within(rowFor('First')).getByRole('button', { name: 'Move up' })).toHaveProperty('disabled', true);
    expect(within(rowFor('First')).getByRole('button', { name: 'Move down' })).toHaveProperty('disabled', false);
    expect(within(rowFor('Third')).getByRole('button', { name: 'Move down' })).toHaveProperty('disabled', true);
  });

  it('reorders by adjacent index', async () => {
    const { props } = renderPane({
      dock: dock([
        launchButton('btn-1', 'First', 'grid-credit'),
        launchButton('btn-2', 'Second', 'grid-credit'),
      ]),
    });

    await userEvent.click(within(rowFor('Second')).getByRole('button', { name: 'Move up' }));
    expect(props.onReorder).toHaveBeenCalledWith(1, 0);

    await userEvent.click(within(rowFor('First')).getByRole('button', { name: 'Move down' }));
    expect(props.onReorder).toHaveBeenCalledWith(0, 1);
  });
});

describe('DockPane — dropdowns', () => {
  it('tells the user an empty menu needs filling', () => {
    renderPane({ dock: dock([dropdownButton('dd-1', 'Reports', [])]) });

    expect(screen.getByText(/Empty menu/)).toBeDefined();
  });

  it('renders nested menu items, and selects one on click', async () => {
    const { props } = renderPane({
      dock: dock([
        dropdownButton('dd-1', 'Reports', [
          menuItem('mi-1', 'Risk', {
            options: [menuItem('mi-1-1', 'Risk EOD', { actionId: ACTION_LAUNCH_COMPONENT, customData: { registryEntryId: 'grid-credit' } })],
          }),
        ]),
      ]),
    });

    expect(screen.getByText('Risk')).toBeDefined();
    expect(screen.getByText('Risk EOD')).toBeDefined();

    await userEvent.click(screen.getByText('Risk EOD'));
    expect(props.onSelect).toHaveBeenCalledWith({ kind: 'dock-item', itemId: 'mi-1-1' });
  });

  it('flags a nested item whose component was deleted', () => {
    renderPane({
      dock: dock([
        dropdownButton('dd-1', 'Reports', [
          menuItem('mi-1', 'Ghost', { actionId: ACTION_LAUNCH_COMPONENT, customData: { registryEntryId: 'gone' } }),
        ]),
      ]),
    });

    expect(screen.getByText('⚠ Component deleted')).toBeDefined();
  });

  it('removing a nested item passes the owning dropdown and the parent chain', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { props } = renderPane({
      dock: dock([
        dropdownButton('dd-1', 'Reports', [
          menuItem('mi-1', 'Risk', { options: [menuItem('mi-1-1', 'Risk EOD')] }),
        ]),
      ]),
    });

    await userEvent.click(within(rowFor('Risk EOD')).getByRole('button', { name: 'Remove from menu' }));

    // parentItemId is what scopes the removal to the right sub-menu.
    expect(props.onRemoveMenuItem).toHaveBeenCalledWith('dd-1', 'mi-1-1', 'mi-1');
    expect(confirmSpy).toHaveBeenCalledWith('Remove "Risk EOD" from this menu?');
  });

  it('removing a root-level menu item passes no parent', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { props } = renderPane({
      dock: dock([dropdownButton('dd-1', 'Reports', [menuItem('mi-1', 'Risk')])]),
    });

    await userEvent.click(within(rowFor('Risk')).getByRole('button', { name: 'Remove from menu' }));

    expect(props.onRemoveMenuItem).toHaveBeenCalledWith('dd-1', 'mi-1', undefined);
  });

  it('cancelling the confirm leaves the menu item in place', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { props } = renderPane({
      dock: dock([dropdownButton('dd-1', 'Reports', [menuItem('mi-1', 'Risk')])]),
    });

    await userEvent.click(within(rowFor('Risk')).getByRole('button', { name: 'Remove from menu' }));

    expect(props.onRemoveMenuItem).not.toHaveBeenCalled();
  });
});

describe('DockPane — add-component popover', () => {
  const withDropdown = { dock: dock([dropdownButton('dd-1', 'Reports', [])]) };

  it('lists every registered component and adds the picked one', async () => {
    const { props } = renderPane(withDropdown);

    await userEvent.click(within(rowFor('Reports')).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Credit blotter')).toBeDefined();

    await userEvent.click(screen.getByText('FX chart'));

    expect(props.onAddComponentToDropdown).toHaveBeenCalledWith('dd-1', entries[1]);
    // Picking closes the popover so the user is back on the tree.
    await waitFor(() => expect(screen.queryByText('Credit blotter')).toBeNull());
  });

  it('filters the list by the popover search box', async () => {
    renderPane(withDropdown);

    await userEvent.click(within(rowFor('Reports')).getByRole('button', { name: 'Add' }));
    await userEvent.type(await screen.findByPlaceholderText('Search components'), 'chart');

    expect(screen.getByText('FX chart')).toBeDefined();
    expect(screen.queryByText('Credit blotter')).toBeNull();
  });

  it('distinguishes an empty registry from an empty search result', async () => {
    const { unmount } = renderPane({ ...withDropdown, entries: [] });
    await userEvent.click(within(rowFor('Reports')).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Define a component first.')).toBeDefined();
    unmount();

    renderPane(withDropdown);
    await userEvent.click(within(rowFor('Reports')).getByRole('button', { name: 'Add' }));
    await userEvent.type(await screen.findByPlaceholderText('Search components'), 'zzz');
    expect(screen.getByText('No matches.')).toBeDefined();
  });

  it('offers no add affordance on a plain action button', () => {
    renderPane();

    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });
});
