import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
  NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger,
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@wellsfargo-starui/react';
import type { ShowcaseEntry } from '../types';

export const navigationEntries: ShowcaseEntry[] = [
  {
    id: 'tabs', name: 'Tabs', category: 'navigation',
    importLine: "import { Tabs, TabsList, TabsTrigger, TabsContent } from '@wellsfargo-starui/react';",
    code: `<Tabs defaultValue="bid">
  <TabsList>
    <TabsTrigger value="bid">Bid</TabsTrigger>
    <TabsTrigger value="ask">Ask</TabsTrigger>
  </TabsList>
  <TabsContent value="bid">Bids…</TabsContent>
  <TabsContent value="ask">Asks…</TabsContent>
</Tabs>`,
    Demo: () => (
      <Tabs defaultValue="bid" className="w-[260px]">
        <TabsList>
          <TabsTrigger value="bid">Bid</TabsTrigger>
          <TabsTrigger value="ask">Ask</TabsTrigger>
        </TabsList>
        <TabsContent value="bid" className="text-[12px] text-[color:var(--ds-text-secondary)]">Bid ladder…</TabsContent>
        <TabsContent value="ask" className="text-[12px] text-[color:var(--ds-text-secondary)]">Ask ladder…</TabsContent>
      </Tabs>
    ),
  },
  {
    id: 'accordion', name: 'Accordion', category: 'navigation',
    importLine: "import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@wellsfargo-starui/react';",
    code: `<Accordion type="single" collapsible>
  <AccordionItem value="a"><AccordionTrigger>Credit themes</AccordionTrigger><AccordionContent>…</AccordionContent></AccordionItem>
</Accordion>`,
    Demo: () => (
      <Accordion type="single" collapsible className="w-[300px]">
        <AccordionItem value="a"><AccordionTrigger>Credit themes</AccordionTrigger><AccordionContent className="text-[12px]">IG spreads tightening into year-end.</AccordionContent></AccordionItem>
        <AccordionItem value="b"><AccordionTrigger>Rates outlook</AccordionTrigger><AccordionContent className="text-[12px]">Curve steepening expected.</AccordionContent></AccordionItem>
      </Accordion>
    ),
  },
  {
    id: 'navigation-menu', name: 'Navigation Menu', category: 'navigation',
    importLine: "import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuTrigger, NavigationMenuContent, NavigationMenuLink } from '@wellsfargo-starui/react';",
    code: `<NavigationMenu>
  <NavigationMenuList>
    <NavigationMenuItem>
      <NavigationMenuTrigger>Markets</NavigationMenuTrigger>
      <NavigationMenuContent>
        <NavigationMenuLink>Rates</NavigationMenuLink>
        <NavigationMenuLink>Credit</NavigationMenuLink>
      </NavigationMenuContent>
    </NavigationMenuItem>
  </NavigationMenuList>
</NavigationMenu>`,
    Demo: () => (
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Markets</NavigationMenuTrigger>
            <NavigationMenuContent>
              <div className="flex w-[180px] flex-col gap-1 p-2 text-[12px]">
                <NavigationMenuLink>Rates</NavigationMenuLink>
                <NavigationMenuLink>Credit</NavigationMenuLink>
                <NavigationMenuLink>FX</NavigationMenuLink>
              </div>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    ),
  },
  {
    id: 'breadcrumb', name: 'Breadcrumb', category: 'navigation',
    importLine: "import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@wellsfargo-starui/react';",
    code: `<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem><BreadcrumbLink href="#">Markets</BreadcrumbLink></BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem><BreadcrumbPage>Credit</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`,
    Demo: () => (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="#">Markets</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="#">Credit</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>AAPL 3.25 02/30</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ),
  },
  {
    id: 'pagination', name: 'Pagination', category: 'navigation',
    importLine: "import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@wellsfargo-starui/react';",
    code: `<Pagination>
  <PaginationContent>
    <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
    <PaginationItem><PaginationLink href="#" isActive>1</PaginationLink></PaginationItem>
    <PaginationItem><PaginationLink href="#">2</PaginationLink></PaginationItem>
    <PaginationItem><PaginationEllipsis /></PaginationItem>
    <PaginationItem><PaginationNext href="#" /></PaginationItem>
  </PaginationContent>
</Pagination>`,
    Demo: () => (
      <Pagination>
        <PaginationContent>
          <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
          <PaginationItem><PaginationLink href="#" isActive>1</PaginationLink></PaginationItem>
          <PaginationItem><PaginationLink href="#">2</PaginationLink></PaginationItem>
          <PaginationItem><PaginationEllipsis /></PaginationItem>
          <PaginationItem><PaginationNext href="#" /></PaginationItem>
        </PaginationContent>
      </Pagination>
    ),
  },
];
