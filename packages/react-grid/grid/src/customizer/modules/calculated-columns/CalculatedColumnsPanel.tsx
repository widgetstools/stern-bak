/**
 * Calculated Columns settings panel — v4 rewrite.
 *
 * The v2 port carried three heavy antipatterns the audit flagged:
 *
 *  1. A file-level `dirtyRegistry = new Set<string>()` + a
 *     `window.dispatchEvent('gc-dirty-change')` broadcast for per-row
 *     LED lighting. This leaks across grids on the same page and loses
 *     coverage on StrictMode synthetic unmounts. v4 uses the
 *     per-platform `DirtyBus` via `useDirty(key)` — `useModuleDraft`
 *     already registers `calculated-columns:<colId>` automatically.
 *  2. A `useBaseGridColumns()` hook with local `tick` state that polled
 *     AG-Grid's column API on `displayedColumnsChanged` /
 *     `columnEverythingChanged`. Replaced by the stable
 *     `useGridColumns()` hook (fingerprint-cached snapshot, ApiHub-wired).
 *  3. `useDraftModuleItem({ store, ... })` + `useModuleState(store, id)`
 *     — the compat shims. Both replaced with the v4 context-driven
 *     equivalents (`useModuleDraft`, `useModuleState(id)`).
 *
 * Surface is unchanged: the master-detail split is exposed to the
 * settings sheet as `module.ListPane` + `module.EditorPane`. All
 * `cc-*` test-ids are preserved character-for-character.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { ExpressionEditor } from '../../ui/ExpressionEditor';
import type { EditorPaneProps, ListPaneProps } from '@wellsfargo-starui/core';
import { useModuleState } from '../../hooks/useModuleState';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useDirty } from '../../hooks/useDirty';
import { useGridColumns } from '../../hooks/useGridColumns';
import {
  Band,
  Caps,
  CockpitList,
  CockpitListItem,
  IconInput,
  LedBar,
  Mono,
  ObjectTitleRow,
  SharpBtn,
  SummaryChip,
  TitleInput,
} from '../../ui/SettingsPanel';
import { ChromeButton } from '../../ui/ChromeButton';
import { FormatterPicker, type FormatterPickerDataType } from '../../ui/FormatterPicker';
import { Tooltip } from '../../ui/HoverTooltip';
import type { CalculatedColumnsState, VirtualColumnDef } from './state';

const MODULE_ID = 'calculated-columns';

/** Base-36 id with a stable `vcol_` prefix — collision-safe for reasonable
 *  lists. Kept plain so new items sort last by creation order. */
