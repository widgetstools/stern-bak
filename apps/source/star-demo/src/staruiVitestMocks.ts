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
export const mockSetPlatformDefaultScope = vi.fn();
export const mockBuildGridHostContext = vi.fn(() => ({ gridId: 'mock-host' }));
export const mockStorageFactoryForPersistence = vi.fn(() => vi.fn());
export const mockDefineStarGridPlugin = vi.fn((def: unknown) => def);
export const mockCreateConfigServiceStorage = vi.fn(() => vi.fn());
export const mockCreateConfigPort = vi.fn(() => ({ port: 'config' }));

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
  mockSetPlatformDefaultScope.mockClear();
  mockBuildGridHostContext.mockClear().mockReturnValue({ gridId: 'mock-host' });
  mockStorageFactoryForPersistence.mockClear().mockReturnValue(vi.fn());
  mockDefineStarGridPlugin.mockClear().mockImplementation((def: unknown) => def);
  mockCreateConfigServiceStorage.mockClear().mockReturnValue(vi.fn());
  mockCreateConfigPort.mockClear().mockReturnValue({ port: 'config' });
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

vi.mock('@wellsfargo-starui/core/host', () => ({
  buildGridHostContext: mockBuildGridHostContext,
  storageFactoryForPersistence: mockStorageFactoryForPersistence,
  defineStarGridPlugin: mockDefineStarGridPlugin,
}));

vi.mock('@wellsfargo-starui/core/host/config', () => ({
  createConfigServiceStorage: mockCreateConfigServiceStorage,
  createConfigPort: mockCreateConfigPort,
}));

// Bootstrap entry points are stubbed (they reach for IndexedDB and a
// SharedWorker); `probeMock` / `inferFields` are NOT — they are pure,
// synchronous and offline, and the assistant's field-discovery answers are
// only meaningful when they come from the real mock generator's schema.
vi.mock('@wellsfargo-starui/data', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ensureConfigReady: mockEnsureConfigReady,
    ensurePlatformReady: mockEnsurePlatformReady,
    resolvePlatformBootstrapFromJson: (...args: unknown[]) =>
      mockResolvePlatformBootstrapFromJson(...args),
    resolvePlatformBootstrapFromManifest: (...args: unknown[]) =>
      mockResolvePlatformBootstrapFromManifest(...args),
  };
});

vi.mock('@wellsfargo-starui/openfin/config', () => ({
  resolvePlatformBootstrapFromManifest: (...args: unknown[]) =>
    mockResolvePlatformBootstrapFromManifest(...args),
  setConfigManager: mockSetConfigManager,
  setPlatformDefaultScope: mockSetPlatformDefaultScope,
  // ensureAiAssistantDockButton's dependencies — a no-op registry/dock here
  // is fine, its own idempotency logic is covered by ensureDockButton.test.ts.
  loadRegistryConfig: vi.fn(() => Promise.resolve(null)),
  saveRegistryConfig: vi.fn(() => Promise.resolve()),
  loadDockConfig: vi.fn(() => Promise.resolve(null)),
  saveDockConfig: vi.fn(() => Promise.resolve()),
  ACTION_LAUNCH_COMPONENT: 'launch-component',
  IAB_DOCK_CONFIG_UPDATE: 'dock-config-update',
  IAB_REGISTRY_CONFIG_UPDATE: 'registry-config-update',
  REGISTRY_CONFIG_VERSION: 2,
  deriveTemplateConfigId: (type: string, sub: string) => `${type}-${sub}`.toLowerCase(),
}));

vi.mock('@wellsfargo-starui/data/assets/data-services-worker.mjs?url', () => ({
  default: '/mock-worker.mjs',
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  DataHubProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'data-hub-provider' }, children),
}));

vi.mock('@wellsfargo-starui/openfin', () => ({
  initWorkspace: mockInitWorkspace,
  ACTION_EXPORT_CONFIG: 'export-config',
  ACTION_IMPORT_CONFIG: 'import-config',
}));

vi.mock('@wellsfargo-starui/react/host/test-bridge', () => ({
  installTestBridge: mockInstallTestBridge,
}));

vi.mock('@wellsfargo-starui/grid/config-browser', () => ({
  ConfigBrowserPanel: () =>
    React.createElement('div', { 'data-testid': 'config-browser-panel' }, 'Config Browser'),
}));

vi.mock('@wellsfargo-starui/grid/widgets/hosted', () => ({
  HostedMarketsGrid: (props: Record<string, unknown>) =>
    React.createElement(
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
          onClick: () => (props.onEditProvider as ((id: string) => void) | undefined)?.('p-1'),
        },
        'Edit provider',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'open-config-browser',
          onClick: () => (props.onOpenConfigBrowser as (() => void) | undefined)?.(),
        },
        'Config browser',
      ),
    ),
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

vi.mock('@wellsfargo-starui/grid/customizer', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) =>
    React.createElement(
      'button',
      { type: 'button', onClick, disabled, ...rest },
      children,
    ),
  Input: React.forwardRef(function MockInput(
    props: React.InputHTMLAttributes<HTMLInputElement>,
    ref: React.ForwardedRef<HTMLInputElement>,
  ) {
    return React.createElement('input', { ref, ...props });
  }),
}));

vi.mock('ag-grid-community', () => ({ ModuleRegistry: { registerModules: vi.fn() } }));
vi.mock('ag-grid-enterprise', () => ({ AllEnterpriseModule: {} }));
vi.mock('ag-grid-react', () => ({
  AgGridReact: () => React.createElement('div', { 'data-testid': 'ag-grid-react' }),
}));
