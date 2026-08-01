/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeConfigManager, type FakeConfigManager } from './test-utils/fakeConfigManager';

/**
 * Only the platform boundary is mocked. The real `useConfigBrowser`, the real
 * dialogs and the real AG Grid all run, so what is asserted here is the
 * wiring between them — which is the only thing this file contributes over
 * the per-component suites.
 */
const readHostEnv = vi.fn();
const getConfigManager = vi.fn();

vi.mock('@wellsfargo-starui/openfin/config', () => ({
  readHostEnv: (...args: unknown[]) => readHostEnv(...args),
  getConfigManager: (...args: unknown[]) => getConfigManager(...args),
}));

const { ConfigBrowserPanel } = await import('./ConfigBrowser');

/** jsdom lays out at zero; AG Grid virtualises off the measured viewport. */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1400 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 });
});

const APP_CONFIG_ROWS = [
  { configId: 'grid-1', appId: 'trading', payload: { columns: 3 }, creationTime: '2026-01-01T00:00:00.000Z' },
  { configId: 'grid-2', appId: 'trading', payload: { columns: 5 }, creationTime: '2026-01-02T00:00:00.000Z' },
];

let manager: FakeConfigManager;
let downloads: { name: string; blob: Blob }[];
let alerts: string[];

function mount(opts: Parameters<typeof createFakeConfigManager>[0] = {}, appId = 'trading') {
  manager = createFakeConfigManager({ appId, ...opts });
  readHostEnv.mockResolvedValue({ appId, configServiceUrl: '' });
  getConfigManager.mockResolvedValue(manager);
  return render(<ConfigBrowserPanel />);
}

/** Boot is async; the panel shows "Loading…" until rows and counts land. */
async function mounted(...args: Parameters<typeof mount>) {
  const view = mount(...args);
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  return view;
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });

/**
 * The drawer's JSON textarea has no accessible name, so it cannot be told
 * apart from the toolbar's quick-filter box by role+name — see WORKLOG item 8.
 * Filtering on the tag is the closest RTL query available until it gets one.
 *
 * The drawer also stays mounted while closed (so the slide-out can play), so
 * the textarea exists — holding the placeholder `{}` — before any row is
 * opened. Callers must wait on its CONTENT, never on its presence.
 */
async function jsonEditor(hasLoaded: (row: any) => boolean): Promise<HTMLTextAreaElement> {
  let editor!: HTMLTextAreaElement;
  await waitFor(() => {
    const found = screen.getAllByRole('textbox').find((el) => el.tagName === 'TEXTAREA');
    expect(found, 'JSON editor is not rendered').toBeTruthy();
    editor = found as HTMLTextAreaElement;
    expect(hasLoaded(JSON.parse(editor.value)), `editor still holds ${editor.value}`).toBe(true);
  });
  return editor;
}

beforeEach(() => {
  vi.clearAllMocks();
  downloads = [];
  alerts = [];
  window.localStorage.clear();

  vi.spyOn(window, 'alert').mockImplementation((msg?: any) => { alerts.push(String(msg)); });

  let lastBlob: Blob | null = null;
  URL.createObjectURL = vi.fn((blob: Blob) => { lastBlob = blob; return 'blob:config-browser'; }) as any;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: lastBlob! });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-ag-theme-mode');
  document.documentElement.classList.remove('dark');
});

describe('ConfigBrowserPanel — header and footer', () => {
  it('shows the active appId and the REST endpoint it mirrors writes to', async () => {
    await mounted({ restUrl: 'https://config.example/api', appConfig: APP_CONFIG_ROWS });

    expect(screen.getByText('appId: trading')).toBeTruthy();
    expect(screen.getByText('connected · https://config.example/api')).toBeTruthy();
    expect(screen.getByText('REST → https://config.example/api')).toBeTruthy();
  });

  it('reports local-only mode when the manager has no REST url', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    expect(screen.getAllByText('local only')).toHaveLength(2); // header chip + footer
    expect(screen.queryByText(/^connected · /)).toBeNull();
  });

  it('renders an em dash rather than a blank chip when there is no appId', async () => {
    await mounted({}, '');

    expect(screen.getByText('appId: —')).toBeTruthy();
  });

  it('footers the visible row count and the selected table\'s description', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    expect(screen.getByText('2 rows')).toBeTruthy();
    expect(screen.getByText('Component configurations (templates + instances).')).toBeTruthy();
  });
});

