import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';

/**
 * WorkspaceSetup is the three-pane shell. Its own logic is the wiring
 * between the two editor hooks: the clone naming rules, the delete cascade
 * that prunes orphaned dock references, and the save-time id rewrite that
 * keeps dock buttons pointing at the entries they launch.
 *
 * Persistence, host-env discovery, template cloning and editor CSS are
 * boundaries and are mocked. The panes below are the real components, so a
 * flow is driven end to end through what a user actually clicks.
 */

const loadRegistryConfig = vi.fn();
const saveRegistryConfig = vi.fn();
const clearRegistryConfig = vi.fn();
const loadDockConfig = vi.fn();
const saveDockConfig = vi.fn();
const clearDockConfig = vi.fn();
const readHostEnv = vi.fn();
const setPlatformDefaultScope = vi.fn();
const cloneRegistryTemplateConfig = vi.fn();

const storageMocks = {
  loadRegistryConfig: (...a: unknown[]) => loadRegistryConfig(...a),
  saveRegistryConfig: (...a: unknown[]) => saveRegistryConfig(...a),
  clearRegistryConfig: (...a: unknown[]) => clearRegistryConfig(...a),
  loadDockConfig: (...a: unknown[]) => loadDockConfig(...a),
  saveDockConfig: (...a: unknown[]) => saveDockConfig(...a),
  clearDockConfig: (...a: unknown[]) => clearDockConfig(...a),
  readHostEnv: (...a: unknown[]) => readHostEnv(...a),
  setPlatformDefaultScope: (...a: unknown[]) => setPlatformDefaultScope(...a),
  cloneRegistryTemplateConfig: (...a: unknown[]) => cloneRegistryTemplateConfig(...a),
};

vi.mock('@wellsfargo-starui/openfin/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wellsfargo-starui/openfin/config')>()),
  ...storageMocks,
}));

vi.mock('@wellsfargo-starui/openfin', async () => ({
  ...(await import('@wellsfargo-starui/openfin/config')),
  ...storageMocks,
}));

vi.mock('@wellsfargo-starui/core', () => ({ injectEditorStyles: vi.fn() }));

const { WorkspaceSetup } = await import('./WorkspaceSetup.js');
const { ACTION_LAUNCH_COMPONENT } = await import('@wellsfargo-starui/openfin/config');

const hostEnv = { appId: 'star-demo', configServiceUrl: 'https://cfg.example', userId: 'k123' };

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
  type: 'ActionButton', id, tooltip, iconUrl: '', iconId: '', iconColor: '',
  actionId: ACTION_LAUNCH_COMPONENT, customData: { registryEntryId, asWindow: false },
});

const dropdownButton = (id: string, tooltip: string, options: unknown[]) => ({
  type: 'DropdownButton', id, tooltip, iconUrl: '', iconId: '', iconColor: '', options,
});

const menuItem = (id: string, tooltip: string, registryEntryId?: string) => ({
  id, tooltip,
  ...(registryEntryId
    ? { actionId: ACTION_LAUNCH_COMPONENT, customData: { registryEntryId, asWindow: false } }
    : {}),
});

/**
 * Mount and wait for the async scope read AND both editor loads to settle.
 * The shell renders as soon as `readHostEnv` resolves, which is one tick
 * before the registry and dock rows land — querying in between is what makes
 * a pane assertion flaky.
 */
