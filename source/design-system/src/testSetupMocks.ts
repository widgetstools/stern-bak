import React from 'react';
import '@testing-library/jest-dom/vitest';
import { Controller } from 'react-hook-form';
import { vi } from 'vitest';

export const mockApplyTheme = vi.fn();
export const mockGetTheme = vi.fn(() => ({ theme: 'dark' as const }));
export const mockToast = vi.fn();

const SheetOpenContext = React.createContext(false);
const TabsContext = React.createContext<{ value?: string; onValueChange?: (v: string) => void }>({});

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

const passthrough =
  (Tag: keyof React.JSX.IntrinsicElements = 'div') =>
  ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement(Tag, rest, children);

export const mockDockHandle = {
  getApi: vi.fn(() => ({
    hasPanel: vi.fn(() => false),
    closePanel: vi.fn(),
    addPanel: vi.fn(),
    floatPanel: vi.fn(),
    updatePanel: vi.fn(),
    bringToFront: vi.fn(),
  })),
  getState: vi.fn(() => ({ panels: new Map(), layout: {}, placements: new Map() })),
};

vi.mock('@wellsfargo-starui/design-system', () => ({
  applyTheme: (...args: unknown[]) => mockApplyTheme(...args),
  getTheme: () => mockGetTheme(),
  ThemeProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@wellsfargo-starui/design-system/adapters/ag-grid', () => ({
  staruiGridTheme: { name: 'staruiGridTheme' },
  agGridBlotterDarkTheme: { name: 'agGridBlotterDarkTheme' },
}));

