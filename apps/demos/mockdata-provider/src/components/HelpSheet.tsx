import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Badge,
  Separator,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@wellsfargo-starui/ui';
import {
  BookOpen,
  Database,
  Columns3,
  Plug,
  Layers,
  ExternalLink,
} from 'lucide-react';

interface HelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpSheet({ open, onOpenChange }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-ground)] p-0 sm:max-w-[680px]"
      >
        <SheetHeader className="space-y-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-5 py-4">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="flex items-center gap-2 font-mono text-[14px] tracking-tight text-[color:var(--ds-text-primary)]">
              <BookOpen size={14} strokeWidth={1.75} className="text-[color:var(--ds-accent-info)]" />
              MockDataProvider · usage guide
            </SheetTitle>
            <Badge className="border-transparent bg-[color:var(--ds-overlay-info-soft)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-info)]">
              Demo app
            </Badge>
          </div>
          <SheetDescription className="text-[12px] leading-relaxed text-[color:var(--ds-text-muted)]">
            Configure a synthetic provider, attach it to MarketsGrid two
            ways, and persist each grid's layout via the built-in profile
            system.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="quickstart" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-4 grid w-[calc(100%-2.5rem)] grid-cols-5 bg-[color:var(--ds-surface-sunken)]">
            <Trigger value="quickstart" label="Quick start" />
            <Trigger value="config"     label="Provider" />
            <Trigger value="columns"    label="Columns" />
            <Trigger value="wiring"     label="Wiring" />
            <Trigger value="layouts"    label="Layouts" />
          </TabsList>

          <Pane value="quickstart"><QuickStart /></Pane>
          <Pane value="config"><ProviderConfigDocs /></Pane>
          <Pane value="columns"><ColumnDocs /></Pane>
          <Pane value="wiring"><WiringDocs /></Pane>
          <Pane value="layouts"><LayoutDocs /></Pane>
        </Tabs>

        <Separator className="bg-[color:var(--ds-border-primary)]" />
        <div className="flex items-center justify-between gap-2 bg-[color:var(--ds-surface-primary)] px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ds-text-faint)]">
            Press <Kbd>Ctrl + /</Kbd> to toggle this panel
          </span>
          <a
            href="https://github.com/nndrao/starui"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-text-secondary)] hover:text-[color:var(--ds-accent-info)]"
          >
            <ExternalLink size={11} strokeWidth={1.75} />
            View on GitHub
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Trigger({ value, label }: { value: string; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
    >
      {label}
    </TabsTrigger>
  );
}

function Pane({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent
      value={value}
      className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
    >
      <ScrollArea className="flex-1 px-5 py-4">{children}</ScrollArea>
    </TabsContent>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────

function QuickStart() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="What this demo shows" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <Prose>
          A four-panel workspace for learning <Code>MockDataProvider</Code>.
          The left panel edits the provider config; two MarketsGrid panels
          render the same stream wired two different ways; the bottom strip
          shows live throughput.
        </Prose>
      </Section>

      <Section title="The four panels" icon={<Layers size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="Provider config" desc="Pick dataType, rowCount, updateIntervalMs, and enableUpdates. Edits propagate to both grids; the JSON preview updates live." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Direct startMock" desc="Calls startMock(cfg, emit) directly in the same module. Simplest wiring." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="via DataServices" desc="Uses useDataProvider() from DataHubProvider. Production wiring." />
        <ItemRow icon={<Columns3 size={13} strokeWidth={1.75} />} name="Live stats" desc="Rolling 5-second tick rate, row count, and last-update timestamp for each grid." />
      </Section>

      <Section title="Try it" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <Step n={1}>Set dataType to <Code>trades</Code> in the Provider Config panel. Both grids remount and show the trade book.</Step>
        <Step n={2}>Drag the <strong>updateIntervalMs</strong> slider to <Code>250</Code>. Watch ticks/s climb in the Stats strip.</Step>
        <Step n={3}>Open the gear icon in either grid → Conditional styling → add a rule. Hit the disk to save it as a layout. Switch dataType and back — your layout returns.</Step>
      </Section>

      <Section title="Keyboard shortcuts" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <ShortcutTable>
          <ShortcutRow keys="Ctrl + /"  label="Toggle this help drawer" />
          <ShortcutRow keys="Ctrl + ."  label="Switch theme (dark / light)" />
          <ShortcutRow keys="Ctrl + 1"  label="dataType = positions" />
          <ShortcutRow keys="Ctrl + 2"  label="dataType = trades" />
          <ShortcutRow keys="Ctrl + 3"  label="dataType = orders" />
        </ShortcutTable>
      </Section>
    </div>
  );
}

function ProviderConfigDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="MockProviderConfig" icon={<Database size={12} strokeWidth={1.75} />}>
        <Prose>
          The shape passed to <Code>startMock()</Code> or to
          <Code>useDataProvider()</Code>. All fields are optional except
          <Code>providerType</Code>.
        </Prose>
        <CodeBlock>
{`type MockProviderConfig = {
  providerType: 'mock';
  dataType?: 'positions' | 'trades' | 'orders';
  rowCount?: number;
  updateIntervalMs?: number;
  enableUpdates?: boolean;
};`}
        </CodeBlock>
      </Section>

      <Section title="Fields" icon={<Database size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="providerType: 'mock'" desc="Always 'mock'. The DataServices hub uses this to route the cfg to the mock transport." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="dataType" desc="'positions' (default, ~250-field bond portfolio) · 'trades' (lifecycle state machine, joins to positions by cusip) · 'orders' (legacy 7-column generator)." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="rowCount" desc="Snapshot size. Defaults: 50 (orders), 200 (trades), full universe size (positions). Values > universe cycle the universe." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="updateIntervalMs" desc="Ticker cadence. Each tick mutates 1–4% of the snapshot (positions/trades) or 1 random row (orders)." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="enableUpdates" desc="Pause/resume the ticker without resetting the snapshot. The grid keeps the data it has." />
      </Section>
    </div>
  );
}

function ColumnDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Column defs by dataType" icon={<Columns3 size={12} strokeWidth={1.75} />}>
        <Prose>
          AG-Grid column defs. Each demo column-def set targets the field
          names emitted by the matching mock builder.
        </Prose>
        <CodeBlock>
{`// data/columnDefsByType.ts
export const columnDefsByType = {
  positions: { columnDefs: positionColumnDefs, rowIdField: 'cusip',   defaultColDef },
  trades:    { columnDefs: tradeColumnDefs,    rowIdField: 'tradeId', defaultColDef },
  orders:    { columnDefs: orderColumnDefs,    rowIdField: 'id',      defaultColDef },
};`}
        </CodeBlock>
      </Section>

      <Section title="rowIdField" icon={<Columns3 size={12} strokeWidth={1.75} />}>
        <Prose>
          MarketsGrid needs a stable id per row so deltas merge cleanly.
          Positions are unique per <Code>cusip</Code>; trades per
          <Code>tradeId</Code>; orders use the synthetic <Code>id</Code>.
        </Prose>
      </Section>

      <Section title="Formatting" icon={<Columns3 size={12} strokeWidth={1.75} />}>
        <Prose>
          Money fields use thousands-grouped <Code>Intl.NumberFormat</Code>;
          prices use 3 decimals; yields append <Code>%</Code>; timestamps
          render as local <Code>HH:mm:ss</Code>. All editable later from the
          formatter toolbar — these defaults exist so the grid looks
          plausible on first render.
        </Prose>
      </Section>
    </div>
  );
}

function WiringDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Shared input — the live MockProviderConfig" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          Both panels read the same <Code>cfg</Code> object from
          <Code>MockConfigContext</Code>. Anything you change in the
          Provider Config panel propagates to both grids. The cfg
          identity is stable across no-op writes so neither panel
          re-attaches needlessly.
        </Prose>
        <CodeBlock>
{`// What MockConfigContext gives both panels:
{
  providerType: 'mock',
  dataType:         'positions' | 'trades' | 'orders',
  rowCount:         50 | 200 | 1000,
  updateIntervalMs: 250 – 3000,
  enableUpdates:    true | false,
}`}
        </CodeBlock>
      </Section>

      <Section title="Side-by-side — what each panel adds" icon={<Plug size={12} strokeWidth={1.75} />}>
        <CompareTable>
          <CompareRow
            label="cfg used"
            direct="cfg as-is from MockConfigContext"
            ds="cfg + keyColumn (the hub indexes its cache by it; rows missing the field are dropped)"
          />
          <CompareRow
            label="Where the provider runs"
            direct="In-process, same module, same event loop as the React tree"
            ds="In a SharedWorker (one per appName), reachable from every tab/window"
          />
          <CompareRow
            label="Lifecycle owner"
            direct="The panel — useEffect → startMock(cfg, emit) → cleanup calls handle.stop()"
            ds="The hub — useDataProvider attaches by providerId; the hub serves catalog configs and late-joins subscribers"
          />
          <CompareRow
            label="Boot prerequisite"
            direct="None — startMock is a pure function"
            ds="Wrap <App /> in <DataHubProvider platform={...}> after initPlatformBootstrap() in main.tsx"
          />
          <CompareRow
            label="API surface"
            direct="startMock(cfg, emit) → ProviderHandle { stop, restart }"
            ds="useDataProvider(providerId) → { provider, status, restart } with onSnapshotData / onTick listeners"
          />
          <CompareRow
            label="Snapshot delivery"
            direct="emit({ rows, replace: true }) once, then per-tick emit({ rows }) deltas"
            ds="Same shape over the wire — first emit on attach is always replace=true, then live deltas"
          />
          <CompareRow
            label="Restart semantics"
            direct="handle.restart(extra) overlays extra onto cfg + re-emits"
            ds="Hook re-runs when cfg identity changes; hub sees the new cfg and starts a new provider (or LATE-JOINER if providerId already running)"
          />
        </CompareTable>
      </Section>

      <Section title="Direct panel — the actual code" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          What <Code>DirectGridPanel.tsx</Code> ships in this demo.
          No keyColumn, no provider context.
        </Prose>
        <CodeBlock>
{`import { startMock } from '@wellsfargo-starui/host-data';

const { cfg } = useMockConfig();
const { columnDefs, rowIdField } = columnDefsByType[cfg.dataType];

useEffect(() => {
  rowsRef.current = [];
  setRows([]);

  // cfg passed straight through — no keyColumn needed; the
  // emit callback never goes through the hub's row cache.
  handleRef.current = startMock(cfg, (evt) => {
    if ('rows' in evt) {
      if (evt.replace) rowsRef.current = [...evt.rows];
      else rowsRef.current = applyDelta(
        rowsRef.current, evt.rows, rowIdField,
      );
      setRows(rowsRef.current);
    }
  });

  return () => handleRef.current?.stop();
}, [cfg, rowIdField]);`}
        </CodeBlock>
      </Section>

      <Section title="DataServices panel — the actual code" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          What <Code>DataServicesGridPanel.tsx</Code> ships. The hub path
          attaches by <Code>providerId</Code>; cfg overrides (e.g.
          <Code>keyColumn</Code>) can still be passed on first attach when
          not yet in the catalog.
        </Prose>
        <CodeBlock>
{`import { useDataProvider } from '@wellsfargo-starui/host-data-react/runtime';

const providerId = \`mock-\${cfg.dataType}\`;
const { provider, status } = useDataProvider(providerId, { autoStart: true });

useEffect(() => {
  if (!provider) return;
  return provider.onSnapshotData((rows) => setRows([...rows]));
}, [provider]);

useEffect(() => {
  if (!provider) return;
  return provider.onTick((tick) => {
    setRows((prev) => applyDelta(prev, tick.rows, rowIdField));
  });
}, [provider, rowIdField]);`}
        </CodeBlock>
      </Section>

      <Section title="Platform bootstrap — what main.tsx adds" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          The DataServices path loads <Code>public/app-config.json</Code>,
          calls <Code>ensurePlatformReady()</Code>, and wraps the tree in
          <Code>{`<DataHubProvider>`}</Code>. Identity (<Code>appId</Code>,
          <Code>userId</Code>) comes from bootstrap config — not hardcoded
          literals.
        </Prose>
        <CodeBlock>
{`// public/app-config.json
{ "appId": "mockdata-provider-starui-app", "userId": "dev1", "useRest": false }

// src/platformBootstrap.ts
const config = await resolvePlatformBootstrapFromJson('/app-config.json');
const platform = await ensurePlatformReady(config, { workerScriptUrl });

// src/main.tsx
<DataHubProvider platform={platform} userId={config.userId}>
  <App />
</DataHubProvider>`}
        </CodeBlock>
      </Section>

      <Section title="When to pick each" icon={<Plug size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Pick Direct when…" desc="You only need one provider in a single tab, you want zero infra, you're embedding in a test, or your provider config doesn't need to be saved as a named entity." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Pick DataServices when…" desc="Multiple panels or windows share the same provider, you need cross-tab broadcast (one provider instance feeds N tabs), or you want provider configs to round-trip through the ConfigManager." />
      </Section>

      <Section title="Lifecycle (identical for both paths)" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          Every provider emits <Code>status: 'loading'</Code> immediately,
          pushes its initial snapshot with <Code>replace: true</Code>,
          transitions to <Code>status: 'ready'</Code>, then starts ticking.
          <Code>stop()</Code> is idempotent.
          <Code>restart(extra)</Code> overlays new fields on the current
          cfg and re-emits.
        </Prose>
      </Section>
    </div>
  );
}

function CompareTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--ds-border-primary)]">
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="bg-[color:var(--ds-surface-sunken)]">
            <th className="w-[130px] border-r border-[color:var(--ds-border-primary)] px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-text-faint)]">
              Aspect
            </th>
            <th className="w-1/2 border-r border-[color:var(--ds-border-primary)] px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-accent-info)]">
              Direct
            </th>
            <th className="w-1/2 px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-accent-info)]">
              DataServices
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--ds-border-primary)]">
          {children}
        </tbody>
      </table>
    </div>
  );
}

function CompareRow({ label, direct, ds }: { label: string; direct: string; ds: string }) {
  return (
    <tr className="bg-[color:var(--ds-surface-primary)] align-top">
      <td className="border-r border-[color:var(--ds-border-primary)] px-3 py-2 font-mono text-[10.5px] font-semibold text-[color:var(--ds-text-primary)]">
        {label}
      </td>
      <td className="border-r border-[color:var(--ds-border-primary)] px-3 py-2 leading-relaxed text-[color:var(--ds-text-secondary)]">
        {direct}
      </td>
      <td className="px-3 py-2 leading-relaxed text-[color:var(--ds-text-secondary)]">
        {ds}
      </td>
    </tr>
  );
}

function LayoutDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="One bundle per (panel × dataType)" icon={<Layers size={12} strokeWidth={1.75} />}>
        <Prose>
          Each MarketsGrid uses a <Code>gridId</Code> that encodes both
          the panel and the dataType, so its profile bundle is independent.
        </Prose>
        <CodeBlock>
{`Direct panel        →  mockdata-direct-<dataType>-v1
DataServices panel  →  mockdata-via-ds-<dataType>-v1`}
        </CodeBlock>
        <Prose>
          Six combinations → six independent <Code>localStorage</Code>
          bundles. Saving a layout in "Direct + positions" leaves
          "Direct + trades" untouched.
        </Prose>
      </Section>

      <Section title="What gets saved" icon={<Layers size={12} strokeWidth={1.75} />}>
        <Prose>
          Every formatter setting, every customizer module's state, and
          AG-Grid's column model (visibility, order, width, sort, filter
          model) are bundled into a named layout. Switching layouts via
          the dropdown replays each module's state in order; AG-Grid's
          state always runs last.
        </Prose>
      </Section>

      <Section title="Storage keys" icon={<Layers size={12} strokeWidth={1.75} />}>
        <div className="rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-secondary)]">
          <div>markets-grid-bundle:mockdata-direct-positions-v1</div>
          <div>markets-grid-bundle:mockdata-direct-trades-v1</div>
          <div>markets-grid-bundle:mockdata-direct-orders-v1</div>
          <div>markets-grid-bundle:mockdata-via-ds-positions-v1</div>
          <div>markets-grid-bundle:mockdata-via-ds-trades-v1</div>
          <div>markets-grid-bundle:mockdata-via-ds-orders-v1</div>
        </div>
      </Section>
    </div>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
        <span className="inline-flex">{icon}</span>
        {title}
      </h3>
      <div className="flex flex-col gap-2 pl-1">{children}</div>
    </section>
  );
}

function ItemRow({ icon, name, desc }: { icon: ReactNode; name: string; desc: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-2.5">
      <span className="mt-[3px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] text-[color:var(--ds-text-secondary)]">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12px] font-semibold text-[color:var(--ds-text-primary)]">{name}</span>
        <span className="text-[11.5px] leading-relaxed text-[color:var(--ds-text-muted)]">{desc}</span>
      </div>
    </div>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">{children}</p>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-[1px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold text-[color:var(--ds-accent-info)]">
        {n}
      </span>
      <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">{children}</p>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-1.5 py-[1px] font-mono text-[11px] text-[color:var(--ds-text-secondary)]">{children}</code>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-primary)]">{children}</pre>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-1.5 py-[1px] font-mono text-[10px] font-medium text-[color:var(--ds-text-primary)] shadow-[0_1px_0_0_var(--ds-border-primary)]">{children}</kbd>
  );
}

function ShortcutTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--ds-border-primary)]">
      <table className="w-full text-[12px]">
        <tbody className="divide-y divide-[color:var(--ds-border-primary)]">{children}</tbody>
      </table>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <tr className="bg-[color:var(--ds-surface-primary)]">
      <td className="w-[110px] border-r border-[color:var(--ds-border-primary)] px-3 py-2 align-middle">
        <Kbd>{keys}</Kbd>
      </td>
      <td className="px-3 py-2 text-[12px] text-[color:var(--ds-text-secondary)]">{label}</td>
    </tr>
  );
}
