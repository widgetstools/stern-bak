/**
 * Orchestrator — composes the modules at both orientations and hosts
 * the shared AlertDialog for the destructive Clear-all action.
 *
 * Two top-level renderers:
 *   - `<FormatterToolbar />`  — horizontal strip, in-grid usage
 *   - `<FormatterPanel />`    — vertical inspector, popped-out usage
 *
 * Both consume `useFormatter()` for state + actions; they differ only
 * in arrangement. The toolbar is a compact single row of labeled
 * segments (FONT · NUMBER · ALIGN · Borders · Column · Templates ·
 * history · clear); segments that don't fit the current width collapse
 * — in a declared priority order — into a "⋯" overflow menu instead of
 * clipping or wrapping (see ./toolbarOverflow). The panel keeps the
 * sectioned vertical inspector.
 *
 * Pop-out lifecycle (browser window.open / OpenFin) is handled by the
 * `<Poppable />` host above this layer in `FormattingToolbar.tsx`;
 * these components are pure render functions that take props.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { PopoverCompat as Popover, Tooltip } from '../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { ColumnMenuControl } from './modules/ColumnMenu';
import { ModuleClear } from './modules/ModuleClear';
import {
  ColumnCaptionCluster,
  GridTogglesCluster,
  HistoryCluster,
  ModuleContext,
  TargetScopeCluster,
} from './modules/ModuleContext';
import { ModuleEditorFilter } from './modules/ModuleEditorFilter';
import { FormatCluster, ModuleFormat } from './modules/ModuleFormat';
import { ModuleLibrary, TemplatesControl } from './modules/ModuleLibrary';
import { BordersControl, ColorCluster, ModulePaint } from './modules/ModulePaint';
import {
  AlignCluster,
  FontSizeSelect,
  ModuleType,
  TypeEmphasisCluster,
} from './modules/ModuleType';
import { Hair, PanelGroup, PillButton, TitleBar, pillClasses } from './primitives';
import { useToolbarOverflow, type OverflowSpec } from './toolbarOverflow';
import './formatter.css';
import type { FormatterActions, FormatterState } from './state';

// ─── Horizontal — in-grid toolbar ─────────────────────────────────

interface ToolbarSegment {
  id: string;
  /** Overflow-menu section label (falls back to id). Not rendered
   *  inline — the row shows controls only, to save width. */
  label?: string;
  menuLabel?: string;
  node: ReactNode;
}

/** The formatting sections (FONT … Column) belong on the toolbar and
 *  survive longest; the tail (Templates, undo/redo, clear) are the
 *  row's last buttons and the first into the ⋯ menu when width runs
 *  out. Context never collapses. */
const SEGMENT_SPEC: OverflowSpec = {
  order: ['font', 'number', 'align', 'borders', 'column', 'templates', 'history', 'clear'],
  collapseOrder: ['templates', 'history', 'clear', 'column', 'borders', 'align', 'number', 'font'],
};

/** Rendered after the flexible readout — always the row's last controls. */
const TAIL_SEGMENT_IDS = new Set(['templates', 'history', 'clear']);

