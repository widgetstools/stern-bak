import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const dockApi = {
  hasPanel: vi.fn((_panelId: string) => false),
  closePanel: vi.fn(),
  addPanel: vi.fn(),
  floatPanel: vi.fn(),
  updatePanel: vi.fn(),
  bringToFront: vi.fn(),
};

export const mockDockHandle = {
  getApi: vi.fn(() => dockApi),
  getState: vi.fn(() => ({ panels: new Map(), layout: {}, placements: new Map() })),
};

export const mockDockCore = {
  dockApi,
  reset: () => {
    dockApi.hasPanel.mockReset().mockReturnValue(false);
    dockApi.closePanel.mockReset();
    dockApi.addPanel.mockReset();
    dockApi.floatPanel.mockReset();
    dockApi.updatePanel.mockReset();
    dockApi.bringToFront.mockReset();
    mockDockHandle.getApi.mockReset().mockReturnValue(dockApi);
    mockDockHandle.getState.mockReset().mockReturnValue({
      panels: new Map(),
      layout: {},
      placements: new Map(),
    });
  },
};

vi.mock('@wellsfargo-starui/design-system', () => ({
  applyTheme: vi.fn(),
  getTheme: vi.fn(() => ({ theme: 'dark' })),
  ThemeProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@wellsfargo-starui/react', () => {
  const passthrough =
    (Tag: keyof React.JSX.IntrinsicElements = 'div') =>
    ({
      children,
      onClick,
      onCheckedChange,
      checked,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(
        Tag,
        {
          ...rest,
          onClick: onClick ?? (onCheckedChange ? () => (onCheckedChange as (v: boolean) => void)(!checked) : undefined),
          'data-checked': checked,
        },
        children,
      );

  return {
    Alert: passthrough(),
    AlertDescription: passthrough('p'),
    AlertTitle: passthrough('h2'),
    Badge: passthrough('span'),
    Button: passthrough('button'),
    Menubar: passthrough('div'),
    MenubarCheckboxItem: passthrough('button'),
    MenubarContent: passthrough('div'),
    MenubarMenu: passthrough('div'),
    MenubarTrigger: passthrough('button'),
    ScrollArea: passthrough('div'),
    Separator: passthrough('hr'),
    Sheet: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
      open ? React.createElement('div', { 'data-testid': 'sheet' }, children) : null,
    SheetContent: passthrough('div'),
    SheetDescription: passthrough('p'),
    SheetHeader: passthrough('div'),
    SheetTitle: passthrough('h2'),
    Tabs: ({ children, defaultValue }: { children: React.ReactNode; defaultValue?: string }) =>
      React.createElement('div', { 'data-testid': 'tabs', 'data-default': defaultValue }, children),
    TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) =>
      React.createElement('div', { 'data-testid': `tab-${value}` }, children),
    TabsList: passthrough('div'),
    TabsTrigger: passthrough('button'),
    Tooltip: passthrough(),
    TooltipContent: passthrough('span'),
    TooltipProvider: passthrough(),
    TooltipTrigger: passthrough(),
  };
});

vi.mock('@wellsfargo-starui/types', () => ({
  LOGGED_IN_USER_ID: 'dev1',
}));

vi.mock('@wellsfargo-starui/grid/config-browser', () => ({
  ConfigBrowserPanel: () =>
    React.createElement('div', { 'data-testid': 'star-config-browser' }, 'Config Browser'),
}));

vi.mock('@wellsfargo-starui/grid/widgets/hosted', () => ({
  useHostedStarui: ({ defaultGridId }: { defaultGridId: string }) => ({
    gridId: defaultGridId,
    identity: { appId: 'DPEditor', userId: 'dev1', storage: () => ({}) },
    ready: true,
  }),
}));

vi.mock('@wellsfargo-starui/grid', () => ({
  StaruiIdentityProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'starui-identity' }, children),
  DataHubProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'data-hub-provider' }, children),
  StarGrid: (props: Record<string, unknown>) => {
    const advanced = (props.advanced ?? {}) as Record<string, unknown>;
    return React.createElement(
      'div',
      {
        'data-testid': 'hosted-markets-grid',
        'data-grid-id': props.gridId,
        'data-component-name': advanced.componentName,
      },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'edit-provider',
          onClick: () => (advanced.onEditProvider as ((id: string) => void) | undefined)?.('provider-1'),
        },
        'Edit',
      ),
    );
  },
}));

vi.mock('@wellsfargo-starui/grid/widgets/provider-editor', () => ({
  DataProviderEditor: (props: Record<string, unknown>) =>
    React.createElement(
      'div',
      {
        'data-testid': 'data-provider-editor',
        'data-user-id': props.userId,
        'data-initial-id': props.initialProviderId,
      },
      React.createElement(
        'button',
        { type: 'button', onClick: () => (props.onClose as (() => void) | undefined)?.() },
        'Close editor',
      ),
    ),
}));

vi.mock('@wellsfargo-starui/data', () => ({
  ensurePlatformReady: vi.fn(async () => ({
    client: {},
    appData: {},
    configManager: {},
    ready: Promise.resolve(),
    dispose: vi.fn(),
  })),
  resolvePlatformBootstrapFromJson: vi.fn(async () => ({
    userId: 'dev1',
    appId: 'TestApp',
  })),
}));

vi.mock('@wellsfargo-starui/data/assets/data-services-worker.mjs?url', () => ({
  default: '/mock-worker.mjs',
}));

vi.mock('@widgetstools/react-dock-manager', () => ({
  DockManagerCore: React.forwardRef(function MockDockManagerCore(
    {
      widgets,
      onWillClose,
      className,
    }: {
      widgets: Record<string, React.ComponentType<unknown>>;
      onWillClose?: (e: unknown, panelId: string) => void;
      className?: string;
    },
    ref: React.ForwardedRef<typeof mockDockHandle>,
  ) {
    React.useImperativeHandle(ref, () => mockDockHandle);

    return React.createElement(
      'div',
      { 'data-testid': 'dock-manager-core', className },
      React.createElement('div', { 'data-testid': 'widget-stats' }, React.createElement(widgets.stats)),
      React.createElement('div', { 'data-testid': 'widget-grid-a' }, React.createElement(widgets.gridA)),
      React.createElement('div', { 'data-testid': 'widget-grid-b' }, React.createElement(widgets.gridB)),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'close-provider-editor',
          onClick: () => onWillClose?.({}, 'providerEditor'),
        },
        'Close provider editor',
      ),
    );
  }),
}));

vi.mock('@widgetstools/dock-manager-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@widgetstools/dock-manager-core')>();
  return {
    ...actual,
    loadFromLocalStorage: vi.fn(() => null),
    saveToLocalStorage: vi.fn(),
    clearLocalStorage: vi.fn(),
    slateDark: { name: 'slateDark' },
    vsCodeLight: { name: 'vsCodeLight' },
  };
});

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => React.createElement('div', { 'data-testid': 'ag-grid-react' }),
}));

vi.mock('@stomp/stompjs', () => ({
  Client: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
}));
