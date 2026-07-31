/*
 * Design-system showcase — exercises @wellsfargo-starui/ui components against
 * the blue-slate token set. This page is the visual-review surface:
 * if a token swap regresses something, you see it here first.
 *
 * Rendered under ?view=design-system (see App.tsx for routing).
 */

import {
  Badge,
  Button,
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
  Checkbox,
  Input,
  Label,
  Progress,
  Slider,
  Switch,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@wellsfargo-starui/ui';
import { ArrowUp, ArrowDown, AlertCircle, CheckCircle2, Info, Plus, Search } from 'lucide-react';

export function DesignSystem() {
  return (
    <div className="min-h-full overflow-auto" style={{ background: 'var(--ds-surface-ground)' }}>
      <div className="mx-auto max-w-6xl px-8 py-10 flex flex-col gap-12">
        <Header />
        <Section title="Buttons" eyebrow="01 · CTA + chrome">
          <ButtonGallery />
        </Section>
        <Section title="Badges" eyebrow="02 · Status chips">
          <BadgeGallery />
        </Section>
        <Section title="Cards" eyebrow="03 · Surfaces & elevation">
          <CardGallery />
        </Section>
        <Section title="Form controls" eyebrow="04 · Inputs">
          <FormGallery />
        </Section>
        <Section title="Tabs" eyebrow="05 · Navigation">
          <TabsGallery />
        </Section>
        <Section title="Typography & numerics" eyebrow="06 · Type scale + tabular-nums">
          <TypeGallery />
        </Section>
        <Section title="Surface scale" eyebrow="07 · 6-tier pewter / paper">
          <SurfaceGallery />
        </Section>
      </div>
    </div>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────────

function Header() {
  return (
    <div className="flex flex-col gap-2 border-b pb-6" style={{ borderColor: 'var(--ds-border-primary)' }}>
      <span
        className="text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: 'var(--ds-accent-info)' }}
      >
        StarUI · slate trading palette
      </span>
      <h1 className="text-[40px] font-bold tracking-tight" style={{ color: 'var(--ds-text-primary)' }}>
        Design system
      </h1>
      <p className="text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--ds-text-muted)' }}>
        Industrial-cool pewter chrome with a sapphire brand accent. Trade semantics
        (mint-teal up / rose down) stay palette-locked. Toggle dark/light from the header
        to verify both modes.
      </p>
    </div>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: 'var(--ds-text-muted)' }}
        >
          {eyebrow}
        </span>
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--ds-text-primary)' }}>
          {title}
        </h2>
      </div>
      <div
        className="rounded-md border p-6"
        style={{
          background: 'var(--ds-surface-primary)',
          borderColor: 'var(--ds-border-primary)',
          boxShadow: 'var(--ds-elevation-card)',
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--ds-text-muted)' }}>
        {label}
      </Label>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

// ─── Galleries ────────────────────────────────────────────────────────────

function ButtonGallery() {
  return (
    <div className="flex flex-col gap-6">
      <Row label="Variants — default size (34px)">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
      </Row>
      <Row label="Sizes — sm 28 · default 34 · lg 40">
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
        <Button size="icon"><Plus size={14} /></Button>
      </Row>
      <Row label="With icons">
        <Button><Plus size={14} /> New order</Button>
        <Button variant="outline"><Search size={14} /> Search</Button>
        <Button variant="ghost"><AlertCircle size={14} /> Help</Button>
      </Row>
      <Row label="Disabled">
        <Button disabled>Primary</Button>
        <Button disabled variant="outline">Outline</Button>
        <Button disabled variant="destructive">Destructive</Button>
      </Row>
    </div>
  );
}

function BadgeGallery() {
  return (
    <div className="flex flex-col gap-6">
      <Row label="Variants">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
      </Row>
      <Row label="Status chips (trade-locked semantics)">
        <Badge
          className="border-transparent"
          style={{
            background: 'var(--ds-overlay-positive-soft)',
            color: 'var(--ds-accent-positive)',
            border: '1px solid var(--ds-overlay-positive-ring)',
          }}
        >
          <ArrowUp size={9} /> Filled
        </Badge>
        <Badge
          className="border-transparent"
          style={{
            background: 'var(--ds-overlay-warning-soft)',
            color: 'var(--ds-accent-warning)',
            border: '1px solid var(--ds-overlay-warning-ring)',
          }}
        >
          Partial
        </Badge>
        <Badge
          className="border-transparent"
          style={{
            background: 'var(--ds-overlay-info-soft)',
            color: 'var(--ds-accent-info)',
            border: '1px solid var(--ds-overlay-info-ring)',
          }}
        >
          <Info size={9} /> Pending
        </Badge>
        <Badge
          className="border-transparent"
          style={{
            background: 'var(--ds-overlay-negative-soft)',
            color: 'var(--ds-accent-negative)',
            border: '1px solid var(--ds-overlay-negative-ring)',
          }}
        >
          <ArrowDown size={9} /> Rejected
        </Badge>
        <Badge
          className="border-transparent"
          style={{
            background: 'var(--ds-overlay-neutral-soft)',
            color: 'var(--ds-text-muted)',
            border: '1px solid var(--ds-overlay-neutral-ring)',
          }}
        >
          Cancelled
        </Badge>
      </Row>
    </div>
  );
}

function CardGallery() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Order ticket</CardTitle>
          <CardDescription>Submit a new equity order to the desk.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--ds-text-muted)' }}>Symbol</span>
              <span className="ds-mono text-sm font-semibold" style={{ color: 'var(--ds-text-primary)' }}>AAPL</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--ds-text-muted)' }}>Quantity</span>
              <span className="ds-mono text-sm font-semibold" style={{ color: 'var(--ds-text-primary)' }}>1,000</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--ds-text-muted)' }}>Limit price</span>
              <span className="ds-mono text-sm font-semibold" style={{ color: 'var(--ds-text-primary)' }}>186.40</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" size="sm">Reset</Button>
          <Button size="sm" style={{ background: 'var(--ds-action-buy-bg)', color: 'var(--ds-action-buy-fg)' }}>
            Submit BUY
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Position P/L</CardTitle>
          <CardDescription>Realised + unrealised across all books.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-[28px] ds-mono font-bold tracking-tight" style={{ color: 'var(--ds-accent-positive)' }}>
            +$12,847.23
          </div>
          <div className="ds-mono text-xs mt-1" style={{ color: 'var(--ds-text-muted)' }}>
            +2.14% on $600,000
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Day&apos;s loss</CardTitle>
          <CardDescription>Realised drawdown — risk-managed.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-[28px] ds-mono font-bold tracking-tight" style={{ color: 'var(--ds-accent-negative)' }}>
            −$3,421.08
          </div>
          <div className="ds-mono text-xs mt-1" style={{ color: 'var(--ds-text-muted)' }}>
            −0.57% on $600,000
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FormGallery() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div className="flex flex-col gap-2">
        <Label className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--ds-text-muted)' }}>
          Symbol
        </Label>
        <Input placeholder="AAPL" />
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--ds-text-muted)' }}>
          Limit price
        </Label>
        <Input type="number" defaultValue="186.40" className="ds-mono" />
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id="allOrNone" />
        <Label htmlFor="allOrNone" className="text-sm" style={{ color: 'var(--ds-text-primary)' }}>
          All or none
        </Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="live" defaultChecked />
        <Label htmlFor="live" className="text-sm" style={{ color: 'var(--ds-text-primary)' }}>
          Live ticking
        </Label>
      </div>
      <div className="flex flex-col gap-2 col-span-full">
        <Label className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--ds-text-muted)' }}>
          Quantity slice
        </Label>
        <Slider defaultValue={[60]} max={100} step={1} />
      </div>
      <div className="flex flex-col gap-2 col-span-full">
        <Label className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--ds-text-muted)' }}>
          Execution progress
        </Label>
        <Progress value={72} />
      </div>
      <div className="col-span-full">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">
                <CheckCircle2 size={12} /> Hover for tooltip
              </Button>
            </TooltipTrigger>
            <TooltipContent>Themed tooltip surface (tertiary tier).</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

