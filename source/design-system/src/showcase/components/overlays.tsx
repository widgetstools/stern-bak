import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
  Button,
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
  Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger,
  HoverCard, HoverCardContent, HoverCardTrigger,
  Popover, PopoverContent, PopoverTrigger,
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
  Tooltip, TooltipContent, TooltipTrigger,
} from '@wellsfargo-starui/ui';
import type { ShowcaseEntry } from '../types';

export const overlaysEntries: ShowcaseEntry[] = [
  {
    id: 'dialog', name: 'Dialog', category: 'overlays',
    importLine: "import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@wellsfargo-starui/ui';",
    code: `<Dialog>
  <DialogTrigger asChild><Button>Open ticket</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Trade ticket</DialogTitle>
      <DialogDescription>Review and submit.</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>`,
    Demo: () => (
      <Dialog>
        <DialogTrigger asChild><Button variant="outline">Open ticket</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trade ticket</DialogTitle>
            <DialogDescription>Review the order and submit.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    id: 'alert-dialog', name: 'Alert Dialog', category: 'overlays',
    importLine: "import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogAction, AlertDialogCancel } from '@wellsfargo-starui/ui';",
    code: `<AlertDialog>
  <AlertDialogTrigger asChild><Button variant="destructive">Cancel all</Button></AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Cancel all orders?</AlertDialogTitle>
      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Keep</AlertDialogCancel>
      <AlertDialogAction>Cancel all</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>`,
    Demo: () => (
      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="destructive">Cancel all</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel all orders?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction>Cancel all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  },
  {
    id: 'sheet', name: 'Sheet', category: 'overlays',
    importLine: "import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@wellsfargo-starui/ui';",
    code: `<Sheet>
  <SheetTrigger asChild><Button variant="outline">Details</Button></SheetTrigger>
  <SheetContent>
    <SheetHeader><SheetTitle>Instrument</SheetTitle><SheetDescription>Reference data.</SheetDescription></SheetHeader>
  </SheetContent>
</Sheet>`,
    Demo: () => (
      <Sheet>
        <SheetTrigger asChild><Button variant="outline">Details</Button></SheetTrigger>
        <SheetContent>
          <SheetHeader><SheetTitle>Instrument</SheetTitle><SheetDescription>Reference data and analytics.</SheetDescription></SheetHeader>
        </SheetContent>
      </Sheet>
    ),
  },
  {
    id: 'drawer', name: 'Drawer', category: 'overlays',
    importLine: "import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@wellsfargo-starui/ui';",
    code: `<Drawer>
  <DrawerTrigger asChild><Button variant="outline">Open drawer</Button></DrawerTrigger>
  <DrawerContent>
    <DrawerHeader><DrawerTitle>Quick trade</DrawerTitle><DrawerDescription>Bottom sheet.</DrawerDescription></DrawerHeader>
  </DrawerContent>
</Drawer>`,
    Demo: () => (
      <Drawer>
        <DrawerTrigger asChild><Button variant="outline">Open drawer</Button></DrawerTrigger>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>Quick trade</DrawerTitle><DrawerDescription>A bottom sheet for fast entry.</DrawerDescription></DrawerHeader>
        </DrawerContent>
      </Drawer>
    ),
  },
  {
    id: 'popover', name: 'Popover', category: 'overlays',
    importLine: "import { Popover, PopoverTrigger, PopoverContent } from '@wellsfargo-starui/ui';",
    code: `<Popover>
  <PopoverTrigger asChild><Button variant="outline">Filters</Button></PopoverTrigger>
  <PopoverContent>Filter controls…</PopoverContent>
</Popover>`,
    Demo: () => (
      <Popover>
        <PopoverTrigger asChild><Button variant="outline">Filters</Button></PopoverTrigger>
        <PopoverContent className="text-[12px] text-[color:var(--ds-text-secondary)]">Filter controls go here.</PopoverContent>
      </Popover>
    ),
  },
  {
    id: 'hover-card', name: 'Hover Card', category: 'overlays',
    importLine: "import { HoverCard, HoverCardTrigger, HoverCardContent } from '@wellsfargo-starui/ui';",
    code: `<HoverCard>
  <HoverCardTrigger className="underline">AAPL</HoverCardTrigger>
  <HoverCardContent>Apple Inc — AA+ · Technology</HoverCardContent>
</HoverCard>`,
    Demo: () => (
      <HoverCard>
        <HoverCardTrigger className="cursor-default underline underline-offset-2">AAPL</HoverCardTrigger>
        <HoverCardContent className="text-[12px]">Apple Inc — AA+ · Technology · 3.25% 2030</HoverCardContent>
      </HoverCard>
    ),
  },
  {
    id: 'tooltip', name: 'Tooltip', category: 'overlays',
    importLine: "import { Tooltip, TooltipTrigger, TooltipContent } from '@wellsfargo-starui/ui';",
    code: `<Tooltip>
  <TooltipTrigger asChild><Button variant="outline">DV01</Button></TooltipTrigger>
  <TooltipContent>Dollar value of 1bp</TooltipContent>
</Tooltip>`,
    Demo: () => (
      <Tooltip>
        <TooltipTrigger asChild><Button variant="outline">DV01</Button></TooltipTrigger>
        <TooltipContent>Dollar value of a 1bp move</TooltipContent>
      </Tooltip>
    ),
  },
];
