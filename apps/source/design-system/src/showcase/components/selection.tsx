import { useState } from 'react';
import {
  Button,
  Calendar,
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarTrigger,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@wellsfargo-starui/react';
import type { ShowcaseEntry } from '../types';

function CalendarDemo() {
  const [date, setDate] = useState<Date | undefined>(undefined);
  return <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border border-[color:var(--ds-border-primary)]" />;
}

export const selectionEntries: ShowcaseEntry[] = [
  {
    id: 'select', name: 'Select', category: 'selection',
    importLine: "import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@wellsfargo-starui/react';",
    code: `<Select defaultValue="t1">
  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="t1">T+1</SelectItem>
    <SelectItem value="t2">T+2</SelectItem>
  </SelectContent>
</Select>`,
    Demo: () => (
      <Select defaultValue="t1">
        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="t1">Settle T+1</SelectItem>
          <SelectItem value="t2">Settle T+2</SelectItem>
          <SelectItem value="t3">Settle T+3</SelectItem>
        </SelectContent>
      </Select>
    ),
  },
  {
    id: 'command', name: 'Command', category: 'selection',
    importLine: "import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@wellsfargo-starui/react';",
    code: `<Command className="w-[280px] border">
  <CommandInput placeholder="Search instruments…" />
  <CommandList>
    <CommandEmpty>No results.</CommandEmpty>
    <CommandGroup heading="Bonds">
      <CommandItem>AAPL 3.25 02/30</CommandItem>
      <CommandItem>MSFT 2.4 08/26</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>`,
    Demo: () => (
      <Command className="w-[280px] rounded-md border border-[color:var(--ds-border-primary)]">
        <CommandInput placeholder="Search instruments…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Bonds">
            <CommandItem>AAPL 3.25 02/30</CommandItem>
            <CommandItem>MSFT 2.4 08/26</CommandItem>
            <CommandItem>JPM 4.25 10/27</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    ),
  },
  {
    id: 'calendar', name: 'Calendar', category: 'selection',
    importLine: "import { Calendar } from '@wellsfargo-starui/react';",
    code: `const [date, setDate] = useState<Date>();
<Calendar mode="single" selected={date} onSelect={setDate} />`,
    Demo: CalendarDemo,
  },
  {
    id: 'dropdown-menu', name: 'Dropdown Menu', category: 'selection',
    importLine: "import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@wellsfargo-starui/react';",
    code: `<DropdownMenu>
  <DropdownMenuTrigger asChild><Button variant="outline">Actions</Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>Order</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Amend</DropdownMenuItem>
    <DropdownMenuItem>Cancel</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
    Demo: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline">Actions</Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Order</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Amend</DropdownMenuItem>
          <DropdownMenuItem>Cancel</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
  {
    id: 'context-menu', name: 'Context Menu', category: 'selection',
    importLine: "import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@wellsfargo-starui/react';",
    code: `<ContextMenu>
  <ContextMenuTrigger>Right-click a row</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem>Add to watchlist</ContextMenuItem>
    <ContextMenuItem>Trade</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>`,
    Demo: () => (
      <ContextMenu>
        <ContextMenuTrigger className="flex h-16 w-[260px] items-center justify-center rounded-md border border-dashed border-[color:var(--ds-border-primary)] text-[12px] text-[color:var(--ds-text-secondary)]">
          Right-click here
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Add to watchlist</ContextMenuItem>
          <ContextMenuItem>Trade</ContextMenuItem>
          <ContextMenuItem>View analytics</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ),
  },
  {
    id: 'menubar', name: 'Menubar', category: 'selection',
    importLine: "import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from '@wellsfargo-starui/react';",
    code: `<Menubar>
  <MenubarMenu>
    <MenubarTrigger>View</MenubarTrigger>
    <MenubarContent>
      <MenubarItem>Blotter</MenubarItem>
      <MenubarSeparator />
      <MenubarItem>Analytics</MenubarItem>
    </MenubarContent>
  </MenubarMenu>
</Menubar>`,
    Demo: () => (
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Blotter</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Analytics</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Order</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>New ticket</MenubarItem>
            <MenubarItem>Cancel all</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    ),
  },
];