vi.mock('@wellsfargo-starui/react', () => {
  const Form = ({
    children,
    ...rest
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('div', { 'data-testid': 'form', ...rest }, children);

  const FormField = ({
    render,
    control,
    name,
  }: {
    render: (ctx: { field: { value: unknown; onChange: (v: unknown) => void } }) => React.ReactNode;
    control?: unknown;
    name?: string;
  }) =>
    React.createElement(Controller as never, { control, name, render });

  return {
    Alert: passthrough(),
    AlertDescription: passthrough('p'),
    AlertTitle: passthrough('h2'),
    Badge: passthrough('span'),
    Button: passthrough('button'),
    ButtonGroup: passthrough(),
    Card: passthrough(),
    CardContent: passthrough(),
    CardHeader: passthrough(),
    CardTitle: passthrough('h3'),
    Checkbox: passthrough('input'),
    Collapsible: passthrough(),
    CollapsibleContent: passthrough(),
    CollapsibleTrigger: passthrough('button'),
    Dialog: passthrough(),
    DialogContent: passthrough(),
    DialogDescription: passthrough('p'),
    DialogHeader: passthrough(),
    DialogTitle: passthrough('h2'),
    DialogTrigger: passthrough('button'),
    Form,
    FormControl: passthrough(),
    FormDescription: passthrough('p'),
    FormField,
    FormItem: passthrough(),
    FormLabel: passthrough('label'),
    FormMessage: passthrough('span'),
    Input: passthrough('input'),
    Label: passthrough('label'),
    Popover: passthrough(),
    PopoverContent: passthrough(),
    PopoverTrigger: passthrough('button'),
    Progress: passthrough(),
    RadioGroup: passthrough(),
    RadioGroupItem: passthrough('input'),
    ScrollArea: passthrough(),
    Select: ({
      children,
      value,
      onValueChange,
    }: React.PropsWithChildren<{ value?: string; onValueChange?: (v: string) => void }>) =>
      React.createElement(
        'select',
        {
          'data-testid': 'select',
          value,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(e.target.value),
        },
        children,
      ),
    SelectContent: passthrough(),
    SelectItem: ({
      children,
      value,
    }: React.PropsWithChildren<{ value: string }>) =>
      React.createElement('option', { value }, children),
    SelectTrigger: passthrough('button'),
    SelectValue: passthrough('span'),
    Separator: passthrough('hr'),
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
    SheetDescription: passthrough('p'),
    SheetHeader: passthrough(),
    SheetTitle: passthrough('h2'),
    SheetTrigger: ({
      asChild,
      children,
      ...rest
    }: React.PropsWithChildren<{ asChild?: boolean } & Record<string, unknown>>) =>
      cloneChild(asChild, children, rest),
    Switch: passthrough('input'),
    Tabs: ({
      children,
      value,
      defaultValue,
      onValueChange,
    }: React.PropsWithChildren<{
      value?: string;
      defaultValue?: string;
      onValueChange?: (v: string) => void;
    }>) => {
      const [internal, setInternal] = React.useState(value ?? defaultValue);
      const active = value ?? internal;
      const setActive = (next: string) => {
        if (value === undefined) setInternal(next);
        onValueChange?.(next);
      };
      return React.createElement(
        TabsContext.Provider,
        { value: { value: active, onValueChange: setActive } },
        React.createElement('div', { 'data-testid': 'tabs' }, children),
      );
    },
    TabsContent: ({
      children,
      value,
    }: React.PropsWithChildren<{ value: string }>) => {
      const ctx = React.useContext(TabsContext);
      if (ctx.value && ctx.value !== value) return null;
      return React.createElement('div', { 'data-testid': `tab-${value}` }, children);
    },
    TabsList: passthrough(),
    TabsTrigger: ({
      children,
      value,
      ...rest
    }: React.PropsWithChildren<{ value: string } & Record<string, unknown>>) => {
      const ctx = React.useContext(TabsContext);
      return React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': rest['data-testid'] ?? `tab-trigger-${value}`,
          onClick: () => ctx.onValueChange?.(value),
          ...rest,
        },
        children,
      );
    },
    Textarea: passthrough('textarea'),
    Toast: passthrough(),
    Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
    toast: (...args: unknown[]) => mockToast(...args),
    Toggle: passthrough('button'),
    ToggleGroup: ({
      children,
      onValueChange,
      value,
    }: React.PropsWithChildren<{ onValueChange?: (v: string) => void; value?: string }>) =>
      React.createElement(
        'div',
        { 'data-testid': 'toggle-group', 'data-value': value },
        React.Children.map(children, (child) =>
          React.isValidElement<{ value?: string; onClick?: () => void }>(child)
            ? React.cloneElement(child, {
                onClick: () => onValueChange?.(child.props.value ?? ''),
              })
            : child,
        ),
      ),
    ToggleGroupItem: ({
      children,
      value,
      onClick,
      ...rest
    }: React.PropsWithChildren<{ value?: string; onClick?: () => void } & Record<string, unknown>>) =>
      React.createElement(
        'button',
        { type: 'button', 'data-value': value, onClick, ...rest },
        children,
      ),
    Tooltip: passthrough(),
    TooltipContent: passthrough('span'),
    TooltipProvider: passthrough(),
    TooltipTrigger: ({
      asChild,
      children,
      ...rest
    }: React.PropsWithChildren<{ asChild?: boolean } & Record<string, unknown>>) =>
      cloneChild(asChild, children, rest),
    AlertDialog: passthrough(),
    AlertDialogAction: passthrough('button'),
    AlertDialogCancel: passthrough('button'),
    AlertDialogContent: passthrough(),
    AlertDialogDescription: passthrough('p'),
    AlertDialogFooter: passthrough(),
    AlertDialogHeader: passthrough(),
    AlertDialogTitle: passthrough('h2'),
    AlertDialogTrigger: passthrough('button'),
    Accordion: passthrough(),
    AccordionContent: passthrough(),
    AccordionItem: passthrough(),
    AccordionTrigger: passthrough('button'),
    AspectRatio: passthrough(),
    Avatar: passthrough(),
    AvatarFallback: passthrough('span'),
    Breadcrumb: passthrough('nav'),
    BreadcrumbItem: passthrough('li'),
    BreadcrumbLink: passthrough('a'),
    BreadcrumbList: passthrough('ol'),
    BreadcrumbPage: passthrough('span'),
    BreadcrumbSeparator: passthrough('span'),
    Calendar: passthrough(),
    CardDescription: passthrough('p'),
    Carousel: passthrough(),
    CarouselContent: passthrough(),
    CarouselItem: passthrough(),
    CarouselNext: passthrough('button'),
    CarouselPrevious: passthrough('button'),
    Command: passthrough(),
    CommandEmpty: passthrough(),
    CommandGroup: passthrough(),
    CommandInput: passthrough('input'),
    CommandItem: passthrough('button'),
    CommandList: passthrough(),
    ContextMenu: passthrough(),
    ContextMenuContent: passthrough(),
    ContextMenuItem: passthrough('button'),
    ContextMenuTrigger: passthrough('button'),
    Drawer: passthrough(),
    DrawerContent: passthrough(),
    DrawerDescription: passthrough('p'),
    DrawerHeader: passthrough(),
    DrawerTitle: passthrough('h2'),
    DrawerTrigger: passthrough('button'),
    DropdownMenu: passthrough(),
    DropdownMenuContent: passthrough(),
    DropdownMenuItem: passthrough('button'),
    DropdownMenuLabel: passthrough('span'),
    DropdownMenuSeparator: passthrough('hr'),
    DropdownMenuTrigger: passthrough('button'),
    HoverCard: passthrough(),
    HoverCardContent: passthrough(),
    HoverCardTrigger: passthrough('button'),
    InputOTP: passthrough('div'),
    InputOTPGroup: passthrough('div'),
    InputOTPSlot: passthrough('div'),
    Menubar: passthrough(),
    MenubarContent: passthrough(),
    MenubarItem: passthrough('button'),
    MenubarMenu: passthrough(),
    MenubarSeparator: passthrough('hr'),
    MenubarTrigger: passthrough('button'),
    NavigationMenu: passthrough(),
    NavigationMenuContent: passthrough(),
    NavigationMenuItem: passthrough('li'),
    NavigationMenuLink: passthrough('a'),
    NavigationMenuList: passthrough('ul'),
    NavigationMenuTrigger: passthrough('button'),
    Pagination: passthrough('nav'),
    PaginationContent: passthrough(),
    PaginationEllipsis: passthrough('span'),
    PaginationItem: passthrough('li'),
    PaginationLink: passthrough('a'),
    PaginationNext: passthrough('a'),
    PaginationPrevious: passthrough('a'),
    ResizableHandle: passthrough(),
    ResizablePanel: passthrough(),
    ResizablePanelGroup: passthrough(),
    Skeleton: passthrough(),
    Slider: passthrough('input'),
    Table: passthrough('table'),
    TableBody: passthrough('tbody'),
    TableCell: passthrough('td'),
    TableHead: passthrough('th'),
    TableHeader: passthrough('thead'),
    TableRow: passthrough('tr'),
    useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
  };
});

