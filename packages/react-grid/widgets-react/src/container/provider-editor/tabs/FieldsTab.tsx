/**
 * FieldsTab — pick which inferred fields to expose as columns.
 *
 * Workflow:
 *   1. User clicks "Infer Fields" (footer of the editor) — calls
 *      probe + inferFields under the hood, populates `inferredFields`.
 *   2. This tab shows the field tree with checkboxes.
 *   3. Selected fields are committed via `onCfgChange` as a list of
 *      column definitions; ColumnsTab renders the resulting list.
 *
 * Lighter than v1's tab — drops the multi-tier "select all /
 * indeterminate / search / sample-size pill" UI in favour of a flat
 * tree + select-all + a sample-size dropdown. The 80% case stays
 * simple; the long tail of features can come back if missed.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button, Checkbox, Input, ScrollArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Badge, Label } from '@wellsfargo-starui/react';
import { Database, Loader2, Search, RefreshCw, X } from 'lucide-react';
import type { FieldNode, TransportConfig, ColumnDefinition } from '@wellsfargo-starui/types/shared';
import { collectNonObjectLeaves, filterFields } from '@wellsfargo-starui/types/shared';

const SAMPLE_SIZES = [50, 100, 200, 500] as const;

// Inline windowing — STOMP field trees can reach 4k+ nodes when a payload
// exposes a wide nested schema. Mirrors the pattern in
// packages/core/src/modules/column-customization/ColumnSettingsPanel.tsx
// (no new dep): walk to the scrolling ancestor, slice rows to its visible
// range plus an overscan. Falls back to full render when no scroll parent
// is found (jsdom, edge containers).
const ROW_HEIGHT = 28;
const VIRTUAL_THRESHOLD = 100;
const OVERSCAN = 8;

export interface FieldsTabProps {
  cfg: TransportConfig;
  inferredFields: FieldNode[];
  inferenceSummary: { rowsFetched: number; rowsUsed: number; fieldsDetected: number } | null;
  inferring: boolean;
  inferenceError: string | null;
  sampleSize: number;
  onSampleSizeChange(n: number): void;
  onInfer(): void;
  /** Called when the user commits a selection — typically by toggling
   *  checkboxes. The container persists this into cfg.columnDefinitions. */
  onColumnsChange(columns: ColumnDefinition[]): void;
  /** Currently committed selection — the cfg.columnDefinitions list. */
  selectedColumnFields: readonly string[];
}