describe('ConfigBrowserPanel — theme', () => {
  it('defaults to dark and stamps the document so the token blocks resolve', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-ag-theme-mode')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('seeds itself from the dock\'s persisted theme key', async () => {
    window.localStorage.setItem('starui:theme', 'light');

    await mounted({ appConfig: APP_CONFIG_ROWS });

    // This window mounts outside the StarGridApp shell, so the persisted key
    // is the only thing it can read at startup.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('ignores a junk value in the persisted key', async () => {
    window.localStorage.setItem('starui:theme', 'chartreuse');

    await mounted({ appConfig: APP_CONFIG_ROWS });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('follows a same-origin storage event from the dock toggle', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'starui:theme', newValue: 'light' }));
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('ignores storage events for other keys and other values', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: 'light' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'starui:theme', newValue: null }));
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('subscribes to the dock\'s IAB broadcast with a wildcard sender uuid', async () => {
    const subscribe = vi.fn();
    const unsubscribe = vi.fn();
    vi.stubGlobal('fin', { InterApplicationBus: { subscribe, unsubscribe } });

    const { unmount } = await mounted({ appConfig: APP_CONFIG_ROWS });

    // The dock publishes from the platform provider, whose uuid differs from
    // this window's — an exact uuid would never match.
    expect(subscribe).toHaveBeenCalledWith({ uuid: '*' }, 'theme-changed', expect.any(Function));

    unmount();
    expect(unsubscribe).toHaveBeenCalledWith({ uuid: '*' }, 'theme-changed', expect.any(Function));
  });

  it('applies an IAB message in either payload shape', async () => {
    let handler: ((msg: unknown) => void) | undefined;
    vi.stubGlobal('fin', {
      InterApplicationBus: {
        subscribe: (_t: unknown, _n: string, cb: (msg: unknown) => void) => { handler = cb; },
        unsubscribe: vi.fn(),
      },
    });
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await act(async () => { handler!({ theme: 'light' }); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    await act(async () => { handler!({ isDark: true }); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Anything unrecognised must leave the theme where it was rather than
    // flipping to a default.
    await act(async () => { handler!({ nonsense: 1 }); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('survives an IAB subscribe that throws because the bus is not ready', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: {
        subscribe: () => { throw new Error('IAB not ready'); },
        unsubscribe: vi.fn(),
      },
    });

    await mounted({ appConfig: APP_CONFIG_ROWS });

    // The panel is still usable without theme sync.
    expect(screen.getByText('Config Browser')).toBeTruthy();
  });
});

describe('ConfigBrowserPanel — table navigation', () => {
  it('switches the grid, toolbar and footer to the table picked in the sidebar', async () => {
    await mounted({
      appConfig: APP_CONFIG_ROWS,
      roles: [{ roleId: 'admin', label: 'Administrator' }],
    });

    await userEvent.click(button(/^Roles/));

    await waitFor(() => expect(screen.getByText('1 row · pk roleId')).toBeTruthy());
    expect(screen.getByText('Role definitions. Always global.')).toBeTruthy();
    expect(await screen.findByText('admin')).toBeTruthy();
  });

  it('offers to seed an empty table rather than showing a bare grid', async () => {
    await mounted({ appConfig: [] });

    expect(screen.getByText(/^No rows in App Config/)).toBeTruthy();
    // A scopable empty table has to say WHICH scope is empty.
    expect(screen.getByText(/for trading$/)).toBeTruthy();
    expect(button('Add first row')).toBeTruthy();
  });

  it('omits the scope hint on an empty global table', async () => {
    await mounted({ roles: [] });

    await userEvent.click(button(/^Roles/));

    await waitFor(() => expect(screen.getByText('No rows in Roles')).toBeTruthy());
  });
});

describe('ConfigBrowserPanel — row editing', () => {
  it('opens the drawer on the clicked row and saves the edit back to the table', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.click(await screen.findByText('grid-1'));

    const editor = await jsonEditor((row) => row.configId === 'grid-1');
    expect(JSON.parse(editor.value).appId).toBe('trading');

    await userEvent.clear(editor);
    await userEvent.click(editor);
    await userEvent.paste('{"configId":"grid-1","appId":"trading","payload":{"columns":42}}');
    await userEvent.click(button('Save'));

    await waitFor(async () =>
      expect((await manager.db.appConfig.get('grid-1')).payload).toEqual({ columns: 42 }));
  });

  it('pre-fills a create-mode row with blanked fields and the in-scope appId', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.click(button('New'));

    const template = JSON.parse((await jsonEditor((row) => row.configId === '')).value);
    // Blanked from the first row's shape so the user sees the columns the
    // table actually has, with the scope already correct.
    expect(template.configId).toBe('');
    expect(template.payload).toBe('');
    expect(template.appId).toBe('trading');
    expect(template.creationTime).not.toBe('');
    expect(Number.isNaN(Date.parse(template.creationTime))).toBe(false);
  });

  it('starts from an empty object when the table has no row to model', async () => {
    await mounted({ appConfig: [] });

    await userEvent.click(button('Add first row'));

    expect(JSON.parse((await jsonEditor((row) => row.appId === 'trading')).value))
      .toEqual({ appId: 'trading' });
  });

  it('deletes the open row from the table', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.click(await screen.findByText('grid-1'));
    await jsonEditor((row) => row.configId === 'grid-1');
    await userEvent.click(button('Delete'));
    await userEvent.click(button('Click to confirm'));

    await waitFor(() => expect(manager.db.appConfig.rows.map((r) => r.configId)).toEqual(['grid-2']));
    await waitFor(() => expect(screen.getByText('1 rows')).toBeTruthy());
  });
});