function TabsGallery() {
  return (
    <Tabs defaultValue="trades" className="w-full">
      <TabsList>
        <TabsTrigger value="trades">Trades</TabsTrigger>
        <TabsTrigger value="positions">Positions</TabsTrigger>
        <TabsTrigger value="orders">Open orders</TabsTrigger>
      </TabsList>
      <TabsContent value="trades" className="text-sm pt-4" style={{ color: 'var(--ds-text-muted)' }}>
        Trade blotter content goes here.
      </TabsContent>
      <TabsContent value="positions" className="text-sm pt-4" style={{ color: 'var(--ds-text-muted)' }}>
        Position blotter content goes here.
      </TabsContent>
      <TabsContent value="orders" className="text-sm pt-4" style={{ color: 'var(--ds-text-muted)' }}>
        Open-orders table content goes here.
      </TabsContent>
    </Tabs>
  );
}

function TypeGallery() {
  const sizes = [
    { tok: '3xl', label: 'KPI',     sample: '+12.34%',       cssSize: 'var(--ds-font-size-3xl)' },
    { tok: '2xl', label: 'Headline', sample: 'Order ticket', cssSize: 'var(--ds-font-size-2xl)' },
    { tok: 'xl', label: 'Panel',    sample: 'Position blotter', cssSize: 'var(--ds-font-size-xl)' },
    { tok: 'lg', label: 'Card',     sample: 'AAPL · Apple Inc.', cssSize: 'var(--ds-font-size-lg)' },
    { tok: 'md', label: 'Body',     sample: 'Submit a new equity order.', cssSize: 'var(--ds-font-size-md)' },
    { tok: 'sm', label: 'Cell',     sample: '186.40 / 1,000 / 186,400', cssSize: 'var(--ds-font-size-sm)' },
    { tok: 'xs', label: 'Caption',  sample: '20:11:21 · T-582951', cssSize: 'var(--ds-font-size-xs)' },
    { tok: '2xs', label: 'Micro',   sample: 'PARTIAL · FILLED · CANCELLED', cssSize: 'var(--ds-font-size-2xs)' },
  ];
  return (
    <div className="flex flex-col gap-3">
      {sizes.map(({ tok, label, sample, cssSize }) => (
        <div key={tok} className="grid grid-cols-[80px_80px_1fr] items-baseline gap-4 border-b pb-2" style={{ borderColor: 'var(--ds-border-primary)' }}>
          <span className="text-[10px] uppercase tracking-[0.06em]" style={{ color: 'var(--ds-text-muted)' }}>
            {tok}
          </span>
          <span className="text-[10px] uppercase tracking-[0.06em]" style={{ color: 'var(--ds-text-muted)' }}>
            {label}
          </span>
          <span
            className="ds-mono"
            style={{ fontSize: cssSize, color: 'var(--ds-text-primary)', fontFamily: tok.startsWith('5') || tok.startsWith('4') || tok.startsWith('3') ? 'var(--ds-font-mono)' : undefined }}
          >
            {sample}
          </span>
        </div>
      ))}
    </div>
  );
}

function SurfaceGallery() {
  const tiers: Array<[string, string]> = [
    ['ground',     'var(--ds-surface-ground)'],
    ['sunken',     'var(--ds-surface-sunken)'],
    ['primary',    'var(--ds-surface-primary)'],
    ['secondary',  'var(--ds-surface-secondary)'],
    ['tertiary',   'var(--ds-surface-tertiary)'],
    ['quaternary', 'var(--ds-surface-quaternary)'],
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {tiers.map(([label, bg]) => (
        <div
          key={label}
          className="h-20 rounded border flex flex-col items-center justify-center text-[10px] uppercase tracking-[0.08em]"
          style={{ background: bg, borderColor: 'var(--ds-border-primary)', color: 'var(--ds-text-muted)' }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
