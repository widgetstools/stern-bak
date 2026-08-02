import type { ReactNode } from 'react';
import { STORAGE_KEY } from '../gridId';
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
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  PaintBucket,
  Square,
  DollarSign,
  Percent,
  Hash,
  ArrowLeftRight,
  Layers,
  LayoutGrid,
  Filter,
  Sliders,
  Eraser,
  Trash2,
  ExternalLink,
  RotateCcw,
  RotateCw,
  Settings,
  Save,
  Eye,
  EyeOff,
  CaseSensitive,
  Lock,
  MessageSquareText,
  ListTree,
  Sigma,
  Group,
  Wand2,
  History,
  ClipboardList,
  BookOpen,
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
        className="flex w-full flex-col gap-0 border-l border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-ground)] p-0 sm:max-w-[640px]"
      >
        <SheetHeader className="space-y-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-5 py-4">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="flex items-center gap-2 font-mono text-[14px] tracking-tight text-[color:var(--ds-text-primary)]">
              <BookOpen
                size={14}
                strokeWidth={1.75}
                className="text-[color:var(--ds-accent-info)]"
              />
              Help & documentation
            </SheetTitle>
            <Badge className="border-transparent bg-[color:var(--ds-overlay-info-soft)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-info)]">
              Bond blotter
            </Badge>
          </div>
          <SheetDescription className="text-[12px] leading-relaxed text-[color:var(--ds-text-muted)]">
            How to shape this grid — format cells, customize columns, save layouts, and persist everything to local storage.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="quickstart" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-4 grid w-[calc(100%-2.5rem)] grid-cols-3 bg-[color:var(--ds-surface-sunken)]">
            <TabsTrigger
              value="quickstart"
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
            >
              Quick start
            </TabsTrigger>
            <TabsTrigger
              value="formatter"
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
            >
              Formatter
            </TabsTrigger>
            <TabsTrigger
              value="customizer"
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"
            >
              Customizer
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="quickstart"
            className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <ScrollArea className="flex-1 px-5 py-4">
              <QuickStart />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="formatter"
            className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <ScrollArea className="flex-1 px-5 py-4">
              <FormatterDocs />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="customizer"
            className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <ScrollArea className="flex-1 px-5 py-4">
              <CustomizerDocs />
            </ScrollArea>
          </TabsContent>
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

