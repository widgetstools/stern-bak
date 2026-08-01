import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import type { ValueFormatterParams, ValueGetterParams } from 'ag-grid-community';
import type { ThemeOptions } from '@wellsfargo-starui/design-system';
import type { StorageAdapterFactory } from '@wellsfargo-starui/grid';

export const mockApplyTheme = vi.fn();
export const mockGetTheme = vi.fn((): ThemeOptions => ({ theme: 'dark' }));

export const mockGridApi = {
  applyTransactionAsync: vi.fn((tx: unknown, cb?: () => void) => cb?.()),
  setGridOption: vi.fn(),
  getRowNode: vi.fn(() => null),
};

export const mockMarketsGridHandle = {
  gridApi: mockGridApi,
  setConfig: vi.fn().mockResolvedValue(undefined),
  platform: {
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
  },
};

export const mockProviderStream = {
  refresh: vi.fn(),
  status: 'ready' as const,
};

let providerOnDelta: ((rows: unknown[], replace: boolean) => void) | undefined;

export const mockStreamControls = {
  emitDelta(rows: unknown[], replace = false) {
    providerOnDelta?.(rows, replace);
  },
  reset() {
    mockGridApi.applyTransactionAsync.mockClear();
    mockGridApi.setGridOption.mockClear();
    mockMarketsGridHandle.setConfig.mockClear().mockResolvedValue(undefined);
    mockProviderStream.refresh.mockClear();
    providerOnDelta = undefined;
  },
};

function cloneChild(
  asChild: boolean | undefined,
  children: React.ReactNode,
  props: Record<string, unknown>,
) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, props);
  }
  return React.createElement('button', { type: 'button', ...props }, children);
}

const LabTabsContext = React.createContext<{
  tab: string;
  setTab: (next: string) => void;
}>({
  tab: 'what',
  setTab: () => {},
});

vi.mock('./globals.css', () => ({}));

vi.mock('@wellsfargo-starui/design-system', () => ({
  applyTheme: (...args: unknown[]) => mockApplyTheme(...args),
  getTheme: () => mockGetTheme(),
  ThemeProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@wellsfargo-starui/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/core')>();
  return {
    ...actual,
    marketsGridLocalStorageBundleKey: (id: string) => `bundle:${id}`,
    activeProfileKey: (id: string) => `active:${id}`,
    RESERVED_DEFAULT_PROFILE_ID: '__default__',
  };
});

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: Record<string, unknown>) => {
    React.useEffect(() => {
      const onReady = props.onReady as ((handle: typeof mockMarketsGridHandle) => void) | undefined;
      onReady?.(mockMarketsGridHandle);
    }, [props.onReady]);
    return React.createElement('div', {
      'data-testid': 'markets-grid',
      'data-grid-id': props.gridId,
      'data-component-name': props.componentName,
    });
  },
  // The real helper returns a StorageAdapterFactory FUNCTION (per-grid
  // adapter factory), not an adapter object — mirror that shape honestly.
  createMarketsGridLocalStorageStorage: (): StorageAdapterFactory => () => ({
    loadProfile: vi.fn(async () => null),
    saveProfile: vi.fn(async () => undefined),
    deleteProfile: vi.fn(async () => undefined),
    listProfiles: vi.fn(async () => []),
  }),
}));

vi.mock('@wellsfargo-starui/data', () => ({
  ensurePlatformReady: vi.fn(async () => ({
    client: {},
    appData: {},
    configManager: { init: vi.fn() },
    ready: Promise.resolve(),
    dispose: vi.fn(),
  })),
  resolvePlatformBootstrapFromJson: vi.fn(async () => ({
    userId: 'lab-user',
    appId: 'MarketsGridLab',
  })),
}));

vi.mock('@wellsfargo-starui/data/assets/data-services-worker.mjs?url', () => ({
  default: '/mock-worker.mjs',
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useProviderStream: vi.fn(
    (_providerId: string, _cfg: unknown, handlers: { onDelta?: typeof providerOnDelta }) => {
      providerOnDelta = handlers.onDelta;
      return mockProviderStream;
    },
  ),
  DataHubProvider: ({
    children,
    platform,
  }: {
    children: React.ReactNode;
    platform?: unknown;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'data-hub-provider', 'data-has-platform': String(!!platform) },
      children,
    ),
}));

