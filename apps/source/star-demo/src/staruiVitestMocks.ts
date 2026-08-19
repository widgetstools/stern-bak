import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

export const mockApplyTheme = vi.fn();
export const mockGetTheme = vi.fn(() => ({ theme: 'dark' as const }));
export const mockSubscribeThemeBroadcast = vi.fn<
  (listener: (theme: string) => void) => () => void
>(() => () => {});
// Matches the slice of the real initWorkspace(options) signature the tests
// drive; the module mock below erases the type again, so this only has to be
// honest, not complete.
export const mockInitWorkspace = vi.fn<
  (options?: { onProgress?: (message: string) => void }) => Promise<void>
>(() => Promise.resolve());
export const mockInstallTestBridge = vi.fn();
export const mockOpenSurface = vi.fn(() => Promise.resolve());
export const mockEnsureConfigReady = vi.fn();
export const mockEnsurePlatformReady = vi.fn();
export const mockResolvePlatformBootstrapFromJson = vi.fn();
export const mockResolvePlatformBootstrapFromManifest = vi.fn();
export const mockSetConfigManager = vi.fn();
export const mockBuildGridHostContext = vi.fn(() => ({ gridId: 'mock-host' }));
export const mockStorageFactoryForPersistence = vi.fn(() => vi.fn());
export const mockDefineStarGridPlugin = vi.fn((def: unknown) => def);
export const mockCreateConfigServiceStorage = vi.fn(() => vi.fn());

const runtimeMock = {
  getTheme: vi.fn(() => 'dark' as const),
  setTheme: vi.fn(),
  onThemeChanged: vi.fn(() => () => {}),
  openSurface: mockOpenSurface,
};

export const mockBrowserRuntime = vi.fn(function BrowserRuntime(this: unknown) {
  return runtimeMock;
});

export const mockOpenFinRuntimeCreate = vi.fn(async () => runtimeMock);
export const mockIsOpenFin = vi.fn(() => false);

export function resetStaruiMocks(): void {
  mockApplyTheme.mockClear();
  mockGetTheme.mockReturnValue({ theme: 'dark' });
  mockSubscribeThemeBroadcast.mockClear().mockReturnValue(() => {});
  mockInitWorkspace.mockClear().mockResolvedValue(undefined);
  mockInstallTestBridge.mockClear();
  mockOpenSurface.mockClear().mockResolvedValue(undefined);
  mockEnsureConfigReady.mockClear();
  mockEnsurePlatformReady.mockClear();
  mockResolvePlatformBootstrapFromJson.mockClear();
  mockResolvePlatformBootstrapFromManifest.mockClear();
  mockSetConfigManager.mockClear();
  mockBuildGridHostContext.mockClear().mockReturnValue({ gridId: 'mock-host' });
  mockStorageFactoryForPersistence.mockClear().mockReturnValue(vi.fn());
  mockDefineStarGridPlugin.mockClear().mockImplementation((def: unknown) => def);
  mockCreateConfigServiceStorage.mockClear().mockReturnValue(vi.fn());
  mockBrowserRuntime.mockClear();
  mockOpenFinRuntimeCreate.mockClear().mockResolvedValue(runtimeMock);
  mockIsOpenFin.mockClear().mockReturnValue(false);
  runtimeMock.getTheme.mockClear().mockReturnValue('dark');
  runtimeMock.setTheme.mockClear();
  runtimeMock.onThemeChanged.mockClear().mockReturnValue(() => {});
}

vi.mock('@wellsfargo-starui/design-system', () => ({
  applyTheme: mockApplyTheme,
  getTheme: () => mockGetTheme(),
  ThemeProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@wellsfargo-starui/types', () => ({
  LOGGED_IN_USER_ID: 'dev1',
}));

vi.mock('@wellsfargo-starui/openfin/host', () => ({
  OpenFinRuntime: { create: () => mockOpenFinRuntimeCreate() },
  isOpenFin: () => mockIsOpenFin(),
  subscribeThemeBroadcast: mockSubscribeThemeBroadcast,
}));

vi.mock('@wellsfargo-starui/core/host/browser', () => ({
  BrowserRuntime: mockBrowserRuntime,
}));