describe('ConfigBrowserPanel — exports', () => {
  it('exports the visible table as JSON named for the table and scope', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.click(button('Export JSON (this table only)'));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe('appConfig-trading.json');
    expect(JSON.parse(await downloads[0].blob.text()).map((r: any) => r.configId))
      .toEqual(['grid-1', 'grid-2']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:config-browser');
  });

  it('names an unscoped export "all"', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS }, '');

    await userEvent.click(button('Export JSON (this table only)'));

    expect(downloads[0].name).toBe('appConfig-all.json');
  });

  it('exports the whole database as a seed-shaped bundle', async () => {
    await mounted({
      appConfig: APP_CONFIG_ROWS,
      roles: [{ roleId: 'admin' }],
    });

    await userEvent.click(button(/^Export ALL \(raw\)/));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe('config-bundle-trading.json');
    const bundle = JSON.parse(await downloads[0].blob.text());
    expect(Object.keys(bundle)).toEqual(['appConfig', 'appRegistry', 'userProfiles', 'roles', 'permissions']);
    expect(bundle.roles).toEqual([{ roleId: 'admin' }]);
  });

  it('previews a deploy export before writing seed.json', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.click(button(/^Export for deploy/));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Export for deploy · trading')).toBeTruthy();
    // Nothing is written until the preview is confirmed.
    expect(downloads).toHaveLength(0);
  });

  it('writes seed.json only after the deploy preview is confirmed', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.click(button(/^Export for deploy/));
    await screen.findByRole('dialog');
    const download = button('Download seed.json');
    if (!(download as HTMLButtonElement).disabled) {
      await userEvent.click(download);
      expect(downloads[0].name).toBe('seed.json');
      expect(screen.queryByRole('dialog')).toBeNull();
    } else {
      // Bundle had errors/warnings — acknowledge, then download.
      await userEvent.click(screen.getByRole('checkbox'));
      await userEvent.click(button('Download seed.json'));
      expect(downloads[0].name).toBe('seed.json');
    }
  });

  it('discards the deploy preview on cancel', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.click(button(/^Export for deploy/));
    await screen.findByRole('dialog');
    await userEvent.click(button('Cancel'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(downloads).toHaveLength(0);
  });
});

