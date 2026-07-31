import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import {
  Button,
  Collapsible, CollapsibleContent, CollapsibleTrigger,
  ResizableHandle, ResizablePanel, ResizablePanelGroup,
  ScrollArea,
} from '@wellsfargo-starui/ui';
import type { ShowcaseEntry } from '../types';

function CollapsibleDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-[260px]">
      <div className="flex items-center justify-between rounded-md border border-[color:var(--ds-border-primary)] px-3 py-2 text-[12px]">
        <span>Risk decomposition</span>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6"><ChevronsUpDown size={14} /></Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-1 rounded-md border border-[color:var(--ds-border-primary)] px-3 py-2 text-[12px] text-[color:var(--ds-text-secondary)]">
        DV01 by sector, KRD curve, convexity…
      </CollapsibleContent>
    </Collapsible>
  );
}

export const layoutEntries: ShowcaseEntry[] = [
  {
    id: 'collapsible', name: 'Collapsible', category: 'layout',
    importLine: "import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@wellsfargo-starui/ui';",
    code: `<Collapsible>
  <CollapsibleTrigger>Toggle</CollapsibleTrigger>
  <CollapsibleContent>Hidden detail…</CollapsibleContent>
</Collapsible>`,
    Demo: CollapsibleDemo,
  },
  {
    id: 'scroll-area', name: 'Scroll Area', category: 'layout',
    importLine: "import { ScrollArea } from '@wellsfargo-starui/ui';",
    code: `<ScrollArea className="h-32 w-[240px]">
  …long content…
</ScrollArea>`,
    Demo: () => (
      <ScrollArea className="h-32 w-[240px] rounded-md border border-[color:var(--ds-border-primary)] p-3">
        <div className="flex flex-col gap-1 text-[12px] text-[color:var(--ds-text-secondary)]">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i}>Fill #{i + 1} · 1,000,000 @ {(101 + i * 0.01).toFixed(3)}</div>
          ))}
        </div>
      </ScrollArea>
    ),
  },
  {
    id: 'resizable', name: 'Resizable', category: 'layout',
    importLine: "import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@wellsfargo-starui/ui';",
    code: `<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel>Left</ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel>Right</ResizablePanel>
</ResizablePanelGroup>`,
    Demo: () => (
      <ResizablePanelGroup orientation="horizontal" className="h-24 w-[300px] rounded-md border border-[color:var(--ds-border-primary)]">
        <ResizablePanel defaultSize={50} className="flex items-center justify-center text-[12px] text-[color:var(--ds-text-secondary)]">Blotter</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} className="flex items-center justify-center text-[12px] text-[color:var(--ds-text-secondary)]">Ticket</ResizablePanel>
      </ResizablePanelGroup>
    ),
  },
];