vi.mock('@wellsfargo-starui/core/host', async (importOriginal) => ({
  // Real module (incl. openProviderEditorSurface / openConfigBrowserSurface,
  // which the view tests drive through mockOpenSurface via the runtime),
  // with only the host-context factories intercepted.
  ...(await importOriginal<typeof import('@wellsfargo-starui/core/host')>()),
  buildGridHostContext: mockBuildGridHostContext,
  storageFactoryForPersistence: mockStorageFactoryForPersistence,
  defineStarGridPlugin: mockDefineStarGridPlugin,
}));

vi.mock('@wellsfargo-starui/core/host/config', () => ({
  createConfigServiceStorage: mockCreateConfigServiceStorage,
}));

vi.mock('@wellsfargo-starui/data', () => ({
  ensureConfigReady: mockEnsureConfigReady,
  ensurePlatformReady: mockEnsurePlatformReady,
  resolvePlatformBootstrapFromJson: (...args: unknown[]) =>
    mockResolvePlatformBootstrapFromJson(...args),
  resolvePlatformBootstrapFromManifest: (...args: unknown[]) =>
    mockResolvePlatformBootstrapFromManifest(...args),
}));

vi.mock('@wellsfargo-starui/openfin/config', () => ({
  resolvePlatformBootstrapFromManifest: (...args: unknown[]) =>
    mockResolvePlatformBootstrapFromManifest(...args),
  setConfigManager: mockSetConfigManager,
}));

vi.mock('@wellsfargo-starui/data/assets/data-services-worker.mjs?url', () => ({
  default: '/mock-worker.mjs',
}));

vi.mock('@wellsfargo-starui/grid/widgets/hosted', () => ({
  useHostedStarui: ({ defaultGridId }: { defaultGridId: string }) => ({
    gridId: defaultGridId,
    identity: { appId: 'StarDemo', userId: 'dev1', storage: () => ({}) },
    ready: true,
  }),
}));

vi.mock('@wellsfargo-starui/grid', () => ({
  DataHubProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'data-hub-provider' }, children),
  StaruiIdentityProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'starui-identity' }, children),
  StarGrid: (props: Record<string, unknown>) => {
    const advanced = (props.advanced ?? {}) as Record<string, unknown>;
    return React.createElement(
      'div',
      {
        'data-testid': 'hosted-markets-grid',
        'data-grid-id': props.gridId,
      },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'edit-provider',
          onClick: () => (advanced.onEditProvider as ((id: string) => void) | undefined)?.('p-1'),
        },
        'Edit provider',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'open-config-browser',
          onClick: () => (advanced.onOpenConfigBrowser as (() => void) | undefined)?.(),
        },
        'Config browser',
      ),
    );
  },
}));

vi.mock('@wellsfargo-starui/openfin', () => ({
  initWorkspace: mockInitWorkspace,
  ACTION_EXPORT_CONFIG: 'export-config',
}));

vi.mock('@wellsfargo-starui/openfin/test-bridge', () => ({
  installTestBridge: mockInstallTestBridge,
}));

vi.mock('@wellsfargo-starui/grid/config-browser', () => ({
  ConfigBrowserPanel: () =>
    React.createElement('div', { 'data-testid': 'config-browser-panel' }, 'Config Browser'),
}));

vi.mock('@wellsfargo-starui/grid/widgets/provider-editor', () => ({
  DataProviderEditor: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'data-provider-editor',
      'data-user-id': props.userId,
      'data-initial-id': props.initialProviderId ?? '',
    }),
}));

vi.mock('@wellsfargo-starui/react/workspace-setup', () => ({
  WorkspaceSetup: () =>
    React.createElement('div', { 'data-testid': 'workspace-setup' }, 'Workspace Setup'),
}));

vi.mock('ag-grid-community', () => ({ ModuleRegistry: { registerModules: vi.fn() } }));
vi.mock('ag-grid-enterprise', () => ({ AllEnterpriseModule: {} }));
vi.mock('ag-grid-react', () => ({
  AgGridReact: () => React.createElement('div', { 'data-testid': 'ag-grid-react' }),
}));