async function mount() {
  const view = render(<WorkspaceSetup />);
  await waitFor(() => expect(screen.getByText('Workspace Setup')).toBeDefined());
  await waitFor(() => {
    expect(loadRegistryConfig).toHaveBeenCalled();
    expect(loadDockConfig).toHaveBeenCalled();
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return view;
}

const componentRow = (name: string) => screen.getByText(name).closest('button')!;
const dockRow = (label: string) => screen.getByText(label).closest('div.group')!;

beforeEach(() => {
  vi.clearAllMocks();
  readHostEnv.mockResolvedValue(hostEnv);
  loadRegistryConfig.mockResolvedValue({ version: 2, entries: [entry()] });
  loadDockConfig.mockResolvedValue({ version: 1, buttons: [] });
  saveRegistryConfig.mockResolvedValue(undefined);
  saveDockConfig.mockResolvedValue(undefined);
  clearRegistryConfig.mockResolvedValue(undefined);
  clearDockConfig.mockResolvedValue(undefined);
  cloneRegistryTemplateConfig.mockResolvedValue(undefined);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WorkspaceSetup — shell', () => {
  it('shows a loading state until the platform scope is known', async () => {
    let resolveEnv!: (env: typeof hostEnv) => void;
    readHostEnv.mockReturnValue(new Promise((resolve) => { resolveEnv = resolve; }));

    render(<WorkspaceSetup />);
    expect(screen.getByText('Loading workspace setup…')).toBeDefined();

    resolveEnv(hostEnv);
    await waitFor(() => expect(screen.getByText('Workspace Setup')).toBeDefined());
  });

  it('primes the module-level default scope and loads both editors under it', async () => {
    await mount();

    // Without this, saves land at the legacy (system, system) default while
    // boot migrations relocate rows onto the real scope.
    expect(setPlatformDefaultScope).toHaveBeenCalledWith({ appId: 'star-demo', userId: 'k123' });
    expect(loadRegistryConfig).toHaveBeenCalledWith({ appId: 'star-demo', userId: 'k123' });
    expect(loadDockConfig).toHaveBeenCalledWith({ appId: 'star-demo', userId: 'k123' });
  });

  it('falls back to the platform default when the host env cannot be read', async () => {
    readHostEnv.mockRejectedValue(new Error('no customData'));
    await mount();

    expect(setPlatformDefaultScope).not.toHaveBeenCalled();
    expect(loadRegistryConfig).toHaveBeenCalledWith({});
  });

  it('leaves the module default alone when the host env is blank', async () => {
    readHostEnv.mockResolvedValue({ appId: '', configServiceUrl: '', userId: '' });
    await mount();

    expect(setPlatformDefaultScope).not.toHaveBeenCalled();
  });

  it('summarises the catalog in the header', async () => {
    loadRegistryConfig.mockResolvedValue({ version: 2, entries: [entry()] });
    loadDockConfig.mockResolvedValue({ version: 1, buttons: [launchButton('b1', 'Credit', 'grid-credit')] });
    await mount();

    expect(screen.getByText('1 component · 1 dock button')).toBeDefined();
  });

  it('pluralises the header counts', async () => {
    loadRegistryConfig.mockResolvedValue({
      version: 2, entries: [entry(), entry({ id: 'grid-rates', componentSubType: 'RATES' })],
    });
    await mount();

    expect(screen.getByText('2 components · 0 dock buttons')).toBeDefined();
  });

  it('keeps Save and Discard disabled until something changes', async () => {
    await mount();

    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveProperty('disabled', true);
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });
});

describe('WorkspaceSetup — component CRUD', () => {
  it('+ New adds a draft and opens it in the inspector', async () => {
    await mount();

    await userEvent.click(screen.getByRole('button', { name: 'New' }));

    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'New Component');
    expect(screen.getByText('Unsaved changes')).toBeDefined();
  });

  it('editing a field in the inspector updates the catalog row', async () => {
    await mount();
    await userEvent.click(componentRow('Credit blotter'));

    await userEvent.type(screen.getByLabelText('Name'), '!');

    await waitFor(() => expect(screen.getByText('Credit blotter!')).toBeDefined());
  });

  it('cloning mints a unique display name and subtype', async () => {
    await mount();

    await userEvent.click(within(componentRow('Credit blotter')).getByRole('button', { name: 'Clone component' }));

    // The clone must differ on (type, subtype) or it derives the same
    // canonical id as its source and collides on save.
    expect(screen.getByText('Credit blotter (copy)')).toBeDefined();
    expect(screen.getByLabelText('SubType')).toHaveProperty('value', 'CREDIT-copy');
    expect(cloneRegistryTemplateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTemplateId: 'grid-credit', targetComponentSubType: 'CREDIT-copy' }),
    );
  });

  it('a second clone steps the suffix rather than colliding', async () => {
    loadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [
        entry(),
        entry({ id: 'x', displayName: 'Credit blotter (copy)', componentSubType: 'CREDIT-copy' }),
      ],
    });
    await mount();

    await userEvent.click(within(componentRow('Credit blotter')).getByRole('button', { name: 'Clone component' }));

    expect(screen.getByText('Credit blotter (copy 2)')).toBeDefined();
    expect(screen.getByLabelText('SubType')).toHaveProperty('value', 'CREDIT-copy-2');
  });

  it('cloning an incomplete draft skips the template copy', async () => {
    loadRegistryConfig.mockResolvedValue({
      version: 2, entries: [entry({ componentType: '', componentSubType: '' })],
    });
    await mount();

    await userEvent.click(within(componentRow('Credit blotter')).getByRole('button', { name: 'Clone component' }));

    expect(screen.getByText('Credit blotter (copy)')).toBeDefined();
    // Nothing to copy from: there is no template id without a type pair.
    expect(cloneRegistryTemplateConfig).not.toHaveBeenCalled();
  });

  it('deleting a component prunes the dock buttons and menu items that reference it', async () => {
    loadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [
        launchButton('b1', 'Credit', 'grid-credit'),
        launchButton('b2', 'Other', 'someone-else'),
        dropdownButton('dd1', 'Reports', [
          menuItem('mi1', 'Credit report', 'grid-credit'),
          menuItem('mi2', 'Keep me'),
        ]),
      ],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();

    await userEvent.click(within(componentRow('Credit blotter')).getByRole('button', { name: 'Delete' }));

    // Orphaned references would still try to launch a component that is gone.
    await waitFor(() => expect(screen.queryByText('Credit')).toBeNull());
    expect(screen.queryByText('Credit report')).toBeNull();
    expect(screen.getByText('Other')).toBeDefined();
    expect(screen.getByText('Keep me')).toBeDefined();
  });

  it('clears the inspector when the component it was showing is deleted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await userEvent.click(componentRow('Credit blotter'));
    expect(screen.getByLabelText('Name')).toBeDefined();

    await userEvent.click(within(componentRow('Credit blotter')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('③ WORKSPACE SETUP')).toBeDefined());
  });
});

