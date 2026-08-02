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
} from '@wellsfargo-starui/react';
import {
  BookOpen,
  Database,
  Plug,
  Layers,
  GitCompareArrows,
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
              DataProvider Editor + ConfigBrowser
            </SheetTitle>
            <Badge className="border-transparent bg-[color:var(--ds-overlay-info-soft)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-info)]">
              Composition demo
            </Badge>
          </div>
          <SheetDescription className="text-[12px] leading-relaxed text-[color:var(--ds-text-muted)]">
            Open the editor from <strong>View → Provider Editor</strong>,
            author a config (Mock/STOMP/REST/AppData), pick it in either
            grid → both grids subscribe through one SharedWorker hub.
            Inspect every Dexie row in <strong>View → Config Browser</strong>.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="quickstart" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-4 grid w-[calc(100%-2.5rem)] grid-cols-4 bg-[color:var(--ds-surface-sunken)]">
            <Trigger value="quickstart" label="Quick start" />
            <Trigger value="editor"     label="Editor" />
            <Trigger value="grid"       label="Hosted grid" />
            <Trigger value="compared"   label="vs manual" />
          </TabsList>

          <Pane value="quickstart"><QuickStart /></Pane>
          <Pane value="editor"><EditorDocs /></Pane>
          <Pane value="grid"><HostedGridDocs /></Pane>
          <Pane value="compared"><ComparedDocs /></Pane>
        </Tabs>

        <Separator className="bg-[color:var(--ds-border-primary)]" />
        <div className="flex items-center justify-between gap-2 bg-[color:var(--ds-surface-primary)] px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ds-text-faint)]">
            Press <Kbd>Ctrl + /</Kbd> to toggle this panel
          </span>
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
          A workspace built entirely from pre-shipped StarUI components.
          Two MarketsGrid panels docked side-by-side; a Provider Editor
          and a Config Browser summoned on demand as floating, non-
          dockable windows from a shadcn Menubar. Zero hand-rolled
          provider-config state, zero <Code>useProviderStream</Code> /
          <Code>applyDelta</Code> plumbing — the whole demo is
          composition. Layout, theme, provider configs, and per-grid
          state all persist through reload.
        </Prose>
      </Section>

      <Section title="The workspace at a glance" icon={<Layers size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Grid A + Grid B (docked)" desc="Two independent <HostedMarketsGrid /> instances split horizontally. Each has its own profile bundle and picker state; both share the same DataServices client (one SharedWorker hub fans out to both)." />
        <ItemRow icon={<BookOpen size={13} strokeWidth={1.75} />} name="Live stats (bottom strip)" desc="Reads each grid's persisted picker state from localStorage and echoes the active providerId per side." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="Provider Editor (floating, on demand)" desc="Open from View → Provider Editor. Floats as a non-dockable window — drag/resize, but can't be docked into the workspace tree. Renders <DataProviderEditor /> from @wellsfargo-starui/grid/widgets." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="Config Browser (floating, on demand)" desc="Open from View → Config Browser. Same floating semantics. Renders <ConfigBrowserPanel /> from @wellsfargo-starui/grid/config-browser — inspects every Dexie table the platform writes to." />
      </Section>

      <Section title="Header controls" icon={<Layers size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="View ▾" desc="Menubar entry with checkbox items for Provider Editor and Config Browser. Click to summon → floats at a default position. Click again (or X the floating window) to close." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Save layout" desc="Persists the current dock state (splits, sizes, active tabs, open floating windows + their positions) to localStorage under the key `dataprovider-editor-starui-app:dock-layout:v3`." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Reset layout" desc="Confirms, clears the saved blob, reloads to defaults." />
        <ItemRow icon={<BookOpen size={13} strokeWidth={1.75} />} name="Help · Theme" desc="Toggle this drawer and dark/light theme respectively." />
      </Section>

      <Section title="Try it (end-to-end flow)" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <Step n={1}>Click <strong>View → Provider Editor</strong>. The editor opens as a floating window. Click <Code>+ Create</Code>, name it <Code>Demo Positions</Code>, pick <Code>Mock</Code> as the transport. Set <Code>dataType: positions</Code>, <Code>rowCount: 200</Code>, <Code>updateIntervalMs: 750</Code>, <Code>enableUpdates: on</Code>.</Step>
        <Step n={2}>Switch to the <strong>Columns</strong> tab inside the editor. Click <Code>Infer fields</Code> (runs probeMock for Mock, probeStomp for STOMP, probeRest for REST). Pick <Code>id</Code> as the <Code>keyColumn</Code> — without this the hub silently drops every row. Save.</Step>
        <Step n={3}>In <strong>Grid A</strong>'s toolbar dropdown (top of the grid), pick "Demo Positions". 200 rows of positions populate within ~500 ms; ticks land every 750 ms.</Step>
        <Step n={4}>Pick the <strong>same</strong> config in <strong>Grid B</strong>. Rows appear instantly from the hub's cache — same provider instance, two consumers.</Step>
        <Step n={5}>Click <strong>View → Config Browser</strong>. The <Code>appConfig</Code> table shows the row you saved, with <Code>componentType: 'data-provider'</Code> and the Mock payload inline.</Step>
        <Step n={6}>Drag the splitter between the two grids, resize the floating editor, hit <strong>Save layout</strong>. Reload — everything (dock arrangement, floating window positions, each grid's picker selection, each grid's MarketsGrid profile) survives.</Step>
      </Section>

      <Section title="Keyboard shortcuts" icon={<BookOpen size={12} strokeWidth={1.75} />}>
        <ShortcutTable>
          <ShortcutRow keys="Ctrl + /"  label="Toggle this help drawer" />
          <ShortcutRow keys="Ctrl + ."  label="Switch theme (dark / light)" />
        </ShortcutTable>
      </Section>

      <Section title="Persistence map" icon={<Database size={12} strokeWidth={1.75} />}>
        <Prose>
          Four independent layers of persistence. They never collide
          and can be wiped individually.
        </Prose>
        <CompareTable>
          <CompareRow
            label="Provider configs"
            manual="IndexedDB · marketsui-config / appConfig"
            composed="Written by the editor. Visible across both grids' dropdowns and via the Config Browser."
          />
          <CompareRow
            label="Per-grid picker + profile"
            manual="localStorage · markets-grid-bundle:dataprovider-editor-demo-a (and -demo-b)"
            composed="Written by MarketsGridContainer's gridLevelData. Stores the active live/historical providerId, mode, and the grid's profile state."
          />
          <CompareRow
            label="Dock layout"
            manual="localStorage · dataprovider-editor-starui-app:dock-layout:v3"
            composed="Written when you click Save layout. Restored on every page load via loadFromLocalStorage()."
          />
          <CompareRow
            label="Theme"
            manual="localStorage · @wellsfargo-starui/design-system theme key"
            composed="Written when you click the theme button. Restored via applyTheme(getTheme()) at boot."
          />
        </CompareTable>
      </Section>
    </div>
  );
}

function EditorDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="The component" icon={<Database size={12} strokeWidth={1.75} />}>
        <Prose>
          <Code>{`<DataProviderEditor userId={LOGGED_IN_USER_ID} initialProviderId={...} onClose={...} />`}</Code> from
          <Code>@wellsfargo-starui/grid/widgets/provider-editor</Code>. Self-contained:
          a list sidebar (left), a tabbed form (right), create/delete dialogs.
          Requires only <Code>{`<DataHubProvider>`}</Code> in the tree —
          no other context.
        </Prose>
      </Section>

      <Section title="Tabs inside the editor" icon={<Database size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="General" desc="Provider name, description, tags, isPublic visibility, isDefault toggle." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="Connection" desc="Transport-specific fields. For Mock: dataType, rowCount, updateIntervalMs, enableUpdates. For Stomp/Rest: URL, topic, message body, etc." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="Columns" desc="Click 'Infer fields' (runs the transport's probe) → see emitted fields → pick the keyColumn (single or composite). Required for streaming — the hub indexes its row cache by keyColumn and drops rows that don't resolve a value." />
        <ItemRow icon={<Database size={13} strokeWidth={1.75} />} name="Diagnostics" desc="Test connection, view recent emits, inspect resolved cfg with brackets substituted." />
      </Section>

      <Section title="Where it saves" icon={<Database size={12} strokeWidth={1.75} />}>
        <Prose>
          IndexedDB database <Code>marketsui-config</Code>, table
          <Code>appConfig</Code>. Visibility: public → <Code>userId: 'system'</Code>;
          private → <Code>userId: 'dev1'</Code> (from <Code>app-config.json</Code> bootstrap).
        </Prose>
        <CodeBlock>
{`{
  configId: "dp-<uuid>",
  appId:         "TestApp",
  userId:        "dev1" | "system",
  displayText:   "Demo Positions",
  componentType: "data-provider",
  componentSubType: "mock",
  payload: {
    providerType: "mock",
    dataType: "positions",
    rowCount: 200,
    updateIntervalMs: 750,
    enableUpdates: true,
    keyColumn: "id",
  },
  createdBy, updatedBy, creationTime, updatedTime, ...
}`}
        </CodeBlock>
      </Section>
    </div>
  );
}

function HostedGridDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="The component" icon={<Plug size={12} strokeWidth={1.75} />}>
        <Prose>
          <Code>{`<HostedMarketsGrid />`}</Code> from
          <Code>@wellsfargo-starui/grid/widgets/hosted</Code> is a wrapping shell
          that owns identity (instanceId / appId / userId), resolves a
          ConfigManager, mounts <Code>{`<DataHubProvider>`}</Code>
          if needed, picks an AG-Grid theme, and delegates to
          <Code>MarketsGridContainer</Code>.
        </Prose>
      </Section>

      <Section title="What the container auto-handles" icon={<Plug size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Picker UI inside the grid" desc="ProviderToolbar mounts in MarketsGrid's headerExtras slot — a dropdown listing every saved DataProvider config, plus mode toggle (Live / Hist), refresh, edit." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Subscribe by id" desc="When the user picks a config, the container calls useDataProviderConfig(id) → useResolvedCfg(cfg) → dpClient.subscribe(id, cfg). No consumer code." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Snapshot + delta application" desc="First emit (replace: true) becomes setRowData; subsequent deltas become applyTransactionAsync({ add, update }) — collected during snapshot phase and flushed after." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Picker persistence" desc="The active providerId (and historical-mode date, mode toggle) live in the grid's profile bundle under gridLevelData. Refresh the page and the picker re-selects." />
      </Section>

      <Section title="In this demo" icon={<Plug size={12} strokeWidth={1.75} />}>
        <CodeBlock>
{`<HostedMarketsGrid
  componentName="Grid A"
  defaultInstanceId="dataprovider-editor-demo-a"
  defaultUserId="dev1"
  withStorage
  configManager={getPlatform().configManager}
  onEditProvider={(providerId) => { ... bring editor to front ... }}
  showFiltersToolbar
  showFormattingToolbar
  showEditingToolbar
  showProfileSelector
  showSaveButton
  showSettingsButton
  sideBar={{ toolPanels: ['columns', 'filters'] }}
  statusBar={{ statusPanels: [...] }}
/>`}
        </CodeBlock>
        <Prose>
          Grid B is the same component with a different
          <Code>defaultInstanceId</Code> (<Code>...-demo-b</Code>) — its
          profile bundle and picker selection are independent, but it
          shares the same DataServices client (one SharedWorker hub).
          Picking the same config in both grids demonstrates the
          single-provider / multi-consumer broadcast property.
        </Prose>
      </Section>
    </div>
  );
}

function ComparedDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Side-by-side" icon={<GitCompareArrows size={12} strokeWidth={1.75} />}>
        <Prose>
          The same dataset, the same SharedWorker hub, two very
          different consumer surfaces.
        </Prose>
        <CompareTable>
          <CompareRow
            label="Provider config UI"
            manual="Hand-rolled MockConfigContext + ProviderConfigPanel (RadioGroup, Slider, Switch)"
            composed="<DataProviderEditor /> — tabbed editor with General / Connection / Columns / Diagnostics"
          />
          <CompareRow
            label="Where configs live"
            manual="React state only (in-memory)"
            composed="IndexedDB (marketsui-config / appConfig table) via ConfigManager"
          />
          <CompareRow
            label="Multiple saved configs"
            manual="N/A — one live config at a time"
            composed="Unlimited; pick any one from the in-grid dropdown"
          />
          <CompareRow
            label="Grid wiring"
            manual="useProviderStream + applyDelta + useEffect in each panel"
            composed="<HostedMarketsGrid /> — picker, subscribe, delta-apply, persistence all internal"
          />
          <CompareRow
            label="LOC in the demo's panels"
            manual="~80 LOC per grid panel"
            composed="~40 LOC for the whole grid panel; most of that is style + the error fallback"
          />
          <CompareRow
            label="What you learn"
            manual="How the parts fit together (provider lifecycle, hub protocol, keyColumn)"
            composed="How to compose the parts (which prop drives what, how state persists)"
          />
        </CompareTable>
      </Section>

      <Section title="When to use which" icon={<GitCompareArrows size={12} strokeWidth={1.75} />}>
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Pick the manual approach when…" desc="You need a one-off in-process grid in a test, you want to swap the transport entirely, or you're learning what the hub does. See mockdata-provider-starui-app." />
        <ItemRow icon={<Plug size={13} strokeWidth={1.75} />} name="Pick the composed approach when…" desc="You're shipping a production tool, you want users to author + reuse named provider configs, or you want cross-tab broadcast via SharedWorker." />
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

function CompareTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--ds-border-primary)]">
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="bg-[color:var(--ds-surface-sunken)]">
            <th className="w-[140px] border-r border-[color:var(--ds-border-primary)] px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-text-faint)]">
              Aspect
            </th>
            <th className="w-1/2 border-r border-[color:var(--ds-border-primary)] px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-accent-info)]">
              Manual
            </th>
            <th className="w-1/2 px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ds-accent-info)]">
              Composed
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--ds-border-primary)]">{children}</tbody>
      </table>
    </div>
  );
}

function CompareRow({ label, manual, composed }: { label: string; manual: string; composed: string }) {
  return (
    <tr className="bg-[color:var(--ds-surface-primary)] align-top">
      <td className="border-r border-[color:var(--ds-border-primary)] px-3 py-2 font-mono text-[10.5px] font-semibold text-[color:var(--ds-text-primary)]">
        {label}
      </td>
      <td className="border-r border-[color:var(--ds-border-primary)] px-3 py-2 leading-relaxed text-[color:var(--ds-text-secondary)]">
        {manual}
      </td>
      <td className="px-3 py-2 leading-relaxed text-[color:var(--ds-text-secondary)]">
        {composed}
      </td>
    </tr>
  );
}