vi.mock('@wellsfargo-starui/react/chart', () => ({
  ChartContainer: ({
    children,
    className,
  }: React.PropsWithChildren<{ className?: string; config?: unknown }>) =>
    React.createElement('div', { 'data-testid': 'chart-container', className }, children),
  ChartTooltip: ({ children }: React.PropsWithChildren<Record<string, unknown>>) =>
    children ?? null,
  ChartTooltipContent: () => React.createElement('div', { 'data-testid': 'chart-tooltip-content' }),
}));

vi.mock('@widgetstools/react-dock-manager', () => ({
  DockManagerCore: React.forwardRef(function MockDockManagerCore(
    {
      widgets,
      initialState,
      onStateChange,
      theme,
      className,
    }: {
      widgets: Record<string, React.ComponentType<unknown>>;
      initialState?: unknown;
      onStateChange?: (s: unknown) => void;
      theme?: string;
      className?: string;
    },
    ref: React.ForwardedRef<typeof mockDockHandle>,
  ) {
    React.useImperativeHandle(ref, () => mockDockHandle);
    React.useEffect(() => {
      if (initialState && onStateChange) onStateChange(initialState);
    }, [initialState, onStateChange]);

    const widgetKeys = Object.keys(widgets);
    return React.createElement(
      'div',
      { 'data-testid': 'dock-manager-core', 'data-theme': theme, className },
      widgetKeys.map((key) =>
        React.createElement(
          'div',
          { key, 'data-testid': `widget-${key}` },
          React.createElement(widgets[key], {}),
        ),
      ),
    );
  }),
}));

