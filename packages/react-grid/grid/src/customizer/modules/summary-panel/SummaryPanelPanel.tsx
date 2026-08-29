/**
 * Summary Panel customizer panel — widget list (left) + widget editor (right).
 *
 * Direct-edit, no draft/dirty staging (unlike Alerts' rule editor) — matches
 * Plus/Minus's simpler nudge editor: every field writes straight through
 * `setState`, since a widget has no expensive validation step and nothing
 * else depends on it being "committed" before use.
 *
 * The editor covers the common desk case — one groupBy, one aggregate, an
 * optional pivotBy for a heatmap cross-tab. A widget's `query` can carry a
 * richer `DataQuery` (multiple aggregates, filter clauses) when the chatbot
 * writes it directly via `add_module_item`/`update_module_item` — this UI is
 * the human on-ramp, not the ceiling.
 *
 * All form controls are shadcn primitives from `@wellsfargo-starui/react` —
 * no native `<input>`, `<select>`, or `<button>` (per the repo's UI stack rules).
 */

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Gauge, Grid3x3, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@wellsfargo-starui/react';
import type { EditorPaneProps, ListPaneProps } from '@wellsfargo-starui/core';
import { AGG_FNS, CHART_KINDS, type AggFn, type ChartKind, type DataQuery } from '@wellsfargo-starui/data';
import { useModuleState } from '../../hooks/useModuleState';
import {
  Band,
  CockpitList,
  CockpitListItem,
  CockpitListItemMeta,
  SettingsRow as Row,
  SubLabel,
} from '../../ui/SettingsPanel';
import { SUMMARY_PANEL_MODULE_ID, type SummaryPanelState, type SummaryWidget, type SummaryWidgetKind } from './index.js';

const KIND_ICON: Record<SummaryWidgetKind, typeof Gauge> = {
  digest: Gauge,
  chart: BarChart3,
  heatmap: Grid3x3,
};

export const KIND_LABEL: Record<SummaryWidgetKind, string> = {
  digest: 'Digest',
  chart: 'Chart',
  heatmap: 'Heatmap',
};