export function FieldsTab(props: FieldsTabProps) {
  const {
    cfg,
    inferredFields, inferenceSummary, inferring, inferenceError,
    sampleSize, onSampleSizeChange, onInfer,
    onColumnsChange, selectedColumnFields,
  } = props;

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedColumnFields));

  // Sync from cfg when columns change externally (e.g. on re-load).
  useEffect(() => {
    setSelected(new Set(selectedColumnFields));
  }, [selectedColumnFields]);

  const allLeaves = useMemo(() => {
    const leaves: string[] = [];
    for (const f of inferredFields) leaves.push(...collectNonObjectLeaves(f));
    return leaves;
  }, [inferredFields]);

  const filtered = useMemo(() => filterFields(inferredFields, search), [inferredFields, search]);

  // Flatten the filtered tree into a 1-D array of { node, depth } rows so
  // the visible slice maps cleanly onto the DOM. Walks in pre-order so
  // children appear directly under their parent — same visual order as
  // the recursive render.
  const flatRows = useMemo(() => {
    const out: Array<{ node: FieldNode; depth: number }> = [];
    const walk = (nodes: FieldNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        if (n.children && n.children.length > 0) walk(n.children, depth + 1);
      }
    };
    walk(filtered, 0);
    return out;
  }, [filtered]);

  // Visible-leaf paths for "Select All" — when a search filter is active
  // it only operates on the filtered subset so the user can mass-select
  // a tightly-scoped query without affecting hidden nodes.
  const visibleLeaves = useMemo(() => {
    const leaves: string[] = [];
    for (const f of filtered) leaves.push(...collectNonObjectLeaves(f));
    return leaves;
  }, [filtered]);

  const commit = (next: Set<string>) => {
    setSelected(next);
    const cols = buildColumns(inferredFields, [...next]);
    onColumnsChange(cols);
  };

  /**
   * Per-node toggle. Clicking a checkbox toggles ONLY that node's path
   * — no cascade to descendants, no propagation to siblings. A parent
   * checkbox shows an indeterminate state computed from its descendants
   * (purely visual), but the click only flips the parent's own
   * membership in the selection set. This is the behaviour expected by
   * users picking individual nested columns from a filtered view; the
   * old cascade had the side-effect of pulling in unrelated leaves.
   */
  const toggleField = (path: string) => {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    commit(next);
  };

  const selectAll = (checked: boolean) => {
    // When unfiltered, mirrors the old behaviour (every leaf in the
    // tree). When a filter is active, only the visible filtered leaves
    // are toggled so off-screen selections survive.
    if (!checked) {
      // De-select every leaf currently visible.
      const next = new Set(selected);
      for (const p of visibleLeaves) next.delete(p);
      commit(next);
      return;
    }
    const next = new Set(selected);
    for (const p of visibleLeaves) next.add(p);
    commit(next);
  };

  const allSelected = visibleLeaves.length > 0 && visibleLeaves.every((l) => selected.has(l));
  const someSelected = !allSelected && visibleLeaves.some((l) => selected.has(l));
  void allLeaves; // retained for future use; selection state is now scoped to visibleLeaves

  if (inferredFields.length === 0) {
    return <EmptyInference cfg={cfg} sampleSize={sampleSize} onSampleSizeChange={onSampleSizeChange} onInfer={onInfer} inferring={inferring} error={inferenceError} />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {inferenceSummary && (
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 text-xs">
            <Badge variant="outline" className="text-[10px]">Inference</Badge>
            <span className="text-muted-foreground">
              <strong className="text-foreground">{inferenceSummary.rowsUsed}</strong> rows used
              {inferenceSummary.rowsFetched > inferenceSummary.rowsUsed && <span> (of {inferenceSummary.rowsFetched})</span>}
              <span className="mx-2">·</span>
              <strong className="text-foreground">{inferenceSummary.fieldsDetected}</strong> fields detected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SampleSizePicker value={sampleSize} onChange={onSampleSizeChange} />
            <Button size="sm" variant="outline" onClick={onInfer} disabled={inferring} title="Re-fetch + re-infer">
              {inferring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5 text-xs">Re-sample</span>
            </Button>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-b border-border space-y-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search fields…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-8 h-8 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              title="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={someSelected ? 'indeterminate' : allSelected}
              onCheckedChange={(v) => selectAll(Boolean(v))}
            />
            <Label htmlFor="select-all" className="text-xs font-medium text-muted-foreground cursor-pointer">
              Select All
            </Label>
          </div>
          <Badge variant="secondary" className="text-xs">{selected.size} selected</Badge>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <VirtualizedFieldList rows={flatRows} selected={selected} onToggle={toggleField} />
      </ScrollArea>
    </div>
  );
}

// ─── Scroll-parent windowing ──────────────────────────────────────
//
// The list does not own its scroll container — Radix `ScrollArea`'s
// viewport does. We walk up to find the first scrolling ancestor and
// observe its scrollTop / clientHeight. If none is found, we render
// everything (jsdom, edge cases).
function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = node?.parentElement ?? null;
  while (cur && cur !== document.body) {
    const oy = getComputedStyle(cur).overflowY;
    if (oy === 'auto' || oy === 'scroll') return cur;
    cur = cur.parentElement;
  }
  return null;
}

interface Range { start: number; end: number; }

function useWindowedRange(
  innerRef: RefObject<HTMLElement | null>,
  count: number,
  rowHeight: number,
  enabled: boolean,
): Range {
  const [range, setRange] = useState<Range>({ start: 0, end: count });
  useLayoutEffect(() => {
    if (!enabled) {
      setRange({ start: 0, end: count });
      return;
    }
    const inner = innerRef.current;
    if (!inner) return;
    const scroller = findScrollParent(inner);
    if (!scroller) {
      setRange({ start: 0, end: count });
      return;
    }
    const recompute = () => {
      const innerTop = inner.getBoundingClientRect().top;
      const scrollerTop = scroller.getBoundingClientRect().top;
      const offset = innerTop - scrollerTop + scroller.scrollTop;
      const viewportTop = Math.max(0, scroller.scrollTop - offset);
      const viewportH = scroller.clientHeight || 0;
      if (viewportH === 0) {
        setRange({ start: 0, end: count });
        return;
      }
      const start = Math.max(0, Math.floor(viewportTop / rowHeight) - OVERSCAN);
      const visible = Math.ceil(viewportH / rowHeight) + OVERSCAN * 2;
      const end = Math.min(count, start + visible);
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    recompute();
    scroller.addEventListener('scroll', recompute, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    ro?.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', recompute);
      ro?.disconnect();
    };
  }, [innerRef, count, rowHeight, enabled]);
  return range;
}

// ─── helpers ──────────────────────────────────────────────────────

export function buildColumns(fields: FieldNode[], selectedPaths: string[]): ColumnDefinition[] {
  const byPath = new Map<string, FieldNode>();
  const walk = (nodes: FieldNode[]) => {
    for (const n of nodes) {
      byPath.set(n.path, n);
      if (n.children) walk(n.children);
    }
  };
  walk(fields);
  const out: ColumnDefinition[] = [];
  for (const path of selectedPaths) {
    const node = byPath.get(path);
    if (!node) continue;
    out.push({
      field: path,
      headerName: humanize(node.name),
      cellDataType: mapType(node.type),
      filter: true,
      sortable: true,
      resizable: true,
    });
  }
  return out;
}

function humanize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1').trim();
}

function mapType(t: FieldNode['type']): ColumnDefinition['cellDataType'] {
  // Inferred "date" fields come from ISO date-ish STRINGS (see inferFields'
  // typeOf heuristic), so the row value is a string. Map them to AG-Grid's
  // `dateString` cellDataType rather than `date` — `date` expects native
  // Date objects and would mis-handle the string value (sorting/filtering).
  if (t === 'date') return 'dateString';
  if (t === 'number' || t === 'boolean' || t === 'object') return t;
  return 'text';
}

// ─── flat windowed view ───────────────────────────────────────────

interface FlatRow { node: FieldNode; depth: number; }

function VirtualizedFieldList({
  rows,
  selected,
  onToggle,
}: {
  rows: FlatRow[];
  selected: Set<string>;
  onToggle(p: string): void;
}) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const virtualize = rows.length > VIRTUAL_THRESHOLD;
  const range = useWindowedRange(innerRef, rows.length, ROW_HEIGHT, virtualize);
  const visible = virtualize ? rows.slice(range.start, range.end) : rows;
  const padTop = virtualize ? range.start * ROW_HEIGHT : 0;
  const padBottom = virtualize ? Math.max(0, (rows.length - range.end) * ROW_HEIGHT) : 0;

  return (
    <div ref={innerRef} className="p-2">
      {padTop > 0 && <div aria-hidden style={{ height: padTop }} />}
      {visible.map(({ node, depth }) => (
        <FieldRow
          key={node.path}
          node={node}
          depth={depth}
          selected={selected}
          onToggle={onToggle}
        />
      ))}
      {padBottom > 0 && <div aria-hidden style={{ height: padBottom }} />}
    </div>
  );
}

