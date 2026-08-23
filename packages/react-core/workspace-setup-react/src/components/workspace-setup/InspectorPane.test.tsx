import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  DockButtonConfig,
  RegistryEntry,
} from '@wellsfargo-starui/openfin/config';
import { ACTION_LAUNCH_COMPONENT } from '@wellsfargo-starui/openfin/config';
import { InspectorPane } from './InspectorPane.js';
import type { EditorSelection } from './types.js';

/**
 * Pane ③ is context-sensitive: a summary card, a component form, or a
 * dock-item form. The interesting parts are the ones a user can get wrong —
 * a duplicate type/subtype pair, a dock item pointing at a deleted component,
 * and the pivot links that jump between the two views.
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

const launchButton = (id: string, tooltip: string, registryEntryId: string) => ({
  type: 'ActionButton', id, tooltip, iconUrl: '', iconId: 'mkt:bond', iconColor: '',
  actionId: ACTION_LAUNCH_COMPONENT, customData: { registryEntryId, asWindow: false },
}) as unknown as DockButtonConfig;

const dropdownButton = (id: string, tooltip: string, options: unknown[]) => ({
  type: 'DropdownButton', id, tooltip, iconUrl: '', iconId: '', iconColor: '', options,
}) as unknown as DockButtonConfig;

const menuItem = (id: string, tooltip: string, extra: Record<string, unknown> = {}) => ({ id, tooltip, ...extra });

const summary = { totalComponents: 3, inDock: 1, singletons: 2, dockButtons: 4 };

function renderPane(overrides: Partial<React.ComponentProps<typeof InspectorPane>> = {}) {
  const props = {
    selection: { kind: 'none' } as EditorSelection,
    entries: [entry()],
    buttons: [] as DockButtonConfig[],
    onChange: vi.fn(),
    onEditButton: vi.fn(),
    onEditMenuItem: vi.fn(),
    onTest: vi.fn(),
    onAddToDock: vi.fn(),
    onSelect: vi.fn(),
    inDockEntryIds: new Set<string>(),
    summary,
    ...overrides,
  };
  return { props, ...render(<InspectorPane {...props} />) };
}

const field = (label: string) => screen.getByLabelText(label);

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('InspectorPane — nothing selected', () => {
  it('shows the workspace counts', () => {
    renderPane();

    expect(screen.getByText('③ WORKSPACE SETUP')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('4')).toBeDefined();
    expect(screen.getByText('Components')).toBeDefined();
    expect(screen.getByText('Dock buttons')).toBeDefined();
  });
});

describe('InspectorPane — component selected', () => {
  const selection = { kind: 'component', entryId: 'grid-credit' } as EditorSelection;

  it('warns when the selected component no longer exists', () => {
    renderPane({ selection, entries: [] });

    expect(screen.getByText(/Selected component no longer exists/)).toBeDefined();
  });

  it('pre-fills the form from the entry', () => {
    renderPane({ selection });

    expect(field('Name')).toHaveProperty('value', 'Credit blotter');
    expect(field('Type')).toHaveProperty('value', 'GRID');
    expect(field('SubType')).toHaveProperty('value', 'CREDIT');
    expect(field('Host URL')).toHaveProperty('value', '/blotters/marketsgrid');
  });

  it.each([
    ['Name', 'X', 'displayName'],
    ['Type', 'X', 'componentType'],
    ['SubType', 'X', 'componentSubType'],
    ['Host URL', 'X', 'hostUrl'],
  ])('typing in %s patches %s', async (label, char, key) => {
    const { props } = renderPane({ selection });

    await userEvent.type(field(label), char);

    expect(props.onChange).toHaveBeenLastCalledWith('grid-credit', expect.objectContaining({ [key]: expect.any(String) }));
  });

  it('shows the derived config id when the entry has none yet', () => {
    renderPane({ selection, entries: [entry({ configId: '' })] });

    // The preview is what tells the user which id their entry will save under.
    expect(screen.getByText('grid-credit')).toBeDefined();
  });

  it('previews a bare separator for a draft with no type pair', () => {
    renderPane({
      selection: { kind: 'component', entryId: 'draft-1' },
      entries: [entry({ id: 'draft-1', configId: '', componentType: '', componentSubType: '' })],
    });

    // Pinning real behaviour: `deriveTemplateConfigId('', '')` returns "-",
    // which is truthy, so the component's `|| "—"` fallback is unreachable
    // and a fresh draft previews its config id as a lone hyphen.
    expect(screen.getByText('-')).toBeDefined();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('warns when another component already claims the same type pair', () => {
    renderPane({
      selection,
      entries: [entry(), entry({ id: 'other', displayName: 'Duplicate blotter' })],
    });

    expect(screen.getByText(/uses this same Type\/SubType pair/)).toBeDefined();
    expect(screen.getByText('"Duplicate blotter"')).toBeDefined();
  });

  it('does not warn when the pair is unique', () => {
    renderPane({
      selection,
      entries: [entry(), entry({ id: 'other', componentSubType: 'RATES' })],
    });

    expect(screen.queryByText(/uses this same Type\/SubType pair/)).toBeNull();
  });

  it('does not warn for a draft with no type yet', () => {
    renderPane({
      selection: { kind: 'component', entryId: 'draft-1' },
      entries: [entry({ id: 'draft-1', componentType: '' }), entry({ id: 'other', componentType: '' })],
    });

    expect(screen.queryByText(/uses this same Type\/SubType pair/)).toBeNull();
  });

  it('the singleton toggle is a pure flag flip', async () => {
    const { props } = renderPane({ selection });

    await userEvent.click(screen.getByRole('checkbox', { name: /Singleton/ }));

    // Toggling must not rewrite the id — the parent tracks selection by it.
    expect(props.onChange).toHaveBeenCalledWith('grid-credit', { singleton: true });
  });

  it('defaults the host surface to a workspace browser view', () => {
    renderPane({ selection });

    expect(screen.getByRole('button', { name: 'Workspace browser view' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Platform window' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('switching the host surface to a platform window patches asWindow', async () => {
    const { props } = renderPane({ selection });

    await userEvent.click(screen.getByRole('button', { name: 'Platform window' }));

    expect(props.onChange).toHaveBeenCalledWith('grid-credit', { asWindow: true });
  });

  it('switching back to a workspace browser view patches asWindow to false', async () => {
    const { props } = renderPane({ selection, entries: [entry({ asWindow: true })] });
    expect(screen.getByRole('button', { name: 'Platform window' }).getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(screen.getByRole('button', { name: 'Workspace browser view' }));

    expect(props.onChange).toHaveBeenCalledWith('grid-credit', { asWindow: false });
  });

  it('marking a component external turns off host config and reveals the extra fields', async () => {
    const { props } = renderPane({ selection });
    expect(screen.queryByLabelText('App ID')).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: /External/ }));
    expect(props.onChange).toHaveBeenCalledWith('grid-credit', { type: 'external', usesHostConfig: false });

    cleanup();
    const external = renderPane({ selection, entries: [entry({ type: 'external', usesHostConfig: false })] });
    expect(screen.getByLabelText('App ID')).toHaveProperty('value', 'star-demo');
    expect(screen.getByLabelText('ConfigService URL')).toHaveProperty('value', 'https://cfg.example');

    await userEvent.click(screen.getByRole('checkbox', { name: /External/ }));
    expect(external.props.onChange).toHaveBeenCalledWith('grid-credit', { type: 'internal', usesHostConfig: true });
  });

  it.each([
    ['App ID', 'appId'],
    ['ConfigService URL', 'configServiceUrl'],
  ])('the external %s field patches the entry', async (label, key) => {
    const { props } = renderPane({ selection, entries: [entry({ type: 'external' })] });

    await userEvent.type(screen.getByLabelText(label), 'X');

    expect(props.onChange).toHaveBeenLastCalledWith('grid-credit', expect.objectContaining({ [key]: expect.any(String) }));
  });

  it('configure launches the entry', async () => {
    const { props } = renderPane({ selection });

    await userEvent.click(screen.getByRole('button', { name: /Configure Component/ }));

    expect(props.onTest).toHaveBeenCalledWith(entry());
  });

  it('both actions are disabled until the entry has a host URL', () => {
    renderPane({ selection, entries: [entry({ hostUrl: '' })] });

    // Launching without a URL opens a blank window; adding it to the dock
    // creates a button that can never do anything.
    expect(screen.getByRole('button', { name: /Configure Component/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /Add to your dock/ })).toHaveProperty('disabled', true);
  });

  it('offers "Add to your dock" only while the component is absent from the dock', async () => {
    const { props } = renderPane({ selection });

    await userEvent.click(screen.getByRole('button', { name: /Add to your dock/ }));
    expect(props.onAddToDock).toHaveBeenCalledWith(entry());
    expect(screen.getByText(/Not in your dock yet/)).toBeDefined();

    cleanup();
    renderPane({ selection, inDockEntryIds: new Set(['grid-credit']) });
    expect(screen.queryByRole('button', { name: /Add to your dock/ })).toBeNull();
    expect(screen.getByText('✓ Currently in your dock')).toBeDefined();
  });

  it('lists each dock placement as a jump link, including nested paths', async () => {
    const { props } = renderPane({
      selection,
      inDockEntryIds: new Set(['grid-credit']),
      buttons: [
        launchButton('btn-1', 'Credit', 'grid-credit'),
        dropdownButton('dd-1', 'Reports', [
          menuItem('mi-1', 'Risk', {
            options: [menuItem('mi-1-1', 'Risk EOD', { actionId: ACTION_LAUNCH_COMPONENT, customData: { registryEntryId: 'grid-credit' } })],
          }),
        ]),
      ],
    });

    expect(screen.getByText('Credit')).toBeDefined();
    expect(screen.getByText('Reports → Risk → Risk EOD')).toBeDefined();

    await userEvent.click(screen.getByText('Reports → Risk → Risk EOD'));
    // Jumping targets the owning top-level button, which is what pane ②
    // can actually scroll to.
    expect(props.onSelect).toHaveBeenCalledWith({ kind: 'dock-item', itemId: 'dd-1' });
  });

  it('shows no placement footer when the component is not referenced', () => {
    renderPane({ selection, buttons: [launchButton('btn-1', 'Other', 'someone-else')] });

    expect(screen.queryByText('📍 In your dock at:')).toBeNull();
  });

  it('opens the icon picker and writes the chosen iconId back', async () => {
    const { props } = renderPane({ selection });

    await userEvent.click(screen.getByRole('button', { name: 'Pick an icon' }));
    await userEvent.click((await screen.findAllByRole('button', { name: 'Bond' }))[0]);

    expect(props.onChange).toHaveBeenCalledWith('grid-credit', { iconId: 'mkt:bond' });
  });
});

describe('InspectorPane — dock item selected', () => {
  it('warns when the dock item no longer exists', () => {
    renderPane({ selection: { kind: 'dock-item', itemId: 'gone' } });

    expect(screen.getByText(/Selected dock item no longer exists/)).toBeDefined();
  });

  it('edits a top-level button’s label and icon as per-placement overrides', async () => {
    const { props } = renderPane({
      selection: { kind: 'dock-item', itemId: 'btn-1' },
      buttons: [launchButton('btn-1', 'Credit', 'grid-credit')],
    });

    await userEvent.type(screen.getByLabelText('Label'), 'X');
    expect(props.onEditButton).toHaveBeenLastCalledWith('btn-1', { tooltip: 'CreditX' });

    await userEvent.click(screen.getByRole('button', { name: /Icon: mkt:bond/ }));
    await userEvent.click(screen.getByRole('button', { name: 'FileText' }));
    expect(props.onEditButton).toHaveBeenLastCalledWith('btn-1', { iconId: 'lucide:file-text' });
  });

  it('routes an edit on a nested menu item to its owning dropdown and parent', async () => {
    const { props } = renderPane({
      selection: { kind: 'dock-item', itemId: 'mi-1-1' },
      buttons: [
        dropdownButton('dd-1', 'Reports', [
          menuItem('mi-1', 'Risk', { options: [menuItem('mi-1-1', 'Risk EOD')] }),
        ]),
      ],
    });

    await userEvent.type(screen.getByLabelText('Label'), 'X');

    expect(props.onEditMenuItem).toHaveBeenLastCalledWith('dd-1', 'mi-1-1', 'mi-1', { tooltip: 'Risk EODX' });
  });

  it('routes an edit on a root menu item with no parent id', async () => {
    const { props } = renderPane({
      selection: { kind: 'dock-item', itemId: 'mi-1' },
      buttons: [dropdownButton('dd-1', 'Reports', [menuItem('mi-1', 'Risk')])],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Pick an icon' }));
    await userEvent.click(screen.getByRole('button', { name: 'FileText' }));

    expect(props.onEditMenuItem).toHaveBeenLastCalledWith('dd-1', 'mi-1', undefined, { iconId: 'lucide:file-text' });
  });

  it.each([
    ['a launch action button', [launchButton('x', 'Credit', 'grid-credit')], 'x', 'Action button · launches a component'],
    ['a dropdown', [dropdownButton('x', 'Reports', [])], 'x', 'Dropdown (with menu items)'],
  ])('describes %s', (_label, buttons, itemId, expected) => {
    renderPane({ selection: { kind: 'dock-item', itemId }, buttons });

    expect(screen.getByText(expected)).toBeDefined();
  });

  it('describes a menu item that owns a sub-menu', () => {
    renderPane({
      selection: { kind: 'dock-item', itemId: 'mi-1' },
      buttons: [dropdownButton('dd-1', 'Reports', [menuItem('mi-1', 'Risk', { options: [menuItem('mi-1-1', 'EOD')] })])],
    });

    expect(screen.getByText('Menu item (sub-menu)')).toBeDefined();
  });

  it('links through to the component a dock item launches', async () => {
    const { props } = renderPane({
      selection: { kind: 'dock-item', itemId: 'btn-1' },
      buttons: [launchButton('btn-1', 'Credit', 'grid-credit')],
    });

    const link = screen.getByRole('button', { name: /Credit blotter/ });
    expect(within(link).getByText('(GRID/CREDIT)')).toBeDefined();

    await userEvent.click(link);
    expect(props.onSelect).toHaveBeenCalledWith({ kind: 'component', entryId: 'grid-credit' });
  });

  it('flags a dock item whose component was deleted', () => {
    renderPane({
      selection: { kind: 'dock-item', itemId: 'btn-1' },
      buttons: [launchButton('btn-1', 'Ghost', 'gone')],
      entries: [],
    });

    expect(screen.getByText(/was deleted/)).toBeDefined();
    expect(screen.getByText('gone')).toBeDefined();
  });

  it('shows no launch section for a dock item that launches nothing', () => {
    const plain = { type: 'ActionButton', id: 'btn-x', tooltip: 'Toggle theme', iconUrl: '', iconId: '', iconColor: '' };
    renderPane({
      selection: { kind: 'dock-item', itemId: 'btn-x' },
      buttons: [plain as unknown as DockButtonConfig],
    });

    expect(screen.queryByText('Launches component')).toBeNull();
    expect(screen.getByText('Action button')).toBeDefined();
  });

  it('surfaces the component default so the override is understood as an override', () => {
    renderPane({
      selection: { kind: 'dock-item', itemId: 'btn-1' },
      buttons: [launchButton('btn-1', 'Credit', 'grid-credit')],
      entries: [entry({ iconId: 'mkt:ticker' })],
    });

    expect(screen.getByText(/per-placement overrides win/)).toBeDefined();
    expect(screen.getByText('mkt:ticker')).toBeDefined();
  });

  it('renders an em dash when the referenced component has no icon of its own', () => {
    renderPane({
      selection: { kind: 'dock-item', itemId: 'btn-1' },
      buttons: [launchButton('btn-1', 'Credit', 'grid-credit')],
      entries: [entry({ iconId: '' })],
    });

    expect(screen.getByText('—')).toBeDefined();
  });
});
