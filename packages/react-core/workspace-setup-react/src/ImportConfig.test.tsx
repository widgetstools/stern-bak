import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportConfigBundleResult } from '@wellsfargo-starui/openfin-platform/config';

/**
 * ImportConfig is the only surface that bulk-writes another machine's config
 * into this one, so the guard rails matter more than the chrome: a file that
 * is not a config export must be rejected before `importConfigBundle` runs,
 * and a zero-row import must not report success.
 *
 * `isInOpenFin` is evaluated at module scope, so the OpenFin tests set up
 * `window.fin` and then import the module — hence the dynamic imports.
 */

const importConfigBundle = vi.fn();

vi.mock('@wellsfargo-starui/openfin-platform/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/openfin-platform/config')>();
  return { ...actual, importConfigBundle: (...a: unknown[]) => importConfigBundle(...a) };
});

function result(overrides: Partial<ImportConfigBundleResult> = {}): ImportConfigBundleResult {
  return {
    appConfig: { imported: 2, failed: 0 },
    appRegistry: { imported: 0, failed: 0 },
    roles: { imported: 0, failed: 0 },
    permissions: { imported: 0, failed: 0 },
    totalImported: 2,
    totalFailed: 0,
    ...overrides,
  } as ImportConfigBundleResult;
}

/** A File whose `.text()` resolves to `content` — jsdom's File lacks it. */
function jsonFile(content: string, name = 'config.json'): File {
  const file = new File([content], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  return file;
}

async function loadComponent() {
  vi.resetModules();
  return (await import('./ImportConfig.js')).default;
}

/** The hidden file input — it is deliberately not labelled or focusable. */
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  importConfigBundle.mockReset().mockResolvedValue(result());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ImportConfig', () => {
  it('prompts for a file before anything has been chosen', async () => {
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    expect(screen.getByRole('heading', { name: 'Import Config' })).toBeDefined();
    expect(screen.getByText(/Click to select a/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
  });

  it('shows the chosen file name and reports what was imported', async () => {
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: [{}, {}] }), 'export.json'));

    expect(await screen.findByText('export.json')).toBeDefined();
    expect(screen.getByText('Imported 2 config rows.')).toBeDefined();
  });

  it('singularises the counts', async () => {
    importConfigBundle.mockResolvedValue(result({
      appConfig: { imported: 1, failed: 0 },
      appRegistry: { imported: 1, failed: 0 },
      roles: { imported: 1, failed: 0 },
      permissions: { imported: 1, failed: 0 },
      totalImported: 4,
    }));
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: [{}] })));

    expect(await screen.findByText('Imported 1 config row, 1 app, 1 role, 1 permission.')).toBeDefined();
  });

  it('reports partial failures alongside the successes', async () => {
    importConfigBundle.mockResolvedValue(result({ totalFailed: 3 }));
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: [{}] })));

    expect(await screen.findByText(/3 rows failed — see console for details\./)).toBeDefined();
  });

  it('falls back to a generic message when nothing itemisable was imported', async () => {
    importConfigBundle.mockResolvedValue(result({
      appConfig: { imported: 0, failed: 0 },
      totalImported: 5,
    }));
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: [{}] })));

    expect(await screen.findByText('Import complete.')).toBeDefined();
  });

  it('rejects a file with no appConfig array before touching storage', async () => {
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ somethingElse: true })));

    expect(await screen.findByText(/No config data found in this file/)).toBeDefined();
    // The guard has to run first — importConfigBundle re-owns rows onto this
    // machine's appId/userId, which is not something to attempt speculatively.
    expect(importConfigBundle).not.toHaveBeenCalled();
  });

  it('rejects an appConfig that is not an array', async () => {
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: { rows: [] } })));

    expect(await screen.findByText(/No config data found in this file/)).toBeDefined();
    expect(importConfigBundle).not.toHaveBeenCalled();
  });

  it('reports an import that matched nothing as a failure, not a success', async () => {
    importConfigBundle.mockResolvedValue(result({ totalImported: 0 }));
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: [] })));

    expect(await screen.findByText('No importable rows found in this file.')).toBeDefined();
  });

  it('reports unparseable JSON rather than throwing', async () => {
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile('{ not json'));

    expect(await screen.findByText(/Failed to read the file/)).toBeDefined();
  });
});

describe('ImportConfig — inside OpenFin', () => {
  const publish = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    publish.mockClear();
    close.mockClear();
    vi.stubGlobal('fin', {
      InterApplicationBus: { publish },
      Window: { getCurrentSync: () => ({ close }) },
    });
  });

  it('tells the dock and the registry to reload after a successful import', async () => {
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: [{}] })));

    await waitFor(() => expect(publish).toHaveBeenCalledWith('reload-dock-after-import', {}));
    // The registry broadcast is conditional on config rows actually landing.
    expect(publish).toHaveBeenCalledWith('registry-config-update', {});
  });

  it('skips the registry broadcast when no config rows landed', async () => {
    importConfigBundle.mockResolvedValue(result({
      appConfig: { imported: 0, failed: 0 },
      roles: { imported: 3, failed: 0 },
      totalImported: 3,
    }));
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: [] })));

    await waitFor(() => expect(publish).toHaveBeenCalledWith('reload-dock-after-import', {}));
    expect(publish).not.toHaveBeenCalledWith('registry-config-update', {});
  });

  it('closes the window a moment after success so the message can be read', async () => {
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: [{}] })));
    expect(await screen.findByText('Imported 2 config rows.')).toBeDefined();

    // Closing synchronously would blank the window before the user could read
    // what actually landed.
    expect(close).not.toHaveBeenCalled();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('cancels the auto-close timer if the user leaves first', async () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const ImportConfig = await loadComponent();
    const { unmount } = render(<ImportConfig />);

    await userEvent.upload(fileInput(), jsonFile(JSON.stringify({ appConfig: [{}] })));
    expect(await screen.findByText('Imported 2 config rows.')).toBeDefined();

    unmount();
    // A surviving timer would call close() on a window the user already
    // dismissed by hand.
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('Cancel closes the window immediately', async () => {
    const ImportConfig = await loadComponent();
    render(<ImportConfig />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
});