function QuickStart() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="What this demo shows">
        <Prose>
          A streaming-ready bond blotter built on{' '}
          <Code>@wellsfargo-starui/grid</Code>. Every column, filter, format,
          template, and saved layout is round-tripped to{' '}
          <Code>localStorage</Code> under a single JSON document — refresh the
          page and your layout returns exactly as you left it.
        </Prose>
      </Section>

      <Section title="The three surfaces">
        <ItemRow
          icon={<Sliders size={13} strokeWidth={1.75} />}
          name="Formatter toolbar"
          desc="Cell-level styling, value formatting, filters, and templates. Toggled by the slider icon next to the layout selector."
        />
        <ItemRow
          icon={<Settings size={13} strokeWidth={1.75} />}
          name="Grid customizer"
          desc="Full-screen panel with nine modules covering everything from calculated columns to conditional styling. Opens via the gear icon."
        />
        <ItemRow
          icon={<Save size={13} strokeWidth={1.75} />}
          name="Layouts"
          desc="Named snapshots of every module's state. Switch from the layout dropdown; save the current view with the disk icon."
        />
      </Section>

      <Section title="Try it">
        <Step n={1}>
          Click a column header to select it, then open the{' '}
          <strong>Formatter toolbar</strong> and toggle{' '}
          <Code>Bold</Code> or change the <Code>Fill color</Code>.
        </Step>
        <Step n={2}>
          Open the <strong>Customizer</strong> (gear icon), pick{' '}
          <Code>Conditional styling</Code>, and add a rule like{' '}
          <Code>{`coupon > 7`}</Code> → red text.
        </Step>
        <Step n={3}>
          Hit <Kbd>Ctrl + S</Kbd> (or the disk icon) to save the active
          layout. Open <strong>Inspect storage</strong> in the header to see
          the JSON.
        </Step>
      </Section>

      <Section title="Keyboard shortcuts">
        <div className="overflow-hidden rounded-md border border-[color:var(--ds-border-primary)]">
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-[color:var(--ds-border-primary)]">
              <ShortcutRow keys="Ctrl + /" label="Toggle help panel" />
              <ShortcutRow keys="Ctrl + J" label="Inspect storage" />
              <ShortcutRow keys="Ctrl + E" label="Export config to JSON" />
              <ShortcutRow keys="Ctrl + I" label="Import config from JSON" />
              <ShortcutRow keys="Ctrl + ." label="Switch theme (dark / light)" />
              <ShortcutRow keys="Ctrl + Shift + R" label="Reset all layouts (with confirm)" />
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function FormatterDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Opening the toolbar">
        <Prose>
          Click the <strong>Show formatting toolbar</strong> button (slider
          icon) in the primary toolbar. Most actions require a selection —
          click any cell or column header to enable them.
        </Prose>
      </Section>

      <Section title="Mode & scope (top row)">
        <ItemRow
          icon={<LayoutGrid size={13} strokeWidth={1.75} />}
          name="Edit cell styling / Edit header styling"
          desc="Switches whether your changes apply to body cells or the column header. Most teams keep it on cells."
        />
        <ItemRow
          icon={<Group size={13} strokeWidth={1.75} />}
          name="Apply to selected column(s) / Apply to every column"
          desc="Selected scope = only the columns you've selected. Global = the baseline for every column (overridden per-column where you've already set values)."
        />
      </Section>

      <Section title="Column properties">
        <ItemRow
          icon={<Type size={13} strokeWidth={1.75} />}
          name="Rename column"
          desc="Click the column name pill to type a new header. Stored per-column; the underlying field id is unchanged."
        />
        <ItemRow
          icon={<Lock size={13} strokeWidth={1.75} />}
          name="Toggle cell editing"
          desc="Locked by default. Unlock to let users double-click cells to edit values inline."
        />
        <ItemRow
          icon={<CaseSensitive size={13} strokeWidth={1.75} />}
          name="Header case"
          desc="Flip every column header between UPPERCASE and the original casing without renaming columns."
        />
        <ItemRow
          icon={<MessageSquareText size={13} strokeWidth={1.75} />}
          name="Cell tooltips"
          desc="When on, hovering a cell shows its full value — useful for truncated text."
        />
      </Section>

      <Section title="Undo & history">
        <ItemRow
          icon={<RotateCcw size={13} strokeWidth={1.75} />}
          name="Undo / Redo"
          desc="Steps through every formatter change since the toolbar opened. Resets when you switch layouts."
        />
      </Section>

      <Section title="Typography">
        <ItemRow
          icon={<Bold size={13} strokeWidth={1.75} />}
          name="Bold, Italic, Underline"
          desc="Standard text styles. Applied to the active scope (selected columns or global)."
        />
        <ItemRow
          icon={<AlignLeft size={13} strokeWidth={1.75} />}
          name="Align left / center / right"
          desc={(
            <span className="inline-flex items-center gap-1">
              Cell text alignment.{' '}
              <AlignCenter size={11} strokeWidth={1.75} />
              <AlignRight size={11} strokeWidth={1.75} />
            </span>
          )}
        />
        <ItemRow
          icon={<Type size={13} strokeWidth={1.75} />}
          name="Font size"
          desc="Per-column font size in pixels. Useful for compact monospace columns next to a roomier description column."
        />
      </Section>

      <Section title="Color & borders">
        <ItemRow
          icon={<Type size={13} strokeWidth={1.75} />}
          name="Text color"
          desc="Full HSV picker, 16 presets, 10 recent colors, OS pipette, and hex input. Commits on every interaction — no Apply button."
        />
        <ItemRow
          icon={<PaintBucket size={13} strokeWidth={1.75} />}
          name="Fill color"
          desc="Cell background. Combine with conditional styling for heatmap effects."
        />
        <ItemRow
          icon={<Square size={13} strokeWidth={1.75} />}
          name="Cell borders"
          desc="Per-edge borders. Pick which side (top/right/bottom/left/all), the style (solid/dashed/dotted), width, and color."
        />
      </Section>

      <Section title="Number formatting">
        <ItemRow
          icon={<DollarSign size={13} strokeWidth={1.75} />}
          name="Currency"
          desc="One-click USD; menu chevron for EUR, GBP, JPY, or basis-point formatting."
        />
        <ItemRow
          icon={<Percent size={13} strokeWidth={1.75} />}
          name="Percentage"
          desc="Multiplies by 100 and appends %. Decimals respect the +/− decimal buttons."
        />
        <ItemRow
          icon={<Hash size={13} strokeWidth={1.75} />}
          name="Thousands separator"
          desc="Toggles 1234567 ↔ 1,234,567 (locale-aware grouping)."
        />
        <ItemRow
          icon={<ArrowLeftRight size={13} strokeWidth={1.75} />}
          name="Fewer / more decimals"
          desc="Adjust decimal places without rewriting the format string."
        />
        <ItemRow
          icon={<Sigma size={13} strokeWidth={1.75} />}
          name="Tick format (32nds / 64ths / 128ths / 256ths)"
          desc="Fixed-income native: render 99.5 as 99-16 (32nds). Pick the denominator from the chevron menu."
        />
      </Section>

      <Section title="Format & cell editor">
        <ItemRow
          icon={<Wand2 size={13} strokeWidth={1.75} />}
          name="Format"
          desc="Opens the value-formatter expression editor — write any d3-format / custom expression. Saved per column."
        />
        <ItemRow
          icon={<Type size={13} strokeWidth={1.75} />}
          name="Cell editor"
          desc="Per-column editor type: text, number, select, date. Sets what's shown when a cell goes into edit mode."
        />
      </Section>

      <Section title="Filtering">
        <ItemRow
          icon={<Filter size={13} strokeWidth={1.75} />}
          name="Column filter / Filter kind"
          desc="Enable a per-column filter; pick text or number. Adds a Set filter alongside it for value picking."
        />
        <ItemRow
          icon={<Eye size={13} strokeWidth={1.75} />}
          name="Show floating filter row"
          desc="Adds an always-visible filter input directly under the column header — great for streaming data."
        />
      </Section>

      <Section title="Templates & reset">
        <ItemRow
          icon={<Layers size={13} strokeWidth={1.75} />}
          name="Templates"
          desc="Save the current column's full styling as a reusable template, then apply it to any other column. Rename or delete from the same menu."
        />
        <ItemRow
          icon={<Eraser size={13} strokeWidth={1.75} />}
          name="Clear styles for selected column(s)"
          desc="Removes styling, value formatter, borders, filter, and template references — keeps the column itself and its data."
        />
        <ItemRow
          icon={<Trash2 size={13} strokeWidth={1.75} />}
          name="Clear all styles in this layout"
          desc="Nukes every customization across every column for the active layout. Confirmation-gated."
        />
        <ItemRow
          icon={<ExternalLink size={13} strokeWidth={1.75} />}
          name="Open toolbar in a separate window"
          desc="Pops the formatter into its own browser window — useful on multi-monitor setups."
        />
      </Section>
    </div>
  );
}

