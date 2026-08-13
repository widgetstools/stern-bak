import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOneByTestId, getOneByText } from '../../../test-utils/queries';
import { readViteDevPort } from '../../../test-utils/vitePort';
import {
  mockApplyTheme,
  mockGetTheme,
  mockIsOpenFin,
  mockOpenFinRuntimeCreate,
  mockEnsureConfigReady,
  mockEnsurePlatformReady,
  mockResolvePlatformBootstrapFromJson,
  mockResolvePlatformBootstrapFromManifest,
  resetStaruiMocks,
} from './staruiVitestMocks';

const mockInstallBootWatchdog = vi.fn();

vi.mock('./bootWatchdog', () => ({
  installBootWatchdog: (...args: unknown[]) => mockInstallBootWatchdog(...args),
}));

vi.mock('./index.css', () => ({}));

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('main', () => {
  const config = { appId: 'StarDemoSsrm', userId: 'dev1' };
  const configManager = { init: vi.fn() };
  const platform = { configManager };

  beforeEach(() => {
    vi.resetModules();
    resetStaruiMocks();
    mockInstallBootWatchdog.mockClear();
    mockGetTheme.mockReturnValue({ theme: 'dark' });
    mockResolvePlatformBootstrapFromJson.mockResolvedValue(config);
    mockResolvePlatformBootstrapFromManifest.mockResolvedValue(config);
    mockEnsureConfigReady.mockResolvedValue({ configManager });
    mockEnsurePlatformReady.mockResolvedValue(platform);
    document.body.innerHTML = '<div id="root"></div>';
  });

  async function bootMain(pathname: string, hash: string) {
    const origin = `http://localhost:${readViteDevPort(appRoot)}`;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { pathname, origin, search: '', hash },
    });
    await import('./main');
  }

  it('applies theme, installs watchdog, and starts platform bootstrap', async () => {
    await bootMain('/', '#/');

    expect(mockGetTheme).toHaveBeenCalled();
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'dark' });
    expect(mockInstallBootWatchdog).toHaveBeenCalled();
    expect(mockEnsurePlatformReady).toHaveBeenCalled();
  });

  it('starts config-only bootstrap for workspace setup pathname', async () => {
    await bootMain('/workspace-setup', '#/workspace-setup');

    expect(mockEnsureConfigReady).toHaveBeenCalled();
    expect(mockEnsurePlatformReady).not.toHaveBeenCalled();
  });

  it('skips bootstrap warming for rename-view-tab pathname', async () => {
    await bootMain('/rename-view-tab', '#/rename-view-tab');

    expect(mockEnsureConfigReady).not.toHaveBeenCalled();
    expect(mockEnsurePlatformReady).not.toHaveBeenCalled();
  });

  it('renders home route after bootstrap resolves', async () => {
    await bootMain('/', '#/');
    await waitFor(() => expect(getOneByText('Star Demo')).toBeInTheDocument());
  });

  it('renders rename tab route', async () => {
    await bootMain('/rename-view-tab', '#/rename-view-tab');
    await waitFor(() => expect(getOneByText('Save Tab As')).toBeInTheDocument());
  });

  it('renders workspace setup route', async () => {
    await bootMain('/workspace-setup', '#/workspace-setup');
    await waitFor(() => expect(getOneByTestId('workspace-setup')).toBeInTheDocument());
  });

  it('renders provider route', async () => {
    await bootMain('/platform/provider', '#/platform/provider');
    await waitFor(() => expect(getOneByText('Star Demo · Platform Provider')).toBeInTheDocument());
  });

  it('renders data providers route', async () => {
    await bootMain('/dataproviders', '#/dataproviders');
    await waitFor(() => expect(getOneByTestId('data-provider-editor')).toBeInTheDocument());
  });

  it('renders config browser route', async () => {
    await bootMain('/config-browser', '#/config-browser');
    await waitFor(() => expect(getOneByTestId('config-browser-panel')).toBeInTheDocument());
  });

  it('creates OpenFin runtime for grid route when isOpenFin', async () => {
    mockIsOpenFin.mockReturnValue(true);
    await bootMain('/blotters/marketsgrid', '#/blotters/marketsgrid');

    await waitFor(() => {
      expect(mockOpenFinRuntimeCreate).toHaveBeenCalled();
    });
    await waitFor(() => expect(getOneByTestId('hosted-markets-grid')).toBeInTheDocument());
  });

  it('executes ag-grid warm-up branch for blotter pathname', async () => {
    await expect(
      bootMain('/blotters/marketsgrid', '#/blotters/marketsgrid'),
    ).resolves.toBeUndefined();
  });
});