describe('ConfigBrowserPanel — import', () => {
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  function jsonFile(name: string, contents: unknown | string) {
    const text = typeof contents === 'string' ? contents : JSON.stringify(contents);
    return new File([text], name, { type: 'application/json' });
  }

  it('previews a parsed array before touching the database', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.upload(fileInput(), jsonFile('rows.json', [
      { configId: 'grid-1', appId: 'trading' },
      { configId: 'new-1', appId: 'trading' },
      { noPk: true },
    ]));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Import preview · App Config')).toBeTruthy();
    expect(within(dialog).getByText('1 import · 1 skip · 1 invalid')).toBeTruthy();
    expect(manager.db.appConfig.rows).toHaveLength(2);
  });

  it('imports on confirm and reports what happened', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.upload(fileInput(), jsonFile('rows.json', [{ configId: 'new-1', appId: 'trading' }]));
    await screen.findByRole('dialog');
    await userEvent.click(button(/^Import 1/));

    await waitFor(() => expect(manager.db.appConfig.rows).toHaveLength(3));
    expect(alerts[0]).toBe('Imported 1 row into App Config.');
    await waitFor(() => expect(screen.getByText('3 rows')).toBeTruthy());
  });

  it('summarises skips and failures in the same report', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.upload(fileInput(), jsonFile('rows.json', [
      { configId: 'grid-1', appId: 'trading' },
      { configId: 'new-1', appId: 'trading' },
      { noPk: true },
    ]));
    await screen.findByRole('dialog');
    await userEvent.click(button(/^Import 1/));

    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]).toContain('Imported 1 row into App Config.');
    expect(alerts[0]).toContain('Skipped 1 existing.');
    expect(alerts[0]).toContain("Failed 1:\nInvalid row: missing primary key 'configId'");
  });

  it('cancels the preview without importing', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.upload(fileInput(), jsonFile('rows.json', [{ configId: 'new-1', appId: 'trading' }]));
    await screen.findByRole('dialog');
    await userEvent.click(button('Cancel'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(manager.db.appConfig.rows).toHaveLength(2);
    expect(alerts).toHaveLength(0);
  });

  it('rejects a JSON object, naming the shape it got', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.upload(fileInput(), jsonFile('bundle.json', { appConfig: [] }));

    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]).toContain('expected a JSON array of rows');
    expect(alerts[0]).toContain('Got object.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reports a JSON null as null rather than as "object"', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.upload(fileInput(), jsonFile('null.json', 'null'));

    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]).toContain('Got null.');
  });

  it('reports a parse failure instead of throwing', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.upload(fileInput(), jsonFile('broken.json', '{ not json'));

    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]).toMatch(/^Import failed: /);
  });

  it('clears the file input so the same file can be picked twice', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.upload(fileInput(), jsonFile('rows.json', [{ configId: 'new-1', appId: 'trading' }]));
    await screen.findByRole('dialog');

    // A file input that keeps its value fires no second onChange, so re-picking
    // the same file after a failed import would appear to do nothing.
    expect(fileInput().value).toBe('');
  });
});