function CustomizerDocs() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Opening the customizer">
        <Prose>
          Click the <strong>gear icon</strong> in the primary toolbar. The
          customizer is a full panel with a sidebar of nine modules — pick
          one to see its config.
        </Prose>
      </Section>

      <Section title="General settings">
        <ItemRow
          icon={<Settings size={13} strokeWidth={1.75} />}
          name="General settings"
          desc="Grid-wide options: row heights, header heights, animations, default column behavior, side-bar visibility, status-bar layout."
        />
      </Section>

      <Section title="Columns & data">
        <ItemRow
          icon={<Layers size={13} strokeWidth={1.75} />}
          name="Column templates"
          desc="Library of reusable styling presets shared across columns. Created from the formatter's Templates button; managed and renamed here."
        />
        <ItemRow
          icon={<LayoutGrid size={13} strokeWidth={1.75} />}
          name="Column customization"
          desc="Drag to reorder, pin, group, hide. Edit type, width, sort behavior, aggregation, and tooltip per column without touching code."
        />
        <ItemRow
          icon={<Sigma size={13} strokeWidth={1.75} />}
          name="Calculated columns"
          desc="Add derived columns from an expression — e.g. `bid + offer / 2` for a mid price. Full d3-format-style formatter support."
        />
        <ItemRow
          icon={<Group size={13} strokeWidth={1.75} />}
          name="Column groups"
          desc="Two-level header grouping with collapse/expand. Define which children stay visible when collapsed."
        />
      </Section>

      <Section title="Styling & rules">
        <ItemRow
          icon={<Wand2 size={13} strokeWidth={1.75} />}
          name="Conditional styling"
          desc="Rule-driven cell coloring — apply background, text, font, and border styles when a row matches an expression. Multiple rules per column; first match wins."
        />
      </Section>

      <Section title="Filters & visibility">
        <ItemRow
          icon={<Filter size={13} strokeWidth={1.75} />}
          name="Saved filters"
          desc="Bundle of column filter states saved with a name. Recall a filter from the filters toolbar; great for daily presets (My Book, IG Only, Energy Sector…)."
        />
        <ItemRow
          icon={<EyeOff size={13} strokeWidth={1.75} />}
          name="Toolbar visibility"
          desc="Hide or show individual primary-toolbar buttons. Useful for purpose-built kiosks that only need a subset."
        />
      </Section>

      <Section title="Layout state">
        <ItemRow
          icon={<ClipboardList size={13} strokeWidth={1.75} />}
          name="Grid state"
          desc="Always runs LAST. Snapshots the live AG-Grid column model (sort, filter model, column visibility/order/width) and replays it on load. This is what makes layout switching exact."
        />
      </Section>

      <Section title="How layouts work">
        <Prose>
          Every module's settings are bundled into a named <em>layout</em>.
          The{' '}
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] align-[-3px] text-[color:var(--ds-text-secondary)]">
            <Save size={10} strokeWidth={1.75} />
          </span>{' '}
          <strong>Save</strong> button writes the current state of every
          module to the active layout. Switching layouts via the dropdown
          replays each module's stored state in order — and{' '}
          <Code>grid-state</Code> always runs last so it sees the finalized
          column set.
        </Prose>
        <Prose>
          Open <strong>Inspect storage</strong> from the header to watch the
          JSON document update in real time as you edit.
        </Prose>
      </Section>

      <Section title="Persistence">
        <div className="rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-secondary)]">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[color:var(--ds-text-faint)]">
            <History size={11} strokeWidth={1.75} />
            Storage key
          </div>
          <code className="mt-1 block text-[color:var(--ds-text-primary)]">
            {STORAGE_KEY}
          </code>
        </div>
        <Prose>
          One key, one JSON value — even with dozens of layouts. Export and
          import via <Kbd>Ctrl+E</Kbd> / <Kbd>Ctrl+I</Kbd> to move layouts
          between browsers.
        </Prose>
      </Section>
    </div>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
        <span className="inline-block h-px w-3 bg-[color:var(--ds-border-secondary)]" />
        {title}
      </h3>
      <div className="flex flex-col gap-2 pl-1">{children}</div>
    </section>
  );
}