function FieldRow({
  node,
  depth,
  selected,
  onToggle,
}: {
  node: FieldNode;
  depth: number;
  selected: Set<string>;
  onToggle(p: string): void;
}) {
  // Per-node selection: the checkbox reflects ONLY whether this node's
  // path is in the selection set. For parents we surface an indeterminate
  // state when any descendant is selected — visual cue only; clicking
  // toggles just this node. `collectNonObjectLeaves` only runs for rows
  // currently in the visible slice.
  const ownChecked = selected.has(node.path);
  const descendantPaths = node.children ? collectNonObjectLeaves(node) : [];
  const someDescendantsSelected = descendantPaths.some((p) => selected.has(p));
  const checkedState: boolean | 'indeterminate' =
    ownChecked ? true : someDescendantsSelected ? 'indeterminate' : false;

  return (
    <div
      className="flex items-center gap-2 hover:bg-accent/40 rounded"
      style={{ height: ROW_HEIGHT, paddingLeft: `${depth * 16 + 6}px`, paddingRight: 6 }}
    >
      <Checkbox checked={checkedState} onCheckedChange={() => onToggle(node.path)} />
      <span className="text-[13px] font-mono truncate">{node.name}</span>
      <span className="text-[10px] text-muted-foreground">{node.type}</span>
      {node.children && (
        <span className="text-[10px] text-muted-foreground">({node.children.length})</span>
      )}
    </div>
  );
}

function SampleSizePicker({ value, onChange }: { value: number; onChange(n: number): void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
      <SelectContent>
        {SAMPLE_SIZES.map((n) => <SelectItem key={n} value={String(n)} className="text-xs">{n} rows</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function EmptyInference({ cfg, sampleSize, onSampleSizeChange, onInfer, inferring, error }: { cfg: TransportConfig; sampleSize: number; onSampleSizeChange(n: number): void; onInfer(): void; inferring: boolean; error: string | null }) {
  void cfg;
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-sm">
        <Database className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
        <h3 className="text-sm font-semibold mb-1">No fields inferred yet</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Click <strong>Infer Fields</strong> to fetch a sample snapshot and analyze the row schema.
        </p>
        <div className="flex items-center justify-center gap-2 mb-3 text-xs text-muted-foreground">
          <span>Sample size:</span>
          <SampleSizePicker value={sampleSize} onChange={onSampleSizeChange} />
        </div>
        <Button size="sm" onClick={onInfer} disabled={inferring}>
          {inferring ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Inferring…</> : <><Database className="h-3.5 w-3.5 mr-1.5" /> Infer Fields</>}
        </Button>
        {error && <p className="text-[11px] text-destructive mt-3">{error}</p>}
      </div>
    </div>
  );
}