vi.mock('@wellsfargo-starui/react', () => {
  const passthrough =
    (Tag: keyof React.JSX.IntrinsicElements = 'div') =>
    ({
      children,
      onClick,
      onChange,
      onValueChange,
      onCheckedChange,
      onOpenChange,
      checked,
      value,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(
        Tag,
        {
          ...rest,
          value,
          checked,
          onClick:
            onClick ??
            (onCheckedChange
              ? () => (onCheckedChange as (v: boolean) => void)(!checked)
              : undefined),
          onChange:
            onChange ??
            (onValueChange
              ? (e: React.ChangeEvent<HTMLInputElement>) =>
                  (onValueChange as (v: string) => void)(e.target.value)
              : undefined),
        },
        children,
      );

  const SheetOpenContext = React.createContext(false);

  return {
    Alert: passthrough(),
    AlertDescription: passthrough('p'),
    AlertTitle: passthrough('h2'),
    Badge: passthrough('span'),
    Button: passthrough('button'),
    Card: passthrough(),
    CardContent: passthrough(),
    CardHeader: passthrough(),
    CardTitle: passthrough('h3'),
    Collapsible: ({
      open = true,
      children,
      onOpenChange,
    }: React.PropsWithChildren<{ open?: boolean; onOpenChange?: (v: boolean) => void }>) =>
      React.createElement(
        'div',
        { 'data-testid': 'collapsible', 'data-open': String(open) },
        React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<{ onClick?: () => void }>, {
                onClick: () => onOpenChange?.(!open),
              })
            : child,
        ),
      ),
    CollapsibleContent: passthrough('div'),
    CollapsibleTrigger: passthrough('button'),
    Input: passthrough('input'),
    Label: passthrough('label'),
    ScrollArea: passthrough('div'),
    Select: passthrough('select'),
    SelectContent: passthrough(),
    SelectItem: passthrough('option'),
    SelectTrigger: passthrough('button'),
    SelectValue: passthrough('span'),
    Separator: passthrough('hr'),
    Sheet: ({
      open = false,
      children,
    }: React.PropsWithChildren<{ open?: boolean; onOpenChange?: (v: boolean) => void }>) =>
      React.createElement(
        SheetOpenContext.Provider,
        { value: open },
        React.createElement('div', { 'data-testid': 'sheet', 'data-open': String(open) }, children),
      ),
    SheetContent: ({
      children,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const open = React.useContext(SheetOpenContext);
      if (!open) return null;
      return React.createElement('div', { 'data-testid': 'sheet-content', ...rest }, children);
    },
    SheetDescription: passthrough('p'),
    SheetHeader: passthrough(),
    SheetTitle: passthrough('h2'),
    SheetTrigger: ({
      asChild,
      children,
      ...rest
    }: React.PropsWithChildren<{ asChild?: boolean } & Record<string, unknown>>) =>
      cloneChild(asChild, children, rest),
    Slider: ({
      value,
      onValueChange,
      ...rest
    }: {
      value?: number[];
      onValueChange?: (v: number[]) => void;
    } & Record<string, unknown>) =>
      React.createElement('input', {
        type: 'range',
        'data-testid': rest['data-testid'],
        value: value?.[0] ?? 500,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onValueChange?.([Number(e.target.value)]),
      }),
    Switch: ({
      checked,
      onCheckedChange,
      id,
      ...rest
    }: {
      checked?: boolean;
      onCheckedChange?: (v: boolean) => void;
      id?: string;
    } & Record<string, unknown>) =>
      React.createElement('input', {
        type: 'checkbox',
        id,
        checked,
        'data-testid': rest['data-testid'],
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onCheckedChange?.(e.target.checked),
      }),
    Tabs: ({
      children,
      value,
      onValueChange,
      defaultValue,
    }: React.PropsWithChildren<{
      value?: string;
      defaultValue?: string;
      onValueChange?: (v: string) => void;
    }>) => {
      const [tab, setTab] = React.useState(value ?? defaultValue ?? 'what');
      React.useEffect(() => {
        if (value != null) setTab(value);
      }, [value]);
      const ctx = React.useMemo(
        () => ({
          tab,
          setTab: (next: string) => {
            setTab(next);
            onValueChange?.(next);
          },
        }),
        [tab, onValueChange],
      );
      return React.createElement(
        LabTabsContext.Provider,
        { value: ctx },
        React.createElement('div', { 'data-testid': 'tabs', 'data-value': tab }, children),
      );
    },
    TabsContent: ({
      children,
      value,
    }: React.PropsWithChildren<{ value: string }>) => {
      const ctx = React.useContext(LabTabsContext);
      return ctx.tab === value
        ? React.createElement('div', { 'data-testid': `tab-panel-${value}` }, children)
        : null;
    },
    TabsList: passthrough('div'),
    TabsTrigger: ({
      children,
      value,
      ...rest
    }: React.PropsWithChildren<{ value: string }>) => {
      const ctx = React.useContext(LabTabsContext);
      return React.createElement(
        'button',
        {
          type: 'button',
          ...rest,
          onClick: () => ctx.setTab(value),
        },
        children,
      );
    },
    Tooltip: passthrough(),
    TooltipContent: passthrough('span'),
    TooltipProvider: passthrough(),
    TooltipTrigger: ({
      asChild,
      children,
      ...rest
    }: React.PropsWithChildren<{ asChild?: boolean } & Record<string, unknown>>) =>
      cloneChild(asChild, children, rest),
  };
});

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'ag-grid-react' }, JSON.stringify(props.rowData ?? [])),
}));

vi.mock('ag-grid-community', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ag-grid-community')>();
  return {
    ...actual,
    ModuleRegistry: { registerModules: vi.fn() },
  };
});

export type MockFormatterParams = ValueFormatterParams;
export type MockGetterParams = ValueGetterParams;