describe('WorkspaceSetup — dock authoring', () => {
  it('adds the selected component to the dock and selects the new button', async () => {
    await mount();
    await userEvent.click(componentRow('Credit blotter'));

    await userEvent.click(screen.getByRole('button', { name: /Add to your dock/ }));

    expect(await screen.findByText('③ DOCK ITEM')).toBeDefined();
    expect(screen.getByLabelText('Label')).toHaveProperty('value', 'Credit blotter');
  });

  it('offers no second add once the component is already in the dock', async () => {
    loadDockConfig.mockResolvedValue({ version: 1, buttons: [launchButton('b1', 'Credit', 'grid-credit')] });
    await mount();

    await userEvent.click(componentRow('Credit blotter'));
    expect(screen.queryByRole('button', { name: /Add to your dock/ })).toBeNull();
  });

  it('+ New menu creates an empty dropdown and selects it', async () => {
    await mount();

    await userEvent.click(screen.getByRole('button', { name: /New menu/ }));

    expect(await screen.findByText('Dropdown (with menu items)')).toBeDefined();
    expect(screen.getByText(/Empty menu/)).toBeDefined();
  });

  it('adds a component into a dropdown via its + Add popover', async () => {
    loadDockConfig.mockResolvedValue({ version: 1, buttons: [dropdownButton('dd1', 'Reports', [])] });
    await mount();

    await userEvent.click(within(dockRow('Reports')).getByRole('button', { name: 'Add' }));
    await userEvent.click((await screen.findAllByText('Credit blotter'))[1]);

    await waitFor(() => expect(within(dockRow('Reports')).getAllByText('Credit blotter').length).toBeGreaterThan(0));
  });

  it('removing a dock button clears the inspector when it was the subject', async () => {
    loadDockConfig.mockResolvedValue({ version: 1, buttons: [launchButton('b1', 'Credit', 'grid-credit')] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await userEvent.click(screen.getByText('Credit'));
    expect(screen.getByText('③ DOCK ITEM')).toBeDefined();

    await userEvent.click(within(dockRow('Credit')).getByRole('button', { name: 'Remove from dock' }));

    await waitFor(() => expect(screen.getByText('③ WORKSPACE SETUP')).toBeDefined());
  });

  it('removing a menu item clears the inspector when it was the subject', async () => {
    loadDockConfig.mockResolvedValue({
      version: 1, buttons: [dropdownButton('dd1', 'Reports', [menuItem('mi1', 'Risk')])],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await userEvent.click(screen.getByText('Risk'));
    expect(screen.getByText('Menu item')).toBeDefined();

    await userEvent.click(within(dockRow('Risk')).getByRole('button', { name: 'Remove from menu' }));

    await waitFor(() => expect(screen.getByText('③ WORKSPACE SETUP')).toBeDefined());
  });

  it('reorders top-level buttons', async () => {
    loadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [launchButton('b1', 'First', 'grid-credit'), launchButton('b2', 'Second', 'grid-credit')],
    });
    await mount();

    await userEvent.click(within(dockRow('Second')).getByRole('button', { name: 'Move up' }));

    const labels = screen.getAllByText(/^(First|Second)$/).map((el) => el.textContent);
    expect(labels).toEqual(['Second', 'First']);
  });

  it('editing a dock item label leaves the underlying component untouched', async () => {
    loadDockConfig.mockResolvedValue({ version: 1, buttons: [launchButton('b1', 'Credit', 'grid-credit')] });
    await mount();
    await userEvent.click(screen.getByText('Credit'));

    await userEvent.type(screen.getByLabelText('Label'), '!');

    // Per-placement override semantics: the registry entry keeps its name.
    await waitFor(() => expect(screen.getByText('Credit!')).toBeDefined());
    const catalogRow = screen.getByText('GRID / CREDIT').closest('button')!;
    expect(within(catalogRow).getByText('Credit blotter')).toBeDefined();
  });

  it('editing a nested menu item label routes through the owning dropdown', async () => {
    loadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [dropdownButton('dd1', 'Reports', [menuItem('mi1', 'Risk')])],
    });
    await mount();
    await userEvent.click(screen.getByText('Risk'));

    await userEvent.type(screen.getByLabelText('Label'), '!');

    await waitFor(() => expect(within(dockRow('Reports')).getByText('Risk!')).toBeDefined());
  });
});