function ItemRow({
  icon,
  name,
  desc,
}: {
  icon: ReactNode;
  name: string;
  desc: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-2.5">
      <span className="mt-[3px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] text-[color:var(--ds-text-secondary)]">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12px] font-semibold text-[color:var(--ds-text-primary)]">
          {name}
        </span>
        <span className="text-[11.5px] leading-relaxed text-[color:var(--ds-text-muted)]">
          {desc}
        </span>
      </div>
    </div>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">
      {children}
    </p>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-[1px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold text-[color:var(--ds-accent-info)]">
        {n}
      </span>
      <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">
        {children}
      </p>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-1.5 py-[1px] font-mono text-[11px] text-[color:var(--ds-text-secondary)]">
      {children}
    </code>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded-sm border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)] px-1.5 py-[1px] font-mono text-[10px] font-medium text-[color:var(--ds-text-primary)] shadow-[0_1px_0_0_var(--ds-border-primary)]">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <tr className="bg-[color:var(--ds-surface-primary)]">
      <td className="w-[110px] border-r border-[color:var(--ds-border-primary)] px-3 py-2 align-middle">
        <Kbd>{keys}</Kbd>
      </td>
      <td className="px-3 py-2 text-[12px] text-[color:var(--ds-text-secondary)]">
        {label}
      </td>
    </tr>
  );
}