function generateId(): string {
  return `vcol_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Per-row LED fed by the per-platform `DirtyBus`. Subscribes through
 *  `useDirty(key)` — no `window` event bus, no file-level `Set`. */
function DirtyListLed({ colId }: { colId: string }) {
  const { isDirty } = useDirty(`${MODULE_ID}:${colId}`);
  if (!isDirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── List pane ─────────────────────────────────────────────────────────

export function CalculatedColumnsList({ selectedId, onSelect }: ListPaneProps) {
  const [state, setState] = useModuleState<CalculatedColumnsState>(MODULE_ID);

  const addVirtualColumn = useCallback(() => {
    const id = generateId();
    setState((prev) => ({
      ...prev,
      virtualColumns: [
        ...prev.virtualColumns,
        {
          colId: id,
          headerName: 'New Column',
          expression: '',
          position: prev.virtualColumns.length,
        },
      ],
    }));
    onSelect(id);
  }, [setState, onSelect]);

  const deleteVirtualColumn = useCallback((colId: string) => {
    const deleteIndex = state.virtualColumns.findIndex((column) => column.colId === colId);
    if (deleteIndex === -1) return;

    const nextSelection = selectedId === colId
      ? state.virtualColumns[deleteIndex + 1]?.colId
        ?? state.virtualColumns[deleteIndex - 1]?.colId
        ?? null
      : selectedId;

    setState((prev) => ({
      ...prev,
      virtualColumns: prev.virtualColumns.filter((column) => column.colId !== colId),
    }));
    onSelect(nextSelection);
  }, [selectedId, state.virtualColumns, setState, onSelect]);

  // Auto-select the first item when the sheet opens with no selection —
  // avoids dumping the user onto the empty-state pane for an existing
  // list. Only runs when `selectedId` is null; user clicks take over.
  useEffect(() => {
    if (!selectedId && state.virtualColumns.length > 0) {
      onSelect(state.virtualColumns[0].colId);
    }
  }, [selectedId, state.virtualColumns, onSelect]);

  return (
    <>
      <div className="flex items-center gap-2.5 sticky top-0 bg-background border-b border-border px-4 pt-3.5 pb-2.5">
        <Caps>Columns</Caps>
        <Mono color="var(--ds-text-faint)">
          {String(state.virtualColumns.length).padStart(2, '0')}
        </Mono>
        <span style={{ flex: 1 }} />
        <ChromeButton
          type="button"
          onClick={addVirtualColumn}
          title="Add virtual column"
          data-testid="cc-add-virtual-btn"
          style={{
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--ds-primary-soft)',
            color: 'var(--ds-primary)',
            border: '1px solid var(--ds-primary-ring)',
            borderRadius: 2,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Plus size={11} strokeWidth={2.5} />
        </ChromeButton>
      </div>
      <CockpitList>
        {state.virtualColumns.map((v) => {
          const active = v.colId === selectedId;
          return (
            <CockpitListItem
              key={v.colId}
              value={v.colId}
              active={active}
              onSelect={() => onSelect(v.colId)}
              data-testid={`cc-virtual-${v.colId}`}
            >
              <span style={{ width: 2, display: 'inline-flex' }}>
                <DirtyListLed colId={v.colId} />
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {v.headerName || '(unnamed)'}
              </span>
              <Tooltip content="Delete">
                <ChromeButton
                  type="button"
                  aria-label="Delete"
                  data-testid={`cc-virtual-delete-${v.colId}`}
                  className="w-6 h-6 inline-flex items-center justify-center rounded-sm text-muted-foreground cursor-pointer p-0 transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary-ring)]"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteVirtualColumn(v.colId);
                  }}
                >
                  <Trash2 size={14} strokeWidth={2} />
                </ChromeButton>
              </Tooltip>
            </CockpitListItem>
          );
        })}
      </CockpitList>
    </>
  );
}

// ─── Editor pane ───────────────────────────────────────────────────────

export function CalculatedColumnsEditor({ selectedId }: EditorPaneProps) {
  const [state] = useModuleState<CalculatedColumnsState>(MODULE_ID);

  if (!selectedId) {
    return (
      <div style={{ padding: '32px 24px' }}>
        <Caps size="xs" style={{ marginBottom: 8, display: 'block' }}>
          No column selected
        </Caps>
        <div className="text-xs text-muted-foreground">
          Select a virtual column from the list, or press <Mono>+</Mono> to add one.
        </div>
      </div>
    );
  }

  if (!state.virtualColumns.some((v) => v.colId === selectedId)) return null;

  return <VirtualColumnEditor colId={selectedId} />;
}

// ─── Per-virtual-column editor ─────────────────────────────────────────

const VirtualColumnEditor = memo(function VirtualColumnEditor({
  colId,
}: {
  colId: string;
}) {
  // Live base-column list (ApiHub-wired, fingerprint-cached).
  const baseCols = useGridColumns();
  const columnsProvider = useCallback(
    () => baseCols.map((c) => ({ colId: c.colId, headerName: c.headerName })),
    [baseCols],
  );

  const { draft, setDraft, dirty, save, discard, missing } = useModuleDraft<
    CalculatedColumnsState,
    VirtualColumnDef
  >({
    moduleId: MODULE_ID,
    itemId: colId,
    selectItem: (state) => state.virtualColumns.find((c) => c.colId === colId),
    commitItem: (next) => (state) => ({
      ...state,
      virtualColumns: state.virtualColumns.map((c) => (c.colId === colId ? next : c)),
    }),
  });

  if (missing || !draft) return null;

  return (
    <div
      data-testid={`cc-virtual-editor-${colId}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div className="shrink-0 bg-background border-b border-border">
        <ObjectTitleRow
          title={
            <TitleInput
              value={draft.headerName}
              onChange={(e) => setDraft({ headerName: e.target.value })}
              placeholder="Column header"
              data-testid={`cc-virtual-header-${colId}`}
            />
          }
          actions={
            <>
              <SharpBtn
                variant="ghost"
                disabled={!dirty}
                onClick={discard}
                data-testid={`cc-virtual-reset-${colId}`}
              >
                <RotateCcw size={13} strokeWidth={2} /> RESET
              </SharpBtn>
              <SharpBtn
                variant={dirty ? 'action' : 'ghost'}
                disabled={!dirty}
                onClick={save}
                data-testid={`cc-virtual-save-${colId}`}
              >
                <Save size={13} strokeWidth={2} /> SAVE
              </SharpBtn>
            </>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
        <div className="sticky top-0 z-10 shrink-0 bg-card border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap">
          <div className="w-full flex items-center gap-2 flex-wrap">
            <SummaryChip
              label="COLUMN ID"
              tone="primary"
              value={
                <span className="max-w-[220px] truncate inline-block align-middle">
                  {draft.colId}
                </span>
              }
              title={draft.colId}
            />
            <SummaryChip
              label="REFS"
              value={<Mono color="var(--ds-text-primary)">{baseCols.length} COLS</Mono>}
              tone="info"
            />
            <SummaryChip
              label="FORMATTER"
              value={
                <Mono color={draft.valueFormatterTemplate ? 'var(--ds-accent-warning)' : 'var(--ds-text-faint)'}>
                  {draft.valueFormatterTemplate ? 'SET' : '—'}
                </Mono>
              }
              tone={draft.valueFormatterTemplate ? 'warning' : 'neutral'}
            />
            <SummaryChip
              label="WIDTH"
              value={<Mono>{draft.initialWidth ? `${draft.initialWidth}px` : 'AUTO'}</Mono>}
              tone={draft.initialWidth ? 'info' : 'neutral'}
            />
          </div>
          <div className="w-full mt-2 flex items-center gap-2">
            <Caps size="2xs">COLUMN ID</Caps>
            <IconInput
              value={draft.colId}
              onCommit={(v) => setDraft({ colId: v })}
              monospace
              data-testid={`cc-virtual-colid-${colId}`}
              className="w-[220px]"
            />
          </div>
        </div>

        <Band index="01" title="EXPRESSION">
          <div
            style={{
              border: '1px solid var(--ds-border-primary)',
              borderRadius: 2,
              background: 'var(--ds-surface-ground)',
              overflow: 'hidden',
            }}
          >
            <ExpressionEditor
              value={draft.expression}
              // Live: mirror every keystroke into the draft so the
              // header's SAVE pill lights up the moment the text diverges
              // from committed. `onCommit` alone missed multiline edits
              // (Enter adds a newline, not a commit).
              onChange={(v) => setDraft({ expression: v })}
              onCommit={(v) => setDraft({ expression: v })}
              multiline
              lines={3}
              fontSize={12}
              placeholder="[price] * [quantity]"
              columnsProvider={columnsProvider}
              data-testid={`cc-virtual-expr-${colId}`}
            />
          </div>
        </Band>

        <Band index="02" title="VALUE FORMATTER">
          {/* Same compact FormatterPicker the Formatting Toolbar uses —
              one picker to learn across surfaces. */}
          <FormatterPicker
            compact
            dataType={(draft.cellDataType ?? 'number') as FormatterPickerDataType}
            value={draft.valueFormatterTemplate}
            onChange={(next) => setDraft({ valueFormatterTemplate: next })}
            data-testid={`cc-virtual-fmt-${colId}`}
          />
          <div className="mt-2 text-xs text-muted-foreground tracking-[0.06em] uppercase">
            OPTIONAL · APPLIED TO THE COMPUTED VALUE BEFORE DISPLAY
          </div>
        </Band>

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
});

// ─── Legacy flat composition ───────────────────────────────────────────
//
// Kept for `module.SettingsPanel` consumers that don't wire master-detail
// themselves. The v4 settings sheet picks up `ListPane` + `EditorPane`
// directly from the module definition, so this wrapper is rarely hit in
// practice — but host apps that mount a single `<SettingsPanel>` for
// simplicity still work.

export function CalculatedColumnsPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div
      data-testid="cc-panel"
      style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}
    >
      <aside
        style={{
          borderRight: '1px solid var(--ds-border-primary)',
          overflowY: 'auto',
          background: 'var(--ds-surface-primary)',
        }}
      >
        <CalculatedColumnsList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section style={{ overflowY: 'auto' }}>
        <CalculatedColumnsEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