describe('WorkspaceSetup — save and discard', () => {
  it('saves only what is dirty', async () => {
    await mount();
    await userEvent.click(screen.getByRole('button', { name: 'New' }));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveRegistryConfig).toHaveBeenCalledTimes(1));
    expect(saveDockConfig).not.toHaveBeenCalled();
  });

  it('rewrites dock references from the draft id to the canonical id on save', async () => {
    await mount();

    // Draft a component, name it, then put it in the dock — the dock button
    // now references a temp `draft-…` id.
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await userEvent.type(screen.getByLabelText('Type'), 'CHART');
    await userEvent.type(screen.getByLabelText('SubType'), 'FX');
    await userEvent.type(screen.getByLabelText('Host URL'), '/charts/fx');
    await userEvent.click(componentRow('New Component'));
    await userEvent.click(screen.getByRole('button', { name: /Add to your dock/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveDockConfig).toHaveBeenCalledTimes(1));
    const [dockConfig] = saveDockConfig.mock.calls[0];
    // A dangling temp id here means the dock button does nothing at runtime.
    expect(dockConfig.buttons[0].customData.registryEntryId).toBe('chart-fx');

    const [registryConfig] = saveRegistryConfig.mock.calls[0];
    expect(registryConfig.entries.map((e: RegistryEntry) => e.id)).toContain('chart-fx');
  });

  it('seeds the dock placement\'s asWindow from the component default', async () => {
    loadRegistryConfig.mockResolvedValue({ version: 2, entries: [entry({ asWindow: true })] });
    await mount();
    await userEvent.click(componentRow('Credit blotter'));

    await userEvent.click(screen.getByRole('button', { name: /Add to your dock/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveDockConfig).toHaveBeenCalledTimes(1));
    const [dockConfig] = saveDockConfig.mock.calls[0];
    expect(dockConfig.buttons[0].customData.asWindow).toBe(true);
  });

  it('rewrites nested menu-item references too', async () => {
    loadDockConfig.mockResolvedValue({ version: 1, buttons: [dropdownButton('dd1', 'Reports', [])] });
    await mount();

    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await userEvent.type(screen.getByLabelText('Type'), 'CHART');
    await userEvent.type(screen.getByLabelText('SubType'), 'FX');
    await userEvent.click(within(dockRow('Reports')).getByRole('button', { name: 'Add' }));
    await userEvent.click((await screen.findAllByText('New Component'))[1]);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveDockConfig).toHaveBeenCalledTimes(1));
    const [dockConfig] = saveDockConfig.mock.calls[0];
    expect(dockConfig.buttons[0].options[0].customData.registryEntryId).toBe('chart-fx');
  });

  it('retries the pending template clone at save time', async () => {
    await mount();
    await userEvent.click(within(componentRow('Credit blotter')).getByRole('button', { name: 'Clone component' }));
    cloneRegistryTemplateConfig.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // The eager clone in handleClone may have failed; save is the retry.
    await waitFor(() => expect(cloneRegistryTemplateConfig).toHaveBeenCalledTimes(1));
  });

  it('Discard re-reads both editors without clearing storage', async () => {
    await mount();
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByText('Unsaved changes')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
    expect(screen.queryByText('New Component')).toBeNull();
    // Discard used to call clearRegistryConfig/clearDockConfig and wipe the
    // user's catalog — it must never touch storage.
    expect(clearRegistryConfig).not.toHaveBeenCalled();
    expect(clearDockConfig).not.toHaveBeenCalled();
    expect(screen.getByText('③ WORKSPACE SETUP')).toBeDefined();
  });
});