vi.mock('@widgetstools/dock-manager-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@widgetstools/dock-manager-core')>();
  return {
    ...actual,
    serialize: vi.fn((state: unknown) => JSON.stringify(state)),
    deserialize: vi.fn((raw: unknown) => ({ state: raw })),
  };
});

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({
    rowData,
    onRowClicked,
    columnDefs,
    getRowStyle,
  }: {
    rowData?: Array<{ id?: string; side?: string }>;
    onRowClicked?: (e: { data?: { id?: string } }) => void;
    columnDefs?: Array<{
      valueFormatter?: (p: { value: number | null }) => string;
      valueGetter?: (p: { data?: unknown }) => unknown;
      cellStyle?: ((p: { value?: unknown; data?: { side?: string } }) => Record<string, string>) | Record<string, string>;
    }>;
    getRowStyle?: (p: { data?: { id?: string } }) => Record<string, string> | undefined;
  }) => {
    columnDefs?.forEach((col) => {
      col.valueFormatter?.({ value: 1.234 });
      col.valueFormatter?.({ value: null });
      col.valueGetter?.({ data: rowData?.[0] });
      if (typeof col.cellStyle === 'function') {
        col.cellStyle({ value: 0.5 });
        col.cellStyle({ value: -0.5, data: { side: 'buy' } });
      }
    });
    getRowStyle?.({ data: rowData?.[0] });
    return React.createElement(
      'div',
      { 'data-testid': 'ag-grid-react' },
      rowData?.map((row, i) =>
        React.createElement(
          'button',
          {
            key: row.id ?? i,
            type: 'button',
            'data-testid': `grid-row-${row.id ?? i}`,
            onClick: () => onRowClicked?.({ data: row }),
          },
          row.id ?? `row-${i}`,
        ),
      ),
    );
  },
}));

vi.mock('ag-grid-community', () => ({
  ModuleRegistry: { registerModules: vi.fn() },
  AllCommunityModule: {},
}));

const chartEl =
  (tag: string) =>
  ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('div', { 'data-testid': tag, ...rest }, children);

vi.mock('recharts', () => ({
  ResponsiveContainer: chartEl('ResponsiveContainer'),
  AreaChart: chartEl('AreaChart'),
  Area: chartEl('Area'),
  BarChart: chartEl('BarChart'),
  Bar: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('div', { 'data-testid': 'Bar', ...rest }, children),
  LineChart: chartEl('LineChart'),
  Line: chartEl('Line'),
  PieChart: chartEl('PieChart'),
  Pie: chartEl('Pie'),
  Cell: chartEl('Cell'),
  ScatterChart: chartEl('ScatterChart'),
  Scatter: chartEl('Scatter'),
  XAxis: ({
    tickFormatter,
    ...rest
  }: React.PropsWithChildren<{ tickFormatter?: (v: string) => string } & Record<string, unknown>>) => {
    tickFormatter?.('CREDIT-IG');
    tickFormatter?.('UNKNOWN-BOOK');
    return React.createElement('div', { 'data-testid': 'XAxis', ...rest });
  },
  YAxis: ({
    tickFormatter,
    ...rest
  }: React.PropsWithChildren<{ tickFormatter?: (v: number) => string } & Record<string, unknown>>) => {
    tickFormatter?.(-150_000);
    tickFormatter?.(0);
    return React.createElement('div', { 'data-testid': 'YAxis', ...rest });
  },
  ZAxis: chartEl('ZAxis'),
  CartesianGrid: chartEl('CartesianGrid'),
  Legend: chartEl('Legend'),
  Tooltip: chartEl('Tooltip'),
  ReferenceLine: chartEl('ReferenceLine'),
  LabelList: ({
    formatter,
    ...rest
  }: React.PropsWithChildren<{ formatter?: (v: unknown) => string } & Record<string, unknown>>) => {
    formatter?.(42);
    return React.createElement('div', { 'data-testid': 'LabelList', ...rest });
  },
}));
