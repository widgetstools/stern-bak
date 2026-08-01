import React from 'react';
import { vi } from 'vitest';

export const mockMarketsGridHandle = {
  platform: {
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
  },
};

export function installStaruiMocks() {
  vi.mock('@wellsfargo-starui/grid', () => ({
    MarketsGrid: (props: Record<string, unknown>) =>
      React.createElement('div', {
        'data-testid': 'markets-grid',
        'data-grid-id': props.gridId,
      }),
    createMarketsGridLocalStorageStorage: () => ({
      load: vi.fn(),
      save: vi.fn(),
    }),
  }));

  vi.mock('@wellsfargo-starui/core', () => ({
    marketsGridLocalStorageBundleKey: (id: string) => `bundle:${id}`,
    activeProfileKey: (id: string) => `active:${id}`,
  }));

  vi.mock('@wellsfargo-starui/design-system', () => ({
    applyTheme: vi.fn(),
    getTheme: vi.fn(() => ({ theme: 'dark' })),
    ThemeProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  }));

  vi.mock('@wellsfargo-starui/react', () => {
    const passthrough =
      (Tag: keyof JSX.IntrinsicElements = 'div') =>
      ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement(Tag, rest, children);

    return {
      Button: passthrough('button'),
      Tooltip: passthrough(),
      TooltipContent: passthrough('span'),
      TooltipProvider: passthrough(),
      TooltipTrigger: passthrough(),
      Sheet: passthrough(),
      SheetContent: passthrough(),
      SheetHeader: passthrough(),
      SheetTitle: passthrough(),
      SheetDescription: passthrough(),
      Dialog: passthrough(),
      DialogContent: passthrough(),
      DialogHeader: passthrough(),
      DialogTitle: passthrough(),
      Tabs: passthrough(),
      TabsList: passthrough(),
      TabsTrigger: passthrough('button'),
      TabsContent: passthrough(),
      Input: passthrough('input'),
      Label: passthrough('label'),
      Select: passthrough('select'),
      SelectContent: passthrough(),
      SelectItem: passthrough('option'),
      SelectTrigger: passthrough('button'),
      SelectValue: passthrough('span'),
      Badge: passthrough('span'),
      Card: passthrough(),
      CardHeader: passthrough(),
      CardTitle: passthrough('h3'),
      CardContent: passthrough(),
    };
  });

  vi.mock('ag-grid-react', () => ({
    AgGridReact: (props: Record<string, unknown>) =>
      React.createElement('div', { 'data-testid': 'ag-grid-react' }, String(props.rowData ? 'grid' : 'empty')),
  }));

  vi.mock('@widgetstools/react-dock-manager', () => ({
    DockManagerProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'dock-manager' }, children),
    useDockManager: () => ({
      api: {
        addPanel: vi.fn(),
        removePanel: vi.fn(),
      },
    }),
  }));
}
