import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import type { ThemeOptions } from '@wellsfargo-starui/design-system/apply-theme';

export const mockApplyTheme = vi.fn();
export const mockGetTheme = vi.fn((): ThemeOptions => ({ theme: 'dark' }));
export const mockMarketsGridEvents = {
  on: vi.fn((_event: string, _handler: () => void) => vi.fn()),
  off: vi.fn(),
  emit: vi.fn(),
};

const SheetOpenContext = React.createContext(false);

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

vi.mock('@wellsfargo-starui/grid', () => ({
  createStarui: () => ({
    Provider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  }),
  applyTheme: (...args: unknown[]) => mockApplyTheme(...args),
  getTheme: () => mockGetTheme(),
  StarGrid: (props: Record<string, unknown>) => {
    const onReady = props.onReady as ((handle: unknown) => void) | undefined;
    if (onReady) {
      queueMicrotask(() =>
        onReady({
          platform: { events: mockMarketsGridEvents },
        }),
      );
    }
    return React.createElement('div', {
      'data-testid': 'markets-grid',
      'data-grid-id': props.gridId,
    });
  },
}));

vi.mock('@wellsfargo-starui/core', () => ({
  marketsGridLocalStorageBundleKey: (id: string) => `markets-grid-bundle:${id}`,
  activeProfileKey: (id: string) => `active:${id}`,
}));

vi.mock('@wellsfargo-starui/react', () => {
  const passthrough =
    (Tag: keyof React.JSX.IntrinsicElements = 'div') =>
    ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(Tag, rest, children);

  const MenubarItem = ({
    children,
    onSelect,
    ...rest
  }: React.PropsWithChildren<{ onSelect?: () => void } & Record<string, unknown>>) =>
    React.createElement(
      'button',
      { type: 'button', onClick: () => onSelect?.(), ...rest },
      children,
    );

  return {
    Button: passthrough('button'),
    Tooltip: passthrough(),
    TooltipContent: passthrough('span'),
    TooltipProvider: passthrough(),
    TooltipTrigger: ({
      asChild,
      children,
      ...rest
    }: React.PropsWithChildren<{ asChild?: boolean } & Record<string, unknown>>) =>
      cloneChild(asChild, children, rest),
    Sheet: ({
      open = false,
      children,
    }: React.PropsWithChildren<{ open?: boolean; onOpenChange?: (open: boolean) => void }>) =>
      React.createElement(SheetOpenContext.Provider, { value: open }, children),
    SheetContent: ({
      children,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const open = React.useContext(SheetOpenContext);
      if (!open) return null;
      return React.createElement('div', { 'data-testid': 'sheet-content', ...rest }, children);
    },
    SheetHeader: passthrough(),
    SheetTitle: passthrough('h2'),
    SheetDescription: passthrough('p'),
    SheetTrigger: ({
      asChild,
      children,
      ...rest
    }: React.PropsWithChildren<{ asChild?: boolean } & Record<string, unknown>>) =>
      cloneChild(asChild, children, rest),
    Dialog: passthrough(),
    DialogContent: passthrough(),
    DialogHeader: passthrough(),
    DialogTitle: passthrough('h2'),
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
    Separator: passthrough('hr'),
    ScrollArea: passthrough(),
    Menubar: passthrough(),
    MenubarContent: passthrough(),
    MenubarItem,
    MenubarMenu: passthrough(),
    MenubarSeparator: passthrough('hr'),
    MenubarShortcut: passthrough('span'),
    MenubarTrigger: passthrough('button'),
  };
});