function newWidgetId(): string {
  return `widget-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function defaultWidget(name: string): SummaryWidget {
  return { id: newWidgetId(), title: name, kind: 'digest', query: {} };
}

function parseList(text: string): string[] | undefined {
  const items = text.split(',').map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function joinList(items: string[] | undefined): string {
  return (items ?? []).join(', ');
}

// ─── List pane ─────────────────────────────────────────────────────────────

function WidgetListBody({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [state, setState] = useModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);

  const addWidget = useCallback(() => {
    const widget = defaultWidget(`Widget ${state.widgets.length + 1}`);
    setState((prev) => ({ ...prev, widgets: [...prev.widgets, widget] }));
    onSelect(widget.id);
  }, [setState, state.widgets.length, onSelect]);

  const removeWidget = useCallback(
    (id: string) => {
      setState((prev) => ({ ...prev, widgets: prev.widgets.filter((w) => w.id !== id) }));
      if (selectedId === id) onSelect(null);
    },
    [setState, selectedId, onSelect],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-center justify-between">
        <SubLabel>Widgets</SubLabel>
        <Button variant="ghost" size="icon" onClick={addWidget} aria-label="Add widget" data-testid="summary-panel-add-widget">
          <Plus size={14} />
        </Button>
      </div>
      <CockpitList className="min-h-0 flex-1 overflow-y-auto" data-testid="summary-panel-widget-list">
        {state.widgets.length === 0 ? (
          <div className="px-2 py-3 text-xs text-[color:var(--ds-text-muted)]">
            No widgets yet — click <Plus className="inline" size={10} /> to create one.
          </div>
        ) : (
          state.widgets.map((widget) => {
            const Icon = KIND_ICON[widget.kind];
            return (
              <CockpitListItem
                key={widget.id}
                value={widget.id}
                active={widget.id === selectedId}
                multiline
                onSelect={() => onSelect(widget.id)}
                data-testid={`summary-panel-widget-row-${widget.id}`}
              >
                <div className="flex w-full items-center gap-2">
                  <Icon size={12} aria-hidden />
                  <span className="flex-1 truncate text-xs">{widget.title || KIND_LABEL[widget.kind]}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWidget(widget.id);
                    }}
                    aria-label={`Delete ${widget.title || widget.kind}`}
                    data-testid={`summary-panel-delete-${widget.id}`}
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
                <CockpitListItemMeta>
                  {KIND_LABEL[widget.kind]}
                  {widget.query.groupBy?.length ? ` · by ${widget.query.groupBy.join(', ')}` : ''}
                </CockpitListItemMeta>
              </CockpitListItem>
            );
          })
        )}
      </CockpitList>
    </div>
  );
}

export function SummaryPanelList({ selectedId, onSelect }: ListPaneProps) {
  const [state] = useModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);

  useEffect(() => {
    if (!selectedId && state.widgets.length > 0) onSelect(state.widgets[0].id);
  }, [selectedId, state.widgets, onSelect]);

  return <WidgetListBody selectedId={selectedId} onSelect={onSelect} />;
}

// ─── Editor pane ───────────────────────────────────────────────────────────

function WidgetEditorBody({ widgetId }: { widgetId: string }) {
  const [state, setState] = useModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);
  const widget = state.widgets.find((w) => w.id === widgetId);

  const updateWidget = useCallback(
    (patch: Partial<SummaryWidget>) => {
      setState((prev) => ({ ...prev, widgets: prev.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)) }));
    },
    [setState, widgetId],
  );

  const updateQuery = useCallback(
    (patch: Partial<DataQuery>) => {
      setState((prev) => ({
        ...prev,
        widgets: prev.widgets.map((w) => (w.id === widgetId ? { ...w, query: { ...w.query, ...patch } } : w)),
      }));
    },
    [setState, widgetId],
  );

  if (!widget) return null;
  const { query } = widget;
  const aggregate = query.aggregate?.[0];

  const setAggregate = (patch: Partial<{ column: string; fn: AggFn }>) => {
    const column = patch.column ?? aggregate?.column ?? '';
    const fn = patch.fn ?? aggregate?.fn ?? 'sum';
    updateQuery({ aggregate: column ? [{ column, fn }] : undefined });
  };

  return (
    <div className="ds-editor-scroll min-h-0 flex-1 overflow-y-auto p-3" data-testid={`summary-panel-widget-editor-${widgetId}`}>
      <Band index="01" title="WIDGET">
        <Row
          label="TITLE"
          data-testid="summary-panel-title"
          control={(
            <Input
              value={widget.title ?? ''}
              onChange={(e) => updateWidget({ title: e.target.value || undefined })}
              placeholder={KIND_LABEL[widget.kind]}
              data-testid="summary-panel-title-input"
            />
          )}
        />
        <Row
          label="KIND"
          data-testid="summary-panel-kind"
          control={(
            <RadioGroup
              value={widget.kind}
              onValueChange={(v) => updateWidget({ kind: v as SummaryWidgetKind })}
              className="grid w-full grid-cols-3 gap-2"
              data-testid="summary-panel-kind-group"
            >
              {(['digest', 'chart', 'heatmap'] as const).map((kind) => (
                <Label
                  key={kind}
                  className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-border px-2 py-1.5 text-xs has-[[data-state=checked]]:border-[color:var(--ds-primary)] has-[[data-state=checked]]:bg-[var(--ds-primary-soft)]"
                >
                  <RadioGroupItem value={kind} data-testid={`summary-panel-kind-${kind}`} />
                  {KIND_LABEL[kind]}
                </Label>
              ))}
            </RadioGroup>
          )}
        />
      </Band>

      <Band index="02" title="DATA">
        {widget.kind === 'digest' && (
          <Row
            label="COLUMNS"
            hint="Comma-separated — empty summarizes every column the rows carry."
            data-testid="summary-panel-columns"
            control={(
              <Input
                value={joinList(query.columns)}
                onChange={(e) => updateQuery({ columns: parseList(e.target.value) })}
                placeholder="sector, marketValue"
                data-testid="summary-panel-columns-input"
              />
            )}
          />
        )}
        <Row
          label="GROUP BY"
          hint="Comma-separated column(s) — the row dimension."
          data-testid="summary-panel-groupby"
          control={(
            <Input
              value={joinList(query.groupBy)}
              onChange={(e) => updateQuery({ groupBy: parseList(e.target.value) })}
              placeholder="sector"
              data-testid="summary-panel-groupby-input"
            />
          )}
        />
        {widget.kind === 'heatmap' && (
          <Row
            label="PIVOT BY"
            hint="Comma-separated column(s) — the column dimension, for a 2D cross-tab."
            data-testid="summary-panel-pivotby"
            control={(
              <Input
                value={joinList(query.pivotBy)}
                onChange={(e) => updateQuery({ pivotBy: parseList(e.target.value) })}
                placeholder="tenorBucket"
                data-testid="summary-panel-pivotby-input"
              />
            )}
          />
        )}
        <Row
          label="AGGREGATE"
          hint="Column to measure, and how — required for chart/heatmap; optional for digest."
          data-testid="summary-panel-aggregate"
          control={(
            <div className="flex items-center gap-1.5">
              <Input
                value={aggregate?.column ?? ''}
                onChange={(e) => setAggregate({ column: e.target.value })}
                placeholder="marketValue"
                className="flex-1"
                data-testid="summary-panel-aggregate-column"
              />
              <Select value={aggregate?.fn ?? 'sum'} onValueChange={(v) => setAggregate({ fn: v as AggFn })}>
                <SelectTrigger className="w-24" data-testid="summary-panel-aggregate-fn">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGG_FNS.map((fn) => (
                    <SelectItem key={fn} value={fn}>{fn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
      </Band>

      {widget.kind === 'chart' && (
        <Band index="03" title="CHART">
          <Row
            label="CHART KIND"
            data-testid="summary-panel-chartkind"
            control={(
              <Select value={widget.chartKind ?? 'auto'} onValueChange={(v) => updateWidget({ chartKind: v as ChartKind })}>
                <SelectTrigger data-testid="summary-panel-chartkind-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_KINDS.filter((k) => k !== 'heatmap').map((kind) => (
                    <SelectItem key={kind} value={kind}>{kind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Band>
      )}
    </div>
  );
}

export function SummaryPanelEditor({ selectedId }: EditorPaneProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="summary-panel-editor-pane">
      {selectedId ? (
        <WidgetEditorBody widgetId={selectedId} />
      ) : (
        <p className="p-4 text-xs text-[color:var(--ds-text-secondary)]">
          Add a widget to configure what it summarizes, groups, or charts.
        </p>
      )}
    </div>
  );
}

// ─── Combined panel (settings + list + editor) ─────────────────────────────

export function SummaryPanelPanel() {
  const [state] = useModuleState<SummaryPanelState>(SUMMARY_PANEL_MODULE_ID);
  const [selectedId, setSelectedId] = useState<string | null>(state.widgets[0]?.id ?? null);

  return (
    <div className="ds-sheet-v2 flex h-full flex-col" data-testid="summary-panel-flat">
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[color:var(--ds-border-primary)]">
        <WidgetListBody selectedId={selectedId} onSelect={setSelectedId} />
        {selectedId ? <WidgetEditorBody widgetId={selectedId} /> : null}
      </div>
    </div>
  );
}