export function FormatterToolbar({
  state,
  actions,
  popoutSlot,
  onClose,
}: {
  state: FormatterState;
  actions: FormatterActions;
  /** Optional pop-out trigger button, hosted in the trailing cluster. */
  popoutSlot?: ReactNode;
  /** When provided, renders a ✕ that hides the toolbar. */
  onClose?: () => void;
}) {
  const { containerRef, leadRef, trailRef, registerSegment, hidden } =
    useToolbarOverflow(SEGMENT_SPEC);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const segments = useMemo<ToolbarSegment[]>(() => [
    {
      id: 'font',
      label: 'Font',
      node: (
        <>
          <TypeEmphasisCluster state={state} actions={actions} />
          <Hair />
          <FontSizeSelect state={state} actions={actions} />
          <Hair />
          <ColorCluster state={state} actions={actions} />
          <Hair />
          <GridTogglesCluster state={state} actions={actions} />
        </>
      ),
    },
    {
      id: 'number',
      label: 'Number',
      node: <FormatCluster state={state} actions={actions} />,
    },
    {
      id: 'align',
      label: 'Align',
      node: <AlignCluster state={state} actions={actions} />,
    },
    {
      id: 'borders',
      node: <BordersControl state={state} actions={actions} labeled />,
    },
    {
      id: 'column',
      node: <ColumnMenuControl state={state} actions={actions} />,
    },
    {
      id: 'templates',
      node: (
        <TemplatesControl
          state={state}
          actions={actions}
          colLabel={state.colLabel}
          labeled
        />
      ),
    },
    {
      id: 'history',
      menuLabel: 'Undo / redo',
      node: <HistoryCluster state={state} actions={actions} />,
    },
    {
      id: 'clear',
      menuLabel: 'Clear',
      node: <ModuleClear state={state} actions={actions} orientation="horizontal" />,
    },
  ], [state, actions]);

  const hiddenSegments = segments.filter((s) => hidden.has(s.id));
  const visibleMain = segments.filter(
    (s) => !hidden.has(s.id) && !TAIL_SEGMENT_IDS.has(s.id),
  );
  const visibleTail = segments.filter(
    (s) => !hidden.has(s.id) && TAIL_SEGMENT_IDS.has(s.id),
  );

  const renderSegment = (seg: ToolbarSegment) => (
    <div
      key={seg.id}
      className="fx-segment"
      data-seg={seg.id}
      data-testid={`fmt-seg-${seg.id}`}
      ref={registerSegment(seg.id)}
    >
      {seg.node}
    </div>
  );

  return (
    <div
      className="fx-shell fx-shell--horizontal"
      data-testid="formatting-toolbar"
      onMouseDown={(e) => {
        // Same four tags the segment-level guards exempt. This one listed
        // three: the overflow menu renders inline, inside this shell, so a
        // TEXTAREA its own guard let through was eaten here on the way up.
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'OPTION' && tag !== 'TEXTAREA') {
          e.preventDefault();
        }
      }}
    >
      <div className="fx-bar" ref={containerRef}>
        {/* Fixed lead — what am I editing, and where. Never collapses. */}
        <div
          className="fx-bar__lead"
          ref={leadRef}
          data-target={state.target}
          data-scope={state.scope}
        >
          <TargetScopeCluster state={state} actions={actions} />
          <ColumnCaptionCluster state={state} actions={actions} />
        </div>

        {visibleMain.map(renderSegment)}

        {/* Spring — pushes the tail to the row's right edge. */}
        <div className="fx-bar__spring" aria-hidden />

        {/* Templates + undo/redo + clear — always the row's last buttons. */}
        {visibleTail.map(renderSegment)}

        {/* ⋯ lives outside the measured trail: its width is accounted
            by the partition's overflowTriggerWidth, so measuring it in
            the trail would reserve it twice. */}
        {hiddenSegments.length > 0 && (
            <Popover
              open={overflowOpen}
              onOpenChange={setOverflowOpen}
              align="end"
              trigger={
                <Tooltip content="More formatting tools">
                  <PillButton
                    type="button"
                    className={pillClasses()}
                    aria-label="More formatting tools"
                    data-testid="formatting-overflow-trigger"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  >
                    <MoreHorizontal size={14} strokeWidth={2} />
                  </PillButton>
                </Tooltip>
              }
            >
              <div
                className="fx-menu-panel fx-menu-panel--overflow"
                data-testid="formatting-overflow-menu"
                onMouseDown={(e) => {
                  const tag = (e.target as HTMLElement).tagName;
                  if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'OPTION' && tag !== 'TEXTAREA') {
                    e.preventDefault();
                  }
                }}
              >
                {hiddenSegments.map((seg) => (
                  <section key={seg.id} className="fx-menu-panel__section" data-seg={seg.id}>
                    <h4 className="fx-menu-panel__label">{seg.label ?? seg.menuLabel ?? seg.id}</h4>
                    <div className="fx-menu-panel__row">{seg.node}</div>
                  </section>
                ))}
              </div>
            </Popover>
        )}

        {/* Fixed trail — popout, close. */}
        <div className="fx-bar__trail" ref={trailRef}>
          {popoutSlot}
          {onClose && (
            <Tooltip content="Hide formatting toolbar">
              <PillButton
                type="button"
                className={pillClasses()}
                aria-label="Hide formatting toolbar"
                data-testid="formatting-close"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
              >
                <X size={14} strokeWidth={2} />
              </PillButton>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Vertical — popped panel ──────────────────────────────────────

export function FormatterPanel({
  state,
  actions,
  frameless,
  onClose,
  titleText,
}: {
  state: FormatterState;
  actions: FormatterActions;
  frameless?: boolean;
  onClose?: () => void;
  titleText?: string;
}) {
  return (
    <div
      className="fx-shell fx-shell--vertical"
      data-testid="formatting-properties-panel"
    >
      {frameless && titleText && onClose && (
        <TitleBar text={titleText} onClose={onClose} testId="fmt-panel-titlebar" />
      )}

      <header data-testid="fmt-panel-header" className="fx-panel-header">
        <PanelGroup label="Scope" testId="fmt-panel-group-scope">
          <ModuleContext state={state} actions={actions} />
        </PanelGroup>
      </header>

      <div className="fx-body" data-testid="fmt-panel-body">
        <div className="fx-panel-sections">
          <PanelGroup label="Type" sectionIndex="02" testId="fmt-panel-group-type">
            <ModuleType state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Paint" sectionIndex="03" testId="fmt-panel-group-paint">
            <ModulePaint state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Format" sectionIndex="04" testId="fmt-panel-group-format">
            <ModuleFormat state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Edit" sectionIndex="05" testId="fmt-panel-group-edit">
            <ModuleEditorFilter state={state} actions={actions} />
          </PanelGroup>
          <PanelGroup label="Templates" sectionIndex="06" testId="fmt-panel-group-templates">
            <ModuleLibrary
              state={state}
              actions={actions}
              orientation="vertical"
              colLabel={state.colLabel}
            />
          </PanelGroup>
        </div>
      </div>

      <footer className="fx-footer">
        <PanelGroup label="Clear" variant="destruct" testId="fmt-panel-group-clear">
          <ModuleClear state={state} actions={actions} orientation="vertical" />
        </PanelGroup>
      </footer>
    </div>
  );
}