describe('ConfigBrowserPanel — destructive actions', () => {
  it('wipes the visible table only after both guard rails are cleared', async () => {
    await mounted({ appConfig: [...APP_CONFIG_ROWS, { configId: 'chart-1', appId: 'research' }] });

    await userEvent.click(button(/^Delete all rows in this view/));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download backup' }));
    await userEvent.click(within(dialog).getByRole('textbox'));
    await userEvent.paste('App Config');
    await userEvent.click(within(dialog).getByRole('button', { name: /^Delete all/ }));

    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]).toBe('Deleted 2 rows from App Config.');
    // The out-of-scope row must survive.
    expect(manager.db.appConfig.rows.map((r) => r.configId)).toEqual(['chart-1']);
    // The guard-rail backup is the same file Export JSON produces.
    expect(downloads[0].name).toBe('appConfig-trading.json');
  });

  it('closes the delete dialog without deleting on cancel', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await userEvent.click(button(/^Delete all rows in this view/));
    await screen.findByRole('dialog');
    await userEvent.click(button('Cancel'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(manager.db.appConfig.rows).toHaveLength(2);
    expect(alerts).toHaveLength(0);
  });

  it('keeps Reset to seed unavailable when no seed file is configured', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    const reset = button('Reset to seed unavailable — no seed file is configured') as HTMLButtonElement;
    expect(reset.disabled).toBe(true);

    await userEvent.click(reset);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('re-seeds the database and reports the resulting counts', async () => {
    await mounted({ seedConfigUrl: '/config/seed.json', appConfig: APP_CONFIG_ROWS });
    vi.spyOn(manager, 'resetToSeed').mockImplementation(async () => {
      manager.db.appConfig.rows = [{ configId: 'seeded', appId: 'trading' }];
      return {
        seedUrl: '/config/seed.json',
        counts: { appConfig: 1, appRegistry: 2, userProfiles: 3, roles: 4, permissions: 5 },
      };
    });

    await userEvent.click(button(/^Reset ALL config to seed\.json/));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download backup' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset to seed' }));

    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]).toContain('Reset complete — re-seeded from /config/seed.json:');
    expect(alerts[0]).toContain('1 app configs, 2 app registry, 3 user profiles, 4 roles, 5 permissions.');
    await waitFor(() => expect(screen.getByText('1 rows')).toBeTruthy());
    // The backup taken first is the full bundle, not the single table.
    expect(downloads[0].name).toBe('config-bundle-trading.json');
  });

  it('reassures the user that nothing was lost when the reset fails', async () => {
    await mounted({ seedConfigUrl: '/config/seed.json', appConfig: APP_CONFIG_ROWS });
    vi.spyOn(manager, 'resetToSeed').mockRejectedValue(new Error('seed fetch failed'));

    await userEvent.click(button(/^Reset ALL config to seed\.json/));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download backup' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset to seed' }));

    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(alerts[0]).toContain('Reset to seed failed — your data was left untouched.');
    expect(alerts[0]).toContain('seed fetch failed');
    expect(manager.db.appConfig.rows).toHaveLength(2);
  });

  it('closes the reset dialog without resetting on cancel', async () => {
    await mounted({ seedConfigUrl: '/config/seed.json', appConfig: APP_CONFIG_ROWS });
    const reset = vi.spyOn(manager, 'resetToSeed');

    await userEvent.click(button(/^Reset ALL config to seed\.json/));
    await screen.findByRole('dialog');
    await userEvent.click(button('Cancel'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('ConfigBrowserPanel — toolbar', () => {
  it('re-reads the table on Refresh', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await manager.db.appConfig.put({ configId: 'grid-3', appId: 'trading' });
    await userEvent.click(button('Refresh'));

    await waitFor(() => expect(screen.getByText('3 rows')).toBeTruthy());
  });

  it('narrows the grid to rows matching the quick filter', async () => {
    await mounted({ appConfig: APP_CONFIG_ROWS });

    await screen.findByText('grid-2');
    await userEvent.click(screen.getByPlaceholderText('Search rows…'));
    await userEvent.paste('grid-2');

    await waitFor(() => expect(screen.queryByText('grid-1')).toBeNull());
    expect(screen.getByText('grid-2')).toBeTruthy();
    // The footer counts the loaded rows, not the filtered ones.
    expect(screen.getByText('2 rows')).toBeTruthy();
  });
});
