import {
  AspectRatio,
  Avatar, AvatarFallback,
  Badge,
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious,
  Separator,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@wellsfargo-starui/ui';
import type { ShowcaseEntry } from '../types';

export const dataDisplayEntries: ShowcaseEntry[] = [
  {
    id: 'table', name: 'Table', category: 'data-display',
    importLine: "import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@wellsfargo-starui/ui';",
    code: `<Table>
  <TableHeader><TableRow><TableHead>Ticker</TableHead><TableHead>Mid</TableHead></TableRow></TableHeader>
  <TableBody>
    <TableRow><TableCell>AAPL 3.25 02/30</TableCell><TableCell>101.250</TableCell></TableRow>
  </TableBody>
</Table>`,
    Demo: () => (
      <Table className="w-[320px]">
        <TableHeader>
          <TableRow><TableHead>Ticker</TableHead><TableHead className="text-right">Mid</TableHead><TableHead className="text-right">YTM</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          <TableRow><TableCell>AAPL 3.25 02/30</TableCell><TableCell className="text-right font-[var(--ds-font-mono)]">101.250</TableCell><TableCell className="text-right font-[var(--ds-font-mono)]">3.12%</TableCell></TableRow>
          <TableRow><TableCell>MSFT 2.4 08/26</TableCell><TableCell className="text-right font-[var(--ds-font-mono)]">99.880</TableCell><TableCell className="text-right font-[var(--ds-font-mono)]">2.55%</TableCell></TableRow>
        </TableBody>
      </Table>
    ),
  },
  {
    id: 'card', name: 'Card', category: 'data-display',
    importLine: "import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@wellsfargo-starui/ui';",
    code: `<Card>
  <CardHeader><CardTitle>Total DV01</CardTitle><CardDescription>Portfolio</CardDescription></CardHeader>
  <CardContent>$284,120</CardContent>
</Card>`,
    Demo: () => (
      <Card className="w-[240px]">
        <CardHeader className="pb-2"><CardTitle className="text-[13px]">Total DV01</CardTitle><CardDescription>Portfolio risk</CardDescription></CardHeader>
        <CardContent className="font-[var(--ds-font-mono)] text-[18px] text-[color:var(--ds-text-primary)]">$284,120</CardContent>
      </Card>
    ),
  },
  {
    id: 'badge', name: 'Badge', category: 'data-display',
    importLine: "import { Badge } from '@wellsfargo-starui/ui';",
    code: `<Badge>Working</Badge>
<Badge variant="secondary">AA+</Badge>
<Badge variant="outline">T+1</Badge>
<Badge variant="destructive">Cancelled</Badge>`,
    Demo: () => (
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Working</Badge>
        <Badge variant="secondary">AA+</Badge>
        <Badge variant="outline">T+1</Badge>
        <Badge variant="destructive">Cancelled</Badge>
      </div>
    ),
  },
  {
    id: 'avatar', name: 'Avatar', category: 'data-display',
    importLine: "import { Avatar, AvatarFallback } from '@wellsfargo-starui/ui';",
    code: `<Avatar><AvatarFallback>JD</AvatarFallback></Avatar>`,
    Demo: () => (
      <div className="flex items-center gap-2">
        <Avatar><AvatarFallback>JD</AvatarFallback></Avatar>
        <Avatar><AvatarFallback>MS</AvatarFallback></Avatar>
      </div>
    ),
  },
  {
    id: 'separator', name: 'Separator', category: 'data-display',
    importLine: "import { Separator } from '@wellsfargo-starui/ui';",
    code: `<div>Bid</div>
<Separator />
<div>Ask</div>`,
    Demo: () => (
      <div className="w-[200px] text-[12px] text-[color:var(--ds-text-secondary)]">
        <div className="py-1">Bid 101.20</div>
        <Separator />
        <div className="py-1">Mid 101.25</div>
        <Separator />
        <div className="py-1">Ask 101.30</div>
      </div>
    ),
  },
  {
    id: 'aspect-ratio', name: 'Aspect Ratio', category: 'data-display',
    importLine: "import { AspectRatio } from '@wellsfargo-starui/ui';",
    code: `<AspectRatio ratio={16 / 9}>
  <div className="h-full w-full bg-[color:var(--ds-surface-secondary)]" />
</AspectRatio>`,
    Demo: () => (
      <div className="w-[240px]">
        <AspectRatio ratio={16 / 9}>
          <div className="flex h-full w-full items-center justify-center rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] text-[11px] text-[color:var(--ds-text-secondary)]">16 : 9</div>
        </AspectRatio>
      </div>
    ),
  },
  {
    id: 'carousel', name: 'Carousel', category: 'data-display',
    importLine: "import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@wellsfargo-starui/ui';",
    code: `<Carousel className="w-[200px]">
  <CarouselContent>
    <CarouselItem>Slide 1</CarouselItem>
    <CarouselItem>Slide 2</CarouselItem>
  </CarouselContent>
  <CarouselPrevious /><CarouselNext />
</Carousel>`,
    Demo: () => (
      <Carousel className="w-[200px]">
        <CarouselContent>
          {['Rates', 'Credit', 'FX'].map((s) => (
            <CarouselItem key={s}>
              <div className="flex h-20 items-center justify-center rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] text-[13px] text-[color:var(--ds-text-primary)]">{s}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    ),
  },
];
